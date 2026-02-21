"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const VIRTUAL_MODULE_ID = "virtual:mion-pure-functions";
const RESOLVED_VIRTUAL_MODULE_ID = "\0" + VIRTUAL_MODULE_ID + ".ts";
const VIRTUAL_AOT_JIT_FNS = "virtual:mion-aot/jit-fns";
const VIRTUAL_AOT_PURE_FNS = "virtual:mion-aot/pure-fns";
const VIRTUAL_AOT_ROUTER_CACHE = "virtual:mion-aot/router-cache";
const RESOLVED_AOT_JIT_FNS = "\0" + VIRTUAL_AOT_JIT_FNS + ".ts";
const RESOLVED_AOT_PURE_FNS = "\0" + VIRTUAL_AOT_PURE_FNS + ".ts";
const RESOLVED_AOT_ROUTER_CACHE = "\0" + VIRTUAL_AOT_ROUTER_CACHE + ".ts";
const VIRTUAL_AOT_CACHES = "virtual:mion-aot/caches";
const RESOLVED_AOT_CACHES = "\0" + VIRTUAL_AOT_CACHES + ".ts";
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
exports.RESOLVED_AOT_CACHES = RESOLVED_AOT_CACHES;
exports.RESOLVED_AOT_JIT_FNS = RESOLVED_AOT_JIT_FNS;
exports.RESOLVED_AOT_PURE_FNS = RESOLVED_AOT_PURE_FNS;
exports.RESOLVED_AOT_ROUTER_CACHE = RESOLVED_AOT_ROUTER_CACHE;
exports.RESOLVED_VIRTUAL_MODULE_ID = RESOLVED_VIRTUAL_MODULE_ID;
exports.VIRTUAL_AOT_CACHES = VIRTUAL_AOT_CACHES;
exports.VIRTUAL_AOT_JIT_FNS = VIRTUAL_AOT_JIT_FNS;
exports.VIRTUAL_AOT_PURE_FNS = VIRTUAL_AOT_PURE_FNS;
exports.VIRTUAL_AOT_ROUTER_CACHE = VIRTUAL_AOT_ROUTER_CACHE;
exports.VIRTUAL_MODULE_ID = VIRTUAL_MODULE_ID;
//# sourceMappingURL=constants.js.map
