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
 * import {mionPlugin} from '@mionkit/devtools/vite-plugin';
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

    return {
        name: 'mion',
        enforce: 'pre',

        configResolved(config) {
            if (aotOptions) {
                aotCacheDir = resolveCacheDir(aotOptions, config.cacheDir);
            }
        },

        async buildStart() {
            // Generate AOT caches if enabled
            if (aotOptions) {
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
            if (id === resolveVirtualId(VIRTUAL_AOT_JIT_FNS)) {
                if (!aotData) {
                    return generateNoopModule('No-op: AOT JIT caches not generated');
                }
                return generateJitFnsModule(aotData.jitFnsCode);
            }

            // AOT pure functions module (standalone)
            if (id === resolveVirtualId(VIRTUAL_AOT_PURE_FNS)) {
                if (!aotData) {
                    return generateNoopModule('No-op: AOT pure fns not generated');
                }
                return generatePureFnsModule(aotData.pureFnsCode);
            }

            // AOT router cache module
            if (id === resolveVirtualId(VIRTUAL_AOT_ROUTER_CACHE)) {
                if (!aotData) {
                    return generateNoopModule('No-op: AOT router cache not generated');
                }
                return generateRouterCacheModule(aotData.routerCacheCode);
            }

            // Combined AOT caches module (imports all 3 above, registers and re-exports)
            if (id === resolveVirtualId(VIRTUAL_AOT_CACHES)) {
                if (!aotData) {
                    return generateNoopCombinedModule();
                }
                return generateCombinedCachesModule();
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

            // Deepkit transformers (run after ours)
            if (needsDeepkit) {
                before.push(...deepkitConfig!.beforeTransformers);
                after.push(...deepkitConfig!.afterTransformers);
            }

            const compilerOptions = deepkitConfig?.compilerOptions ?? defaultCompilerOptions;

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

        handleHotUpdate({file, server}) {
            // In dev mode, re-scan when client source changes (for pure functions)
            if (pureFnOptions) {
                const clientSrcPath = resolve(pureFnOptions.clientSrcPath);
                if (file.startsWith(clientSrcPath)) {
                    const include = pureFnOptions.include || ['**/*.ts', '**/*.tsx'];
                    const exclude = pureFnOptions.exclude || ['**/node_modules/**', '**/.dist/**', '**/dist/**'];
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
            if (aotOptions && aotOptions.startServerScript) {
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
