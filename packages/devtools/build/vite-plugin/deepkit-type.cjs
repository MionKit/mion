"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const pluginutils = require("@rollup/pluginutils");
const typeCompiler = require("@deepkit/type-compiler");
function transformWithDeepkit(code, fileName, options = {}) {
  const filter = pluginutils.createFilter(options.include ?? ["**/*.tsx", "**/*.ts"], options.exclude ?? "node_modules/**");
  if (!filter(fileName)) return null;
  const loader = new typeCompiler.DeepkitLoader();
  const transformed = loader.transform(code, fileName);
  return {
    code: transformed,
    map: null
  };
}
exports.transformWithDeepkit = transformWithDeepkit;
//# sourceMappingURL=deepkit-type.cjs.map
