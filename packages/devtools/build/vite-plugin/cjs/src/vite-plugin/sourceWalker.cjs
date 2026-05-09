"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const fs = require("fs");
const path = require("path");
const src_vitePlugin_extractPureFn = require("./extractPureFn.cjs");
const src_vitePlugin_mionVitePlugin = require("./mionVitePlugin.cjs");
function walkSourceFiles(rootDirs, opts, visitors) {
  if (visitors.length === 0) return;
  const include = opts.include ?? ["**/*.ts", "**/*.tsx", "**/*.vue", "**/*.js", "**/*.jsx"];
  const exclude = opts.exclude ?? ["../node_modules/**", "**/.dist/**", "**/dist/**", "**/build/**"];
  const seen = /* @__PURE__ */ new Set();
  for (const root of rootDirs) {
    const abs = path.resolve(root);
    if (seen.has(abs)) continue;
    seen.add(abs);
    walkDir(abs, include, exclude, visitors);
  }
}
function walkDir(dir, include, exclude, visitors) {
  let entries;
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    const fullPath = path.join(dir, entry);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      if (!src_vitePlugin_mionVitePlugin.isIncluded(fullPath + "/", include, exclude)) continue;
      walkDir(fullPath, include, exclude, visitors);
    } else if (stat.isFile()) {
      if (!src_vitePlugin_mionVitePlugin.isIncluded(fullPath, include, exclude)) continue;
      try {
        let code = fs.readFileSync(fullPath, "utf-8");
        let effectivePath = fullPath;
        if (fullPath.endsWith(".vue")) {
          const block = src_vitePlugin_extractPureFn.extractVueScriptContent(code);
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
exports.aotImportVisitor = aotImportVisitor;
exports.walkSourceFiles = walkSourceFiles;
//# sourceMappingURL=sourceWalker.cjs.map
