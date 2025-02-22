/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

const jitHashes = new Map<string, string>();
const hashChars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const hashIncrement = 1;
const maxHashCollisions = 22;
const PRIME = 37; // Prime number to mix hash more robustly
// TODO: investigate if this is a good default length, we want short hashes for small code size but long enough to avoid collisions
// variable hash length avoids collisions, so there shouldn't be any problems. but better to keep an eye on it
const hashDefaultLength = 10;

export function quickHash(input: string, length = hashDefaultLength, prevResult?: string): string {
    let hash = 0;
    // Generate initial numeric hash
    for (let i = 0; i < input.length; i++) {
        hash = (hash * PRIME + input.charCodeAt(i)) & 0x1fffffffffffff; // bitwise is slightly faster than modulo
    }
    let result = prevResult || '';
    // Convert numeric hash to a short alphanumeric string
    while (result.length < length) {
        hash = (hash * PRIME) & 0x1fffffffffffff; // bitwise is slightly faster than modulo
        result += hashChars.charAt(hash % hashChars.length);
    }
    return result.slice(0, length);
}

export function createJitIDHash(jitId: string, length = hashDefaultLength): string {
    let id = quickHash(jitId, length);
    let counter = 1;
    let existing = jitHashes.get(id);
    // Check if ID already exists and corresponds to the same input
    while (existing && existing !== jitId) {
        length += counter * hashIncrement;
        // generates a longer hash if there are collisions
        // this would allow trying to get all possible hashes for a given input just by increasing the length
        const newId = quickHash(jitId, length, id);
        if (process.env.DEBUG_JIT)
            console.warn(
                `Collision for jitId: ${jitId} with extended hash: ${newId}, and existing jitId: ${existing} with hash: ${id}`
            );
        id = newId;
        counter++;
        existing = jitHashes.get(id);
        if (counter > maxHashCollisions) throw new Error(`Cannot generate unique hash for jitId: ${jitId} too many collisions.`);
    }

    // Store the unique ID with its original input string
    jitHashes.set(id, jitId);
    // console.log(`Jit ID: ${jitId} with hash: ${id}`);
    return id;
}
