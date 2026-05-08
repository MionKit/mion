"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const path = require("path");
const ts = require("typescript");
const src_vitePlugin_transformers = require("./transformers.cjs");
const src_vitePlugin_extractPureFn = require("./extractPureFn.cjs");
const src_vitePlugin_virtualModule = require("./virtualModule.cjs");
const src_vitePlugin_constants = require("./constants.cjs");
const src_vitePlugin_aotCacheGenerator = require("./aotCacheGenerator.cjs");
const src_vitePlugin_aotDiskCache = require("./aotDiskCache.cjs");
function _interopNamespaceDefault(e) {
  const n = Object.create(null, { [Symbol.toStringTag]: { value: "Module" } });
  if (e) {
    for (const k in e) {
      if (k !== "default") {
        const d = Object.getOwnPropertyDescriptor(e, k);
        Object.defineProperty(n, k, d.get ? d : {
          enumerable: true,
          get: () => e[k]
        });
      }
    }
  }
  n.default = e;
  return Object.freeze(n);
}
const ts__namespace = /* @__PURE__ */ _interopNamespaceDefault(ts);
const IS_TEST_ENV = process.env.VITEST !== void 0 || process.env.NODE_ENV === "test";
const log = IS_TEST_ENV ? () => void 0 : console.log.bind(console);
function mionVitePlugin(options) {
  let extractedFns = null;
  const pureFnOptions = options.serverPureFunctions;
  const runTypesOptions = options.runTypes;
  const aotOptions = options.aotCaches === true ? {} : options.aotCaches;
  const serverConfig = options.server;
  const deepkitConfig = runTypesOptions ? src_vitePlugin_transformers.createDeepkitConfig(runTypesOptions) : null;
  const defaultCompilerOptions = {
    target: ts__namespace.ScriptTarget.ESNext,
    module: ts__namespace.ModuleKind.ESNext,
    sourceMap: true
  };
  let pureServerFnCount = 0;
  let registerPureFnFactoryCount = 0;
  let pureFnFilesCount = 0;
  let aotData = null;
  let aotCacheDir = "";
  let ssrLoadModule = null;
  const ssrEnabled = serverConfig?.runMode === "middleware";
  let ssrInitPromise = null;
  let persistentChild = null;
  let cleanupRegistered = false;
  const { aotVirtualModules, aotResolvedIds } = buildAOTVirtualModuleMaps(aotOptions?.customVirtualModuleId);
  async function cleanupChild() {
    if (persistentChild) {
      await src_vitePlugin_aotCacheGenerator.killPersistentChild(persistentChild);
      persistentChild = null;
    }
  }
  function registerCleanupHandlers() {
    if (cleanupRegistered) return;
    cleanupRegistered = true;
    const onExit = () => {
      if (persistentChild && !persistentChild.killed) {
        persistentChild.kill("SIGTERM");
        persistentChild = null;
      }
    };
    process.on("exit", onExit);
    process.on("SIGINT", onExit);
    process.on("SIGTERM", onExit);
  }
  return {
    name: "mion",
    enforce: "pre",
    // literal type required: inferred 'string' is not assignable to Vite's 'pre' | 'post'
    config(config, env) {
      if (aotOptions?.excludeReflection && !isRunningAsChild()) {
        const aliases = config.resolve?.alias;
        if (aliases && !Array.isArray(aliases)) {
          for (const mod of src_vitePlugin_constants.REFLECTION_MODULES) {
            delete aliases[mod];
          }
        }
      }
      const shimModules = [];
      if (pureFnOptions) shimModules.push(src_vitePlugin_constants.SERVER_PURE_FNS_SHIM);
      addSsrNoExternal(config, shimModules);
      if (env.command === "build" && (shimModules.length > 0 || aotOptions)) {
        wrapBuildExternal(config, shimModules);
      }
    },
    configResolved(config) {
      if (aotOptions) {
        aotCacheDir = src_vitePlugin_aotDiskCache.resolveCacheDir(aotOptions, config.cacheDir);
      }
    },
    async buildStart() {
      if (serverConfig && !isRunningAsChild() && !ssrEnabled) {
        try {
          log("[mion] Generating AOT caches...");
          const result = await src_vitePlugin_aotDiskCache.getOrGenerateAOTCaches(serverConfig, aotOptions, aotCacheDir);
          aotData = result.data;
          log("[mion] AOT caches generated successfully");
          src_vitePlugin_aotCacheGenerator.logAOTCaches(aotData);
          if (result.childProcess) {
            persistentChild = result.childProcess;
            registerCleanupHandlers();
            log(`[mion] Server process persisted (pid: ${persistentChild.pid})`);
          }
          if (result.platformReady && serverConfig.waitTimeout && serverConfig.runMode === "childProcess") {
            log("[mion] Waiting for server to call setPlatformConfig()...");
            const timeout = serverConfig.waitTimeout;
            const timeoutId = setTimeout(() => {
              if (result.childProcess?.connected) result.childProcess.disconnect();
              console.error(
                `[mion] Server did not call setPlatformConfig() within ${timeout / 1e3}s. Ensure your platform adapter (startNodeServer, etc.) is called after initMionRouter().`
              );
            }, timeout);
            result.platformReady.then(() => {
              clearTimeout(timeoutId);
              if (result.childProcess?.connected) result.childProcess.disconnect();
              log("[mion] Server ready");
              onServerReady();
            });
          } else {
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
      ssrLoadModule = (url) => server.ssrLoadModule(url);
      const startScript = path.resolve(serverConfig.startScript);
      let nodeRequestHandler = null;
      let basePath = null;
      let initFailed = false;
      log("[mion] Generating SSR AOT caches...");
      ssrInitPromise = src_vitePlugin_aotCacheGenerator.loadSSRRouterAndGenerateAOTCaches(ssrLoadModule, startScript, aotOptions?.isClient).then(async (data) => {
        aotData = data;
        log("[mion] SSR AOT caches generated successfully");
        src_vitePlugin_aotCacheGenerator.logAOTCaches(data);
        if (pureFnOptions) await server.ssrLoadModule(src_vitePlugin_constants.VIRTUAL_SERVER_PURE_FNS);
        const routerModule = await server.ssrLoadModule("@mionjs/router");
        const opts = routerModule.getRouterOptions();
        basePath = "/" + (opts.basePath || "").replace(/^\//, "");
        const platformNode = await server.ssrLoadModule("@mionjs/platform-node");
        nodeRequestHandler = platformNode.httpRequestHandler;
        log("[mion] Dev server proxy initialized");
        onServerReady();
      }).catch((err) => {
        initFailed = true;
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[mion] Failed to initialize SSR: ${message}`);
      });
      server.middlewares.use(async (req, res, next) => {
        try {
          if (!basePath && !initFailed) await ssrInitPromise;
          if (!basePath || !req.url?.startsWith(basePath)) return next();
          if (nodeRequestHandler) {
            nodeRequestHandler(req, res);
          } else {
            res.statusCode = 503;
            res.end("mion API failed to initialize");
          }
        } catch (err) {
          console.error("[mion] Dev server proxy error:", err);
          if (!res.writableEnded) {
            res.statusCode = 500;
            res.end("Internal Server Error");
          }
        }
      });
    },
    resolveId(id) {
      if (id === src_vitePlugin_constants.VIRTUAL_SERVER_PURE_FNS) return src_vitePlugin_constants.resolveVirtualId(id);
      if (aotVirtualModules.has(id)) return src_vitePlugin_constants.resolveVirtualId(id);
      if (pureFnOptions && (id === src_vitePlugin_constants.SERVER_PURE_FNS_SHIM || id.endsWith("/server-pure-fns"))) {
        return src_vitePlugin_constants.resolveVirtualId(src_vitePlugin_constants.VIRTUAL_SERVER_PURE_FNS);
      }
      if (aotOptions?.excludeReflection && !isRunningAsChild() && src_vitePlugin_constants.REFLECTION_MODULES.includes(id)) {
        return src_vitePlugin_constants.resolveVirtualId(src_vitePlugin_constants.VIRTUAL_STUB_PREFIX + id);
      }
      return null;
    },
    async load(id) {
      if (id === src_vitePlugin_constants.resolveVirtualId(src_vitePlugin_constants.VIRTUAL_SERVER_PURE_FNS)) {
        if (!pureFnOptions) return src_vitePlugin_virtualModule.generateServerPureFnsVirtualModule([]);
        if (!extractedFns) extractedFns = src_vitePlugin_extractPureFn.scanClientSource(pureFnOptions);
        return src_vitePlugin_virtualModule.generateServerPureFnsVirtualModule(extractedFns);
      }
      const aotType = aotResolvedIds.get(id);
      if (aotType) {
        switch (aotType) {
          case "jit-fns": {
            if (!aotData) return src_vitePlugin_aotCacheGenerator.generateDevJitFnsModule();
            return src_vitePlugin_aotCacheGenerator.generateJitFnsModule(aotData.jitFnsCode);
          }
          case "pure-fns": {
            if (!aotData) return src_vitePlugin_aotCacheGenerator.generateDevPureFnsModule();
            return src_vitePlugin_aotCacheGenerator.generatePureFnsModule(aotData.pureFnsCode);
          }
          case "router-cache": {
            if (!aotData) return src_vitePlugin_aotCacheGenerator.generateDevRouterCacheModule();
            return src_vitePlugin_aotCacheGenerator.generateRouterCacheModule(aotData.routerCacheCode);
          }
          case "caches": {
            if (!aotData) return src_vitePlugin_aotCacheGenerator.generateDevCombinedCachesModule();
            return src_vitePlugin_aotCacheGenerator.generateCombinedCachesModule();
          }
        }
      }
      for (const mod of src_vitePlugin_constants.REFLECTION_MODULES) {
        if (id === src_vitePlugin_constants.resolveVirtualId(src_vitePlugin_constants.VIRTUAL_STUB_PREFIX + mod)) {
          return { code: "export default {}", syntheticNamedExports: true };
        }
      }
      return null;
    },
    transform(code, fileName) {
      const vueInfo = parseVueModuleId(fileName);
      const basePath = fileName.includes("?") ? fileName.slice(0, fileName.indexOf("?")) : fileName;
      if (basePath.includes("@mionjs/") && (basePath.includes("/.dist/") || basePath.includes("/build/"))) return null;
      if (basePath.includes("/.cache/vite/") || basePath.includes("/.vite/deps/")) return null;
      const filterPath = vueInfo ? vueInfo.basePath : basePath;
      if (basePath.endsWith(".vue") && !vueInfo) return null;
      const lang = vueInfo?.lang || "ts";
      const tsFileName = vueInfo ? `${vueInfo.basePath}.${lang}` : fileName;
      const isTsx = tsFileName.endsWith(".tsx") || tsFileName.endsWith(".jsx");
      const hasPureFns = code.includes("pureServerFn") || code.includes("registerPureFnFactory") || code.includes("mapFrom");
      const needsDeepkit = deepkitConfig ? deepkitConfig.filter(filterPath) : false;
      if (!hasPureFns && !needsDeepkit) return null;
      const before = [];
      const after = [];
      const collected = hasPureFns ? [] : void 0;
      if (hasPureFns) {
        before.push(src_vitePlugin_transformers.createPureFnTransformerFactory(code, tsFileName, collected, pureFnOptions?.noViteClient));
      }
      if (needsDeepkit) {
        before.push(...deepkitConfig.beforeTransformers);
      }
      if (deepkitConfig) {
        after.push(...deepkitConfig.afterTransformers);
      }
      const baseCompilerOptions = deepkitConfig?.compilerOptions ?? defaultCompilerOptions;
      const compilerOptions = isTsx ? { ...baseCompilerOptions, jsx: ts__namespace.JsxEmit.ReactJSX } : baseCompilerOptions;
      const result = ts__namespace.transpileModule(code, {
        compilerOptions,
        fileName: tsFileName,
        transformers: { before, after }
      });
      if (collected && collected.length > 0) {
        pureFnFilesCount++;
        for (const fn of collected) {
          if (fn.isFactory) registerPureFnFactoryCount++;
          else pureServerFnCount++;
        }
      }
      const outputCode = result.outputText.replace(/\n\/\/# sourceMappingURL=.*$/, "");
      return { code: outputCode, map: result.sourceMapText };
    },
    buildEnd() {
      if (pureServerFnCount > 0 || registerPureFnFactoryCount > 0) {
        const total = pureServerFnCount + registerPureFnFactoryCount;
        const parts = [
          pureServerFnCount > 0 ? `${pureServerFnCount} pureServerFn` : "",
          registerPureFnFactoryCount > 0 ? `${registerPureFnFactoryCount} registerPureFnFactory` : ""
        ].filter(Boolean);
        log(`[mion] Injected ${total} pure functions across ${pureFnFilesCount} files (${parts.join(", ")})`);
      }
    },
    async closeBundle() {
      await cleanupChild();
    },
    handleHotUpdate({ file, server }) {
      if (pureFnOptions) {
        const clientSrcPath = path.resolve(pureFnOptions.clientSrcPath);
        if (file.startsWith(clientSrcPath)) {
          const include = pureFnOptions.include || ["**/*.ts", "**/*.tsx", "**/*.vue"];
          const exclude = pureFnOptions.exclude || ["../node_modules/**", "**/.dist/**", "**/dist/**"];
          if (isIncluded(file, include, exclude)) {
            extractedFns = null;
            const mod = server.moduleGraph.getModuleById(src_vitePlugin_constants.resolveVirtualId(src_vitePlugin_constants.VIRTUAL_SERVER_PURE_FNS));
            if (mod) {
              server.moduleGraph.invalidateModule(mod);
              return [mod];
            }
          }
        }
      }
      if (serverConfig && !isRunningAsChild()) {
        const serverDir = path.resolve(serverConfig.startScript, "..");
        if (file.startsWith(serverDir)) {
          const killPromise = cleanupChild();
          const regeneratePromise = ssrEnabled && ssrLoadModule ? (
            // SSR mode: reset router (clears persistedMethods + router state via
            // their globalThis slots) and serverPureFnsCache, then re-init.
            // Preserve jitFnsCache + pureFnsCache — they're expensive to rebuild
            // and routes that haven't changed reuse them.
            (async () => {
              const routerModule = await ssrLoadModule("@mionjs/router");
              routerModule.resetRouter();
              const pureFnsSlot = globalThis[/* @__PURE__ */ Symbol.for("mion.server-pure-fns/v1")];
              if (pureFnsSlot) {
                for (const k in pureFnsSlot) delete pureFnsSlot[k];
              }
              return src_vitePlugin_aotCacheGenerator.loadSSRRouterAndGenerateAOTCaches(
                ssrLoadModule,
                path.resolve(serverConfig.startScript),
                aotOptions?.isClient
              );
            })()
          ) : (
            // IPC mode: wait for old child to die, then spawn new
            killPromise.then(() => src_vitePlugin_aotCacheGenerator.generateAOTCaches(serverConfig, void 0, aotOptions?.isClient))
          );
          regeneratePromise.then(async (result) => {
            const data = "data" in result ? result.data : result;
            aotData = data;
            src_vitePlugin_aotCacheGenerator.logAOTCaches(data);
            if (ssrEnabled && ssrLoadModule && pureFnOptions) {
              const mod = server.moduleGraph.getModuleById(src_vitePlugin_constants.resolveVirtualId(src_vitePlugin_constants.VIRTUAL_SERVER_PURE_FNS));
              if (mod) server.moduleGraph.invalidateModule(mod);
              await ssrLoadModule(src_vitePlugin_constants.VIRTUAL_SERVER_PURE_FNS);
            }
            if ("childProcess" in result && result.childProcess) {
              persistentChild = result.childProcess;
              log(`[mion] Server process re-persisted (pid: ${persistentChild.pid})`);
            }
            const platformReady = "platformReady" in result ? result.platformReady : void 0;
            if (platformReady && serverConfig.waitTimeout && serverConfig.runMode === "childProcess") {
              const timeout = serverConfig.waitTimeout;
              log("[mion] Waiting for restarted server to call setPlatformConfig()...");
              const timeoutId = setTimeout(() => {
                if (persistentChild?.connected) persistentChild.disconnect();
                console.error(
                  `[mion] Restarted server did not call setPlatformConfig() within ${timeout / 1e3}s.`
                );
              }, timeout);
              platformReady.then(() => {
                clearTimeout(timeoutId);
                if (persistentChild?.connected) persistentChild.disconnect();
                log("[mion] Restarted server ready");
                onServerReady();
              });
            } else if ("childProcess" in result && result.childProcess?.connected) {
              result.childProcess.disconnect();
            }
            if (!ssrEnabled) src_vitePlugin_aotDiskCache.updateDiskCache(serverConfig, aotOptions, data, aotCacheDir);
            let invalidatedCount = 0;
            for (const resolvedId of aotResolvedIds.keys()) {
              const mod = server.moduleGraph.getModuleById(resolvedId);
              if (mod) {
                server.moduleGraph.invalidateModule(mod);
                invalidatedCount++;
              }
            }
            if (invalidatedCount > 0) {
              log("[mion] AOT caches regenerated, invalidating virtual modules");
            }
          }).catch((err) => {
            console.error("[mion] Failed to regenerate AOT caches:", err.message);
          });
        }
      }
      return void 0;
    }
  };
}
function isRunningAsChild() {
  return process.env.MION_COMPILE === "buildOnly" || process.env.MION_COMPILE === "childProcess";
}
function parseVueModuleId(id) {
  const qIdx = id.indexOf("?");
  if (qIdx === -1) return null;
  const basePath = id.slice(0, qIdx);
  if (!basePath.endsWith(".vue")) return null;
  const params = new URLSearchParams(id.slice(qIdx));
  if (!params.has("vue") || params.get("type") !== "script") return null;
  return { basePath, lang: params.get("lang") };
}
function isIncluded(filePath, include, exclude) {
  const vueInfo = parseVueModuleId(filePath);
  const effectivePath = vueInfo ? vueInfo.basePath : filePath;
  const isTs = /\.(ts|tsx|js|jsx)$/.test(effectivePath);
  const isVue = effectivePath.endsWith(".vue");
  const isDir = effectivePath.endsWith("/");
  if (!isTs && !isVue && !isDir) return false;
  for (const pattern of exclude) {
    if (matchGlob(effectivePath, pattern)) return false;
  }
  return true;
}
function matchGlob(filePath, pattern) {
  if (pattern.startsWith("**/")) {
    const suffix = pattern.slice(3);
    return filePath.includes(suffix.replace(/\*/g, ""));
  }
  const regex = new RegExp("^" + pattern.replace(/\*\*/g, ".*").replace(/\*/g, "[^/]*") + "$");
  return regex.test(filePath);
}
const AOT_MODULE_TYPES = ["jit-fns", "pure-fns", "router-cache", "caches"];
function buildAOTVirtualModuleMaps(customVirtualModuleId) {
  const aotVirtualModules = /* @__PURE__ */ new Map();
  const aotResolvedIds = /* @__PURE__ */ new Map();
  for (const type of AOT_MODULE_TYPES) {
    const defaultId = `virtual:mion-aot/${type}`;
    aotVirtualModules.set(defaultId, type);
    aotResolvedIds.set(src_vitePlugin_constants.resolveVirtualId(defaultId), type);
    if (customVirtualModuleId) {
      const customId = `virtual:${customVirtualModuleId}/${type}`;
      aotVirtualModules.set(customId, type);
      aotResolvedIds.set(src_vitePlugin_constants.resolveVirtualId(customId), type);
    }
  }
  return { aotVirtualModules, aotResolvedIds };
}
function addSsrNoExternal(config, specifiers) {
  if (specifiers.length === 0) return;
  const noExternal = config.ssr?.noExternal;
  if (!config.ssr) config.ssr = {};
  if (Array.isArray(noExternal)) {
    for (const spec of specifiers) {
      if (!noExternal.includes(spec)) noExternal.push(spec);
    }
  } else if (typeof noExternal === "string" || noExternal instanceof RegExp) {
    config.ssr.noExternal = [noExternal, ...specifiers];
  } else if (noExternal !== true) {
    config.ssr.noExternal = noExternal ? [noExternal, ...specifiers] : [...specifiers];
  }
}
function wrapBuildExternal(config, shimModules) {
  if (!config.build) config.build = {};
  if (!config.build.rollupOptions) config.build.rollupOptions = {};
  const original = config.build.rollupOptions.external;
  config.build.rollupOptions.external = (id, ...rest) => {
    if (shimModules.includes(id) || id.startsWith("virtual:mion")) return false;
    if (typeof original === "function") {
      const r = original(id, ...rest);
      if (r !== void 0) return r;
    } else if (Array.isArray(original)) {
      return original.some((ext) => ext instanceof RegExp ? ext.test(id) : ext === id);
    } else if (original instanceof RegExp) {
      return original.test(id);
    } else if (typeof original === "string") {
      return original === id;
    }
    return /^[^./]/.test(id);
  };
}
const READY_KEY = /* @__PURE__ */ Symbol.for("mion.serverReady");
function getOrCreateServerReady() {
  if (!globalThis[READY_KEY]) {
    let _resolve;
    globalThis[READY_KEY] = {
      promise: new Promise((r) => {
        _resolve = r;
      }),
      resolve: () => _resolve()
    };
  }
  return globalThis[READY_KEY];
}
const serverReady = getOrCreateServerReady().promise;
const onServerReady = getOrCreateServerReady().resolve;
exports.isIncluded = isIncluded;
exports.mionVitePlugin = mionVitePlugin;
exports.parseVueModuleId = parseVueModuleId;
exports.serverReady = serverReady;
//# sourceMappingURL=mionVitePlugin.cjs.map
