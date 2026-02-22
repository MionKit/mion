"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const path = require("path");
const src_vitePlugin_deepkitType = require("./deepkit-type.js");
const src_vitePlugin_extractPureFn = require("./extractPureFn.js");
const src_vitePlugin_virtualModule = require("./virtualModule.js");
const src_vitePlugin_constants = require("./constants.js");
const src_vitePlugin_aotCacheGenerator = require("./aotCacheGenerator.js");
const src_vitePlugin_aotDiskCache = require("./aotDiskCache.js");
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
  const deepkitOptions = options.runTypes;
  const aotOptions = options.aotCaches;
  const deepkitTransform = deepkitOptions ? src_vitePlugin_deepkitType.createDeepkitTransform(deepkitOptions) : null;
  let aotData = null;
  let aotGenerationPromise = null;
  let aotCacheDir = "";
  return {
    name: "mion",
    enforce: "pre",
    configResolved(config) {
      if (aotOptions) {
        aotCacheDir = src_vitePlugin_aotDiskCache.resolveCacheDir(aotOptions, config.cacheDir);
      }
    },
    async buildStart() {
      if (aotOptions) {
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
      return null;
    },
    load(id) {
      if (id === src_vitePlugin_constants.resolveVirtualId(src_vitePlugin_constants.VIRTUAL_SERVER_PURE_FNS)) {
        if (!pureFnOptions) {
          return src_vitePlugin_virtualModule.generateVirtualModule([]);
        }
        if (!extractedFns) {
          extractedFns = src_vitePlugin_extractPureFn.scanClientSource(pureFnOptions);
        }
        return src_vitePlugin_virtualModule.generateVirtualModule(extractedFns);
      }
      if (id === src_vitePlugin_constants.resolveVirtualId(src_vitePlugin_constants.VIRTUAL_AOT_JIT_FNS)) {
        if (!aotData) {
          return src_vitePlugin_aotCacheGenerator.generateNoopModule("No-op: AOT JIT caches not generated");
        }
        return src_vitePlugin_aotCacheGenerator.generateJitFnsModule(aotData.jitFnsCode);
      }
      if (id === src_vitePlugin_constants.resolveVirtualId(src_vitePlugin_constants.VIRTUAL_AOT_PURE_FNS)) {
        if (!aotData) {
          return src_vitePlugin_aotCacheGenerator.generateNoopModule("No-op: AOT pure fns not generated");
        }
        return src_vitePlugin_aotCacheGenerator.generatePureFnsModule(aotData.pureFnsCode);
      }
      if (id === src_vitePlugin_constants.resolveVirtualId(src_vitePlugin_constants.VIRTUAL_AOT_ROUTER_CACHE)) {
        if (!aotData) {
          return src_vitePlugin_aotCacheGenerator.generateNoopModule("No-op: AOT router cache not generated");
        }
        return src_vitePlugin_aotCacheGenerator.generateRouterCacheModule(aotData.routerCacheCode);
      }
      if (id === src_vitePlugin_constants.resolveVirtualId(src_vitePlugin_constants.VIRTUAL_AOT_CACHES)) {
        if (!aotData) {
          return src_vitePlugin_aotCacheGenerator.generateNoopCombinedModule();
        }
        return src_vitePlugin_aotCacheGenerator.generateCombinedCachesModule();
      }
      return null;
    },
    transform(code, fileName) {
      let currentCode = code;
      if (code.includes("pureServerFn")) {
        try {
          const result = src_vitePlugin_extractPureFn.transformPureFnCalls(currentCode, fileName, "pureServerFn", "hash");
          if (result) {
            currentCode = result.code;
          }
        } catch (err) {
          console.warn(`[mion] Warning: Could not transform pureServerFn calls in ${fileName}: ${err}`);
        }
      }
      if (currentCode.includes("registerPureFnFactory")) {
        try {
          const result = src_vitePlugin_extractPureFn.transformPureFnCalls(currentCode, fileName, "registerPureFnFactory", "parsedFactoryFn");
          if (result) {
            currentCode = result.code;
          }
        } catch (err) {
          console.warn(
            `[mion] Warning: Could not transform registerPureFnFactory calls in ${fileName}: ${err}`
          );
        }
      }
      if (deepkitTransform) {
        const deepkitResult = deepkitTransform(currentCode, fileName);
        if (deepkitResult) return deepkitResult;
      }
      return currentCode !== code ? currentCode : null;
    },
    handleHotUpdate({ file, server }) {
      if (pureFnOptions) {
        const clientSrcPath = path.resolve(pureFnOptions.clientSrcPath);
        if (file.startsWith(clientSrcPath)) {
          const include = pureFnOptions.include || ["**/*.ts", "**/*.tsx"];
          const exclude = pureFnOptions.exclude || ["**/node_modules/**", "**/.dist/**", "**/dist/**"];
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
      if (aotOptions && aotOptions.startServerScript) {
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
//# sourceMappingURL=mionVitePlugin.js.map
