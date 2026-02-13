"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const core = require("@mionkit/core");
const REGISTRY_VERSION = "1.0.0";
function createRegistry(extractedFns) {
  const entries = {};
  for (const fn of extractedFns) {
    entries[fn.bodyHash] = {
      namespace: core.PURE_SERVER_FN_NAMESPACE,
      fnName: fn.fnName,
      // Optional, for debugging
      paramNames: fn.paramNames,
      code: fn.code,
      bodyHash: fn.bodyHash,
      dependencies: fn.dependencies
    };
  }
  return {
    version: REGISTRY_VERSION,
    entries
  };
}
exports.createRegistry = createRegistry;
//# sourceMappingURL=registry.cjs.map
