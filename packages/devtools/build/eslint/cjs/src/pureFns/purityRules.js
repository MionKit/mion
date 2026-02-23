"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const ALLOWED_GLOBALS = /* @__PURE__ */ new Set([
  // Value types
  "undefined",
  "null",
  "NaN",
  "Infinity",
  "true",
  "false",
  // Built-in constructors/objects
  "Object",
  "Array",
  "String",
  "Number",
  "Boolean",
  "Math",
  "JSON",
  "Date",
  "RegExp",
  "Map",
  "Set",
  "WeakMap",
  "WeakSet",
  "Symbol",
  "BigInt",
  "Promise",
  "Error",
  "TypeError",
  "RangeError",
  "parseInt",
  "parseFloat",
  "isNaN",
  "isFinite",
  "encodeURIComponent",
  "decodeURIComponent",
  "encodeURI",
  "decodeURI",
  // Common safe globals
  "console",
  "globalThis"
]);
const FORBIDDEN_IDENTIFIERS = /* @__PURE__ */ new Set([
  "eval",
  "Function",
  "fetch",
  "setTimeout",
  "setInterval",
  "clearTimeout",
  "clearInterval",
  "process",
  "window",
  "document",
  "global",
  "require",
  "XMLHttpRequest",
  "WebSocket",
  "localStorage",
  "sessionStorage",
  "indexedDB"
]);
const FACTORY_FORBIDDEN_IDENTIFIERS = /* @__PURE__ */ new Set(["eval", "Function", "fetch", "XMLHttpRequest", "WebSocket"]);
const PURE_FN_SOURCE_PACKAGES = ["@mionkit/core"];
exports.ALLOWED_GLOBALS = ALLOWED_GLOBALS;
exports.FACTORY_FORBIDDEN_IDENTIFIERS = FACTORY_FORBIDDEN_IDENTIFIERS;
exports.FORBIDDEN_IDENTIFIERS = FORBIDDEN_IDENTIFIERS;
exports.PURE_FN_SOURCE_PACKAGES = PURE_FN_SOURCE_PACKAGES;
//# sourceMappingURL=purityRules.js.map
