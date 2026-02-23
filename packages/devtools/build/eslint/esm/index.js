import rule$5 from "./src/eslint/rules/no-typeof-runtype.js";
import rule$4 from "./src/eslint/rules/strong-typed-routes.js";
import rule$3 from "./src/eslint/rules/no-unreachable-union-types.js";
import rule$2 from "./src/eslint/rules/no-mixed-union-properties.js";
import rule$1 from "./src/eslint/rules/no-type-imports.js";
import rule from "./src/eslint/rules/pure-functions.js";
const plugin = {
  rules: {
    "no-typeof-runtype": rule$5,
    "strong-typed-routes": rule$4,
    "no-unreachable-union-types": rule$3,
    "no-mixed-union-properties": rule$2,
    "no-type-imports": rule$1,
    "pure-functions": rule
  },
  configs: {}
};
plugin.configs.recommended = {
  plugins: {
    "@mionkit": plugin
  },
  rules: {
    "@mionkit/no-typeof-runtype": "error",
    "@mionkit/strong-typed-routes": "error",
    "@mionkit/no-unreachable-union-types": "error",
    "@mionkit/no-type-imports": "error",
    "@mionkit/pure-functions": "error"
    // disabled as seems is not too useful and overlaps with some ts rules
    // '@mionkit/no-mixed-union-properties': 'warn',
  }
};
export {
  plugin as default
};
//# sourceMappingURL=index.js.map
