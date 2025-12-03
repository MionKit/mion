import rule$1 from "./rules/no-typeof-runtype.js";
import rule from "./rules/strong-typed-routes.js";
const plugin = {
  rules: {
    "no-typeof-runtype": rule$1,
    "strong-typed-routes": rule
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
export {
  plugin as default
};
//# sourceMappingURL=index.js.map
