/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {createUniqueHash} from './quickHash.ts';

it('quick hash should generate unique hashes', () => {
    const hashes = new Set();
    const initial = 100_000_000_000;
    const max = initial + 100;
    for (let i = initial; i < max; i++) {
        const typeID = `type${i}`;
        const hash = createUniqueHash(typeID, 8);
        expect(hashes.has(hash)).toBe(false);
        hashes.add(hash);
        // console.log(typeID, hash);
    }
});

it('quick hash should generate hashes with specified length', () => {
    // important same type with different length param generates different hashes
    expect(createUniqueHash('type_000000000_1', 6).length).toBe(6);
    expect(createUniqueHash('type_000000000_1', 8).length).toBe(8);
    expect(createUniqueHash('type_000000000_1', 10).length).toBe(10);
    expect(createUniqueHash('type_000000000_1', 12).length).toBe(12);
    expect(createUniqueHash('type_000000000_1', 14).length).toBe(14);
});
