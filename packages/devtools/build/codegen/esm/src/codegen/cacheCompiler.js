import { existsSync, readFileSync, mkdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { execSync } from "child_process";
import { runType, JitFunctions } from "@mionkit/run-types";
function getBiomePath() {
  const biomePkgPath = require.resolve("@biomejs/biome/package.json");
  return join(dirname(biomePkgPath), "bin", "biome");
}
function formatWithBiome(code, filename = "file.js") {
  try {
    const biomePath = getBiomePath();
    const formattedCode = execSync(`${biomePath} format --stdin-file-path=${filename}`, {
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
  if (existsSync(fileToWrite.path)) {
    originalSrcCode = readFileSync(fileToWrite.path, "utf8");
  }
  let fileCode = compileTypeToJs(instance, config, fileToWrite, type, originalSrcCode);
  fileCode = formatWithBiome(fileCode, "cache.js");
  const dir = dirname(fileToWrite.path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(fileToWrite.path, fileCode, "utf8");
  return fileCode;
}
function compileTypeToJs(instance, config, fileToWrite, type, originalSrcCode) {
  const rt = runType(type);
  const toJSCode = rt.createJitFunction(JitFunctions.toJSCode, config.runTypeOptions);
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
export {
  compileAndWriteJitFunctions,
  compileAndWritePureFunctions,
  compileAndWriteRouterMethods,
  compileAndWriteRunType,
  compileTypeToJs,
  formatWithBiome
};
//# sourceMappingURL=cacheCompiler.js.map
