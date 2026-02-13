/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, it, expect, beforeAll} from 'vitest';
import {pureServerFn} from './pureServerFn.ts';
import {resetHashes, pureFnHashLength} from '@mionkit/core';

beforeAll(() => {
    resetHashes();
});

describe('pureServerFn', () => {
    it('should return a reference with fnName and bodyHash for named functions', () => {
        const ref = pureServerFn(function mapUsers(users: any[]) {
            return users.map((u: any) => ({userId: u.id}));
        });

        expect(ref.fnName).toBe('mapUsers');
        expect(ref.bodyHash).toBeDefined();
        expect(typeof ref.bodyHash).toBe('string');
        expect(ref.bodyHash.length).toBe(pureFnHashLength);
    });

    it('should include the original function in the reference', () => {
        const originalFn = function addOne(x: number) {
            return x + 1;
        };
        const ref = pureServerFn(originalFn);

        expect(ref.fn).toBe(originalFn);
        expect(ref.fn!(5)).toBe(6);
    });

    it('should allow anonymous functions (fnName is undefined)', () => {
        // eslint-disable-next-line prefer-arrow-callback
        const ref = pureServerFn(function () {
            return 1;
        } as any);

        expect(ref.fnName).toBeUndefined();
        expect(ref.bodyHash).toBeDefined();
        expect(ref.bodyHash.length).toBe(pureFnHashLength);
    });

    it('should allow arrow functions', () => {
        const ref = pureServerFn((x: number) => x * 2);

        expect(ref.fnName).toBeUndefined(); // Arrow functions don't have names
        expect(ref.bodyHash).toBeDefined();
        expect(ref.bodyHash.length).toBe(pureFnHashLength);
    });

    it('should generate deterministic hashes for same body', () => {
        const ref1 = pureServerFn(function stableFn(x: number) {
            return x * 2;
        });
        resetHashes();
        const ref2 = pureServerFn(function stableFn(x: number) {
            return x * 2;
        });

        expect(ref1.bodyHash).toBe(ref2.bodyHash);
    });

    it('should generate different hashes for different function bodies', () => {
        const ref1 = pureServerFn(function fnA(x: number) {
            return x + 1;
        });
        const ref2 = pureServerFn(function fnB(x: number) {
            return x + 2;
        });

        expect(ref1.bodyHash).not.toBe(ref2.bodyHash);
    });

    it('should generate same hash for same body regardless of function name', () => {
        // Since we now use body-only hash, same body = same hash
        const ref1 = pureServerFn(function nameA(x: number) {
            return x + 1;
        });
        const ref2 = pureServerFn(function nameB(x: number) {
            return x + 1;
        });

        // Same body should produce same hash (fnName is not part of hash anymore)
        expect(ref1.bodyHash).toBe(ref2.bodyHash);
    });

    it('should handle functions with no parameters', () => {
        const ref = pureServerFn(function getDefault() {
            return 42;
        });

        expect(ref.fnName).toBe('getDefault');
        expect(ref.bodyHash).toBeDefined();
    });

    it('should handle functions with multiple parameters', () => {
        const ref = pureServerFn(function combine(a: string, b: string, c: string) {
            return [a, b, c].join('-');
        });

        expect(ref.fnName).toBe('combine');
        expect(ref.bodyHash).toBeDefined();
    });

    it('should generate same hash for functions with same body structure', () => {
        // Arrow function with expression body
        const ref1 = pureServerFn((x: number) => x + 1);
        // Arrow function with same expression body
        const ref2 = pureServerFn((y: number) => y + 1);

        // Same body structure should produce same hash (parameter names don't affect body)
        // Note: The body is "return x + 1" vs "return y + 1" - different!
        // So they should have different hashes
        expect(ref1.bodyHash).not.toBe(ref2.bodyHash);

        // Same exact body should produce same hash
        const ref3 = pureServerFn((x: number) => x + 1);
        expect(ref1.bodyHash).toBe(ref3.bodyHash);
    });
});
