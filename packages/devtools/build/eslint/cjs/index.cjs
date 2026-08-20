"use strict";
const src_eslint_rules_strongTypedRoutes = require("./src/eslint/rules/strong-typed-routes.cjs");
const src_eslint_rules_noUnreachableUnionTypes = require("./src/eslint/rules/no-unreachable-union-types.cjs");
const src_eslint_rules_noMixedUnionProperties = require("./src/eslint/rules/no-mixed-union-properties.cjs");
const src_eslint_rules_noViteClient = require("./src/eslint/rules/no-vite-client.cjs");
const src_eslint_rules_enforceTypeImports = require("./src/eslint/rules/enforce-type-imports.cjs");
const plugin = {
  rules: {
    "strong-typed-routes": src_eslint_rules_strongTypedRoutes,
    "no-unreachable-union-types": src_eslint_rules_noUnreachableUnionTypes,
    "no-mixed-union-properties": src_eslint_rules_noMixedUnionProperties,
    "no-vite-client": src_eslint_rules_noViteClient,
    "enforce-type-imports": src_eslint_rules_enforceTypeImports
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
module.exports = plugin;
//# sourceMappingURL=index.cjs.map
