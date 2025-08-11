/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {getENV} from '@mionkit/core';

const hashes = new Map<string, string>();
const literalHashes = new Map<string, string>();
const hashChars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const alphaChars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
const hashIncrement = 1;
const maxHashCollisions = 22;
const PRIME = 37; // Prime number to mix hash robustly, but quick
// TODO: investigate if this is a good default length, we want short hashes for small code size but long enough to avoid to many collisions
// variable hash length avoids collisions, so there shouldn't be any problems. but better to keep an eye on it
export const hashDefaultLength = 6;
export const defaultLiteralLength = 5;

export function quickHash(input: string, length = hashDefaultLength, prevResult?: string): string {
    let hash = 0;
    // Generate initial numeric hash using Math.imul and forcing unsigned 32-bit arithmetic
    for (let i = 0; i < input.length; i++) {
        hash = (Math.imul(hash, PRIME) + input.charCodeAt(i)) >>> 0;
    }
    let result = prevResult || '';
    // First char is always from alphaChars to have a valid variable name
    hash = Math.imul(hash, PRIME) >>> 0;
    result += alphaChars.charAt(hash % alphaChars.length);
    // Convert numeric hash to a short alphanumeric string
    while (result.length < length) {
        hash = Math.imul(hash, PRIME) >>> 0;
        result += hashChars.charAt(hash % hashChars.length);
    }
    return result.slice(0, length);
}

export function createUniqueHash(id: string, length = hashDefaultLength, isLiteral = false): string {
    const dictionary = isLiteral ? literalHashes : hashes;
    let hash = quickHash(id, length);
    let counter = 1;
    let existingId = dictionary.get(hash);
    // Check if ID already exists and corresponds to the same input
    while (existingId && existingId !== id) {
        length += counter * hashIncrement;
        // generates a longer hash if there are collisions
        // this would allow trying to get all possible hashes for a given input just by increasing the length
        const newId = quickHash(id, length, hash);
        if (getENV('DEBUG_JIT'))
            console.warn(
                `Collision for typeID: ${id} with extended hash: ${newId}, and existing typeID: ${existingId} with hash: ${hash}`
            );
        hash = newId;
        counter++;
        existingId = dictionary.get(hash);
        if (counter > maxHashCollisions) throw new Error(`Cannot generate unique hash for typeID: ${id} too many collisions.`);
    }

    // Store the unique ID with its original input string
    dictionary.set(hash, id);
    // console.log(`Jit ID: ${typeID} with hash: ${id}`);
    return hash;
}

export function createHashLiteral(id: string, length = defaultLiteralLength): string {
    return createUniqueHash(id, length, true);
}
