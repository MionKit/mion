import { resolve } from "path";
import * as ts from "typescript";
import { createDeepkitConfig, createPureFnTransformerFactory } from "./transformers.js";
import { scanClientSource } from "./extractPureFn.js";
import { generateServerPureFnsVirtualModule } from "./virtualModule.js";
import { resolveVirtualId, VIRTUAL_SERVER_PURE_FNS, VIRTUAL_AOT_JIT_FNS, VIRTUAL_AOT_PURE_FNS, VIRTUAL_AOT_ROUTER_CACHE, VIRTUAL_AOT_CACHES } from "./constants.js";
import { generateAOTCaches, logAOTCaches, generateNoopModule, generateJitFnsModule, generatePureFnsModule, generateRouterCacheModule, generateNoopCombinedModule, generateCombinedCachesModule } from "./aotCacheGenerator.js";
import { updateDiskCache, getOrGenerateAOTCaches, resolveCacheDir } from "./aotDiskCache.js";
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
  return {
    name: "mion",
    enforce: "pre",
    configResolved(config) {
      if (aotOptions) {
        aotCacheDir = resolveCacheDir(aotOptions, config.cacheDir);
      }
    },
    async buildStart() {
      if (aotOptions) {
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
      if (id === VIRTUAL_SERVER_PURE_FNS) return resolveVirtualId(id);
      if (id === VIRTUAL_AOT_JIT_FNS) return resolveVirtualId(id);
      if (id === VIRTUAL_AOT_PURE_FNS) return resolveVirtualId(id);
      if (id === VIRTUAL_AOT_ROUTER_CACHE) return resolveVirtualId(id);
      if (id === VIRTUAL_AOT_CACHES) return resolveVirtualId(id);
      return null;
    },
    load(id) {
      if (id === resolveVirtualId(VIRTUAL_SERVER_PURE_FNS)) {
        if (!pureFnOptions) {
          return generateServerPureFnsVirtualModule([]);
        }
        if (!extractedFns) {
          extractedFns = scanClientSource(pureFnOptions);
        }
        return generateServerPureFnsVirtualModule(extractedFns);
      }
      if (id === resolveVirtualId(VIRTUAL_AOT_JIT_FNS)) {
        if (!aotData) {
          return generateNoopModule("No-op: AOT JIT caches not generated");
        }
        return generateJitFnsModule(aotData.jitFnsCode);
      }
      if (id === resolveVirtualId(VIRTUAL_AOT_PURE_FNS)) {
        if (!aotData) {
          return generateNoopModule("No-op: AOT pure fns not generated");
        }
        return generatePureFnsModule(aotData.pureFnsCode);
      }
      if (id === resolveVirtualId(VIRTUAL_AOT_ROUTER_CACHE)) {
        if (!aotData) {
          return generateNoopModule("No-op: AOT router cache not generated");
        }
        return generateRouterCacheModule(aotData.routerCacheCode);
      }
      if (id === resolveVirtualId(VIRTUAL_AOT_CACHES)) {
        if (!aotData) {
          return generateNoopCombinedModule();
        }
        return generateCombinedCachesModule();
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
        before.push(createPureFnTransformerFactory(code, fileName, collected));
      }
      if (needsDeepkit) {
        before.push(...deepkitConfig.beforeTransformers);
        after.push(...deepkitConfig.afterTransformers);
      }
      const compilerOptions = deepkitConfig?.compilerOptions ?? defaultCompilerOptions;
      const result = ts.transpileModule(code, {
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
        const clientSrcPath = resolve(pureFnOptions.clientSrcPath);
        if (file.startsWith(clientSrcPath)) {
          const include = pureFnOptions.include || ["**/*.ts", "**/*.tsx"];
          const exclude = pureFnOptions.exclude || ["**/node_modules/**", "**/.dist/**", "**/dist/**"];
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
      if (aotOptions && aotOptions.startServerScript) {
        const serverDir = resolve(aotOptions.startServerScript, "..");
        if (file.startsWith(serverDir)) {
          generateAOTCaches(aotOptions).then((data) => {
            aotData = data;
            logAOTCaches(data);
            updateDiskCache(aotOptions, data, aotCacheDir);
            const modulesToInvalidate = [VIRTUAL_AOT_JIT_FNS, VIRTUAL_AOT_PURE_FNS, VIRTUAL_AOT_ROUTER_CACHE].map(
              resolveVirtualId
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
export {
  isIncluded,
  mionVitePlugin
};
//# sourceMappingURL=mionVitePlugin.js.map
