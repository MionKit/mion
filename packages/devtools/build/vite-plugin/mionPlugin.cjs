"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const fs = require("fs");
const path = require("path");
const deepkitType = require("./deepkit-type.cjs");
const extractPureFn = require("./extractPureFn.cjs");
const virtualModule = require("./virtualModule.cjs");
const constants = require("./constants.cjs");
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
          const extracted = extractPureFn.extractPureFnsFromSource(code, fullPath);
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
  return {
    name: "mion",
    enforce: "pre",
    resolveId(id) {
      if (!pureFnOptions) return null;
      if (id === constants.VIRTUAL_MODULE_ID) {
        return constants.RESOLVED_VIRTUAL_MODULE_ID;
      }
      return null;
    },
    load(id) {
      if (!pureFnOptions) return null;
      if (id === constants.RESOLVED_VIRTUAL_MODULE_ID) {
        if (!extractedFns) {
          extractedFns = scanClientSource(pureFnOptions);
        }
        return virtualModule.generateVirtualModule(extractedFns);
      }
      return null;
    },
    transform(code, fileName) {
      if (pureFnOptions) {
        try {
          const fns = extractPureFn.extractPureFnsFromSource(code, fileName);
          if (fns.length > 0) {
          }
        } catch (err) {
          console.warn(`[mion] Warning: Could not extract pure functions from ${fileName}: ${err}`);
        }
      }
      if (deepkitOptions) {
        return deepkitType.transformWithDeepkit(code, fileName, deepkitOptions);
      }
      return null;
    },
    handleHotUpdate({ file, server }) {
      if (!pureFnOptions) return;
      const clientSrcPath = path.resolve(pureFnOptions.clientSrcPath);
      if (!file.startsWith(clientSrcPath)) return;
      const include = pureFnOptions.include || ["**/*.ts", "**/*.tsx"];
      const exclude = pureFnOptions.exclude || ["**/node_modules/**", "**/.dist/**", "**/dist/**"];
      if (!isIncluded(file, include, exclude)) return;
      extractedFns = null;
      const mod = server.moduleGraph.getModuleById(constants.RESOLVED_VIRTUAL_MODULE_ID);
      if (mod) {
        server.moduleGraph.invalidateModule(mod);
        return [mod];
      }
    }
  };
}
exports.mionVitePlugin = mionVitePlugin;
//# sourceMappingURL=mionPlugin.cjs.map
