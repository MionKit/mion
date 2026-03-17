import { resolve } from "path";
import { createRequire } from "module";
import { existsSync } from "fs";
import * as ts from "typescript";
import { createDeepkitConfig, createPureFnTransformerFactory } from "./transformers.js";
import { scanClientSource } from "./extractPureFn.js";
import { generateServerPureFnsVirtualModule } from "./virtualModule.js";
import { resolveVirtualId, VIRTUAL_SERVER_PURE_FNS, REFLECTION_MODULES, VIRTUAL_STUB_PREFIX, VIRTUAL_AOT_CACHES, AOT_CACHES_SHIM, SERVER_PURE_FNS_SHIM } from "./constants.js";
import { generateAOTCaches, logAOTCaches, waitForServer, generateNoopCombinedModule, generateCombinedCachesModule, generateNoopModule, generateRouterCacheModule, generatePureFnsModule, generateJitFnsModule, loadSSRRouterAndGenerateAOTCaches, killPersistentChild } from "./aotCacheGenerator.js";
import { updateDiskCache, getOrGenerateAOTCaches, resolveCacheDir } from "./aotDiskCache.js";
function mionVitePlugin(options) {
  let extractedFns = null;
  const pureFnOptions = options.serverPureFunctions;
  const runTypesOptions = options.runTypes;
  const aotOptions = options.aotCaches === true ? {} : options.aotCaches;
  const serverConfig = options.server;
  const deepkitConfig = runTypesOptions ? createDeepkitConfig(runTypesOptions) : null;
  const defaultCompilerOptions = {
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext
  };
  let pureServerFnCount = 0;
  let registerPureFnFactoryCount = 0;
  let pureFnFilesCount = 0;
  let aotData = null;
  let aotGenerationPromise = null;
  let aotCacheDir = "";
  let ssrLoadModule = null;
  const ssrEnabled = serverConfig?.runMode === "middleware";
  let ssrInitPromise = null;
  let persistentChild = null;
  let cleanupRegistered = false;
  const { aotVirtualModules, aotResolvedIds } = buildAOTVirtualModuleMaps(aotOptions?.customVirtualModuleId);
  async function cleanupChild() {
    if (persistentChild) {
      await killPersistentChild(persistentChild);
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
          for (const mod of REFLECTION_MODULES) {
            delete aliases[mod];
          }
        }
      }
      const shimModules = [];
      if (pureFnOptions) shimModules.push(SERVER_PURE_FNS_SHIM);
      if (aotOptions) shimModules.push(AOT_CACHES_SHIM);
      addSsrNoExternal(config, shimModules);
      if (env.command === "build" && shimModules.length > 0) {
        wrapBuildExternal(config, shimModules);
      }
    },
    configResolved(config) {
      if (aotOptions) {
        aotCacheDir = resolveCacheDir(aotOptions, config.cacheDir);
      }
    },
    async buildStart() {
      if (serverConfig && !isRunningAsChild() && !ssrEnabled) {
        if (serverConfig.port) process.env.MION_TEST_PORT = String(serverConfig.port);
        try {
          console.log("[mion] Generating AOT caches...");
          const resultPromise = getOrGenerateAOTCaches(serverConfig, aotOptions, aotCacheDir);
          aotGenerationPromise = resultPromise.then((r) => r.data);
          const result = await resultPromise;
          aotData = result.data;
          console.log("[mion] AOT caches generated successfully");
          logAOTCaches(aotData);
          if (result.childProcess) {
            persistentChild = result.childProcess;
            registerCleanupHandlers();
            console.log(`[mion] Server process persisted (pid: ${persistentChild.pid})`);
          }
          if (serverConfig.port && serverConfig.runMode === "childProcess") {
            const timeout = serverConfig.waitTimeout ?? 3e4;
            console.log(`[mion] Waiting for server on port ${serverConfig.port}...`);
            waitForServer(serverConfig.port, timeout).then(() => {
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
      const startScript = resolve(serverConfig.startScript);
      let nodeRequestHandler = null;
      let basePath = null;
      let initFailed = false;
      console.log("[mion] Generating SSR AOT caches...");
      ssrInitPromise = loadSSRRouterAndGenerateAOTCaches(ssrLoadModule, startScript).then(async (data) => {
        aotData = data;
        aotGenerationPromise = Promise.resolve(data);
        console.log("[mion] SSR AOT caches generated successfully");
        logAOTCaches(data);
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
      if (id === VIRTUAL_SERVER_PURE_FNS) return resolveVirtualId(id);
      if (aotVirtualModules.has(id)) return resolveVirtualId(id);
      if (aotOptions) {
        const resolved = resolveShimModule(
          id,
          importer,
          AOT_CACHES_SHIM,
          VIRTUAL_AOT_CACHES,
          "aot-caches",
          "aotCaches.ts",
          "emptyCaches.ts"
        );
        if (resolved) return resolved;
      }
      if (pureFnOptions) {
        const resolved = resolveShimModule(
          id,
          importer,
          SERVER_PURE_FNS_SHIM,
          VIRTUAL_SERVER_PURE_FNS,
          "server-pure-fns",
          "serverPureFnsCaches.ts",
          "emptyServerPureFns.ts"
        );
        if (resolved) return resolved;
      }
      if (aotOptions?.excludeReflection && !isRunningAsChild() && REFLECTION_MODULES.includes(id)) {
        return resolveVirtualId(VIRTUAL_STUB_PREFIX + id);
      }
      return null;
    },
    async load(id) {
      if (id === resolveVirtualId(VIRTUAL_SERVER_PURE_FNS)) {
        if (!pureFnOptions) return generateServerPureFnsVirtualModule([]);
        if (!extractedFns) extractedFns = scanClientSource(pureFnOptions);
        return generateServerPureFnsVirtualModule(extractedFns);
      }
      const aotType = aotResolvedIds.get(id);
      if (aotType) {
        const initPromise = ssrInitPromise || aotGenerationPromise;
        if (!aotData && initPromise) await initPromise;
        switch (aotType) {
          case "jit-fns": {
            if (!aotData) return generateNoopModule("No-op: AOT JIT caches not generated");
            return generateJitFnsModule(aotData.jitFnsCode);
          }
          case "pure-fns": {
            if (!aotData) return generateNoopModule("No-op: AOT pure fns not generated");
            return generatePureFnsModule(aotData.pureFnsCode);
          }
          case "router-cache": {
            if (!aotData) return generateNoopModule("No-op: AOT router cache not generated");
            return generateRouterCacheModule(aotData.routerCacheCode);
          }
          case "caches": {
            if (!aotData) return generateNoopCombinedModule();
            return generateCombinedCachesModule();
          }
        }
      }
      for (const mod of REFLECTION_MODULES) {
        if (id === resolveVirtualId(VIRTUAL_STUB_PREFIX + mod)) {
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
        before.push(createPureFnTransformerFactory(code, tsFileName, collected, pureFnOptions?.noViteClient));
      }
      if (deepkitConfig) after.push(...deepkitConfig.afterTransformers);
      if (needsDeepkit) before.push(...deepkitConfig.beforeTransformers);
      const baseCompilerOptions = deepkitConfig?.compilerOptions ?? defaultCompilerOptions;
      const compilerOptions = isTsx ? { ...baseCompilerOptions, jsx: ts.JsxEmit.ReactJSX } : baseCompilerOptions;
      const result = ts.transpileModule(code, {
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
        const clientSrcPath = resolve(pureFnOptions.clientSrcPath);
        if (file.startsWith(clientSrcPath)) {
          const include = pureFnOptions.include || ["**/*.ts", "**/*.tsx", "**/*.vue"];
          const exclude = pureFnOptions.exclude || ["../node_modules/**", "**/.dist/**", "**/dist/**"];
          if (isIncluded(file, include, exclude)) {
            extractedFns = null;
            const mod = server.moduleGraph.getModuleById(resolveVirtualId(VIRTUAL_SERVER_PURE_FNS));
            if (mod) {
              server.moduleGraph.invalidateModule(mod);
              return [mod];
            }
          }
        }
      }
      if (serverConfig && !isRunningAsChild()) {
        const serverDir = resolve(serverConfig.startScript, "..");
        if (file.startsWith(serverDir)) {
          const killPromise = cleanupChild();
          const regeneratePromise = ssrEnabled && ssrLoadModule ? (
            // SSR mode: reset router and re-init via ssrLoadModule
            (async () => {
              const routerModule = await ssrLoadModule("@mionjs/router");
              routerModule.resetRouter();
              return loadSSRRouterAndGenerateAOTCaches(ssrLoadModule, resolve(serverConfig.startScript));
            })()
          ) : (
            // IPC mode: wait for old child to die, then spawn new
            killPromise.then(() => generateAOTCaches(serverConfig))
          );
          aotGenerationPromise = regeneratePromise.then((r) => "data" in r ? r.data : r);
          regeneratePromise.then((result) => {
            const data = "data" in result ? result.data : result;
            aotData = data;
            logAOTCaches(data);
            if ("childProcess" in result && result.childProcess) {
              persistentChild = result.childProcess;
              console.log(`[mion] Server process re-persisted (pid: ${persistentChild.pid})`);
            }
            if (serverConfig.port && serverConfig.runMode === "childProcess") {
              const timeout = serverConfig.waitTimeout ?? 3e4;
              console.log(`[mion] Waiting for restarted server on port ${serverConfig.port}...`);
              waitForServer(serverConfig.port, timeout).then(() => {
                console.log(`[mion] Restarted server ready on port ${serverConfig.port}`);
                onServerReady();
              }).catch((err) => {
                console.error(`[mion] ${err instanceof Error ? err.message : String(err)}`);
              });
            }
            if (!ssrEnabled) updateDiskCache(serverConfig, aotOptions, data, aotCacheDir);
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
function isRunningAsChild() {
  return process.env.MION_COMPILE === "onlyAOT" || process.env.MION_COMPILE === "serve";
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
    aotResolvedIds.set(resolveVirtualId(defaultId), type);
    if (customVirtualModuleId) {
      const customId = `virtual:${customVirtualModuleId}/${type}`;
      aotVirtualModules.set(customId, type);
      aotResolvedIds.set(resolveVirtualId(customId), type);
    }
  }
  return { aotVirtualModules, aotResolvedIds };
}
function resolveShimModule(id, importer, shimSpecifier, virtualModuleId, entryName, sourceFileName, emptyFileName) {
  if (id === shimSpecifier) {
    try {
      const resolved = createRequire(import.meta.url).resolve(shimSpecifier);
      const sourceFile = resolve(resolved.replace(/[/\\].dist[/\\].*$/, ""), "src/aot/" + sourceFileName);
      if (existsSync(sourceFile)) return sourceFile;
      return resolveVirtualId(virtualModuleId);
    } catch {
      return resolveVirtualId(virtualModuleId);
    }
  }
  if (id.endsWith("/" + entryName)) {
    const sourceFile = resolve(id, "..", "src/aot/" + sourceFileName);
    if (existsSync(sourceFile)) return sourceFile;
  }
  const emptyBase = emptyFileName.replace(".ts", "");
  const sourceBase = sourceFileName.replace(".ts", "");
  if (new RegExp(`${emptyBase}\\.(ts|js|mjs|cjs)$`).test(id) && importer && new RegExp(`${sourceBase}\\.(ts|js|mjs|cjs)$`).test(importer)) {
    return resolveVirtualId(virtualModuleId);
  }
  return null;
}
function addSsrNoExternal(config, moduleIds) {
  if (moduleIds.length === 0) return;
  const noExternal = config.ssr?.noExternal;
  if (!config.ssr) config.ssr = {};
  if (Array.isArray(noExternal)) {
    for (const moduleId of moduleIds) {
      if (!noExternal.includes(moduleId)) noExternal.push(moduleId);
    }
  } else if (typeof noExternal === "string") {
    config.ssr.noExternal = [noExternal, ...moduleIds];
  } else if (noExternal !== true) {
    config.ssr.noExternal = noExternal ? [noExternal, ...moduleIds] : [...moduleIds];
  }
}
function wrapBuildExternal(config, shimModules) {
  if (!config.build) config.build = {};
  if (!config.build.rollupOptions) config.build.rollupOptions = {};
  const original = config.build.rollupOptions.external;
  if (!original) return;
  config.build.rollupOptions.external = (id, ...rest) => {
    if (shimModules.includes(id) || id.startsWith("virtual:mion")) return false;
    if (typeof original === "function") return original(id, ...rest);
    if (Array.isArray(original)) return original.some((ext) => ext instanceof RegExp ? ext.test(id) : ext === id);
    if (original instanceof RegExp) return original.test(id);
    return original === id;
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
export {
  isIncluded,
  mionVitePlugin,
  parseVueModuleId,
  serverReady
};
//# sourceMappingURL=mionVitePlugin.js.map
