import { createFilter } from "@rollup/pluginutils";
import { DeepkitLoader } from "@deepkit/type-compiler";
function transformWithDeepkit(code, fileName, options = {}) {
  const filter = createFilter(options.include ?? ["**/*.tsx", "**/*.ts"], options.exclude ?? "node_modules/**");
  if (!filter(fileName)) return null;
  const loader = new DeepkitLoader();
  const transformed = loader.transform(code, fileName);
  return {
    code: transformed,
    map: null
  };
}
export {
  transformWithDeepkit
};
//# sourceMappingURL=deepkit-type.js.map
