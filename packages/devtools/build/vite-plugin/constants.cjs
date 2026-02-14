"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const VIRTUAL_MODULE_ID = "virtual:mion-pure-functions";
const RESOLVED_VIRTUAL_MODULE_ID = "\0" + VIRTUAL_MODULE_ID + ".ts";
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
exports.ALLOWED_GLOBALS = ALLOWED_GLOBALS;
exports.FORBIDDEN_IDENTIFIERS = FORBIDDEN_IDENTIFIERS;
exports.RESOLVED_VIRTUAL_MODULE_ID = RESOLVED_VIRTUAL_MODULE_ID;
exports.VIRTUAL_MODULE_ID = VIRTUAL_MODULE_ID;
//# sourceMappingURL=constants.cjs.map
