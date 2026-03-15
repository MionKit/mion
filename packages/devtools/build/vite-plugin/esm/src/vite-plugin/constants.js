const BODY_HASH_LENGTH = 14;
const VIRTUAL_SERVER_PURE_FNS = "virtual:mion-server-pure-fns";
const VIRTUAL_AOT_JIT_FNS = "virtual:mion-aot/jit-fns";
const VIRTUAL_AOT_PURE_FNS = "virtual:mion-aot/pure-fns";
const VIRTUAL_AOT_ROUTER_CACHE = "virtual:mion-aot/router-cache";
const VIRTUAL_AOT_CACHES = "virtual:mion-aot/caches";
const AOT_CACHES_SHIM = "@mionjs/core/aot-caches";
const PURE_SERVER_FN_NAMESPACE = "pureServerFn";
function resolveVirtualId(id) {
  return "\0" + id + ".ts";
}
const REFLECTION_MODULES = ["@mionjs/run-types", "@deepkit/type", "@deepkit/core"];
const VIRTUAL_STUB_PREFIX = "virtual:mion-stub/";
export {
  AOT_CACHES_SHIM,
  BODY_HASH_LENGTH,
  PURE_SERVER_FN_NAMESPACE,
  REFLECTION_MODULES,
  VIRTUAL_AOT_CACHES,
  VIRTUAL_AOT_JIT_FNS,
  VIRTUAL_AOT_PURE_FNS,
  VIRTUAL_AOT_ROUTER_CACHE,
  VIRTUAL_SERVER_PURE_FNS,
  VIRTUAL_STUB_PREFIX,
  resolveVirtualId
};
//# sourceMappingURL=constants.js.map
