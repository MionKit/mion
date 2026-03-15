"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const path = require("path");
const fs = require("fs");
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
function isRunningAsChild() {
  return process.env.MION_COMPILE === "onlyAOT" || process.env.MION_COMPILE === "serve";
}
function mionVitePlugin(options) {
  let extractedFns = null;
  const pureFnOptions = options.serverPureFunctions;
  const runTypesOptions = options.runTypes;
  const aotOptions = options.aotCaches === true ? {} : options.aotCaches;
  const serverConfig = options.server;
  const deepkitConfig = runTypesOptions ? src_vitePlugin_transformers.createDeepkitConfig(runTypesOptions) : null;
  const defaultCompilerOptions = {
    target: ts__namespace.ScriptTarget.ESNext,
    module: ts__namespace.ModuleKind.ESNext
  };
  let pureServerFnCount = 0;
  let registerPureFnFactoryCount = 0;
  let pureFnFilesCount = 0;
  let aotData = null;
  let aotGenerationPromise = null;
  let aotCacheDir = "";
  let ssrLoadModule = null;
  const ssrEnabled = serverConfig?.mode === "viteSSR";
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
    config(config) {
      if (aotOptions?.excludeReflection && !isRunningAsChild()) {
        const aliases = config.resolve?.alias;
        if (aliases && !Array.isArray(aliases)) {
          for (const mod of src_vitePlugin_constants.REFLECTION_MODULES) {
            delete aliases[mod];
          }
        }
      }
    },
    configResolved(config) {
      if (aotOptions) {
        aotCacheDir = src_vitePlugin_aotDiskCache.resolveCacheDir(aotOptions, config.cacheDir);
      }
    },
    async buildStart() {
      if (serverConfig && !isRunningAsChild() && !ssrEnabled) {
        if (serverConfig.port) process.env.MION_TEST_PORT = String(serverConfig.port);
        try {
          console.log("[mion] Generating AOT caches...");
          const resultPromise = src_vitePlugin_aotDiskCache.getOrGenerateAOTCaches(serverConfig, aotOptions, aotCacheDir);
          aotGenerationPromise = resultPromise.then((r) => r.data);
          const result = await resultPromise;
          aotData = result.data;
          console.log("[mion] AOT caches generated successfully");
          src_vitePlugin_aotCacheGenerator.logAOTCaches(aotData);
          if (result.childProcess) {
            persistentChild = result.childProcess;
            registerCleanupHandlers();
            console.log(`[mion] Server process persisted (pid: ${persistentChild.pid})`);
          }
          if (serverConfig.port && serverConfig.mode === "IPC") {
            const timeout = serverConfig.waitTimeout ?? 3e4;
            console.log(`[mion] Waiting for server on port ${serverConfig.port}...`);
            src_vitePlugin_aotCacheGenerator.waitForServer(serverConfig.port, timeout).then(() => {
              console.log(`[mion] Server ready on port ${serverConfig.port}`);
              onServerReady();
            }).catch((err) => {
              console.error(`[mion] ${err instanceof Error ? err.message : String(err)}`);
            });
          } else {
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
      const startServerScript = path.resolve(serverConfig.startServerScript);
      let nodeRequestHandler = null;
      let basePath = null;
      let initFailed = false;
      console.log("[mion] Generating SSR AOT caches...");
      ssrInitPromise = src_vitePlugin_aotCacheGenerator.loadSSRRouterAndGenerateAOTCaches(ssrLoadModule, startServerScript).then(async (data) => {
        aotData = data;
        aotGenerationPromise = Promise.resolve(data);
        console.log("[mion] SSR AOT caches generated successfully");
        src_vitePlugin_aotCacheGenerator.logAOTCaches(data);
        for (const resolvedId of aotResolvedIds.keys()) {
          const mod = server.moduleGraph.getModuleById(resolvedId);
          if (mod) server.moduleGraph.invalidateModule(mod);
        }
        const routerModule = await server.ssrLoadModule("@mionjs/router");
        const opts = routerModule.getRouterOptions();
        basePath = "/" + (opts.basePath || "").replace(/^\//, "");
        const platformNode = await server.ssrLoadModule("@mionjs/platform-node");
        nodeRequestHandler = platformNode.httpRequestHandler;
        console.log("[mion] Dev server proxy initialized");
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
    resolveId(id, importer) {
      if (id === src_vitePlugin_constants.VIRTUAL_SERVER_PURE_FNS) return src_vitePlugin_constants.resolveVirtualId(id);
      if (aotVirtualModules.has(id)) return src_vitePlugin_constants.resolveVirtualId(id);
      if (aotOptions) {
        if (id.endsWith("/aot-caches") && fs.existsSync(path.resolve(id, "..", src_vitePlugin_constants.AOT_CACHES_SHIM_SOURCE))) {
          return path.resolve(id, "..", "src/aot/aotCaches.ts");
        }
        if (id === src_vitePlugin_constants.AOT_CACHES_SHIM) return src_vitePlugin_constants.resolveVirtualId(src_vitePlugin_constants.VIRTUAL_AOT_CACHES);
        if (id.endsWith("emptyCaches.ts") && importer?.endsWith("aotCaches.ts")) {
          return src_vitePlugin_constants.resolveVirtualId(src_vitePlugin_constants.VIRTUAL_AOT_CACHES);
        }
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
        const initPromise = ssrInitPromise || aotGenerationPromise;
        if (!aotData && initPromise) await initPromise;
        switch (aotType) {
          case "jit-fns": {
            if (!aotData) return src_vitePlugin_aotCacheGenerator.generateNoopModule("No-op: AOT JIT caches not generated");
            return src_vitePlugin_aotCacheGenerator.generateJitFnsModule(aotData.jitFnsCode);
          }
          case "pure-fns": {
            if (!aotData) return src_vitePlugin_aotCacheGenerator.generateNoopModule("No-op: AOT pure fns not generated");
            return src_vitePlugin_aotCacheGenerator.generatePureFnsModule(aotData.pureFnsCode);
          }
          case "router-cache": {
            if (!aotData) return src_vitePlugin_aotCacheGenerator.generateNoopModule("No-op: AOT router cache not generated");
            return src_vitePlugin_aotCacheGenerator.generateRouterCacheModule(aotData.routerCacheCode);
          }
          case "caches": {
            if (!aotData) return src_vitePlugin_aotCacheGenerator.generateNoopCombinedModule();
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
      if (deepkitConfig) after.push(...deepkitConfig.afterTransformers);
      if (needsDeepkit) before.push(...deepkitConfig.beforeTransformers);
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
      return { code: result.outputText, map: result.sourceMapText };
    },
    buildEnd() {
      if (pureServerFnCount > 0 || registerPureFnFactoryCount > 0) {
        const total = pureServerFnCount + registerPureFnFactoryCount;
        const parts = [
          pureServerFnCount > 0 ? `${pureServerFnCount} pureServerFn` : "",
          registerPureFnFactoryCount > 0 ? `${registerPureFnFactoryCount} registerPureFnFactory` : ""
        ].filter(Boolean);
        console.log(`[mion] Injected ${total} pure functions across ${pureFnFilesCount} files (${parts.join(", ")})`);
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
        const serverDir = path.resolve(serverConfig.startServerScript, "..");
        if (file.startsWith(serverDir)) {
          const killPromise = cleanupChild();
          const regeneratePromise = ssrEnabled && ssrLoadModule ? (
            // SSR mode: reset router and re-init via ssrLoadModule
            (async () => {
              const routerModule = await ssrLoadModule("@mionjs/router");
              routerModule.resetRouter();
              return src_vitePlugin_aotCacheGenerator.loadSSRRouterAndGenerateAOTCaches(
                ssrLoadModule,
                path.resolve(serverConfig.startServerScript)
              );
            })()
          ) : (
            // IPC mode: wait for old child to die, then spawn new
            killPromise.then(() => src_vitePlugin_aotCacheGenerator.generateAOTCaches(serverConfig))
          );
          aotGenerationPromise = regeneratePromise.then((r) => "data" in r ? r.data : r);
          regeneratePromise.then((result) => {
            const data = "data" in result ? result.data : result;
            aotData = data;
            src_vitePlugin_aotCacheGenerator.logAOTCaches(data);
            if ("childProcess" in result && result.childProcess) {
              persistentChild = result.childProcess;
              console.log(`[mion] Server process re-persisted (pid: ${persistentChild.pid})`);
            }
            if (serverConfig.port && serverConfig.mode === "IPC") {
              const timeout = serverConfig.waitTimeout ?? 3e4;
              console.log(`[mion] Waiting for restarted server on port ${serverConfig.port}...`);
              src_vitePlugin_aotCacheGenerator.waitForServer(serverConfig.port, timeout).then(() => {
                console.log(`[mion] Restarted server ready on port ${serverConfig.port}`);
                onServerReady();
              }).catch((err) => {
                console.error(`[mion] ${err instanceof Error ? err.message : String(err)}`);
              });
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
              console.log("[mion] AOT caches regenerated, invalidating virtual modules");
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
