/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

/** Virtual module ID for the pure functions registry (client-extracted pure functions) */
export const VIRTUAL_MODULE_ID = 'virtual:mion-pure-functions';

/** Resolved virtual module ID (with \0 prefix per Vite convention, .ts extension for TypeScript) */
export const RESOLVED_VIRTUAL_MODULE_ID = '\0' + VIRTUAL_MODULE_ID + '.ts';

// ============ AOT Virtual Modules ============

/** Virtual module ID for JIT functions + pure functions cache (from running the router) */
export const VIRTUAL_AOT_JIT_FNS = 'virtual:mion-aot/jit-fns';

/** Virtual module ID for pure functions cache (standalone, from client AST extraction) */
export const VIRTUAL_AOT_PURE_FNS = 'virtual:mion-aot/pure-fns';

/** Virtual module ID for router methods cache */
export const VIRTUAL_AOT_ROUTER_CACHE = 'virtual:mion-aot/router-cache';

/** Resolved virtual module ID for JIT functions */
export const RESOLVED_AOT_JIT_FNS = '\0' + VIRTUAL_AOT_JIT_FNS + '.ts';

/** Resolved virtual module ID for pure functions */
export const RESOLVED_AOT_PURE_FNS = '\0' + VIRTUAL_AOT_PURE_FNS + '.ts';

/** Resolved virtual module ID for router cache */
export const RESOLVED_AOT_ROUTER_CACHE = '\0' + VIRTUAL_AOT_ROUTER_CACHE + '.ts';

/** Virtual module ID for combined AOT caches (re-exports all 3 cache modules) */
export const VIRTUAL_AOT_CACHES = 'virtual:mion-aot/caches';

/** Resolved virtual module ID for combined AOT caches */
export const RESOLVED_AOT_CACHES = '\0' + VIRTUAL_AOT_CACHES + '.ts';

/** Globals and built-ins that are allowed inside pure functions */
export const ALLOWED_GLOBALS = new Set([
    // Value types
    'undefined',
    'null',
    'NaN',
    'Infinity',
    'true',
    'false',
    // Built-in constructors/objects
    'Object',
    'Array',
    'String',
    'Number',
    'Boolean',
    'Math',
    'JSON',
    'Date',
    'RegExp',
    'Map',
    'Set',
    'WeakMap',
    'WeakSet',
    'Symbol',
    'BigInt',
    'Promise',
    'Error',
    'TypeError',
    'RangeError',
    'parseInt',
    'parseFloat',
    'isNaN',
    'isFinite',
    'encodeURIComponent',
    'decodeURIComponent',
    'encodeURI',
    'decodeURI',
    // Common safe globals
    'console',
    'globalThis',
]);

/** Forbidden identifiers that indicate impure operations */
export const FORBIDDEN_IDENTIFIERS = new Set([
    'eval',
    'Function',
    'fetch',
    'setTimeout',
    'setInterval',
    'clearTimeout',
    'clearInterval',
    'process',
    'window',
    'document',
    'global',
    'require',
    'XMLHttpRequest',
    'WebSocket',
    'localStorage',
    'sessionStorage',
    'indexedDB',
]);
