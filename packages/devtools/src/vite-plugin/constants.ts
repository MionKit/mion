/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

export const BODY_HASH_LENGTH = 14;

/** Virtual module ID for the pure functions registry (client-extracted pure functions) */
export const VIRTUAL_SERVER_PURE_FNS = 'virtual:mion-server-pure-fns';

// ============ AOT Virtual Modules ============

/** Virtual module ID for JIT functions + pure functions cache (from running the router) */
export const VIRTUAL_AOT_JIT_FNS = 'virtual:mion-aot/jit-fns';

/** Virtual module ID for pure functions cache (standalone, from client AST extraction) */
export const VIRTUAL_AOT_PURE_FNS = 'virtual:mion-aot/pure-fns';

/** Virtual module ID for router methods cache */
export const VIRTUAL_AOT_ROUTER_CACHE = 'virtual:mion-aot/router-cache';

/** Virtual module ID for combined AOT caches (re-exports all 3 cache modules) */
export const VIRTUAL_AOT_CACHES = 'virtual:mion-aot/caches';

/** The real module that acts as a shim for AOT caches (empty caches). Swapped by the plugin when AOT is enabled. */
export const AOT_CACHES_SHIM = '@mionjs/core/aot-caches';

/** The real module that acts as a shim for server pure functions (empty cache). Swapped by the plugin when serverPureFunctions is enabled. */
export const SERVER_PURE_FNS_SHIM = '@mionjs/core/server-pure-fns';

/** The namespace used for all pureServerFn functions */
export const PURE_SERVER_FN_NAMESPACE = 'pureServerFn';

/** Resolves a virtual module ID to its internal Vite ID (\0 prefix + .ts extension) */
export function resolveVirtualId(id: string): string {
    return '\0' + id + '.ts';
}

// ============ Reflection Stubs (for excludeReflection) ============

/** Modules stubbed out when excludeReflection is enabled (not needed at runtime in AOT mode) */
export const REFLECTION_MODULES = ['@mionjs/run-types', '@deepkit/type', '@deepkit/core'];

/** Prefix for virtual stub module IDs */
export const VIRTUAL_STUB_PREFIX = 'virtual:mion-stub/';

// Purity validation constants (ALLOWED_GLOBALS, FORBIDDEN_IDENTIFIERS, FACTORY_FORBIDDEN_IDENTIFIERS)
// are in ../pureFns/purityRules.ts, shared with the eslint plugin.
