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
    tsconfig: rt.tsConfig,
    outDir: rt.outDir,
    emitMode: rt.emitMode,
    moduleMode: rt.moduleMode,
    inlineMode: rt.inlineMode,
    transformMode: rt.transformMode
  });
}
const serverReady = Promise.resolve();
exports.mionVitePlugin = mionVitePlugin;
exports.resolveRtBinary = resolveRtBinary;
exports.serverReady = serverReady;
//# sourceMappingURL=mionVitePlugin.cjs.map
