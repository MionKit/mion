/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

/**
 * Inlined utilities from @mionkit/core to avoid circular dependency.
 * The vite-plugin needs these utilities to extract pure functions,
 * but @mionkit/core needs the vite-plugin to build.
 *
 * These must be kept in sync with the original implementations in:
 * - packages/core/src/pureFns/quickHash.ts
 * - packages/core/src/pureFns/pureFn.ts
 * - packages/core/src/pureFns/pureServerFn.ts
 */

/** The namespace used for all pureServerFn functions */
export const PURE_SERVER_FN_NAMESPACE = 'pureServerFn';

// Hash utilities from quickHash.ts
const hashes = new Map<string, string>();
const hashChars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const alphaChars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
const hashIncrement = 2;
const maxHashCollisions = 22;
const PRIME = 37;
const hashDefaultLength = 6;

/** Hash length used for pure function body hashes */
export const pureFnHashLength = 8;

function quickHash(input: string, length = hashDefaultLength, prevResult?: string): string {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
        hash = (Math.imul(hash, PRIME) + input.charCodeAt(i)) >>> 0;
    }
    let result = prevResult || '';
    hash = Math.imul(hash, PRIME) >>> 0;
    result += alphaChars.charAt(hash % alphaChars.length);
    while (result.length < length) {
        hash = Math.imul(hash, PRIME) >>> 0;
        result += hashChars.charAt(hash % hashChars.length);
    }
    return result.slice(0, length);
}

export function createUniqueHash(id: string, length = hashDefaultLength): string {
    let hash = quickHash(id, length);
    let counter = 1;
    let existingId = hashes.get(hash);
    while (existingId && existingId !== id) {
        length += counter * hashIncrement;
        const newId = quickHash(id, length, hash);
        hash = newId;
        counter++;
        existingId = hashes.get(hash);
        if (counter > maxHashCollisions) throw new Error(`Cannot generate unique hash for typeID: ${id} too many collisions.`);
    }
    hashes.set(hash, id);
    return hash;
}

/** Normalizes a pure function body for consistent hashing (collapses whitespace, strips deepkit artifacts) */
export function normalizePureFnBody(body: string): string {
    let result = body;
    // Strip deepkit type compiler artifacts (__assignType wrappers) if present.
    // Must match the same logic in packages/core/src/pureFns/pureFn.ts
    if (result.includes('__assignType')) result = stripAssignTypeWrappers(result);
    return result.replace(/[ \t]+/g, ' ').trim();
}

/** Strips __assignType(expr, [...]) wrappers from code, replacing them with just expr */
function stripAssignTypeWrappers(code: string): string {
    const marker = '__assignType(';
    let result = code;
    let idx = result.indexOf(marker);
    while (idx !== -1) {
        const start = idx;
        let pos = idx + marker.length;
        let depth = 1;
        const argStart = pos;
        let argEnd = pos;
        let foundSep = false;
        while (pos < result.length && depth > 0) {
            const ch = result[pos];
            if (ch === '(') depth++;
            else if (ch === ')') {
                depth--;
                if (depth === 0) break;
            } else if (ch === ',' && depth === 1 && !foundSep) {
                argEnd = pos;
                foundSep = true;
            }
            pos++;
        }
        if (!foundSep) argEnd = pos;
        const firstArg = result.substring(argStart, argEnd).trim();
        const end = pos + 1;
        result = result.substring(0, start) + firstArg + result.substring(end);
        idx = result.indexOf(marker);
    }
    return result;
}
