"use strict";
const src_eslint_rules_noTypeofRuntype = require("./src/eslint/rules/no-typeof-runtype.cjs");
const src_eslint_rules_strongTypedRoutes = require("./src/eslint/rules/strong-typed-routes.cjs");
const src_eslint_rules_noUnreachableUnionTypes = require("./src/eslint/rules/no-unreachable-union-types.cjs");
const src_eslint_rules_noMixedUnionProperties = require("./src/eslint/rules/no-mixed-union-properties.cjs");
const src_eslint_rules_noTypeImports = require("./src/eslint/rules/no-type-imports.cjs");
const src_eslint_rules_pureFunctions = require("./src/eslint/rules/pure-functions.cjs");
const src_eslint_rules_typeFormatsImports = require("./src/eslint/rules/type-formats-imports.cjs");
const plugin = {
  rules: {
    "no-typeof-runtype": src_eslint_rules_noTypeofRuntype,
    "strong-typed-routes": src_eslint_rules_strongTypedRoutes,
    "no-unreachable-union-types": src_eslint_rules_noUnreachableUnionTypes,
    "no-mixed-union-properties": src_eslint_rules_noMixedUnionProperties,
    "no-type-imports": src_eslint_rules_noTypeImports,
    "pure-functions": src_eslint_rules_pureFunctions,
    "type-formats-imports": src_eslint_rules_typeFormatsImports
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
    "@mionkit/pure-functions": "error",
    "@mionkit/type-formats-imports": "error"
    // disabled as seems is not too useful and overlaps with some ts rules
    // '@mionkit/no-mixed-union-properties': 'warn',
  }
};
module.exports = plugin;
//# sourceMappingURL=index.cjs.map
