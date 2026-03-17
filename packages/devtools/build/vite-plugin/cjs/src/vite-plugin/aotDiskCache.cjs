"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const src_vitePlugin_aotCacheGenerator = require("./aotCacheGenerator.cjs");
var _documentCurrentScript = typeof document !== "undefined" ? document.currentScript : null;
const AOT_DISK_CACHE_VERSION = "2";
const CACHE_FILENAME = "mion-aot-cache.json";
const SKIP_DIRS = /* @__PURE__ */ new Set(["node_modules", ".dist", "dist", ".git", ".vite", "build", "coverage", ".coverage"]);
const SOURCE_EXTENSIONS = /\.(ts|tsx)$/;
const TEST_FILE_PATTERN = /\.(spec|test)\.(ts|tsx)$/;
let devtoolsVersion = null;
function getDevtoolsVersion() {
  if (devtoolsVersion) return devtoolsVersion;
  try {
    const pkgPath = path.resolve(path.dirname(new URL(typeof document === "undefined" ? require("url").pathToFileURL(__filename).href : _documentCurrentScript && _documentCurrentScript.tagName.toUpperCase() === "SCRIPT" && _documentCurrentScript.src || new URL("src/vite-plugin/aotDiskCache.cjs", document.baseURI).href).pathname), "../../package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    devtoolsVersion = pkg.version || "0.0.0";
  } catch {
    devtoolsVersion = "0.0.0";
  }
  return devtoolsVersion;
}
function collectFileStats(dir, baseDir) {
  const entries = [];
  let files;
  try {
    files = fs.readdirSync(dir);
  } catch {
    return entries;
  }
  for (const file of files) {
    const fullPath = path.join(dir, file);
    let stat;
    try {
      stat = fs.statSync(fullPath);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      if (SKIP_DIRS.has(file)) continue;
      entries.push(...collectFileStats(fullPath, baseDir));
    } else if (SOURCE_EXTENSIONS.test(file) && !TEST_FILE_PATTERN.test(file)) {
      const relativePath = path.relative(baseDir, fullPath);
      entries.push(`${relativePath}:${stat.mtimeMs}:${stat.size}`);
    }
  }
  return entries;
}
function computeSourceHash(serverConfig, aotOptions) {
  const serverDir = path.dirname(path.resolve(serverConfig.startScript));
  const fileStats = collectFileStats(serverDir, serverDir);
  fileStats.sort();
  const hashInput = [
    ...fileStats,
    `cacheVersion:${AOT_DISK_CACHE_VERSION}`,
    `devtoolsVersion:${getDevtoolsVersion()}`,
    `excludedFns:${JSON.stringify((aotOptions?.excludedFns || []).slice().sort())}`,
    `excludedPureFns:${JSON.stringify((aotOptions?.excludedPureFns || []).slice().sort())}`
  ].join("\n");
  return crypto.createHash("sha256").update(hashInput).digest("hex");
}
function readDiskCache(cacheDir) {
  const cachePath = path.join(cacheDir, CACHE_FILENAME);
  try {
    const raw = fs.readFileSync(cachePath, "utf-8");
    const parsed = JSON.parse(raw);
    if (typeof parsed.cacheVersion === "string" && typeof parsed.hash === "string" && typeof parsed.jitFnsCode === "string" && typeof parsed.pureFnsCode === "string" && typeof parsed.routerCacheCode === "string") {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}
function writeDiskCache(cacheDir, hash, data) {
  const cachePath = path.join(cacheDir, CACHE_FILENAME);
  try {
    fs.mkdirSync(cacheDir, { recursive: true });
    const cacheFile = {
      cacheVersion: AOT_DISK_CACHE_VERSION,
      hash,
      jitFnsCode: data.jitFnsCode,
      pureFnsCode: data.pureFnsCode,
      routerCacheCode: data.routerCacheCode
    };
    fs.writeFileSync(cachePath, JSON.stringify(cacheFile), "utf-8");
  } catch (err) {
    console.warn(`[mion] Warning: Could not write AOT disk cache: ${err instanceof Error ? err.message : String(err)}`);
  }
}
function resolveCacheDir(options, viteCacheDir) {
  if (options.cache === false) return "";
  if (typeof options.cache === "string") return path.resolve(options.cache);
  return viteCacheDir || path.resolve(process.cwd(), "node_modules/.vite");
}
async function getOrGenerateAOTCaches(serverConfig, aotOptions, cacheDir) {
  const forceRegenerate = process.env.MION_AOT_FORCE === "true";
  const isIPCMode = serverConfig.runMode === "childProcess";
  const cachingEnabled = cacheDir !== "" && !forceRegenerate && !isIPCMode;
  let hash = "";
  if (cachingEnabled) {
    hash = computeSourceHash(serverConfig, aotOptions);
    const cached = readDiskCache(cacheDir);
    if (cached && cached.cacheVersion === AOT_DISK_CACHE_VERSION && cached.hash === hash) {
      console.log("[mion] AOT caches loaded from disk cache (source unchanged)");
      return {
        data: {
          jitFnsCode: cached.jitFnsCode,
          pureFnsCode: cached.pureFnsCode,
          routerCacheCode: cached.routerCacheCode
        }
      };
    }
  }
  const result = await src_vitePlugin_aotCacheGenerator.generateAOTCaches(serverConfig);
  if (cachingEnabled) {
    if (!hash) hash = computeSourceHash(serverConfig, aotOptions);
    writeDiskCache(cacheDir, hash, result.data);
    console.log("[mion] AOT caches saved to disk cache");
  }
  return result;
}
function updateDiskCache(serverConfig, aotOptions, data, cacheDir) {
  if (!cacheDir || aotOptions?.cache === false) return;
  const hash = computeSourceHash(serverConfig, aotOptions);
  writeDiskCache(cacheDir, hash, data);
}
exports.computeSourceHash = computeSourceHash;
exports.getOrGenerateAOTCaches = getOrGenerateAOTCaches;
exports.resolveCacheDir = resolveCacheDir;
exports.updateDiskCache = updateDiskCache;
//# sourceMappingURL=aotDiskCache.cjs.map
