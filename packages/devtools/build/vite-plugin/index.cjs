"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const plugin = require("./plugin.cjs");
const constants = require("./constants.cjs");
const extractPureFn = require("./extractPureFn.cjs");
const registry = require("./registry.cjs");
const virtualModule = require("./virtualModule.cjs");
exports.pureFunctionsPlugin = plugin.pureFunctionsPlugin;
exports.RESOLVED_VIRTUAL_MODULE_ID = constants.RESOLVED_VIRTUAL_MODULE_ID;
exports.VIRTUAL_MODULE_ID = constants.VIRTUAL_MODULE_ID;
exports.PurityError = extractPureFn.PurityError;
exports.extractPureFnsFromSource = extractPureFn.extractPureFnsFromSource;
exports.createRegistry = registry.createRegistry;
exports.generateVirtualModule = virtualModule.generateVirtualModule;
//# sourceMappingURL=index.cjs.map
