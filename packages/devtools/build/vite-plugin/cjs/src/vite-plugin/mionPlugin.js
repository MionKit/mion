"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const fs = require("fs");
const path = require("path");
const src_vitePlugin_deepkitType = require("./deepkit-type.js");
const src_vitePlugin_extractPureFn = require("./extractPureFn.js");
const src_vitePlugin_virtualModule = require("./virtualModule.js");
const src_vitePlugin_constants = require("./constants.js");
const src_vitePlugin_aotCacheGenerator = require("./aotCacheGenerator.js");
function scanClientSource(options) {
  const include = options.include || ["**/*.ts", "**/*.tsx"];
  const exclude = options.exclude || ["**/node_modules/**", "**/.dist/**", "**/dist/**"];
  const clientSrcPath = path.resolve(options.clientSrcPath);
  const fns = [];
  function scanDir(dir) {
    const entries = fs.readdirSync(dir);
    for (const entry of entries) {
      const fullPath = path.join(dir, entry);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        if (!isIncluded(fullPath + "/", include, exclude)) continue;
        scanDir(fullPath);
      } else if (stat.isFile()) {
        if (!isIncluded(fullPath, include, exclude)) continue;
        try {
          const code = fs.readFileSync(fullPath, "utf-8");
          if (!code.includes("pureServerFn")) continue;
          const extracted = src_vitePlugin_extractPureFn.extractPureFnsFromSource(code, fullPath);
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
  let aotData = null;
  let aotGenerationPromise = null;
  return {
    name: "mion",
    enforce: "pre",
    async buildStart() {
      if (aotOptions && aotOptions.mode) {
        let startScriptOverride;
        if (!aotOptions.startServerScript) {
          startScriptOverride = src_vitePlugin_aotCacheGenerator.getDefaultRoutesScriptPath();
          console.log("[mion] No startServerScript provided, using default routes for internal mion routes only");
        }
        try {
          console.log("[mion] Generating AOT caches...");
          aotGenerationPromise = src_vitePlugin_aotCacheGenerator.generateAOTCaches(aotOptions, startScriptOverride);
          aotData = await aotGenerationPromise;
          console.log("[mion] AOT caches generated successfully");
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          throw new Error(`[mion] Failed to generate AOT caches: ${message}`);
        }
      }
    },
    resolveId(id) {
      if (pureFnOptions && id === src_vitePlugin_constants.VIRTUAL_MODULE_ID) {
        return src_vitePlugin_constants.RESOLVED_VIRTUAL_MODULE_ID;
      }
      if (id === src_vitePlugin_constants.VIRTUAL_AOT_JIT_FNS) return src_vitePlugin_constants.RESOLVED_AOT_JIT_FNS;
      if (id === src_vitePlugin_constants.VIRTUAL_AOT_PURE_FNS) return src_vitePlugin_constants.RESOLVED_AOT_PURE_FNS;
      if (id === src_vitePlugin_constants.VIRTUAL_AOT_ROUTER_CACHE) return src_vitePlugin_constants.RESOLVED_AOT_ROUTER_CACHE;
      return null;
    },
    load(id) {
      if (pureFnOptions && id === src_vitePlugin_constants.RESOLVED_VIRTUAL_MODULE_ID) {
        if (!extractedFns) {
          extractedFns = scanClientSource(pureFnOptions);
        }
        return src_vitePlugin_virtualModule.generateVirtualModule(extractedFns);
      }
      if (id === src_vitePlugin_constants.RESOLVED_AOT_JIT_FNS) {
        if (!aotData) {
          return src_vitePlugin_aotCacheGenerator.generateNoopModule("No-op: AOT JIT caches not generated");
        }
        return src_vitePlugin_aotCacheGenerator.generateJitFnsModule(aotData.jitFnsCode);
      }
      if (id === src_vitePlugin_constants.RESOLVED_AOT_PURE_FNS) {
        if (!aotData) {
          return src_vitePlugin_aotCacheGenerator.generateNoopModule("No-op: AOT pure fns not generated");
        }
        return src_vitePlugin_aotCacheGenerator.generatePureFnsModule(aotData.pureFnsCode);
      }
      if (id === src_vitePlugin_constants.RESOLVED_AOT_ROUTER_CACHE) {
        if (!aotData) {
          return src_vitePlugin_aotCacheGenerator.generateNoopModule("No-op: AOT router cache not generated");
        }
        return src_vitePlugin_aotCacheGenerator.generateRouterCacheModule(aotData.routerCacheCode);
      }
      return null;
    },
    transform(code, fileName) {
      if (pureFnOptions) {
        try {
          const fns = src_vitePlugin_extractPureFn.extractPureFnsFromSource(code, fileName);
          if (fns.length > 0) {
          }
        } catch (err) {
          console.warn(`[mion] Warning: Could not extract pure functions from ${fileName}: ${err}`);
        }
      }
      if (deepkitOptions) {
        return src_vitePlugin_deepkitType.transformWithDeepkit(code, fileName, deepkitOptions);
      }
      return null;
    },
    handleHotUpdate({ file, server }) {
      if (pureFnOptions) {
        const clientSrcPath = path.resolve(pureFnOptions.clientSrcPath);
        if (file.startsWith(clientSrcPath)) {
          const include = pureFnOptions.include || ["**/*.ts", "**/*.tsx"];
          const exclude = pureFnOptions.exclude || ["**/node_modules/**", "**/.dist/**", "**/dist/**"];
          if (isIncluded(file, include, exclude)) {
            extractedFns = null;
            const mod = server.moduleGraph.getModuleById(src_vitePlugin_constants.RESOLVED_VIRTUAL_MODULE_ID);
            if (mod) {
              server.moduleGraph.invalidateModule(mod);
              return [mod];
            }
          }
        }
      }
      if (aotOptions && aotOptions.mode && aotOptions.startServerScript) {
        const serverDir = path.resolve(aotOptions.startServerScript, "..");
        if (file.startsWith(serverDir)) {
          src_vitePlugin_aotCacheGenerator.generateAOTCaches(aotOptions).then((data) => {
            aotData = data;
            const modulesToInvalidate = [src_vitePlugin_constants.RESOLVED_AOT_JIT_FNS, src_vitePlugin_constants.RESOLVED_AOT_PURE_FNS, src_vitePlugin_constants.RESOLVED_AOT_ROUTER_CACHE];
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
exports.mionVitePlugin = mionVitePlugin;
//# sourceMappingURL=mionPlugin.js.map
