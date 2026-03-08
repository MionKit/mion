/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {Plugin} from 'vite';
import {resolve} from 'path';
import * as ts from 'typescript';
import {createDeepkitConfig, DeepkitConfig, createPureFnTransformerFactory} from './transformers.ts';
import {ServerPureFunctionsOptions, ExtractedPureFn, DeepkitTypeOptions, AOTCacheOptions} from './types.ts';
import {scanClientSource} from './extractPureFn.ts';
import {generateServerPureFnsVirtualModule} from './virtualModule.ts';
import {
    VIRTUAL_SERVER_PURE_FNS,
    VIRTUAL_AOT_JIT_FNS,
    VIRTUAL_AOT_PURE_FNS,
    VIRTUAL_AOT_ROUTER_CACHE,
    VIRTUAL_AOT_CACHES,
    REFLECTION_MODULES,
    VIRTUAL_STUB_PREFIX,
    resolveVirtualId,
} from './constants.ts';
import {
    generateAOTCaches,
    logAOTCaches,
    generateJitFnsModule,
    generatePureFnsModule,
    generateRouterCacheModule,
    generateCombinedCachesModule,
    generateNoopModule,
    generateNoopCombinedModule,
    writeAOTCachesToDisk,
    AOTCacheData,
} from './aotCacheGenerator.ts';
import {getOrGenerateAOTCaches, updateDiskCache, resolveCacheDir} from './aotDiskCache.ts';

export interface MionPluginOptions {
    /** Options for pure function extraction - omit to disable */
    serverPureFunctions?: ServerPureFunctionsOptions;
    /** Options for deepkit type transformation - omit to disable */
    runTypes?: DeepkitTypeOptions;
    /** Options for AOT cache generation - omit to disable */
    aotCaches?: AOTCacheOptions;
}

/** Checks if a file path matches the include/exclude patterns */
export function isIncluded(filePath: string, include: string[], exclude: string[]): boolean {
    // Simple pattern matching - check file extension
    const isTs = /\.(ts|tsx|js|jsx)$/.test(filePath);
    const isDir = filePath.endsWith('/');
    if (!isTs && !isDir) return false;

    // Check exclude patterns
    for (const pattern of exclude) {
        if (matchGlob(filePath, pattern)) return false;
    }

    return true;
}

