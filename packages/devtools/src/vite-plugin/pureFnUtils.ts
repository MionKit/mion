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

/** Normalizes a pure function body for consistent hashing (collapses whitespace) */
export function normalizePureFnBody(body: string): string {
    return body.replace(/[ \t]+/g, ' ').trim();
}
