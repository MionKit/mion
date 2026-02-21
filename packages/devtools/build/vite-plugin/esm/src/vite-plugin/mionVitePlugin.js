import { readdirSync, statSync, readFileSync } from "fs";
import { resolve, join } from "path";
import { createDeepkitTransform } from "./deepkit-type.js";
import { extractPureFnsFromSource } from "./extractPureFn.js";
import { generateVirtualModule } from "./virtualModule.js";
import { RESOLVED_VIRTUAL_MODULE_ID, RESOLVED_AOT_JIT_FNS, RESOLVED_AOT_PURE_FNS, RESOLVED_AOT_ROUTER_CACHE, RESOLVED_AOT_CACHES, VIRTUAL_MODULE_ID, VIRTUAL_AOT_JIT_FNS, VIRTUAL_AOT_PURE_FNS, VIRTUAL_AOT_ROUTER_CACHE, VIRTUAL_AOT_CACHES } from "./constants.js";
import { generateAOTCaches, logAOTCaches, generateNoopModule, generateJitFnsModule, generatePureFnsModule, generateRouterCacheModule, generateNoopCombinedModule, generateCombinedCachesModule } from "./aotCacheGenerator.js";
import { updateDiskCache, getOrGenerateAOTCaches, resolveCacheDir } from "./aotDiskCache.js";
function scanClientSource(options) {
  const include = options.include || ["**/*.ts", "**/*.tsx"];
  const exclude = options.exclude || ["**/node_modules/**", "**/.dist/**", "**/dist/**"];
  const clientSrcPath = resolve(options.clientSrcPath);
  const fns = [];
  function scanDir(dir) {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        if (!isIncluded(fullPath + "/", include, exclude)) continue;
        scanDir(fullPath);
      } else if (stat.isFile()) {
        if (!isIncluded(fullPath, include, exclude)) continue;
        try {
          const code = readFileSync(fullPath, "utf-8");
          if (!code.includes("pureServerFn")) continue;
          const extracted = extractPureFnsFromSource(code, fullPath);
          fns.push(...extracted);
        } catch (err) {
          console.warn(`[mion-pure-functions] Warning: Could not parse ${fullPath}: ${err.message}`);
        }
      }
    }
  }
  scanDir(clientSrcPath);
  return fns;
}
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
  const pureFnOptions = options.pureFunctions;
  const deepkitOptions = options.deepkitType;
  const aotOptions = options.aotCaches;
  const deepkitTransform = deepkitOptions ? createDeepkitTransform(deepkitOptions) : null;
  let aotData = null;
  let aotGenerationPromise = null;
  let aotCacheDir = "";
  return {
    name: "mion",
    enforce: "pre",
    configResolved(config) {
      if (aotOptions && aotOptions.mode) {
        aotCacheDir = resolveCacheDir(aotOptions, config.cacheDir);
      }
    },
    async buildStart() {
      if (aotOptions && aotOptions.mode) {
        try {
          console.log("[mion] Generating AOT caches...");
          aotGenerationPromise = getOrGenerateAOTCaches(aotOptions, aotCacheDir);
          aotData = await aotGenerationPromise;
          console.log("[mion] AOT caches generated successfully");
          logAOTCaches(aotData);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          throw new Error(`[mion] Failed to generate AOT caches: ${message}`);
        }
      }
    },
    resolveId(id) {
      if (pureFnOptions && id === VIRTUAL_MODULE_ID) {
        return RESOLVED_VIRTUAL_MODULE_ID;
      }
      if (id === VIRTUAL_AOT_JIT_FNS) return RESOLVED_AOT_JIT_FNS;
      if (id === VIRTUAL_AOT_PURE_FNS) return RESOLVED_AOT_PURE_FNS;
      if (id === VIRTUAL_AOT_ROUTER_CACHE) return RESOLVED_AOT_ROUTER_CACHE;
      if (id === VIRTUAL_AOT_CACHES) return RESOLVED_AOT_CACHES;
      return null;
    },
    load(id) {
      if (pureFnOptions && id === RESOLVED_VIRTUAL_MODULE_ID) {
        if (!extractedFns) {
          extractedFns = scanClientSource(pureFnOptions);
        }
        return generateVirtualModule(extractedFns);
      }
      if (id === RESOLVED_AOT_JIT_FNS) {
        if (!aotData) {
          return generateNoopModule("No-op: AOT JIT caches not generated");
        }
        return generateJitFnsModule(aotData.jitFnsCode);
      }
      if (id === RESOLVED_AOT_PURE_FNS) {
        if (!aotData) {
          return generateNoopModule("No-op: AOT pure fns not generated");
        }
        return generatePureFnsModule(aotData.pureFnsCode);
      }
      if (id === RESOLVED_AOT_ROUTER_CACHE) {
        if (!aotData) {
          return generateNoopModule("No-op: AOT router cache not generated");
        }
        return generateRouterCacheModule(aotData.routerCacheCode);
      }
      if (id === RESOLVED_AOT_CACHES) {
        if (!aotData) {
          return generateNoopCombinedModule();
        }
        return generateCombinedCachesModule();
      }
      return null;
    },
    transform(code, fileName) {
      if (pureFnOptions) {
        try {
          const fns = extractPureFnsFromSource(code, fileName);
          if (fns.length > 0) {
          }
        } catch (err) {
          console.warn(`[mion] Warning: Could not extract pure functions from ${fileName}: ${err}`);
        }
      }
      if (deepkitTransform) {
        return deepkitTransform(code, fileName);
      }
      return null;
    },
    handleHotUpdate({ file, server }) {
      if (pureFnOptions) {
        const clientSrcPath = resolve(pureFnOptions.clientSrcPath);
        if (file.startsWith(clientSrcPath)) {
          const include = pureFnOptions.include || ["**/*.ts", "**/*.tsx"];
          const exclude = pureFnOptions.exclude || ["**/node_modules/**", "**/.dist/**", "**/dist/**"];
          if (isIncluded(file, include, exclude)) {
            extractedFns = null;
            const mod = server.moduleGraph.getModuleById(RESOLVED_VIRTUAL_MODULE_ID);
            if (mod) {
              server.moduleGraph.invalidateModule(mod);
              return [mod];
            }
          }
        }
      }
      if (aotOptions && aotOptions.mode && aotOptions.startServerScript) {
        const serverDir = resolve(aotOptions.startServerScript, "..");
        if (file.startsWith(serverDir)) {
          generateAOTCaches(aotOptions).then((data) => {
            aotData = data;
            logAOTCaches(data);
            updateDiskCache(aotOptions, data, aotCacheDir);
            const modulesToInvalidate = [RESOLVED_AOT_JIT_FNS, RESOLVED_AOT_PURE_FNS, RESOLVED_AOT_ROUTER_CACHE];
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
export {
  mionVitePlugin
};
//# sourceMappingURL=mionVitePlugin.js.map
