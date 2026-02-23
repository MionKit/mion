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

/** The namespace used for all pureServerFn functions */
export const PURE_SERVER_FN_NAMESPACE = 'pureServerFn';

/** Resolves a virtual module ID to its internal Vite ID (\0 prefix + .ts extension) */
export function resolveVirtualId(id: string): string {
    return '\0' + id + '.ts';
}

// Purity validation constants (ALLOWED_GLOBALS, FORBIDDEN_IDENTIFIERS, FACTORY_FORBIDDEN_IDENTIFIERS)
// are in ../pureFns/purityRules.ts, shared with the eslint plugin.
