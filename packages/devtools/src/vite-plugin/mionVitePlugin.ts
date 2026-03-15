/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {resolve} from 'path';
import {createRequire} from 'module';
import {existsSync} from 'fs';
import * as ts from 'typescript';
import {ChildProcess} from 'child_process';
import {createDeepkitConfig, DeepkitConfig, createPureFnTransformerFactory} from './transformers.ts';
import {ServerPureFunctionsOptions, ExtractedPureFn, DeepkitTypeOptions, AOTCacheOptions, MionServerConfig} from './types.ts';
import {scanClientSource} from './extractPureFn.ts';
import {generateServerPureFnsVirtualModule} from './virtualModule.ts';
import {
    VIRTUAL_SERVER_PURE_FNS,
    REFLECTION_MODULES,
    VIRTUAL_STUB_PREFIX,
    VIRTUAL_AOT_CACHES,
    AOT_CACHES_SHIM,
    resolveVirtualId,
} from './constants.ts';
import {
    generateAOTCaches,
    loadSSRRouterAndGenerateAOTCaches,
    killPersistentChild,
    logAOTCaches,
    waitForServer,
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
    aotCaches?: AOTCacheOptions | true;
    /** Server configuration - controls how the server process is managed */
    server?: MionServerConfig;
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
 *       server: {
 *         startServerScript: '../server/src/init.ts',
 *         mode: 'onlyAOT',
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
    const aotOptions: AOTCacheOptions | undefined = options.aotCaches === true ? {} : options.aotCaches;
    const serverConfig = options.server;
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

    // SSR AOT: module loader (set in configureServer when SSR mode is active)
    let ssrLoadModule: ((url: string) => Promise<Record<string, any>>) | null = null;
    /** Whether SSR mode is active — resolved from server config */
    const ssrEnabled = serverConfig?.mode === 'viteSSR';
    /** SSR init promise: AOT generation + router/platform module loading */
    let ssrInitPromise: Promise<void> | null = null;

    // Persistent child process for IPC mode
    let persistentChild: ChildProcess | null = null;
    let cleanupRegistered = false;

    const {aotVirtualModules, aotResolvedIds} = buildAOTVirtualModuleMaps(aotOptions?.customVirtualModuleId);

    /** Kill persistent child process and clear reference */
    async function cleanupChild() {
        if (persistentChild) {
            await killPersistentChild(persistentChild);
            persistentChild = null;
        }
    }

    /** Register process exit handlers (once) */
    function registerCleanupHandlers() {
        if (cleanupRegistered) return;
        cleanupRegistered = true;
        const onExit = () => {
            if (persistentChild && !persistentChild.killed) {
                persistentChild.kill('SIGTERM');
                persistentChild = null;
            }
        };
        process.on('exit', onExit);
        process.on('SIGINT', onExit);
        process.on('SIGTERM', onExit);
    }

    return {
        name: 'mion',
        enforce: 'pre' as const, // literal type required: inferred 'string' is not assignable to Vite's 'pre' | 'post'

        config(config) {
            // Strip reflection module aliases in bundle build mode so our resolveId can stub them.
            // Vite's alias plugin runs before our resolveId, so we remove aliases here to prevent
            // them from transforming bare package names into file paths before we can intercept.
            if (aotOptions?.excludeReflection && !isRunningAsChild()) {
                const aliases = config.resolve?.alias;
                if (aliases && !Array.isArray(aliases)) {
                    for (const mod of REFLECTION_MODULES) {
                        delete (aliases as Record<string, string>)[mod];
                    }
                }
            }

            // When AOT caches are enabled, ensure Vite handles @mionjs/core/aot-caches
            // instead of letting Node.js resolve it from node_modules
            if (aotOptions && !isRunningAsChild()) {
                const noExternal = config.ssr?.noExternal;
                const moduleId = AOT_CACHES_SHIM;
                if (!config.ssr) config.ssr = {};
                if (Array.isArray(noExternal)) {
                    if (!noExternal.includes(moduleId)) noExternal.push(moduleId);
                } else if (typeof noExternal === 'string') {
                    config.ssr.noExternal = [noExternal, moduleId];
                } else if (noExternal !== true) {
                    config.ssr.noExternal = noExternal ? [noExternal, moduleId] : [moduleId];
                }
            }
        },

        configResolved(config) {
            if (aotOptions) {
                aotCacheDir = resolveCacheDir(aotOptions, config.cacheDir);
            }
        },

        async buildStart() {
            // Generate AOT caches if server is configured
            // Skip when already running as a child process to prevent infinite recursion
            // Skip when SSR mode — configureServer will handle it
            if (serverConfig && !isRunningAsChild() && !ssrEnabled) {
                // Set port env before spawning child so the server uses the correct port
                if (serverConfig.port) process.env.MION_TEST_PORT = String(serverConfig.port);
                try {
                    console.log('[mion] Generating AOT caches...');
                    const resultPromise = getOrGenerateAOTCaches(serverConfig, aotOptions, aotCacheDir);
                    aotGenerationPromise = resultPromise.then((r) => r.data);
                    const result = await resultPromise;
                    aotData = result.data;
                    console.log('[mion] AOT caches generated successfully');
                    logAOTCaches(aotData);

                    // Store persistent child for IPC mode
                    if (result.childProcess) {
                        persistentChild = result.childProcess;
                        registerCleanupHandlers();
                        console.log(`[mion] Server process persisted (pid: ${persistentChild.pid})`);
                    }

                    // Non-blocking: poll server port and resolve serverReady promise (IPC mode)
                    if (serverConfig.port && serverConfig.mode === 'IPC') {
                        const timeout = serverConfig.waitTimeout ?? 30000;
                        console.log(`[mion] Waiting for server on port ${serverConfig.port}...`);
                        waitForServer(serverConfig.port, timeout)
                            .then(() => {
                                console.log(`[mion] Server ready on port ${serverConfig.port}`);
                                onServerReady();
                            })
                            .catch((err) => {
                                console.error(`[mion] ${err instanceof Error ? err.message : String(err)}`);
                            });
                    } else {
                        // onlyAOT mode: no persistent server, resolve immediately
                        onServerReady();
                    }
                } catch (err) {
                    const message = err instanceof Error ? err.message : String(err);
                    throw new Error(`[mion] Failed to generate AOT caches: ${message}`);
                }
            }
        },

        configureServer(server) {
            if (!ssrEnabled || !serverConfig) return;
            // SSR mode: use ssrLoadModule to load the server in the same Vite process.
            // ssrLoadModule uses Vite's internal transform pipeline (not HTTP),
            ssrLoadModule = (url: string) => server.ssrLoadModule(url);
            const startServerScript = resolve(serverConfig.startServerScript);
            // Single init chain: generate AOT caches → load router + platform modules
            let nodeRequestHandler: ((req: any, res: any) => void) | null = null;
            let basePath: string | null = null;
            let initFailed = false;

            console.log('[mion] Generating SSR AOT caches...');
            ssrInitPromise = loadSSRRouterAndGenerateAOTCaches(ssrLoadModule, startServerScript)
                .then(async (data) => {
                    aotData = data;
                    aotGenerationPromise = Promise.resolve(data);
                    console.log('[mion] SSR AOT caches generated successfully');
                    logAOTCaches(data);
                    // Invalidate virtual modules so they reload with real data
                    for (const resolvedId of aotResolvedIds.keys()) {
                        const mod = server.moduleGraph.getModuleById(resolvedId);
                        if (mod) server.moduleGraph.invalidateModule(mod);
                    }
                    // Load router and platform modules now that caches are ready
                    const routerModule = await server.ssrLoadModule('@mionjs/router');
                    const opts = routerModule.getRouterOptions();
                    basePath = '/' + (opts.basePath || '').replace(/^\//, '');
                    const platformNode = await server.ssrLoadModule('@mionjs/platform-node');
                    nodeRequestHandler = platformNode.httpRequestHandler;
                    console.log('[mion] Dev server proxy initialized');
                    onServerReady();
                })
                .catch((err) => {
                    initFailed = true;
                    const message = err instanceof Error ? err.message : String(err);
                    console.error(`[mion] Failed to initialize SSR: ${message}`);
                });

            // Dev server proxy: route matching requests to mion's httpRequestHandler
            server.middlewares.use(async (req: any, res: any, next: () => void) => {
                try {
                    if (!basePath && !initFailed) await ssrInitPromise;
                    if (!basePath || !req.url?.startsWith(basePath)) return next();
                    if (nodeRequestHandler) {
                        nodeRequestHandler(req, res);
                    } else {
                        res.statusCode = 503;
                        res.end('mion API failed to initialize');
                    }
                } catch (err) {
                    console.error('[mion] Dev server proxy error:', err);
                    if (!res.writableEnded) {
                        res.statusCode = 500;
                        res.end('Internal Server Error');
                    }
                }
            });
        },

        resolveId(id, importer) {
            // Pure functions virtual module — always resolve, returns empty cache if not configured
            if (id === VIRTUAL_SERVER_PURE_FNS) return resolveVirtualId(id);
            // AOT virtual modules (default + custom prefix both resolve)
            if (aotVirtualModules.has(id)) return resolveVirtualId(id);
            // AOT caches: resolve @mionjs/core/aot-caches to the actual aotCaches file,
            // then intercept its emptyCaches import and replace with the virtual AOT module.
            if (aotOptions) {
                // Bare specifier: use Node's module resolution (respects package.json exports)
                if (id === AOT_CACHES_SHIM) {
                    try {
                        return createRequire(import.meta.url).resolve(AOT_CACHES_SHIM);
                    } catch {
                        return resolveVirtualId(VIRTUAL_AOT_CACHES);
                    }
                }
                // Alias-resolved absolute path (e.g. Vite alias @mionjs/core → ../core
                // transforms the import to /path/to/packages/core/aot-caches).
                // This only happens in monorepo dev where source files always exist.
                if (id.endsWith('/aot-caches')) {
                    const sourceFile = resolve(id, '..', 'src/aot/aotCaches.ts');
                    if (existsSync(sourceFile)) return sourceFile;
                }
                // Intercept emptyCaches imports from aotCaches files (any extension)
                if (/emptyCaches\.(ts|js|mjs|cjs)$/.test(id) && importer && /aotCaches\.(ts|js|mjs|cjs)$/.test(importer)) {
                    return resolveVirtualId(VIRTUAL_AOT_CACHES);
                }
            }
            // Stub out reflection modules in the bundle build (not needed at runtime in AOT mode)
            if (aotOptions?.excludeReflection && !isRunningAsChild() && REFLECTION_MODULES.includes(id)) {
                return resolveVirtualId(VIRTUAL_STUB_PREFIX + id);
            }
            return null;
        },

        async load(id) {
            // Pure functions virtual module
            if (id === resolveVirtualId(VIRTUAL_SERVER_PURE_FNS)) {
                // No serverPureFunctions configured — return empty cache
                if (!pureFnOptions) return generateServerPureFnsVirtualModule([]);
                // Lazily scan client source on first load
                if (!extractedFns) extractedFns = scanClientSource(pureFnOptions);
                return generateServerPureFnsVirtualModule(extractedFns);
            }

            // AOT virtual modules — check resolved ID against the map
            const aotType = aotResolvedIds.get(id);
            if (aotType) {
                const initPromise = ssrInitPromise || aotGenerationPromise;
                if (!aotData && initPromise) await initPromise;

                switch (aotType) {
                    case 'jit-fns': {
                        if (!aotData) return generateNoopModule('No-op: AOT JIT caches not generated');
                        return generateJitFnsModule(aotData.jitFnsCode);
                    }
                    case 'pure-fns': {
                        if (!aotData) return generateNoopModule('No-op: AOT pure fns not generated');
                        return generatePureFnsModule(aotData.pureFnsCode);
                    }
                    case 'router-cache': {
                        if (!aotData) return generateNoopModule('No-op: AOT router cache not generated');
                        return generateRouterCacheModule(aotData.routerCacheCode);
                    }
                    case 'caches': {
                        if (!aotData) return generateNoopCombinedModule();
                        return generateCombinedCachesModule();
                    }
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
            if (deepkitConfig) after.push(...deepkitConfig.afterTransformers);
            if (needsDeepkit) before.push(...deepkitConfig!.beforeTransformers);

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

        async closeBundle() {
            await cleanupChild();
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
            // Skip when running as a child process
            if (serverConfig && !isRunningAsChild()) {
                const serverDir = resolve(serverConfig.startServerScript, '..');

                if (file.startsWith(serverDir)) {
                    // Kill existing persistent child before regenerating
                    const killPromise = cleanupChild();

                    const regeneratePromise =
                        ssrEnabled && ssrLoadModule
                            ? // SSR mode: reset router and re-init via ssrLoadModule
                              (async () => {
                                  const routerModule = await ssrLoadModule!('@mionjs/router');
                                  routerModule.resetRouter();
                                  return loadSSRRouterAndGenerateAOTCaches(
                                      ssrLoadModule!,
                                      resolve(serverConfig.startServerScript)
                                  );
                              })()
                            : // IPC mode: wait for old child to die, then spawn new
                              killPromise.then(() => generateAOTCaches(serverConfig));

                    aotGenerationPromise = regeneratePromise.then((r) => ('data' in r ? r.data : r));
                    regeneratePromise
                        .then((result) => {
                            const data = 'data' in result ? result.data : result;
                            aotData = data;
                            logAOTCaches(data);

                            // Store new persistent child if IPC mode
                            if ('childProcess' in result && result.childProcess) {
                                persistentChild = result.childProcess;
                                console.log(`[mion] Server process re-persisted (pid: ${persistentChild!.pid})`);
                            }

                            // Non-blocking: poll restarted server and resolve serverReady promise
                            if (serverConfig.port && serverConfig.mode === 'IPC') {
                                const timeout = serverConfig.waitTimeout ?? 30000;
                                console.log(`[mion] Waiting for restarted server on port ${serverConfig.port}...`);
                                waitForServer(serverConfig.port, timeout)
                                    .then(() => {
                                        console.log(`[mion] Restarted server ready on port ${serverConfig.port}`);
                                        onServerReady();
                                    })
                                    .catch((err) => {
                                        console.error(`[mion] ${err instanceof Error ? err.message : String(err)}`);
                                    });
                            }

                            if (!ssrEnabled) updateDiskCache(serverConfig, aotOptions, data, aotCacheDir);
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

/** Whether the current process is a child spawned by the mion plugin */
function isRunningAsChild(): boolean {
    return process.env.MION_COMPILE === 'onlyAOT' || process.env.MION_COMPILE === 'serve';
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

// #################### SERVER READY ####################

// Uses globalThis with Symbol.for because vitest loads vitest.config.ts and globalSetup.ts
// in separate module contexts — without globalThis they'd get different promise instances.
const READY_KEY = Symbol.for('mion.serverReady');
function getOrCreateServerReady(): {promise: Promise<void>; resolve: () => void} {
    if (!(globalThis as any)[READY_KEY]) {
        let _resolve: () => void;
        (globalThis as any)[READY_KEY] = {
            promise: new Promise<void>((r) => {
                _resolve = r;
            }),
            resolve: () => _resolve(),
        };
    }
    return (globalThis as any)[READY_KEY];
}

/** Promise that resolves when the server is ready. Await this in vitest globalSetup. */
export const serverReady: Promise<void> = getOrCreateServerReady().promise;
const onServerReady: () => void = getOrCreateServerReady().resolve;
