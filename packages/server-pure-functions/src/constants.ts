/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

/** Virtual module ID for the pure functions registry */
export const VIRTUAL_MODULE_ID = 'virtual:mion-pure-functions';

/** Resolved virtual module ID (with \0 prefix per Vite convention, .ts extension for TypeScript) */
export const RESOLVED_VIRTUAL_MODULE_ID = '\0' + VIRTUAL_MODULE_ID + '.ts';

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
