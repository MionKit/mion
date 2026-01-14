import rule$3 from "./rules/no-typeof-runtype.js";
import rule$2 from "./rules/strong-typed-routes.js";
import rule$1 from "./rules/no-unreachable-union-types.js";
import rule from "./rules/no-mixed-union-properties.js";
const plugin = {
  rules: {
    "no-typeof-runtype": rule$3,
    "strong-typed-routes": rule$2,
    "no-unreachable-union-types": rule$1,
    "no-mixed-union-properties": rule
  },
  configs: {
    recommended: {
      extends: [],
      rules: {
        "@mionkit/no-typeof-runtype": "error",
        "@mionkit/strong-typed-routes": "error",
        "@mionkit/no-unreachable-union-types": "error"
        // disabled as seems is not too useful and overlaps with some ts rules
        // '@mionkit/no-mixed-union-properties': 'warn',
      }
    }
  }
};
module.exports = plugin;
export {
  plugin as default
};
//# sourceMappingURL=index.js.map
