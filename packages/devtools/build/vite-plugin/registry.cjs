"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const REGISTRY_VERSION = "1.0.0";
function createRegistry(extractedFns) {
  const entries = {};
  for (const fn of extractedFns) {
    const key = `${fn.namespace}::${fn.fnName}`;
    entries[key] = {
      namespace: fn.namespace,
      fnName: fn.fnName,
      paramNames: fn.paramNames,
      code: fn.code,
      bodyHash: fn.bodyHash,
      dependencies: fn.dependencies,
      isFactory: fn.isFactory
    };
  }
  return {
    version: REGISTRY_VERSION,
    entries
  };
}
exports.createRegistry = createRegistry;
//# sourceMappingURL=registry.cjs.map
