import { readdirSync, statSync, readFileSync } from "fs";
import { resolve, join } from "path";
import { RESOLVED_VIRTUAL_MODULE_ID, VIRTUAL_MODULE_ID } from "./constants.js";
import { extractPureFnsFromSource } from "./extractPureFn.js";
import { generateVirtualModule } from "./virtualModule.js";
function pureFunctionsPlugin(options) {
  const include = options.include || ["**/*.ts", "**/*.tsx"];
  const exclude = options.exclude || ["**/node_modules/**", "**/.dist/**", "**/dist/**"];
  let extractedFns = null;
  function scanClientSource() {
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
  return {
    name: "mion-pure-functions",
    enforce: "pre",
    resolveId(id) {
      if (id === VIRTUAL_MODULE_ID) {
        return RESOLVED_VIRTUAL_MODULE_ID;
      }
      return null;
    },
    load(id) {
      if (id === RESOLVED_VIRTUAL_MODULE_ID) {
        if (!extractedFns) {
          extractedFns = scanClientSource();
        }
        return generateVirtualModule(extractedFns);
      }
      return null;
    },
    handleHotUpdate({ file, server }) {
      const clientSrcPath = resolve(options.clientSrcPath);
      if (!file.startsWith(clientSrcPath)) return;
      if (!isIncluded(file, include, exclude)) return;
      extractedFns = null;
      const mod = server.moduleGraph.getModuleById(RESOLVED_VIRTUAL_MODULE_ID);
      if (mod) {
        server.moduleGraph.invalidateModule(mod);
        return [mod];
      }
    }
  };
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
export {
  pureFunctionsPlugin
};
//# sourceMappingURL=plugin.js.map
