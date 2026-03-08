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
function isIncluded(filePath, include, exclude) {
  const isTs = /\.(ts|tsx|js|jsx)$/.test(filePath);
  const isDir = filePath.endsWith("/");
  if (!isTs && !isDir) return false;
  for (const pattern of exclude) {
    if (matchGlob(filePath, pattern)) return false;
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
function mionVitePlugin(options) {
  let extractedFns = null;
  const pureFnOptions = options.serverPureFunctions;
  const runTypesOptions = options.runTypes;
  const aotOptions = options.aotCaches;
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
  const diskVirtualPrefix = aotOptions?.customVirtualModuleId ? `virtual:${aotOptions.customVirtualModuleId}` : null;
  const DISK_VIRTUAL_JIT_FNS = diskVirtualPrefix ? `${diskVirtualPrefix}/jit-fns` : null;
  const DISK_VIRTUAL_PURE_FNS = diskVirtualPrefix ? `${diskVirtualPrefix}/pure-fns` : null;
  const DISK_VIRTUAL_ROUTER_CACHE = diskVirtualPrefix ? `${diskVirtualPrefix}/router-cache` : null;
  const DISK_VIRTUAL_CACHES = diskVirtualPrefix ? `${diskVirtualPrefix}/caches` : null;
  return {
    name: "mion",
    enforce: "pre",
    config(config) {
      if (aotOptions?.excludeReflection && process.env.MION_COMPILE !== "true") {
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
      if (aotOptions && process.env.MION_COMPILE !== "true") {
        try {
          console.log("[mion] Generating AOT caches...");
          aotGenerationPromise = src_vitePlugin_aotDiskCache.getOrGenerateAOTCaches(aotOptions, aotCacheDir);
          aotData = await aotGenerationPromise;
          console.log("[mion] AOT caches generated successfully");
          src_vitePlugin_aotCacheGenerator.logAOTCaches(aotData);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          throw new Error(`[mion] Failed to generate AOT caches: ${message}`);
        }
      }
    },
    resolveId(id) {
      if (id === src_vitePlugin_constants.VIRTUAL_SERVER_PURE_FNS) return src_vitePlugin_constants.resolveVirtualId(id);
      if (id === src_vitePlugin_constants.VIRTUAL_AOT_JIT_FNS) return src_vitePlugin_constants.resolveVirtualId(id);
      if (id === src_vitePlugin_constants.VIRTUAL_AOT_PURE_FNS) return src_vitePlugin_constants.resolveVirtualId(id);
      if (id === src_vitePlugin_constants.VIRTUAL_AOT_ROUTER_CACHE) return src_vitePlugin_constants.resolveVirtualId(id);
      if (id === src_vitePlugin_constants.VIRTUAL_AOT_CACHES) return src_vitePlugin_constants.resolveVirtualId(id);
      if (DISK_VIRTUAL_JIT_FNS && id === DISK_VIRTUAL_JIT_FNS) return src_vitePlugin_constants.resolveVirtualId(id);
      if (DISK_VIRTUAL_PURE_FNS && id === DISK_VIRTUAL_PURE_FNS) return src_vitePlugin_constants.resolveVirtualId(id);
      if (DISK_VIRTUAL_ROUTER_CACHE && id === DISK_VIRTUAL_ROUTER_CACHE) return src_vitePlugin_constants.resolveVirtualId(id);
      if (DISK_VIRTUAL_CACHES && id === DISK_VIRTUAL_CACHES) return src_vitePlugin_constants.resolveVirtualId(id);
      if (aotOptions?.excludeReflection && process.env.MION_COMPILE !== "true" && src_vitePlugin_constants.REFLECTION_MODULES.includes(id)) {
        return src_vitePlugin_constants.resolveVirtualId(src_vitePlugin_constants.VIRTUAL_STUB_PREFIX + id);
      }
      return null;
    },
    load(id) {
      if (id === src_vitePlugin_constants.resolveVirtualId(src_vitePlugin_constants.VIRTUAL_SERVER_PURE_FNS)) {
        if (!pureFnOptions) {
          return src_vitePlugin_virtualModule.generateServerPureFnsVirtualModule([]);
        }
        if (!extractedFns) {
          extractedFns = src_vitePlugin_extractPureFn.scanClientSource(pureFnOptions);
        }
        return src_vitePlugin_virtualModule.generateServerPureFnsVirtualModule(extractedFns);
      }
      if (id === src_vitePlugin_constants.resolveVirtualId(src_vitePlugin_constants.VIRTUAL_AOT_JIT_FNS) || DISK_VIRTUAL_JIT_FNS && id === src_vitePlugin_constants.resolveVirtualId(DISK_VIRTUAL_JIT_FNS)) {
        if (!aotData) return src_vitePlugin_aotCacheGenerator.generateNoopModule("No-op: AOT JIT caches not generated");
        return src_vitePlugin_aotCacheGenerator.generateJitFnsModule(aotData.jitFnsCode);
      }
      if (id === src_vitePlugin_constants.resolveVirtualId(src_vitePlugin_constants.VIRTUAL_AOT_PURE_FNS) || DISK_VIRTUAL_PURE_FNS && id === src_vitePlugin_constants.resolveVirtualId(DISK_VIRTUAL_PURE_FNS)) {
        if (!aotData) return src_vitePlugin_aotCacheGenerator.generateNoopModule("No-op: AOT pure fns not generated");
        return src_vitePlugin_aotCacheGenerator.generatePureFnsModule(aotData.pureFnsCode);
      }
      if (id === src_vitePlugin_constants.resolveVirtualId(src_vitePlugin_constants.VIRTUAL_AOT_ROUTER_CACHE) || DISK_VIRTUAL_ROUTER_CACHE && id === src_vitePlugin_constants.resolveVirtualId(DISK_VIRTUAL_ROUTER_CACHE)) {
        if (!aotData) return src_vitePlugin_aotCacheGenerator.generateNoopModule("No-op: AOT router cache not generated");
        return src_vitePlugin_aotCacheGenerator.generateRouterCacheModule(aotData.routerCacheCode);
      }
      if (id === src_vitePlugin_constants.resolveVirtualId(src_vitePlugin_constants.VIRTUAL_AOT_CACHES) || DISK_VIRTUAL_CACHES && id === src_vitePlugin_constants.resolveVirtualId(DISK_VIRTUAL_CACHES)) {
        if (!aotData) return src_vitePlugin_aotCacheGenerator.generateNoopCombinedModule();
        return src_vitePlugin_aotCacheGenerator.generateCombinedCachesModule();
      }
      for (const mod of src_vitePlugin_constants.REFLECTION_MODULES) {
        if (id === src_vitePlugin_constants.resolveVirtualId(src_vitePlugin_constants.VIRTUAL_STUB_PREFIX + mod)) {
          return { code: "export default {}", syntheticNamedExports: true };
        }
      }
      return null;
    },
    transform(code, fileName) {
      const hasPureFns = code.includes("pureServerFn") || code.includes("registerPureFnFactory") || code.includes("mapFrom");
      const needsDeepkit = deepkitConfig ? deepkitConfig.filter(fileName) : false;
      if (!hasPureFns && !needsDeepkit) return null;
      const before = [];
      const after = [];
      const collected = hasPureFns ? [] : void 0;
      if (hasPureFns) {
        before.push(src_vitePlugin_transformers.createPureFnTransformerFactory(code, fileName, collected, pureFnOptions?.noViteClient));
      }
      if (deepkitConfig) {
        after.push(...deepkitConfig.afterTransformers);
      }
      if (needsDeepkit) {
        before.push(...deepkitConfig.beforeTransformers);
      }
      const baseCompilerOptions = deepkitConfig?.compilerOptions ?? defaultCompilerOptions;
      const compilerOptions = fileName.endsWith(".tsx") ? { ...baseCompilerOptions, jsx: ts__namespace.JsxEmit.ReactJSX } : baseCompilerOptions;
      const result = ts__namespace.transpileModule(code, {
        compilerOptions,
        fileName,
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
    handleHotUpdate({ file, server }) {
      if (pureFnOptions) {
        const clientSrcPath = path.resolve(pureFnOptions.clientSrcPath);
        if (file.startsWith(clientSrcPath)) {
          const include = pureFnOptions.include || ["**/*.ts", "**/*.tsx"];
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
      if (aotOptions && aotOptions.startServerScript && process.env.MION_COMPILE !== "true") {
        const serverDir = path.resolve(aotOptions.startServerScript, "..");
        if (file.startsWith(serverDir)) {
          src_vitePlugin_aotCacheGenerator.generateAOTCaches(aotOptions).then((data) => {
            aotData = data;
            src_vitePlugin_aotCacheGenerator.logAOTCaches(data);
            src_vitePlugin_aotDiskCache.updateDiskCache(aotOptions, data, aotCacheDir);
            const modulesToInvalidate = [src_vitePlugin_constants.VIRTUAL_AOT_JIT_FNS, src_vitePlugin_constants.VIRTUAL_AOT_PURE_FNS, src_vitePlugin_constants.VIRTUAL_AOT_ROUTER_CACHE].map(
              src_vitePlugin_constants.resolveVirtualId
            );
            const invalidatedMods = [];
            for (const vmId of modulesToInvalidate) {
              const mod = server.moduleGraph.getModuleById(vmId);
              if (mod) {
                server.moduleGraph.invalidateModule(mod);
                invalidatedMods.push(mod);
              }
            }
            if (invalidatedMods.length > 0) {
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
exports.isIncluded = isIncluded;
exports.mionVitePlugin = mionVitePlugin;
//# sourceMappingURL=mionVitePlugin.cjs.map
