import { resolve, join, dirname } from "path";
import { existsSync, cpSync } from "fs";
import { compileAndWriteJitFunctions, compileAndWritePureFunctions, compileAndWriteRouterMethods } from "./cacheCompiler.js";
import { getJitFnCaches, getJitUtils, routesCache } from "@mionkit/core";
import { getPersistedMethods } from "@mionkit/router";
import { isTest } from "./constants.js";
import { JitFunctions } from "@mionkit/run-types";
const EXCLUDED_FNS = [JitFunctions.toJSCode.id];
const EXCLUDED_PURE_FNS = ["sanitizeCompiledFn"];
function resetCacheFiles(templateDir, aotDir) {
  const moduleFormats = ["cjs", "esm"];
  for (const moduleFormat of moduleFormats) {
    const templateBuildDir = join(templateDir, "build", moduleFormat, "src");
    const targetBuildDir = join(aotDir, "build", moduleFormat, "src");
    if (!existsSync(templateBuildDir)) {
      throw new Error(`Template build directory not found: ${templateBuildDir}`);
    }
    if (!existsSync(targetBuildDir)) {
      throw new Error(`Target build directory not found: ${targetBuildDir}. Run 'mion-init-aot' first.`);
    }
    cpSync(templateBuildDir, targetBuildDir, { recursive: true });
  }
}
function registerTsNode(scriptPath) {
  const scriptDir = dirname(scriptPath);
  let tsconfigPath;
  let currentDir = scriptDir;
  while (currentDir !== dirname(currentDir)) {
    const candidate = join(currentDir, "tsconfig.json");
    if (existsSync(candidate)) {
      tsconfigPath = candidate;
      break;
    }
    currentDir = dirname(currentDir);
  }
  const tsNode = require("ts-node");
  require("tsconfig-paths/register");
  tsNode.register({
    project: tsconfigPath,
    transpileOnly: true,
    compilerOptions: {
      module: "commonjs"
    }
  });
}
async function compileAOT(options, excludedFns = EXCLUDED_FNS, excludedPureFns = EXCLUDED_PURE_FNS) {
  const { startScriptPath, aotDir, templateDir } = options;
  const resolvedStartScript = resolve(startScriptPath);
  const isTypeScript = resolvedStartScript.endsWith(".ts") || resolvedStartScript.endsWith(".tsx");
  if (!isTest) {
    console.log(`AOT Compilation starting...`);
    console.log(`Start script: ${resolvedStartScript}`);
    console.log(`AOT directory: ${aotDir}`);
    if (isTypeScript) {
      console.log(`TypeScript file detected, using ts-node...`);
    }
  }
  if (!isTest) {
    console.log("Resetting cache files to original template state...");
  }
  resetCacheFiles(templateDir, aotDir);
  if (isTypeScript) {
    registerTsNode(resolvedStartScript);
  }
  process.env.MION_COMPILE = "true";
  enableCompileTracking();
  if (!isTest) console.log("Running start script to populate caches...");
  try {
    const module = await import(resolvedStartScript);
    const promiseExports = Object.values(module).filter((value) => value instanceof Promise);
    if (promiseExports.length > 0) {
      await Promise.all(promiseExports);
    }
    if (!isTest) console.log("Start script completed, caches populated");
  } catch (error) {
    console.error("Error running start script:", error.message);
    throw error;
  }
  if (!isTest) console.log("Compiling and writing AOT caches...");
  const { jitFnsCache, pureFnsCache } = getJitFnCaches();
  const routerCache = getPersistedMethods();
  writeAOTCachesToFiles({ jitFnsCache, pureFnsCache, routerCache }, aotDir, excludedFns, excludedPureFns);
  if (!isTest) {
    console.log("✅ AOT compilation completed successfully!");
    console.log(`
Cache files updated in both CJS and ESM formats:
  - ${join(aotDir, "build", "cjs", "*.cache.js")}
  - ${join(aotDir, "build", "esm", "*.cache.js")}
`);
  }
}
let compileTrackingEnabled = false;
let originalJitUtilsBackup = null;
let originalRoutesCacheBackup = null;
function resetCompileTracking() {
  if (originalJitUtilsBackup) {
    const jitUtils = getJitUtils();
    Object.assign(jitUtils, originalJitUtilsBackup);
    originalJitUtilsBackup = null;
  }
  if (originalRoutesCacheBackup) {
    Object.assign(routesCache, originalRoutesCacheBackup);
    originalRoutesCacheBackup = null;
  }
  compileTrackingEnabled = false;
}
function enableCompileTracking() {
  if (compileTrackingEnabled) return;
  compileTrackingEnabled = true;
  const jitUtils = getJitUtils();
  originalJitUtilsBackup = {
    addToJitCache: jitUtils.addToJitCache,
    addPureFn: jitUtils.addPureFn,
    getJIT: jitUtils.getJIT,
    getJitFn: jitUtils.getJitFn,
    getPureFn: jitUtils.getPureFn,
    getCompiledPureFn: jitUtils.getCompiledPureFn,
    usePureFn: jitUtils.usePureFn
  };
  const originalJitUtils = originalJitUtilsBackup;
  jitUtils.addToJitCache = (comp) => {
    comp._used = true;
    originalJitUtils.addToJitCache(comp);
  };
  jitUtils.addPureFn = (namespace, compiledFn) => {
    compiledFn._used = true;
    return originalJitUtils.addPureFn(namespace, compiledFn);
  };
  jitUtils.getJIT = (jitFnHash) => {
    const comp = originalJitUtils.getJIT(jitFnHash);
    if (comp) comp._used = true;
    return comp;
  };
  jitUtils.getJitFn = (jitFnHash) => {
    const comp = originalJitUtils.getJIT(jitFnHash);
    if (comp) comp._used = true;
    return originalJitUtils.getJitFn(jitFnHash);
  };
  jitUtils.getPureFn = (namespace, fnHash) => {
    const compiled = originalJitUtils.getCompiledPureFn(namespace, fnHash);
    if (!compiled) return;
    compiled._used = true;
    return originalJitUtils.getPureFn(namespace, fnHash);
  };
  jitUtils.getCompiledPureFn = (namespace, fnHash) => {
    const compiled = originalJitUtils.getCompiledPureFn(namespace, fnHash);
    if (compiled) compiled._used = true;
    return compiled;
  };
  jitUtils.usePureFn = (namespace, fnHash) => {
    const compiled = originalJitUtils.getCompiledPureFn(namespace, fnHash);
    if (compiled) compiled._used = true;
    return originalJitUtils.usePureFn(namespace, fnHash);
  };
  originalRoutesCacheBackup = {
    getMetadata: routesCache.getMetadata,
    getMethodJitFns: routesCache.getMethodJitFns,
    setMetadata: routesCache.setMetadata,
    setMethodJitFns: routesCache.setMethodJitFns
  };
  const originalRoutesCache = originalRoutesCacheBackup;
  routesCache.getMetadata = (id) => {
    const metadata = originalRoutesCache.getMetadata(id);
    if (metadata) metadata._used = true;
    return metadata;
  };
  routesCache.getMethodJitFns = (id) => {
    const method = originalRoutesCache.getMethodJitFns(id);
    if (method) method._used = true;
    return method;
  };
  routesCache.setMetadata = (id, methodData) => {
    methodData._used = true;
    originalRoutesCache.setMetadata(id, methodData);
  };
  routesCache.setMethodJitFns = (id, method) => {
    method._used = true;
    originalRoutesCache.setMethodJitFns(id, method);
  };
}
function writeAOTCachesToFiles(cacheData, aotDir, excludedFns = EXCLUDED_FNS, excludedPureFns = EXCLUDED_PURE_FNS) {
  const { jitFnsCache, pureFnsCache, routerCache } = cacheData;
  const filteredJitFnsCache = filterJitFns(filterUsedJitFns(jitFnsCache), excludedFns);
  const filteredPureFnsCache = filterPureFns(filterUsedPureFns(pureFnsCache), excludedPureFns);
  const filteredRouterCache = filterUsedRouterCache(routerCache);
  const moduleFormats = ["cjs", "esm"];
  for (const moduleFormat of moduleFormats) {
    if (!isTest) {
      console.log(`Writing ${moduleFormat.toUpperCase()} cache files...`);
    }
    const buildDir = join(aotDir, "build", moduleFormat, "src");
    const aotConfig = {
      module: moduleFormat,
      caches: {
        router: {
          path: join(buildDir, "router.cache.js"),
          exportName: "routerCache"
        },
        jit: {
          path: join(buildDir, "jitFns.cache.js"),
          exportName: "jitFnsCache"
        },
        pure: {
          path: join(buildDir, "pureFns.cache.js"),
          exportName: "pureFnsCache"
        }
      }
    };
    if (!isTest) {
      console.log(`Writing JIT functions cache (${moduleFormat})...`);
    }
    compileAndWriteJitFunctions(filteredJitFnsCache, aotConfig);
    if (!isTest) {
      console.log(`Writing pure functions cache (${moduleFormat})...`);
    }
    compileAndWritePureFunctions(filteredPureFnsCache, aotConfig);
    if (!isTest) {
      console.log(`Writing router methods cache (${moduleFormat})...`);
    }
    compileAndWriteRouterMethods(filteredRouterCache, aotConfig);
  }
}
function filterUsedJitFns(jitFnsCache) {
  return Object.fromEntries(
    Object.entries(jitFnsCache).filter(([, value]) => value._used === true).map(([key, value]) => [key, { ...value, _used: void 0 }])
  );
}
function filterUsedPureFns(pureFnsCache) {
  return Object.fromEntries(
    Object.entries(pureFnsCache).map(([namespace, nsCache]) => [
      namespace,
      Object.fromEntries(
        Object.entries(nsCache).filter(([, value]) => value._used === true).map(([key, value]) => [key, { ...value, _used: void 0 }])
      )
    ])
  );
}
function filterUsedRouterCache(routerCache) {
  return Object.fromEntries(
    Object.entries(routerCache).filter(([, value]) => (value == null ? void 0 : value._used) === true).map(([key, value]) => [key, { ...value, _used: void 0 }])
  );
}
function filterJitFns(jitFnsCache, excludedFns = EXCLUDED_FNS) {
  if (!excludedFns.length) return jitFnsCache;
  return Object.fromEntries(
    Object.entries(jitFnsCache).filter(([, value]) => !excludedFns.includes(value.fnID))
  );
}
function filterPureFns(pureFnsCache, excludedPureFns = EXCLUDED_PURE_FNS) {
  if (!excludedPureFns.length) return pureFnsCache;
  return Object.fromEntries(
    Object.entries(pureFnsCache).map(([namespace, nsCache]) => [
      namespace,
      Object.fromEntries(Object.entries(nsCache).filter(([, value]) => !excludedPureFns.includes(value.fnName)))
    ])
  );
}
export {
  EXCLUDED_FNS,
  EXCLUDED_PURE_FNS,
  compileAOT,
  filterJitFns,
  filterPureFns,
  filterUsedJitFns,
  filterUsedPureFns,
  filterUsedRouterCache,
  resetCompileTracking,
  writeAOTCachesToFiles
};
//# sourceMappingURL=aot-compile.js.map
