"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const fs = require("node:fs");
const path = require("node:path");
const tsRuntypes = require("@ts-runtypes/devtools/vite");
let legacyOptionsNoticeShown = false;
function resolveRtBinary(explicit) {
  if (explicit) return explicit;
  if (process.env.TS_RUNTYPES_BIN) return process.env.TS_RUNTYPES_BIN;
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(dir, "ts-run-types", "bin", "ts-runtypes");
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return void 0;
}
function deriveRuntypesTsconfig(tsConfigPath, cwd = process.cwd()) {
  if (!tsConfigPath) return void 0;
  const absConfig = path.isAbsolute(tsConfigPath) ? tsConfigPath : path.resolve(cwd, tsConfigPath);
  try {
    const raw = JSON.parse(fs.readFileSync(absConfig, "utf8"));
    if (!Array.isArray(raw.references) || raw.references.length === 0) return absConfig;
  } catch {
    return absConfig;
  }
  const cacheDir = path.join(path.dirname(absConfig), "node_modules", ".cache", "mion-devtools");
  const derived = path.join(cacheDir, "tsconfig.ts-runtypes.json");
  const content = JSON.stringify({ extends: absConfig, references: [] }, null, 2) + "\n";
  try {
    fs.mkdirSync(cacheDir, { recursive: true });
    if (!fs.existsSync(derived) || fs.readFileSync(derived, "utf8") !== content) fs.writeFileSync(derived, content);
    return derived;
  } catch {
    return absConfig;
  }
}
function mionVitePlugin(options = {}) {
  const rt = options.runTypes ?? {};
  if (!legacyOptionsNoticeShown && (options.serverPureFunctions || options.aotCaches || options.server || rt.compilerOptions)) {
    legacyOptionsNoticeShown = true;
    console.warn(
      "[mionVitePlugin] legacy options (serverPureFunctions/aotCaches/server/runTypes.compilerOptions) are ignored since the ts-runtypes migration. See migration-docs/ at the repo root."
    );
  }
  return tsRuntypes({
    binary: resolveRtBinary(rt.binary),
    tsconfig: deriveRuntypesTsconfig(rt.tsConfig),
    outDir: rt.outDir,
    emitMode: rt.emitMode,
    moduleMode: rt.moduleMode,
    inlineMode: rt.inlineMode,
    transformMode: rt.transformMode
  });
}
const serverReady = Promise.resolve();
exports.deriveRuntypesTsconfig = deriveRuntypesTsconfig;
exports.mionVitePlugin = mionVitePlugin;
exports.resolveRtBinary = resolveRtBinary;
exports.serverReady = serverReady;
//# sourceMappingURL=mionVitePlugin.cjs.map
