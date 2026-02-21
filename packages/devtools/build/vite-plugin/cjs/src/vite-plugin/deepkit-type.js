"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const pluginutils = require("@rollup/pluginutils");
const ts = require("typescript");
const typeCompiler = require("@deepkit/type-compiler");
function _interopNamespaceDefault(e) {
  const n = Object.create(null, { [Symbol.toStringTag]: { value: "Module" } });
  if (e) {
    for (const k in e) {
      if (k !== "default") {
        const d = Object.getOwnPropertyDescriptor(e, k);
        Object.defineProperty(n, k, d.get ? d : {
          enumerable: true,
          get: () => e[k]
        });
      }
    }
  }
  n.default = e;
  return Object.freeze(n);
}
const ts__namespace = /* @__PURE__ */ _interopNamespaceDefault(ts);
function createDeepkitTransform(options = {}) {
  const filter = pluginutils.createFilter(options.include ?? ["**/*.tsx", "**/*.ts"], options.exclude ?? "node_modules/**");
  const transformers = {
    before: [typeCompiler.transformer],
    after: [typeCompiler.declarationTransformer]
  };
  return function transformWithDeepkit(code, fileName) {
    if (!filter(fileName)) return null;
    const transformed = ts__namespace.transpileModule(code, {
      compilerOptions: Object.assign(
        {
          target: ts__namespace.ScriptTarget.ESNext,
          module: ts__namespace.ModuleKind.ESNext,
          configFilePath: options.tsConfig || process.cwd() + "/tsconfig.json"
        },
        options.compilerOptions || {}
      ),
      fileName,
      // @ts-ignore - transformers type mismatch between ts versions
      transformers
    });
    return {
      code: transformed.outputText,
      map: transformed.sourceMapText
    };
  };
}
exports.createDeepkitTransform = createDeepkitTransform;
//# sourceMappingURL=deepkit-type.js.map
