/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {resolve} from 'path';
import * as ts from 'typescript';
import {createDeepkitConfig, DeepkitConfig, createPureFnTransformerFactory} from './transformers.ts';
import {ServerPureFunctionsOptions, ExtractedPureFn, DeepkitTypeOptions, AOTCacheOptions} from './types.ts';
import {scanClientSource} from './extractPureFn.ts';
import {generateServerPureFnsVirtualModule} from './virtualModule.ts';
import {VIRTUAL_SERVER_PURE_FNS, REFLECTION_MODULES, VIRTUAL_STUB_PREFIX, resolveVirtualId} from './constants.ts';
import {
    generateAOTCaches,
    generateInProcessAOTCaches,
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

/** Extracts the base file path and lang from a Vue SFC virtual module ID (e.g. Component.vue?vue&type=script&lang=ts) */
export function parseVueModuleId(id: string): {basePath: string; lang: string | null} | null {
    const qIdx = id.indexOf('?');
    if (qIdx === -1) return null;
    const basePath = id.slice(0, qIdx);
    if (!basePath.endsWith('.vue')) return null;
    const params = new URLSearchParams(id.slice(qIdx));
    if (!params.has('vue') || params.get('type') !== 'script') return null;
    return {basePath, lang: params.get('lang')};
}

/** Checks if a file path matches the include/exclude patterns */
export function isIncluded(filePath: string, include: string[], exclude: string[]): boolean {
    // For Vue virtual module IDs, use the base .vue path for matching
    const vueInfo = parseVueModuleId(filePath);
    const effectivePath = vueInfo ? vueInfo.basePath : filePath;

    const isTs = /\.(ts|tsx|js|jsx)$/.test(effectivePath);
    const isVue = effectivePath.endsWith('.vue');
    const isDir = effectivePath.endsWith('/');
    if (!isTs && !isVue && !isDir) return false;

    // Check exclude patterns
    for (const pattern of exclude) {
        if (matchGlob(effectivePath, pattern)) return false;
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

/** AOT virtual module types — each maps to a different cache export */
const AOT_MODULE_TYPES = ['jit-fns', 'pure-fns', 'router-cache', 'caches'] as const;
type AOTModuleType = (typeof AOT_MODULE_TYPES)[number];

/** Builds maps from virtual module names → AOT type for resolveId and load hooks.
 *  Default 'virtual:mion-aot/*' is always registered. If customVirtualModuleId is set,
 *  'virtual:${custom}/*' is also registered — both map to the same cache data. */
function buildAOTVirtualModuleMaps(customVirtualModuleId?: string) {
    const aotVirtualModules = new Map<string, AOTModuleType>();
    const aotResolvedIds = new Map<string, AOTModuleType>();
    for (const type of AOT_MODULE_TYPES) {
        const defaultId = `virtual:mion-aot/${type}`;
        aotVirtualModules.set(defaultId, type);
        aotResolvedIds.set(resolveVirtualId(defaultId), type);
        if (customVirtualModuleId) {
            const customId = `virtual:${customVirtualModuleId}/${type}`;
            aotVirtualModules.set(customId, type);
            aotResolvedIds.set(resolveVirtualId(customId), type);
        }
    }
    return {aotVirtualModules, aotResolvedIds};
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
export function mionVitePlugin(options: MionPluginOptions) {
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

    // AOT cache data - populated during buildStart (IPC) or configureServer (in-process)
    let aotData: AOTCacheData | null = null;
    let aotGenerationPromise: Promise<AOTCacheData> | null = null;

    // Resolved cache directory from Vite's config — set in configResolved
    let aotCacheDir = '';

    // In-process AOT: module loader and options
    const inProcessOptions = aotOptions?.inProcess ?? null;
    let inProcessLoadModule: ((url: string) => Promise<Record<string, any>>) | null = null;

    const {aotVirtualModules, aotResolvedIds} = buildAOTVirtualModuleMaps(aotOptions?.customVirtualModuleId);

    return {
        name: 'mion',
        enforce: 'pre' as const, // literal type required: inferred 'string' is not assignable to Vite's 'pre' | 'post'

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
            // Skip when in-process mode is configured — configureServer will handle it
            if (aotOptions && process.env.MION_COMPILE !== 'true' && !inProcessOptions) {
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

        configureServer(server) {
            if (!inProcessOptions) return;
            inProcessLoadModule = (url: string) => server.ssrLoadModule(url);

            /** Trigger in-process AOT generation and set up module invalidation on completion */
            const startInProcessAOT = () => {
                console.log('[mion] Generating in-process AOT caches...');
                aotGenerationPromise = generateInProcessAOTCaches(inProcessLoadModule!, inProcessOptions!)
                    .then((data) => {
                        aotData = data;
                        console.log('[mion] In-process AOT caches generated successfully');
                        logAOTCaches(data);
                        // Invalidate virtual modules so they reload with real data
                        for (const resolvedId of aotResolvedIds.keys()) {
                            const mod = server.moduleGraph.getModuleById(resolvedId);
                            if (mod) server.moduleGraph.invalidateModule(mod);
                        }
                        return data;
                    })
                    .catch((err) => {
                        const message = err instanceof Error ? err.message : String(err);
                        console.error(`[mion] Failed to generate in-process AOT caches: ${message}`);
                        throw err;
                    });
            };

            // ssrLoadModule requires the server's module runner transport to be ready,
            // which only works after server.listen(). Can't call from configureServer or load().
            // Use 'listening' event when available, otherwise defer to next macrotask.
            if (server.httpServer) {
                server.httpServer.once('listening', startInProcessAOT);
            } else {
                // middlewareMode: framework (e.g. Nuxt) manages the HTTP server.
                // Defer to macrotask — the framework should have started by then.
                setTimeout(startInProcessAOT, 0);
            }
        },

        resolveId(id) {
            // Pure functions virtual module — always resolve, returns empty cache if not configured
            if (id === VIRTUAL_SERVER_PURE_FNS) return resolveVirtualId(id);

            // AOT virtual modules (default + custom prefix both resolve)
            if (aotVirtualModules.has(id)) return resolveVirtualId(id);

            // Stub out reflection modules in the bundle build (not needed at runtime in AOT mode)
            if (aotOptions?.excludeReflection && process.env.MION_COMPILE !== 'true' && REFLECTION_MODULES.includes(id)) {
                return resolveVirtualId(VIRTUAL_STUB_PREFIX + id);
            }

            return null;
        },

        async load(id) {
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

            // AOT virtual modules — check resolved ID against the map
            const aotType = aotResolvedIds.get(id);
            if (aotType) {
                // Wait for in-process AOT generation ONLY for AOT virtual modules.
                // Awaiting for all modules would deadlock: generateInProcessAOTCaches calls
                // ssrLoadModule which triggers load() for dependency modules, which would
                // then await the same promise that's trying to load them.
                if (!aotData && aotGenerationPromise) {
                    try {
                        aotData = await aotGenerationPromise;
                    } catch {
                        // Error already logged in configureServer/buildStart
                    }
                }

                switch (aotType) {
                    case 'jit-fns':
                        if (!aotData) return generateNoopModule('No-op: AOT JIT caches not generated');
                        return generateJitFnsModule(aotData.jitFnsCode);
                    case 'pure-fns':
                        if (!aotData) return generateNoopModule('No-op: AOT pure fns not generated');
                        return generatePureFnsModule(aotData.pureFnsCode);
                    case 'router-cache':
                        if (!aotData) return generateNoopModule('No-op: AOT router cache not generated');
                        return generateRouterCacheModule(aotData.routerCacheCode);
                    case 'caches':
                        if (!aotData) return generateNoopCombinedModule();
                        return generateCombinedCachesModule();
                }
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
            // For Vue SFC virtual modules, resolve the base path and lang for downstream tools
            const vueInfo = parseVueModuleId(fileName);
            // Strip any query params (e.g. ?macro=true from Nuxt) to get the real file path
            const basePath = fileName.includes('?') ? fileName.slice(0, fileName.indexOf('?')) : fileName;
            const filterPath = vueInfo ? vueInfo.basePath : basePath;

            // Skip .vue files unless they are Vue script virtual modules (?vue&type=script).
            // Bare .vue files and other .vue queries (e.g. ?macro=true from Nuxt) contain raw
            // SFC content — wait for the Vue plugin to extract the <script> block first.
            if (basePath.endsWith('.vue') && !vueInfo) return null;

            const lang = vueInfo?.lang || 'ts';
            const tsFileName = vueInfo ? `${vueInfo.basePath}.${lang}` : fileName;
            const isTsx = tsFileName.endsWith('.tsx') || tsFileName.endsWith('.jsx');

            const hasPureFns =
                code.includes('pureServerFn') || code.includes('registerPureFnFactory') || code.includes('mapFrom');
            const needsDeepkit = deepkitConfig ? deepkitConfig.filter(filterPath) : false;

            if (!hasPureFns && !needsDeepkit) return null;

            const before: ts.CustomTransformerFactory[] = [];
            const after: ts.CustomTransformerFactory[] = [];

            // Pure function transformer (runs first — sees clean AST)
            const collected: ExtractedPureFn[] | undefined = hasPureFns ? [] : undefined;
            if (hasPureFns) {
                before.push(createPureFnTransformerFactory(code, tsFileName, collected, pureFnOptions?.noViteClient));
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

            const baseCompilerOptions = deepkitConfig?.compilerOptions ?? defaultCompilerOptions;
            const compilerOptions = isTsx ? {...baseCompilerOptions, jsx: ts.JsxEmit.ReactJSX} : baseCompilerOptions;

            const result = ts.transpileModule(code, {
                compilerOptions,
                fileName: tsFileName,
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
                    const include = pureFnOptions.include || ['**/*.ts', '**/*.tsx', '**/*.vue'];
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
            // Skip when running as the AOT compile child process
            if (aotOptions && process.env.MION_COMPILE !== 'true') {
                const serverDir = inProcessOptions
                    ? resolve(inProcessOptions.serverEntry, '..')
                    : aotOptions.startServerScript
                      ? resolve(aotOptions.startServerScript, '..')
                      : null;

                if (serverDir && file.startsWith(serverDir)) {
                    const regeneratePromise =
                        inProcessOptions && inProcessLoadModule
                            ? // In-process mode: reset router and re-init via environment runner
                              (async () => {
                                  const routerModule = await inProcessLoadModule!('@mionjs/router');
                                  routerModule.resetRouter();
                                  return generateInProcessAOTCaches(inProcessLoadModule!, inProcessOptions);
                              })()
                            : // IPC mode: spawn child process
                              generateAOTCaches(aotOptions);

                    aotGenerationPromise = regeneratePromise;
                    regeneratePromise
                        .then((data) => {
                            aotData = data;
                            logAOTCaches(data);
                            if (!inProcessOptions) updateDiskCache(aotOptions, data, aotCacheDir);
                            // Invalidate all AOT virtual modules
                            let invalidatedCount = 0;
                            for (const resolvedId of aotResolvedIds.keys()) {
                                const mod = server.moduleGraph.getModuleById(resolvedId);
                                if (mod) {
                                    server.moduleGraph.invalidateModule(mod);
                                    invalidatedCount++;
                                }
                            }
                            if (invalidatedCount > 0) {
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
