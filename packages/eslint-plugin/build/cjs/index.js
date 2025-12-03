"use strict";
const rules_noTypeofRuntype = require("./rules/no-typeof-runtype.js");
const rules_strongTypedRoutes = require("./rules/strong-typed-routes.js");
const plugin = {
  rules: {
    "no-typeof-runtype": rules_noTypeofRuntype,
    "strong-typed-routes": rules_strongTypedRoutes
  },
  configs: {
    recommended: {
      extends: [],
      rules: {
        "@mionkit/no-typeof-runtype": "error",
        "@mionkit/strong-typed-routes": "error"
      }
    }
  }
};
module.exports = plugin;
module.exports = plugin;
