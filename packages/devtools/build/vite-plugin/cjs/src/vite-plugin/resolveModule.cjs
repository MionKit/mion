"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const posix = require("path/posix");
const url = require("url");
async function resolveModule(moduleName, callerDir) {
  const resolvedPath = moduleName.startsWith(".") && callerDir ? posix.resolve(callerDir, moduleName) : moduleName;
  const metaResolve = getImportMetaResolve();
  if (metaResolve) {
    const resolved = await metaResolve(resolvedPath);
    if (resolved) return resolved.startsWith("file:") ? url.fileURLToPath(resolved) : resolved;
  }
  try {
    if (typeof require !== "undefined" && typeof require.resolve === "function") return require.resolve(resolvedPath);
  } catch {
  }
  try {
    const { createRequire } = await import("module");
    const basePath = callerDir ? posix.resolve(callerDir, "noop.js") : posix.resolve(process.cwd(), "noop.js");
    const requireFn = createRequire(basePath);
    return requireFn.resolve(resolvedPath);
  } catch (err) {
    throw new Error(`Failed to resolve module "${moduleName}": ${err instanceof Error ? err.message : String(err)}`);
  }
}
function getImportMetaResolve() {
  try {
    return new Function("specifier", "return import.meta.resolve?.(specifier);");
  } catch {
    return void 0;
  }
}
exports.resolveModule = resolveModule;
//# sourceMappingURL=resolveModule.cjs.map
