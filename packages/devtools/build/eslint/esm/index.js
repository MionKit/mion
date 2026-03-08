import rule$7 from "./src/eslint/rules/no-typeof-runtype.js";
import rule$6 from "./src/eslint/rules/strong-typed-routes.js";
import rule$5 from "./src/eslint/rules/no-unreachable-union-types.js";
import rule$4 from "./src/eslint/rules/no-mixed-union-properties.js";
import rule$3 from "./src/eslint/rules/no-type-imports.js";
import rule$2 from "./src/eslint/rules/pure-functions.js";
import rule$1 from "./src/eslint/rules/no-vite-client.js";
import rule from "./src/eslint/rules/type-formats-imports.js";
const plugin = {
  rules: {
    "no-typeof-runtype": rule$7,
    "strong-typed-routes": rule$6,
    "no-unreachable-union-types": rule$5,
    "no-mixed-union-properties": rule$4,
    "no-type-imports": rule$3,
    "pure-functions": rule$2,
    "no-vite-client": rule$1,
    "type-formats-imports": rule
  },
  configs: {}
};
plugin.configs.recommended = {
  plugins: {
    "@mionjs": plugin
  },
  rules: {
    "@mionjs/no-typeof-runtype": "error",
    "@mionjs/strong-typed-routes": "error",
    "@mionjs/no-unreachable-union-types": "error",
    "@mionjs/no-type-imports": "error",
    "@mionjs/pure-functions": "error",
    "@mionjs/type-formats-imports": "error"
    // disabled as seems is not too useful and overlaps with some ts rules
    // '@mionjs/no-mixed-union-properties': 'warn',
  }
};
export {
  plugin as default
};
//# sourceMappingURL=index.js.map
