"use strict";
const rules_noTypeofRuntype = require("./rules/no-typeof-runtype.js");
const rules_strongTypedRoutes = require("./rules/strong-typed-routes.js");
const rules_noUnreachableUnionTypes = require("./rules/no-unreachable-union-types.js");
const rules_noMixedUnionProperties = require("./rules/no-mixed-union-properties.js");
const rules_noTypeImports = require("./rules/no-type-imports.js");
const plugin = {
  rules: {
    "no-typeof-runtype": rules_noTypeofRuntype,
    "strong-typed-routes": rules_strongTypedRoutes,
    "no-unreachable-union-types": rules_noUnreachableUnionTypes,
    "no-mixed-union-properties": rules_noMixedUnionProperties,
    "no-type-imports": rules_noTypeImports
  },
  configs: {
    recommended: {
      extends: [],
      rules: {
        "@mionkit/no-typeof-runtype": "error",
        "@mionkit/strong-typed-routes": "error",
        "@mionkit/no-unreachable-union-types": "error",
        "@mionkit/no-type-imports": "error"
        // disabled as seems is not too useful and overlaps with some ts rules
        // '@mionkit/no-mixed-union-properties': 'warn',
      }
    }
  }
};
module.exports = plugin;
module.exports = plugin;
//# sourceMappingURL=index.js.map
