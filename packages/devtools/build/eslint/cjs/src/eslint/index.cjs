"use strict";
require("./rules/strong-typed-routes.cjs");
require("./rules/no-unreachable-union-types.cjs");
require("./rules/no-mixed-union-properties.cjs");
require("./rules/no-type-imports.cjs");
require("./rules/pure-functions.cjs");
require("./rules/no-vite-client.cjs");
require("./rules/enforce-type-imports.cjs");
const index = require("../../index.cjs");
module.exports = index;
//# sourceMappingURL=index.cjs.map
