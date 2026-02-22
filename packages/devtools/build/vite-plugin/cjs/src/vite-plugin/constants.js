"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const BODY_HASH_LENGTH = 14;
const VIRTUAL_SERVER_PURE_FNS = "virtual:mion-server-pure-fns";
const VIRTUAL_AOT_JIT_FNS = "virtual:mion-aot/jit-fns";
const VIRTUAL_AOT_PURE_FNS = "virtual:mion-aot/pure-fns";
const VIRTUAL_AOT_ROUTER_CACHE = "virtual:mion-aot/router-cache";
const VIRTUAL_AOT_CACHES = "virtual:mion-aot/caches";
const PURE_SERVER_FN_NAMESPACE = "pureServerFn";
function resolveVirtualId(id) {
  return "\0" + id + ".ts";
}
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
exports.BODY_HASH_LENGTH = BODY_HASH_LENGTH;
exports.FORBIDDEN_IDENTIFIERS = FORBIDDEN_IDENTIFIERS;
exports.PURE_SERVER_FN_NAMESPACE = PURE_SERVER_FN_NAMESPACE;
exports.VIRTUAL_AOT_CACHES = VIRTUAL_AOT_CACHES;
exports.VIRTUAL_AOT_JIT_FNS = VIRTUAL_AOT_JIT_FNS;
exports.VIRTUAL_AOT_PURE_FNS = VIRTUAL_AOT_PURE_FNS;
exports.VIRTUAL_AOT_ROUTER_CACHE = VIRTUAL_AOT_ROUTER_CACHE;
exports.VIRTUAL_SERVER_PURE_FNS = VIRTUAL_SERVER_PURE_FNS;
exports.resolveVirtualId = resolveVirtualId;
//# sourceMappingURL=constants.js.map
