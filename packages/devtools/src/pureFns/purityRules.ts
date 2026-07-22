/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

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
    'Bun',
]);

/** Forbidden identifiers that indicate impure operations in pure functions */
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

/** The target function names that purity validation applies to */
export const PURE_FN_CALL_NAMES = ['serverMapFrom', 'registerMionPureFn'] as const;

/** The packages that export the target pure function APIs */
export const PURE_FN_SOURCE_PACKAGES = ['@mionjs/client', '@mionjs/core'] as const;
