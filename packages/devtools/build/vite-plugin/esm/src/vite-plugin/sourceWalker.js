import { readdirSync, statSync, readFileSync } from "fs";
import { resolve, join } from "path";
import { extractVueScriptContent } from "./extractPureFn.js";
import { isIncluded } from "./mionVitePlugin.js";
function walkSourceFiles(rootDirs, opts, visitors) {
  if (visitors.length === 0) return;
  const include = opts.include ?? ["**/*.ts", "**/*.tsx", "**/*.vue", "**/*.js", "**/*.jsx"];
  const exclude = opts.exclude ?? ["../node_modules/**", "**/.dist/**", "**/dist/**", "**/build/**"];
  const seen = /* @__PURE__ */ new Set();
  for (const root of rootDirs) {
    const abs = resolve(root);
    if (seen.has(abs)) continue;
    seen.add(abs);
    walkDir(abs, include, exclude, visitors);
  }
}
function walkDir(dir, include, exclude, visitors) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      if (!isIncluded(fullPath + "/", include, exclude)) continue;
      walkDir(fullPath, include, exclude, visitors);
    } else if (stat.isFile()) {
      if (!isIncluded(fullPath, include, exclude)) continue;
      try {
        let code = readFileSync(fullPath, "utf-8");
        let effectivePath = fullPath;
        if (fullPath.endsWith(".vue")) {
          const block = extractVueScriptContent(code);
          if (!block) continue;
          code = block.content;
          effectivePath = `${fullPath}.${block.lang}`;
        }
        const file = { fullPath, code, effectivePath };
        for (const v of visitors) v(file);
      } catch (err) {
        console.warn(`[mion] sourceWalker: skipping ${fullPath}: ${err?.message ?? err}`);
      }
    }
  }
}
const aotImportVisitor = (out) => ({ code }) => {
  if (out.found) return;
  if (code.includes("virtual:mion-aot/")) out.found = true;
};
export {
  aotImportVisitor,
  walkSourceFiles
};
//# sourceMappingURL=sourceWalker.js.map
