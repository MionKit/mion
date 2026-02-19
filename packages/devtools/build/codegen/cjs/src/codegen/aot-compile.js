"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const path = require("path");
const fs = require("fs");
const src_codegen_cacheCompiler = require("./cacheCompiler.js");
const core = require("@mionkit/core");
const router = require("@mionkit/router");
const src_codegen_constants = require("./constants.js");
const runTypes = require("@mionkit/run-types");
const EXCLUDED_FNS = [runTypes.JitFunctions.toJSCode.id];
const EXCLUDED_PURE_FNS = ["sanitizeCompiledFn"];
function resetCacheFiles(templateDir, aotDir) {
  const moduleFormats = ["cjs", "esm"];
  for (const moduleFormat of moduleFormats) {
    const templateBuildDir = path.join(templateDir, "build", moduleFormat, "src");
    const targetBuildDir = path.join(aotDir, "build", moduleFormat, "src");
    if (!fs.existsSync(templateBuildDir)) {
      throw new Error(`Template build directory not found: ${templateBuildDir}`);
    }
    if (!fs.existsSync(targetBuildDir)) {
      throw new Error(`Target build directory not found: ${targetBuildDir}. Run 'mion-init-aot' first.`);
    }
    fs.cpSync(templateBuildDir, targetBuildDir, { recursive: true });
  }
}
function registerTsNode(scriptPath) {
  const scriptDir = path.dirname(scriptPath);
  let tsconfigPath;
  let currentDir = scriptDir;
  while (currentDir !== path.dirname(currentDir)) {
    const candidate = path.join(currentDir, "tsconfig.json");
    if (fs.existsSync(candidate)) {
      tsconfigPath = candidate;
      break;
    }
    currentDir = path.dirname(currentDir);
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
  const resolvedStartScript = path.resolve(startScriptPath);
  const isTypeScript = resolvedStartScript.endsWith(".ts") || resolvedStartScript.endsWith(".tsx");
  if (!src_codegen_constants.isTest) {
    console.log(`AOT Compilation starting...`);
    console.log(`Start script: ${resolvedStartScript}`);
    console.log(`AOT directory: ${aotDir}`);
    if (isTypeScript) {
      console.log(`TypeScript file detected, using ts-node...`);
    }
  }
  if (!src_codegen_constants.isTest) {
    console.log("Resetting cache files to original template state...");
  }
  resetCacheFiles(templateDir, aotDir);
  if (isTypeScript) {
    registerTsNode(resolvedStartScript);
  }
  process.env.MION_COMPILE = "true";
  enableCompileTracking();
  if (!src_codegen_constants.isTest) console.log("Running start script to populate caches...");
  try {
    const module2 = await import(resolvedStartScript);
    const promiseExports = Object.values(module2).filter((value) => value instanceof Promise);
    if (promiseExports.length > 0) {
      await Promise.all(promiseExports);
    }
    if (!src_codegen_constants.isTest) console.log("Start script completed, caches populated");
  } catch (error) {
    console.error("Error running start script:", error.message);
    throw error;
  }
  if (!src_codegen_constants.isTest) console.log("Compiling and writing AOT caches...");
  const { jitFnsCache, pureFnsCache } = core.getJitFnCaches();
  const routerCache = router.getPersistedMethods();
  writeAOTCachesToFiles({ jitFnsCache, pureFnsCache, routerCache }, aotDir, excludedFns, excludedPureFns);
  if (!src_codegen_constants.isTest) {
    console.log("✅ AOT compilation completed successfully!");
    console.log(`
Cache files updated in both CJS and ESM formats:
  - ${path.join(aotDir, "build", "cjs", "*.cache.js")}
  - ${path.join(aotDir, "build", "esm", "*.cache.js")}
`);
  }
}
let compileTrackingEnabled = false;
let originalJitUtilsBackup = null;
let originalRoutesCacheBackup = null;
function resetCompileTracking() {
  if (originalJitUtilsBackup) {
    const jitUtils = core.getJitUtils();
    Object.assign(jitUtils, originalJitUtilsBackup);
    originalJitUtilsBackup = null;
  }
  if (originalRoutesCacheBackup) {
    Object.assign(core.routesCache, originalRoutesCacheBackup);
    originalRoutesCacheBackup = null;
  }
  compileTrackingEnabled = false;
}
function enableCompileTracking() {
  if (compileTrackingEnabled) return;
  compileTrackingEnabled = true;
  const jitUtils = core.getJitUtils();
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
    getMetadata: core.routesCache.getMetadata,
    getMethodJitFns: core.routesCache.getMethodJitFns,
    setMetadata: core.routesCache.setMetadata,
    setMethodJitFns: core.routesCache.setMethodJitFns
  };
  const originalRoutesCache = originalRoutesCacheBackup;
  core.routesCache.getMetadata = (id) => {
    const metadata = originalRoutesCache.getMetadata(id);
    if (metadata) metadata._used = true;
    return metadata;
  };
  core.routesCache.getMethodJitFns = (id) => {
    const method = originalRoutesCache.getMethodJitFns(id);
    if (method) method._used = true;
    return method;
  };
  core.routesCache.setMetadata = (id, methodData) => {
    methodData._used = true;
    originalRoutesCache.setMetadata(id, methodData);
  };
  core.routesCache.setMethodJitFns = (id, method) => {
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
    if (!src_codegen_constants.isTest) {
      console.log(`Writing ${moduleFormat.toUpperCase()} cache files...`);
    }
    const buildDir = path.join(aotDir, "build", moduleFormat, "src");
    const aotConfig = {
      module: moduleFormat,
      caches: {
        router: {
          path: path.join(buildDir, "router.cache.js"),
          exportName: "routerCache"
        },
        jit: {
          path: path.join(buildDir, "jitFns.cache.js"),
          exportName: "jitFnsCache"
        },
        pure: {
          path: path.join(buildDir, "pureFns.cache.js"),
          exportName: "pureFnsCache"
        }
      }
    };
    if (!src_codegen_constants.isTest) {
      console.log(`Writing JIT functions cache (${moduleFormat})...`);
    }
    src_codegen_cacheCompiler.compileAndWriteJitFunctions(filteredJitFnsCache, aotConfig);
    if (!src_codegen_constants.isTest) {
      console.log(`Writing pure functions cache (${moduleFormat})...`);
    }
    src_codegen_cacheCompiler.compileAndWritePureFunctions(filteredPureFnsCache, aotConfig);
    if (!src_codegen_constants.isTest) {
      console.log(`Writing router methods cache (${moduleFormat})...`);
    }
    src_codegen_cacheCompiler.compileAndWriteRouterMethods(filteredRouterCache, aotConfig);
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
exports.EXCLUDED_FNS = EXCLUDED_FNS;
exports.EXCLUDED_PURE_FNS = EXCLUDED_PURE_FNS;
exports.compileAOT = compileAOT;
exports.filterJitFns = filterJitFns;
exports.filterPureFns = filterPureFns;
exports.filterUsedJitFns = filterUsedJitFns;
exports.filterUsedPureFns = filterUsedPureFns;
exports.filterUsedRouterCache = filterUsedRouterCache;
exports.resetCompileTracking = resetCompileTracking;
exports.writeAOTCachesToFiles = writeAOTCachesToFiles;
//# sourceMappingURL=aot-compile.js.map
