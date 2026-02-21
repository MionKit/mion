import { createFilter } from "@rollup/pluginutils";
import * as ts from "typescript";
import { declarationTransformer, transformer } from "@deepkit/type-compiler";
function createDeepkitTransform(options = {}) {
  const filter = createFilter(options.include ?? ["**/*.tsx", "**/*.ts"], options.exclude ?? "node_modules/**");
  const transformers = {
    before: [transformer],
    after: [declarationTransformer]
  };
  return function transformWithDeepkit(code, fileName) {
    if (!filter(fileName)) return null;
    const transformed = ts.transpileModule(code, {
      compilerOptions: Object.assign(
        {
          target: ts.ScriptTarget.ESNext,
          module: ts.ModuleKind.ESNext,
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
export {
  createDeepkitTransform
};
//# sourceMappingURL=deepkit-type.js.map
