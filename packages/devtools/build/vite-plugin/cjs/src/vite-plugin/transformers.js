"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const pluginutils = require("@rollup/pluginutils");
const ts = require("typescript");
const typeCompiler = require("@deepkit/type-compiler");
const src_vitePlugin_extractPureFn = require("./extractPureFn.js");
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
function createDeepkitConfig(options = {}) {
  const filter = pluginutils.createFilter(options.include ?? ["**/*.tsx", "**/*.ts"], options.exclude ?? "node_modules/**");
  return {
    filter: (fileName) => filter(fileName),
    compilerOptions: {
      target: ts__namespace.ScriptTarget.ESNext,
      module: ts__namespace.ModuleKind.ESNext,
      configFilePath: options.tsConfig || process.cwd() + "/tsconfig.json",
      ...options.compilerOptions || {}
    },
    beforeTransformers: [typeCompiler.transformer],
    afterTransformers: [typeCompiler.declarationTransformer]
  };
}
function createPureFnTransformerFactory(originalSource, filePath, collector) {
  const hasPureServerFn = originalSource.includes("pureServerFn");
  const hasFactory = originalSource.includes("registerPureFnFactory");
  const pureServerFns = hasPureServerFn ? src_vitePlugin_extractPureFn.extractPureFnsFromSource(originalSource, filePath, "pureServerFn") : [];
  const factoryFns = hasFactory ? src_vitePlugin_extractPureFn.extractPureFnsFromSource(originalSource, filePath, "registerPureFnFactory") : [];
  return (context) => {
    let pureIdx = 0;
    let factoryIdx = 0;
    function visitor(node) {
      if (ts__namespace.isCallExpression(node)) {
        const callee = node.expression;
        if (ts__namespace.isIdentifier(callee)) {
          if (callee.text === "pureServerFn" && pureIdx < pureServerFns.length) {
            if (node.arguments.length >= 2) {
              pureIdx++;
              return ts__namespace.visitEachChild(node, visitor, context);
            }
            const data = pureServerFns[pureIdx++];
            collector?.push(data);
            return context.factory.updateCallExpression(node, node.expression, node.typeArguments, [
              ...node.arguments,
              context.factory.createStringLiteral(data.bodyHash)
            ]);
          }
          if (callee.text === "registerPureFnFactory" && factoryIdx < factoryFns.length) {
            if (node.arguments.length >= 4) {
              factoryIdx++;
              return ts__namespace.visitEachChild(node, visitor, context);
            }
            const data = factoryFns[factoryIdx++];
            collector?.push(data);
            return context.factory.updateCallExpression(node, node.expression, node.typeArguments, [
              ...node.arguments,
              createParsedFactoryFnNode(context.factory, data)
            ]);
          }
        }
      }
      return ts__namespace.visitEachChild(node, visitor, context);
    }
    return {
      transformSourceFile(sourceFile) {
        if (pureServerFns.length === 0 && factoryFns.length === 0) return sourceFile;
        return ts__namespace.visitNode(sourceFile, visitor);
      },
      transformBundle(bundle) {
        return bundle;
      }
    };
  };
}
function createParsedFactoryFnNode(factory, data) {
  return factory.createObjectLiteralExpression([
    factory.createPropertyAssignment("bodyHash", factory.createStringLiteral(data.bodyHash)),
    factory.createPropertyAssignment(
      "paramNames",
      factory.createArrayLiteralExpression(data.paramNames.map((n) => factory.createStringLiteral(n)))
    ),
    factory.createPropertyAssignment("code", factory.createStringLiteral(data.fnBody))
  ]);
}
exports.createDeepkitConfig = createDeepkitConfig;
exports.createPureFnTransformerFactory = createPureFnTransformerFactory;
//# sourceMappingURL=transformers.js.map
