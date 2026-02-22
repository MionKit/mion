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
export {
  ALLOWED_GLOBALS,
  BODY_HASH_LENGTH,
  FORBIDDEN_IDENTIFIERS,
  PURE_SERVER_FN_NAMESPACE,
  VIRTUAL_AOT_CACHES,
  VIRTUAL_AOT_JIT_FNS,
  VIRTUAL_AOT_PURE_FNS,
  VIRTUAL_AOT_ROUTER_CACHE,
  VIRTUAL_SERVER_PURE_FNS,
  resolveVirtualId
};
//# sourceMappingURL=constants.js.map
