/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {resolve} from 'path';
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
    SERVER_PURE_FNS_SHIM,
    resolveVirtualId,
} from './constants.ts';
import {
    generateAOTCaches,
    loadSSRRouterAndGenerateAOTCaches,
    killPersistentChild,
    logAOTCaches,
    generateJitFnsModule,
    generatePureFnsModule,
    generateRouterCacheModule,
    generateCombinedCachesModule,
    generateDevJitFnsModule,
    generateDevPureFnsModule,
    generateDevRouterCacheModule,
    generateDevCombinedCachesModule,
    AOTCacheData,
} from './aotCacheGenerator.ts';
import {getOrGenerateAOTCaches, updateDiskCache, resolveCacheDir} from './aotDiskCache.ts';

/** True when running under Vitest (or NODE_ENV=test). Used to suppress info logs during tests. */
const IS_TEST_ENV = process.env.VITEST !== undefined || process.env.NODE_ENV === 'test';
/** Info logger — silent in test env. Errors should keep using console.error directly. */
const log: (...args: unknown[]) => void = IS_TEST_ENV ? () => undefined : console.log.bind(console);

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
 * import {mionVitePlugin} from '@mionjs/devtools/vite-plugin';
 *
 * export default defineConfig({
 *   plugins: [
 *     mionVitePlugin({
 *       runTypes: {
 *         tsConfig: './tsconfig.json',
 *       },
 *       server: {
 *         startScript: '../server/src/init.ts',
 *         runMode: 'buildOnly',
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
        sourceMap: true,
    };

    // Pure function injection counters — accumulated during transform, logged in buildEnd
    let pureServerFnCount = 0;
    let registerPureFnFactoryCount = 0;
    let pureFnFilesCount = 0;

    // AOT cache data - populated during buildStart (IPC) or configureServer (in-process)
    let aotData: AOTCacheData | null = null;

    // Resolved cache directory from Vite's config — set in configResolved
    let aotCacheDir = '';

    // SSR AOT: module loader (set in configureServer when SSR mode is active)
    let ssrLoadModule: ((url: string) => Promise<Record<string, any>>) | null = null;
    /** Whether SSR mode is active — resolved from server config */
    const ssrEnabled = serverConfig?.runMode === 'middleware';
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

        config(config, env) {
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

            // Ensure Vite bundles shim modules instead of externalizing them
            const shimModules: string[] = [];
            if (pureFnOptions) shimModules.push(SERVER_PURE_FNS_SHIM);
            addSsrNoExternal(config, shimModules);

            // Wrap build.rollupOptions.external so shim and virtual modules are never externalized.
            // Always install the wrapper when AOT is enabled — it also externalizes bare specifiers
            // (Vite lib-mode default), so consumers can drop their own external config entirely.
            if (env.command === 'build' && (shimModules.length > 0 || aotOptions)) {
                wrapBuildExternal(config, shimModules);
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
                try {
                    log('[mion] Generating AOT caches...');
                    const result = await getOrGenerateAOTCaches(serverConfig, aotOptions, aotCacheDir);
                    aotData = result.data;
                    log('[mion] AOT caches generated successfully');
                    logAOTCaches(aotData);

                    // Store persistent child for IPC mode
                    if (result.childProcess) {
                        persistentChild = result.childProcess;
                        registerCleanupHandlers();
                        log(`[mion] Server process persisted (pid: ${persistentChild.pid})`);
                    }

                    // Non-blocking: wait for setPlatformConfig() IPC and resolve serverReady promise
                    if (result.platformReady && serverConfig.waitTimeout && serverConfig.runMode === 'childProcess') {
                        log('[mion] Waiting for server to call setPlatformConfig()...');
                        const timeout = serverConfig.waitTimeout;
                        const timeoutId = setTimeout(() => {
                            if (result.childProcess?.connected) result.childProcess.disconnect();
                            console.error(
                                `[mion] Server did not call setPlatformConfig() within ${timeout / 1000}s. ` +
                                    `Ensure your platform adapter (startNodeServer, etc.) is called after initMionRouter().`
                            );
                        }, timeout);
                        result.platformReady.then(() => {
                            clearTimeout(timeoutId);
                            if (result.childProcess?.connected) result.childProcess.disconnect();
                            log('[mion] Server ready');
                            onServerReady();
                        });
                    } else {
                        // buildOnly mode or no waitTimeout: resolve immediately
                        if (result.childProcess?.connected) result.childProcess.disconnect();
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
            const startScript = resolve(serverConfig.startScript);
            // Single init chain: generate AOT caches → load router + platform modules
            let nodeRequestHandler: ((req: any, res: any) => void) | null = null;
            let basePath: string | null = null;
            let initFailed = false;

            log('[mion] Generating SSR AOT caches...');
            ssrInitPromise = loadSSRRouterAndGenerateAOTCaches(ssrLoadModule, startScript, aotOptions?.isClient)
                .then(async (data) => {
                    aotData = data;
                    log('[mion] SSR AOT caches generated successfully');
                    logAOTCaches(data);
                    // Populate the server pure fns cache directly via the virtual module.
                    // routesFlow (loaded externally by Node from @mionjs/router) reads from the
                    // same globalThis slot that this virtual module writes to as a side-effect.
                    if (pureFnOptions) await server.ssrLoadModule(VIRTUAL_SERVER_PURE_FNS);
                    // Load router and platform modules. State (router options, persisted methods,
                    // pure fns) is shared across instances via globalThis slots, so it doesn't
                    // matter which instance ssrLoadModule resolves to.
                    const routerModule = await server.ssrLoadModule('@mionjs/router');
                    const opts = routerModule.getRouterOptions();
                    basePath = '/' + (opts.basePath || '').replace(/^\//, '');
                    const platformNode = await server.ssrLoadModule('@mionjs/platform-node');
                    nodeRequestHandler = platformNode.httpRequestHandler;
                    log('[mion] Dev server proxy initialized');
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

        resolveId(id) {
            // Pure functions virtual module — always resolve, returns empty cache if not configured
            if (id === VIRTUAL_SERVER_PURE_FNS) return resolveVirtualId(id);
            // AOT virtual modules (default + custom prefix both resolve)
            if (aotVirtualModules.has(id)) return resolveVirtualId(id);
            // @mionjs/core/server-pure-fns — redirect to the virtual module so the populated
            // entries get bundled. The virtual module exports the same helper surface
            // (getServerPureFn, loadServerPureFns) backed by the shared globalThis slot.
            //
            // We match both the bare specifier and the alias-resolved absolute path. Some Vite
            // configs (notably the monorepo test-server's edge/cloudflare configs) alias
            // `@mionjs/core` to the package dir, rewriting the import to `<pkg>/server-pure-fns`
            // before our plugin sees it.
            //
            // In dev SSR mode this redirect doesn't fire for externalised importers (e.g.
            // @mionjs/router) — they read the real source/dist file, which uses the same
            // globalThis slot.
            if (pureFnOptions && (id === SERVER_PURE_FNS_SHIM || id.endsWith('/server-pure-fns'))) {
                return resolveVirtualId(VIRTUAL_SERVER_PURE_FNS);
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

            // AOT virtual modules — check resolved ID against the map.
            // In dev (no aotData yet), return a tiny module backed by globalThis slots.
            // No `await initPromise` here — that would deadlock when the user's startScript
            // imports virtual:mion-aot/caches while the plugin is inside loadSSRRouterAndGenerateAOTCaches.
            const aotType = aotResolvedIds.get(id);
            if (aotType) {
                switch (aotType) {
                    case 'jit-fns': {
                        if (!aotData) return generateDevJitFnsModule();
                        return generateJitFnsModule(aotData.jitFnsCode);
                    }
                    case 'pure-fns': {
                        if (!aotData) return generateDevPureFnsModule();
                        return generatePureFnsModule(aotData.pureFnsCode);
                    }
                    case 'router-cache': {
                        if (!aotData) return generateDevRouterCacheModule();
                        return generateRouterCacheModule(aotData.routerCacheCode);
                    }
                    case 'caches': {
                        if (!aotData) return generateDevCombinedCachesModule();
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

            // Skip @mionjs build artifacts and Vite pre-bundled cache files — they already have
            // deepkit types and pure function metadata injected. Re-transpiling them through
            // ts.transpileModule would inject duplicate __assignType declarations.
            if (basePath.includes('@mionjs/') && (basePath.includes('/.dist/') || basePath.includes('/build/'))) return null;
            if (basePath.includes('/.cache/vite/') || basePath.includes('/.vite/deps/')) return null;

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

            // Deepkit before-transformers emit type metadata and inject __assignType + CJS require().
            if (needsDeepkit) {
                before.push(...deepkitConfig!.beforeTransformers);
            }

            // After-transformers (declarationTransformer, requireToImport) must ALWAYS run when
            // deepkitConfig exists. Deepkit's install script patches typescript.js getTransformers()
            // to inject its transformer into every ts.transpileModule call — even for files outside
            // our include filter. Without requireToImport, those files end up with CJS require()
            // calls (with .ts extensions) that Rollup can't resolve, producing broken build output.
            if (deepkitConfig) {
                after.push(...deepkitConfig.afterTransformers);
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

            // Strip the //# sourceMappingURL comment that ts.transpileModule appends —
            // Vite consumes the source map via the `map` property, not inline comments.
            const outputCode = result.outputText.replace(/\n\/\/# sourceMappingURL=.*$/, '');
            return {code: outputCode, map: result.sourceMapText};
        },

        buildEnd() {
            if (pureServerFnCount > 0 || registerPureFnFactoryCount > 0) {
                const total = pureServerFnCount + registerPureFnFactoryCount;
                const parts = [
                    pureServerFnCount > 0 ? `${pureServerFnCount} pureServerFn` : '',
                    registerPureFnFactoryCount > 0 ? `${registerPureFnFactoryCount} registerPureFnFactory` : '',
                ].filter(Boolean);
                log(`[mion] Injected ${total} pure functions across ${pureFnFilesCount} files (${parts.join(', ')})`);
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
                const serverDir = resolve(serverConfig.startScript, '..');

                if (file.startsWith(serverDir)) {
                    // Kill existing persistent child before regenerating
                    const killPromise = cleanupChild();

                    const regeneratePromise =
                        ssrEnabled && ssrLoadModule
                            ? // SSR mode: reset router (clears persistedMethods + router state via
                              // their globalThis slots) and serverPureFnsCache, then re-init.
                              // Preserve jitFnsCache + pureFnsCache — they're expensive to rebuild
                              // and routes that haven't changed reuse them.
                              (async () => {
                                  const routerModule = await ssrLoadModule!('@mionjs/router');
                                  routerModule.resetRouter();
                                  const pureFnsSlot = (globalThis as any)[Symbol.for('mion.server-pure-fns/v1')];
                                  if (pureFnsSlot) {
                                      for (const k in pureFnsSlot) delete pureFnsSlot[k];
                                  }
                                  return loadSSRRouterAndGenerateAOTCaches(
                                      ssrLoadModule!,
                                      resolve(serverConfig.startScript),
                                      aotOptions?.isClient
                                  );
                              })()
                            : // IPC mode: wait for old child to die, then spawn new
                              killPromise.then(() => generateAOTCaches(serverConfig, undefined, aotOptions?.isClient));

                    regeneratePromise
                        .then(async (result) => {
                            const data = 'data' in result ? result.data : result;
                            aotData = data;
                            logAOTCaches(data);

                            // SSR mode: re-populate serverPureFnsCache (was cleared above) by
                            // re-loading the virtual module. The module's side-effect populates
                            // the globalThis slot.
                            if (ssrEnabled && ssrLoadModule && pureFnOptions) {
                                const mod = server.moduleGraph.getModuleById(resolveVirtualId(VIRTUAL_SERVER_PURE_FNS));
                                if (mod) server.moduleGraph.invalidateModule(mod);
                                await ssrLoadModule(VIRTUAL_SERVER_PURE_FNS);
                            }

                            // Store new persistent child if IPC mode
                            if ('childProcess' in result && result.childProcess) {
                                persistentChild = result.childProcess;
                                log(`[mion] Server process re-persisted (pid: ${persistentChild!.pid})`);
                            }

                            // Non-blocking: wait for setPlatformConfig() IPC from restarted server
                            const platformReady = 'platformReady' in result ? result.platformReady : undefined;
                            if (platformReady && serverConfig.waitTimeout && serverConfig.runMode === 'childProcess') {
                                const timeout = serverConfig.waitTimeout;
                                log('[mion] Waiting for restarted server to call setPlatformConfig()...');
                                const timeoutId = setTimeout(() => {
                                    if (persistentChild?.connected) persistentChild.disconnect();
                                    console.error(
                                        `[mion] Restarted server did not call setPlatformConfig() within ${timeout / 1000}s.`
                                    );
                                }, timeout);
                                platformReady.then(() => {
                                    clearTimeout(timeoutId);
                                    if (persistentChild?.connected) persistentChild.disconnect();
                                    log('[mion] Restarted server ready');
                                    onServerReady();
                                });
                            } else if ('childProcess' in result && result.childProcess?.connected) {
                                result.childProcess.disconnect();
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
                                log('[mion] AOT caches regenerated, invalidating virtual modules');
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
    return process.env.MION_COMPILE === 'buildOnly' || process.env.MION_COMPILE === 'childProcess';
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

/** Adds specifiers (string or RegExp) to Vite's ssr.noExternal so they are bundled instead of externalized. */
function addSsrNoExternal(config: Record<string, any>, specifiers: (string | RegExp)[]): void {
    if (specifiers.length === 0) return;
    const noExternal = config.ssr?.noExternal;
    if (!config.ssr) config.ssr = {};
    if (Array.isArray(noExternal)) {
        for (const spec of specifiers) {
            if (!noExternal.includes(spec)) noExternal.push(spec);
        }
    } else if (typeof noExternal === 'string' || noExternal instanceof RegExp) {
        config.ssr.noExternal = [noExternal, ...specifiers];
    } else if (noExternal !== true) {
        config.ssr.noExternal = noExternal ? [noExternal, ...specifiers] : [...specifiers];
    }
}

/** Wraps build.rollupOptions.external so shim and virtual modules are always bundled.
 *  When no original external is configured, installs a default that externalizes bare specifiers
 *  (matches Vite lib-mode default) — letting consumers omit rollupOptions.external entirely. */
function wrapBuildExternal(config: Record<string, any>, shimModules: string[]): void {
    if (!config.build) config.build = {};
    if (!config.build.rollupOptions) config.build.rollupOptions = {};
    const original = config.build.rollupOptions.external;
    config.build.rollupOptions.external = (id: string, ...rest: any[]) => {
        // Never externalize shim modules or virtual modules (plugin replaces them with generated code)
        if (shimModules.includes(id) || id.startsWith('virtual:mion')) return false;
        // Delegate to original external config when present
        if (typeof original === 'function') {
            const r = original(id, ...rest);
            if (r !== undefined) return r;
        } else if (Array.isArray(original)) {
            return original.some((ext) => (ext instanceof RegExp ? ext.test(id) : ext === id));
        } else if (original instanceof RegExp) {
            return original.test(id);
        } else if (typeof original === 'string') {
            return original === id;
        }
        // No original (or function returned undefined): externalize bare specifiers,
        // matching Vite's lib-mode default. This implicitly externalizes @mionjs/*,
        // node:* builtins, and third-party deps — relative paths stay bundled.
        return /^[^./]/.test(id);
    };
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
