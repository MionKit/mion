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
const fs = require("fs");
const path = require("path");
const child_process = require("child_process");
const runTypes = require("@mionkit/run-types");
function getBiomePath() {
  const biomePkgPath = require.resolve("@biomejs/biome/package.json");
  return path.join(path.dirname(biomePkgPath), "bin", "biome");
}
function formatWithBiome(code, filename = "file.js") {
  try {
    const biomePath = getBiomePath();
    const formattedCode = child_process.execSync(`${biomePath} format --stdin-file-path=${filename}`, {
      input: code,
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024
      // 10MB buffer for large cache files
    });
    return formattedCode;
  } catch (error) {
    console.warn(`Biome formatting failed, using unformatted code: ${error.message}`);
    return code;
  }
}
function compileAndWriteJitFunctions(cache, config) {
  return compileAndWriteRunType(
    cache,
    config,
    config.caches.jit
  );
}
function compileAndWritePureFunctions(cache, config) {
  return compileAndWriteRunType(cache, config, config.caches.pure);
}
function compileAndWriteRouterMethods(cache, config) {
  return compileAndWriteRunType(cache, config, config.caches.router);
}
function compileAndWriteRunType(instance, config, fileToWrite, type) {
  let originalSrcCode;
  if (fs.existsSync(fileToWrite.path)) {
    originalSrcCode = fs.readFileSync(fileToWrite.path, "utf8");
  }
  let fileCode = compileTypeToJs(instance, config, fileToWrite, type, originalSrcCode);
  fileCode = formatWithBiome(fileCode, "cache.js");
  const dir = path.dirname(fileToWrite.path);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(fileToWrite.path, fileCode, "utf8");
  return fileCode;
}
function compileTypeToJs(instance, config, fileToWrite, type, originalSrcCode) {
  const rt = runTypes.runType(type);
  const toJSCode = rt.createJitFunction(runTypes.JitFunctions.toJSCode, config.runTypeOptions);
  const code = toJSCode(instance);
  if (originalSrcCode) {
    return replaceExportPattern(originalSrcCode, fileToWrite.exportName, code, config.module);
  }
  const isCommonJS = config.module === "cjs";
  const exportStatement = isCommonJS ? `module.exports = { ${fileToWrite.exportName}: ${code} };
` : `export const ${fileToWrite.exportName} = ${code};
`;
  return exportStatement;
}
function replaceExportPattern(originalSrc, exportName, compiledCode, moduleType) {
  if (moduleType === "cjs") {
    const constPattern = `const ${exportName} = {};`;
    if (originalSrc.includes(constPattern)) {
      return originalSrc.replace(constPattern, `const ${exportName} = ${compiledCode};`);
    }
    const exactPattern = `exports.${exportName} = {};`;
    if (originalSrc.includes(exactPattern)) {
      return originalSrc.replace(exactPattern, `exports.${exportName} = ${compiledCode};`);
    }
  } else {
    const constPattern = `const ${exportName} = {};`;
    if (originalSrc.includes(constPattern)) {
      return originalSrc.replace(constPattern, `const ${exportName} = ${compiledCode};`);
    }
    const exactPattern = `export const ${exportName} = {};`;
    if (originalSrc.includes(exactPattern)) {
      return originalSrc.replace(exactPattern, `export const ${exportName} = ${compiledCode};`);
    }
  }
  throw new Error(
    `Could not find export pattern for '${exportName}' in ${moduleType} module format. Expected: 'const ${exportName} = {};' or '${moduleType === "cjs" ? `exports.${exportName} = {};` : `export const ${exportName} = {};`}'`
  );
}
exports.compileAndWriteJitFunctions = compileAndWriteJitFunctions;
exports.compileAndWritePureFunctions = compileAndWritePureFunctions;
exports.compileAndWriteRouterMethods = compileAndWriteRouterMethods;
exports.compileAndWriteRunType = compileAndWriteRunType;
exports.compileTypeToJs = compileTypeToJs;
exports.formatWithBiome = formatWithBiome;
//# sourceMappingURL=cacheCompiler.js.map
