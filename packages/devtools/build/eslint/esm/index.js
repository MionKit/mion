import rule$4 from "./src/eslint/rules/strong-typed-routes.js";
import rule$3 from "./src/eslint/rules/no-unreachable-union-types.js";
import rule$2 from "./src/eslint/rules/no-mixed-union-properties.js";
import rule$1 from "./src/eslint/rules/no-vite-client.js";
import rule from "./src/eslint/rules/enforce-type-imports.js";
const plugin = {
  rules: {
    "strong-typed-routes": rule$4,
    "no-unreachable-union-types": rule$3,
    "no-mixed-union-properties": rule$2,
    "no-vite-client": rule$1,
    "enforce-type-imports": rule
  },
  configs: {}
};
plugin.configs.recommended = {
  plugins: {
    "@mionjs": plugin
  },
  rules: {
    "@mionjs/strong-typed-routes": "error",
    "@mionjs/no-unreachable-union-types": "error"
    // disabled as seems is not too useful and overlaps with some ts rules
    // '@mionjs/no-mixed-union-properties': 'warn',
  }
};
export {
  plugin as default
};
//# sourceMappingURL=index.js.map
