import { createHash } from "crypto";
import { readdirSync, statSync, readFileSync, mkdirSync, writeFileSync } from "fs";
import { dirname, resolve, join, relative } from "path";
import { generateAOTCaches } from "./aotCacheGenerator.js";
const AOT_DISK_CACHE_VERSION = "1";
const CACHE_FILENAME = "mion-aot-cache.json";
const SKIP_DIRS = /* @__PURE__ */ new Set(["node_modules", ".dist", "dist", ".git", ".vite", "build", "coverage", ".coverage"]);
const SOURCE_EXTENSIONS = /\.(ts|tsx)$/;
const TEST_FILE_PATTERN = /\.(spec|test)\.(ts|tsx)$/;
let devtoolsVersion = null;
function getDevtoolsVersion() {
  if (devtoolsVersion) return devtoolsVersion;
  try {
    const pkgPath = resolve(dirname(new URL(import.meta.url).pathname), "../../package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
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
    files = readdirSync(dir);
  } catch {
    return entries;
  }
  for (const file of files) {
    const fullPath = join(dir, file);
    let stat;
    try {
      stat = statSync(fullPath);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      if (SKIP_DIRS.has(file)) continue;
      entries.push(...collectFileStats(fullPath, baseDir));
    } else if (SOURCE_EXTENSIONS.test(file) && !TEST_FILE_PATTERN.test(file)) {
      const relativePath = relative(baseDir, fullPath);
      entries.push(`${relativePath}:${stat.mtimeMs}:${stat.size}`);
    }
  }
  return entries;
}
function computeSourceHash(options) {
  const serverDir = dirname(resolve(options.startServerScript));
  const fileStats = collectFileStats(serverDir, serverDir);
  fileStats.sort();
  const hashInput = [
    ...fileStats,
    `cacheVersion:${AOT_DISK_CACHE_VERSION}`,
    `devtoolsVersion:${getDevtoolsVersion()}`,
    `excludedFns:${JSON.stringify((options.excludedFns || []).slice().sort())}`,
    `excludedPureFns:${JSON.stringify((options.excludedPureFns || []).slice().sort())}`
  ].join("\n");
  return createHash("sha256").update(hashInput).digest("hex");
}
function readDiskCache(cacheDir) {
  const cachePath = join(cacheDir, CACHE_FILENAME);
  try {
    const raw = readFileSync(cachePath, "utf-8");
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
  const cachePath = join(cacheDir, CACHE_FILENAME);
  try {
    mkdirSync(cacheDir, { recursive: true });
    const cacheFile = {
      cacheVersion: AOT_DISK_CACHE_VERSION,
      hash,
      jitFnsCode: data.jitFnsCode,
      pureFnsCode: data.pureFnsCode,
      routerCacheCode: data.routerCacheCode
    };
    writeFileSync(cachePath, JSON.stringify(cacheFile), "utf-8");
  } catch (err) {
    console.warn(`[mion] Warning: Could not write AOT disk cache: ${err instanceof Error ? err.message : String(err)}`);
  }
}
function resolveCacheDir(options, viteCacheDir) {
  if (options.cache === false) return "";
  if (typeof options.cache === "string") return resolve(options.cache);
  return viteCacheDir || resolve(process.cwd(), "node_modules/.vite");
}
async function getOrGenerateAOTCaches(options, cacheDir) {
  const forceRegenerate = process.env.MION_AOT_FORCE === "true";
  const cachingEnabled = cacheDir !== "" && !forceRegenerate && !!options.startServerScript;
  let hash = "";
  if (cachingEnabled) {
    hash = computeSourceHash(options);
    const cached = readDiskCache(cacheDir);
    if (cached && cached.cacheVersion === AOT_DISK_CACHE_VERSION && cached.hash === hash) {
      console.log("[mion] AOT caches loaded from disk cache (source unchanged)");
      return {
        jitFnsCode: cached.jitFnsCode,
        pureFnsCode: cached.pureFnsCode,
        routerCacheCode: cached.routerCacheCode
      };
    }
  }
  const data = await generateAOTCaches(options);
  if (cachingEnabled) {
    if (!hash) hash = computeSourceHash(options);
    writeDiskCache(cacheDir, hash, data);
    console.log("[mion] AOT caches saved to disk cache");
  }
  return data;
}
function updateDiskCache(options, data, cacheDir) {
  if (!cacheDir || options.cache === false || !options.startServerScript) return;
  const hash = computeSourceHash(options);
  writeDiskCache(cacheDir, hash, data);
}
export {
  computeSourceHash,
  getOrGenerateAOTCaches,
  resolveCacheDir,
  updateDiskCache
};
//# sourceMappingURL=aotDiskCache.js.map
