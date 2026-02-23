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
exports.BODY_HASH_LENGTH = BODY_HASH_LENGTH;
exports.PURE_SERVER_FN_NAMESPACE = PURE_SERVER_FN_NAMESPACE;
exports.VIRTUAL_AOT_CACHES = VIRTUAL_AOT_CACHES;
exports.VIRTUAL_AOT_JIT_FNS = VIRTUAL_AOT_JIT_FNS;
exports.VIRTUAL_AOT_PURE_FNS = VIRTUAL_AOT_PURE_FNS;
exports.VIRTUAL_AOT_ROUTER_CACHE = VIRTUAL_AOT_ROUTER_CACHE;
exports.VIRTUAL_SERVER_PURE_FNS = VIRTUAL_SERVER_PURE_FNS;
exports.resolveVirtualId = resolveVirtualId;
//# sourceMappingURL=constants.js.map
