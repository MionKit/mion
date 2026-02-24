import { createFilter } from "@rollup/pluginutils";
import * as ts from "typescript";
import { declarationTransformer, transformer } from "@deepkit/type-compiler";
import { extractPureFnsFromSource } from "./extractPureFn.js";
function createDeepkitConfig(options = {}) {
  const filter = createFilter(options.include ?? ["**/*.tsx", "**/*.ts"], options.exclude ?? "node_modules/**");
  return {
    filter: (fileName) => filter(fileName),
    compilerOptions: {
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
      configFilePath: options.tsConfig || process.cwd() + "/tsconfig.json",
      ...options.compilerOptions || {}
    },
    beforeTransformers: [transformer],
    afterTransformers: [declarationTransformer]
  };
}
function createPureFnTransformerFactory(originalSource, filePath, collector) {
  const hasPureServerFn = originalSource.includes("pureServerFn");
  const hasFactory = originalSource.includes("registerPureFnFactory");
  const hasMapFrom = originalSource.includes("mapFrom");
  const pureServerFns = hasPureServerFn ? extractPureFnsFromSource(originalSource, filePath, "pureServerFn") : [];
  const factoryFns = hasFactory ? extractPureFnsFromSource(originalSource, filePath, "registerPureFnFactory") : [];
  const mapFromFns = hasMapFrom ? extractPureFnsFromSource(originalSource, filePath, "mapFrom") : [];
  return (context) => {
    let pureIdx = 0;
    let factoryIdx = 0;
    let mapFromIdx = 0;
    function visitor(node) {
      if (ts.isCallExpression(node)) {
        const callee = node.expression;
        if (ts.isIdentifier(callee)) {
          if (callee.text === "pureServerFn" && pureIdx < pureServerFns.length) {
            if (node.arguments.length >= 2) {
              pureIdx++;
              return ts.visitEachChild(node, visitor, context);
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
              return ts.visitEachChild(node, visitor, context);
            }
            const data = factoryFns[factoryIdx++];
            collector?.push(data);
            return context.factory.updateCallExpression(node, node.expression, node.typeArguments, [
              ...node.arguments,
              createParsedFactoryFnNode(context.factory, data)
            ]);
          }
          if (callee.text === "mapFrom" && mapFromIdx < mapFromFns.length) {
            if (node.arguments.length >= 3) {
              mapFromIdx++;
              return ts.visitEachChild(node, visitor, context);
            }
            const data = mapFromFns[mapFromIdx++];
            collector?.push(data);
            return context.factory.updateCallExpression(node, node.expression, node.typeArguments, [
              ...node.arguments,
              context.factory.createStringLiteral(data.bodyHash)
            ]);
          }
        }
      }
      return ts.visitEachChild(node, visitor, context);
    }
    return {
      transformSourceFile(sourceFile) {
        if (pureServerFns.length === 0 && factoryFns.length === 0 && mapFromFns.length === 0) return sourceFile;
        return ts.visitNode(sourceFile, visitor);
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
export {
  createDeepkitConfig,
  createPureFnTransformerFactory
};
//# sourceMappingURL=transformers.js.map