/** Simple glob matching for common patterns */
function matchGlob(filePath: string, pattern: string): boolean {
    // Handle **/ prefix
    if (pattern.startsWith('**/')) {
        const suffix = pattern.slice(3);
        return filePath.includes(suffix.replace(/\*/g, ''));
    }
    // Handle simple wildcard
    const regex = new RegExp('^' + pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*') + '$');
    return regex.test(filePath);
}

/**
 * Creates the unified mion Vite plugin.
 * This plugin combines pure function extraction, type compiler transformations,
 * and AOT cache generation in a single plugin with correct execution order.
 *
 * Execution order:
 * 1. Extract pure functions from original TypeScript source
 * 2. Apply type metadata transformations to the code
 *
 * This ensures pure function extraction happens on clean, untransformed TypeScript.
 *
 * @example
 * ```ts
 * // vite.config.ts
 * import {mionPlugin} from '@mionjs/devtools/vite-plugin';
 *
 * export default defineConfig({
 *   plugins: [
 *     mionPlugin({
 *       runTypes: {
 *         tsConfig: './tsconfig.json',
 *       },
 *       pureFunctions: {
 *         clientSrcPath: '../client/src',
 *       },
 *       aotCaches: {
 *         startServerScript: '../server/src/init.ts',
 *       },
 *     }),
 *   ],
 * });
 * ```
 */
export function mionVitePlugin(options: MionPluginOptions): Plugin {
    let extractedFns: ExtractedPureFn[] | null = null;
    const pureFnOptions = options.serverPureFunctions;
    const runTypesOptions = options.runTypes;
    const aotOptions = options.aotCaches;
    const deepkitConfig: DeepkitConfig | null = runTypesOptions ? createDeepkitConfig(runTypesOptions) : null;

    // Default compiler options for when deepkit is disabled
    const defaultCompilerOptions: ts.CompilerOptions = {
        target: ts.ScriptTarget.ESNext,
        module: ts.ModuleKind.ESNext,
    };

    // Pure function injection counters — accumulated during transform, logged in buildEnd
    let pureServerFnCount = 0;
    let registerPureFnFactoryCount = 0;
    let pureFnFilesCount = 0;

    // AOT cache data - populated during buildStart if AOT is enabled
    let aotData: AOTCacheData | null = null;
    let aotGenerationPromise: Promise<AOTCacheData> | null = null;

    // Resolved cache directory from Vite's config — set in configResolved
    let aotCacheDir = '';

    // Prefixed virtual module IDs for writeToDisk (e.g., 'virtual:client-mion-aot/jit-fns')
    const diskVirtualPrefix = aotOptions?.writeToDiskId ? `virtual:${aotOptions.writeToDiskId}` : null;
    // Disk file name prefix derived from writeToDiskId (e.g., 'client-mion-aot-')
    const diskFilePrefix = aotOptions?.writeToDiskId ? `${aotOptions.writeToDiskId}-` : undefined;
    const DISK_VIRTUAL_JIT_FNS = diskVirtualPrefix ? `${diskVirtualPrefix}/jit-fns` : null;
    const DISK_VIRTUAL_PURE_FNS = diskVirtualPrefix ? `${diskVirtualPrefix}/pure-fns` : null;
    const DISK_VIRTUAL_ROUTER_CACHE = diskVirtualPrefix ? `${diskVirtualPrefix}/router-cache` : null;
    const DISK_VIRTUAL_CACHES = diskVirtualPrefix ? `${diskVirtualPrefix}/caches` : null;

    return {
        name: 'mion',
        enforce: 'pre',

        config(config) {
            // Strip reflection module aliases in bundle build mode so our resolveId can stub them.
            // Vite's alias plugin runs before our resolveId, so we remove aliases here to prevent
            // them from transforming bare package names into file paths before we can intercept.
            if (aotOptions?.excludeReflection && process.env.MION_COMPILE !== 'true') {
                const aliases = config.resolve?.alias;
                if (aliases && !Array.isArray(aliases)) {
                    for (const mod of REFLECTION_MODULES) {
                        delete (aliases as Record<string, string>)[mod];
                    }
                }
            }
        },

        configResolved(config) {
            if (aotOptions) {
                aotCacheDir = resolveCacheDir(aotOptions, config.cacheDir);
            }
        },

        async buildStart() {
            // Generate AOT caches if enabled
            // Skip when already running as the AOT compile child process to prevent infinite recursion
            // (happens when aotCaches.serverViteConfig points to the same vite config)
            if (aotOptions && process.env.MION_COMPILE !== 'true') {
                try {
                    console.log('[mion] Generating AOT caches...');
                    aotGenerationPromise = getOrGenerateAOTCaches(aotOptions, aotCacheDir);
                    aotData = await aotGenerationPromise;
                    console.log('[mion] AOT caches generated successfully');
                    logAOTCaches(aotData);
                } catch (err) {
                    const message = err instanceof Error ? err.message : String(err);
                    throw new Error(`[mion] Failed to generate AOT caches: ${message}`);
                }
            }
        },

        resolveId(id) {
            // Pure functions virtual module — always resolve, returns empty cache if not configured
            if (id === VIRTUAL_SERVER_PURE_FNS) return resolveVirtualId(id);

            // AOT virtual modules
            if (id === VIRTUAL_AOT_JIT_FNS) return resolveVirtualId(id);
            if (id === VIRTUAL_AOT_PURE_FNS) return resolveVirtualId(id);
            if (id === VIRTUAL_AOT_ROUTER_CACHE) return resolveVirtualId(id);
            if (id === VIRTUAL_AOT_CACHES) return resolveVirtualId(id);

            // Prefixed AOT virtual modules (for disk-backed caches, e.g., virtual:mion-aot-client/*)
            if (DISK_VIRTUAL_JIT_FNS && id === DISK_VIRTUAL_JIT_FNS) return resolveVirtualId(id);
            if (DISK_VIRTUAL_PURE_FNS && id === DISK_VIRTUAL_PURE_FNS) return resolveVirtualId(id);
            if (DISK_VIRTUAL_ROUTER_CACHE && id === DISK_VIRTUAL_ROUTER_CACHE) return resolveVirtualId(id);
            if (DISK_VIRTUAL_CACHES && id === DISK_VIRTUAL_CACHES) return resolveVirtualId(id);

            // Stub out reflection modules in the bundle build (not needed at runtime in AOT mode)
            if (aotOptions?.excludeReflection && process.env.MION_COMPILE !== 'true' && REFLECTION_MODULES.includes(id)) {
                return resolveVirtualId(VIRTUAL_STUB_PREFIX + id);
            }

            return null;
        },

        load(id) {
            // Pure functions virtual module
            if (id === resolveVirtualId(VIRTUAL_SERVER_PURE_FNS)) {
                if (!pureFnOptions) {
                    // No serverPureFunctions configured — return empty cache
                    return generateServerPureFnsVirtualModule([]);
                }
                // Lazily scan client source on first load
                if (!extractedFns) {
                    extractedFns = scanClientSource(pureFnOptions);
                }
                return generateServerPureFnsVirtualModule(extractedFns);
            }

            // AOT JIT functions + pure functions module
            if (
                id === resolveVirtualId(VIRTUAL_AOT_JIT_FNS) ||
                (DISK_VIRTUAL_JIT_FNS && id === resolveVirtualId(DISK_VIRTUAL_JIT_FNS))
            ) {
                if (!aotData) return generateNoopModule('No-op: AOT JIT caches not generated');
                return generateJitFnsModule(aotData.jitFnsCode);
            }

            // AOT pure functions module (standalone)
            if (
                id === resolveVirtualId(VIRTUAL_AOT_PURE_FNS) ||
                (DISK_VIRTUAL_PURE_FNS && id === resolveVirtualId(DISK_VIRTUAL_PURE_FNS))
            ) {
                if (!aotData) return generateNoopModule('No-op: AOT pure fns not generated');
                return generatePureFnsModule(aotData.pureFnsCode);
            }

            // AOT router cache module
            if (
                id === resolveVirtualId(VIRTUAL_AOT_ROUTER_CACHE) ||
                (DISK_VIRTUAL_ROUTER_CACHE && id === resolveVirtualId(DISK_VIRTUAL_ROUTER_CACHE))
            ) {
                if (!aotData) return generateNoopModule('No-op: AOT router cache not generated');
                return generateRouterCacheModule(aotData.routerCacheCode);
            }

            // Combined AOT caches module (imports all 3 above, registers and re-exports)
            if (
                id === resolveVirtualId(VIRTUAL_AOT_CACHES) ||
                (DISK_VIRTUAL_CACHES && id === resolveVirtualId(DISK_VIRTUAL_CACHES))
            ) {
                if (!aotData) return generateNoopCombinedModule();
                return generateCombinedCachesModule();
            }

            // Reflection module stubs (empty modules — all reflection is pre-compiled in AOT caches)
            // syntheticNamedExports tells Rollup to derive named exports from the default export,
            // so any `import {foo} from '...'` resolves to undefined without build errors.
            for (const mod of REFLECTION_MODULES) {
                if (id === resolveVirtualId(VIRTUAL_STUB_PREFIX + mod)) {
                    return {code: 'export default {}', syntheticNamedExports: true};
                }
            }

            return null;
        },

        transform(code: string, fileName: string) {
            const hasPureFns =
                code.includes('pureServerFn') || code.includes('registerPureFnFactory') || code.includes('mapFrom');
            const needsDeepkit = deepkitConfig ? deepkitConfig.filter(fileName) : false;

            if (!hasPureFns && !needsDeepkit) return null;

            const before: ts.CustomTransformerFactory[] = [];
            const after: ts.CustomTransformerFactory[] = [];

            // Pure function transformer (runs first — sees clean AST)
            const collected: ExtractedPureFn[] | undefined = hasPureFns ? [] : undefined;
            if (hasPureFns) {
                before.push(createPureFnTransformerFactory(code, fileName, collected));
            }

            // Deepkit has two functions: type metadata emission (follows include/exclude filters)
            // and import restoration (always runs globally for all ts.transpileModule calls).
            // afterTransformers (including requireToImport) must always be included to convert
            // deepkit's CJS require() back to ESM imports in the restored import statements.
            if (deepkitConfig) {
                after.push(...deepkitConfig.afterTransformers);
            }
            if (needsDeepkit) {
                before.push(...deepkitConfig!.beforeTransformers);
            }

            const compilerOptions = deepkitConfig!.compilerOptions ?? defaultCompilerOptions;

            const result = ts.transpileModule(code, {
                compilerOptions,
                fileName,
                transformers: {before, after},
            });

            // Count injected pure functions (collector is populated synchronously by transpileModule)
            if (collected && collected.length > 0) {
                pureFnFilesCount++;
                for (const fn of collected) {
                    if (fn.isFactory) registerPureFnFactoryCount++;
                    else pureServerFnCount++;
                }
            }

            return {code: result.outputText, map: result.sourceMapText};
        },

        buildEnd() {
            if (pureServerFnCount > 0 || registerPureFnFactoryCount > 0) {
                const total = pureServerFnCount + registerPureFnFactoryCount;
                const parts = [
                    pureServerFnCount > 0 ? `${pureServerFnCount} pureServerFn` : '',
                    registerPureFnFactoryCount > 0 ? `${registerPureFnFactoryCount} registerPureFnFactory` : '',
                ].filter(Boolean);
                console.log(`[mion] Injected ${total} pure functions across ${pureFnFilesCount} files (${parts.join(', ')})`);
            }
        },

        closeBundle() {
            // Write AOT caches to disk after the build (runs after emptyOutDir)
            if (aotOptions?.writeToDisk && aotData) {
                writeAOTCachesToDisk(aotData, resolve(aotOptions.writeToDisk), diskFilePrefix);
            }
        },

        handleHotUpdate({file, server}) {
            // In dev mode, re-scan when client source changes (for pure functions)
            if (pureFnOptions) {
                const clientSrcPath = resolve(pureFnOptions.clientSrcPath);
                if (file.startsWith(clientSrcPath)) {
                    const include = pureFnOptions.include || ['**/*.ts', '**/*.tsx'];
                    const exclude = pureFnOptions.exclude || ['../node_modules/**', '**/.dist/**', '**/dist/**'];
                    if (isIncluded(file, include, exclude)) {
                        // Clear cache and invalidate virtual module
                        extractedFns = null;
                        const mod = server.moduleGraph.getModuleById(resolveVirtualId(VIRTUAL_SERVER_PURE_FNS));
                        if (mod) {
                            server.moduleGraph.invalidateModule(mod);
                            return [mod];
                        }
                    }
                }
            }

            // In dev mode, regenerate AOT caches when server source changes
            // Only if a custom startServerScript is provided (default routes don't change)
            // Skip when running as the AOT compile child process
            if (aotOptions && aotOptions.startServerScript && process.env.MION_COMPILE !== 'true') {
                // Check if the changed file is in the server directory
                const serverDir = resolve(aotOptions.startServerScript, '..');
                if (file.startsWith(serverDir)) {
                    // Regenerate AOT caches asynchronously (always fresh, then update disk cache)
                    generateAOTCaches(aotOptions)
                        .then((data) => {
                            aotData = data;
                            logAOTCaches(data);
                            updateDiskCache(aotOptions, data, aotCacheDir);
                            // Invalidate all 3 AOT virtual modules
                            const modulesToInvalidate = [VIRTUAL_AOT_JIT_FNS, VIRTUAL_AOT_PURE_FNS, VIRTUAL_AOT_ROUTER_CACHE].map(
                                resolveVirtualId
                            );
                            const invalidatedMods: any[] = [];
                            for (const vmId of modulesToInvalidate) {
                                const mod = server.moduleGraph.getModuleById(vmId);
                                if (mod) {
                                    server.moduleGraph.invalidateModule(mod);
                                    invalidatedMods.push(mod);
                                }
                            }
                            if (invalidatedMods.length > 0) {
                                console.log('[mion] AOT caches regenerated, invalidating virtual modules');
                            }
                        })
                        .catch((err) => {
                            console.error('[mion] Failed to regenerate AOT caches:', err.message);
                        });
                }
            }

            return undefined;
        },
    };
}
