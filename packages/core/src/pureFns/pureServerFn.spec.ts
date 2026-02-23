/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, it, expect} from 'vitest';
import {pureServerFn} from './pureServerFn.ts';

describe('pureServerFn', () => {
    it('should throw when bodyHash is not provided', () => {
        expect(() =>
            pureServerFn({
                pureFn: function mapUsers(users: any[]) {
                    return users.map((u: any) => ({userId: u.id}));
                },
            })
        ).toThrow('pureServerFn requires mion vite plugin transform to inject bodyHash');
    });

    it('should return a reference with the provided bodyHash', () => {
        const ref = pureServerFn(
            {
                pureFn: function mapUsers(users: any[]) {
                    return users.map((u: any) => ({userId: u.id}));
                },
            },
            'abcd1234'
        );

        expect(ref.fnName).toBe('mapUsers');
        expect(ref.bodyHash).toBe('abcd1234');
    });

    it('should include the original function in the reference', () => {
        const originalFn = function addOne(x: number) {
            return x + 1;
        };
        const ref = pureServerFn({pureFn: originalFn}, 'hash0001');

        expect(ref.pureFn).toBe(originalFn);
        expect(ref.pureFn!(5)).toBe(6);
    });

    it('should use bodyHash as fnName when no name is available', () => {
        const fn = function () {
            return 1;
        };
        Object.defineProperty(fn, 'name', {value: ''});

        const ref = pureServerFn({pureFn: fn as any}, 'hash0002');

        // Functions without a name use bodyHash as fnName
        expect(ref.fnName).toBe('hash0002');
        expect(ref.bodyHash).toBe('hash0002');
    });

    it('should allow arrow functions', () => {
        const ref = pureServerFn({pureFn: (x: number) => x * 2, fnName: 'double'}, 'hash0003');

        expect(ref.fnName).toBe('double');
        expect(ref.bodyHash).toBe('hash0003');
    });

    it('should handle functions with no parameters', () => {
        const ref = pureServerFn(
            {
                pureFn: function getDefault() {
                    return 42;
                },
            },
            'hash0004'
        );

        expect(ref.fnName).toBe('getDefault');
        expect(ref.bodyHash).toBe('hash0004');
    });

    it('should handle functions with multiple parameters', () => {
        const ref = pureServerFn(
            {
                pureFn: function combine(a: string, b: string, c: string) {
                    return [a, b, c].join('-');
                },
            },
            'hash0005'
        );

        expect(ref.fnName).toBe('combine');
        expect(ref.bodyHash).toBe('hash0005');
    });

    it('should allow custom namespace', () => {
        const ref = pureServerFn(
            {
                pureFn: function myFn(x: number) {
                    return x;
                },
                namespace: 'customNamespace',
            },
            'hash0006'
        );

        expect(ref.namespace).toBe('customNamespace');
    });

    it('should default namespace to pureServerFn', () => {
        const ref = pureServerFn(
            {
                pureFn: function myFn(x: number) {
                    return x;
                },
            },
            'hash0007'
        );

        expect(ref.namespace).toBe('pureServerFn');
    });

    it('should allow custom fnName', () => {
        const ref = pureServerFn({pureFn: (x: number) => x, fnName: 'customName'}, 'hash0008');

        expect(ref.fnName).toBe('customName');
    });

    it('should set isFactory to false by default', () => {
        const ref = pureServerFn({pureFn: (x: number) => x, fnName: 'fn1'}, 'hash0009');

        expect(ref.isFactory).toBe(false);
    });

    it('should allow isFactory to be set to true', () => {
        const ref = pureServerFn(
            {
                pureFn: (jitUtils: any) => (x: number) => x,
                isFactory: true,
                fnName: 'factory1',
            },
            'hash0010'
        );

        expect(ref.isFactory).toBe(true);
    });

    it('should extract all data from a PureFnDef', () => {
        const ref = pureServerFn(
            {
                pureFn: function testFn(x: number) {
                    return x * 2;
                },
            },
            'hash0011'
        );

        expect(ref.namespace).toBe('pureServerFn');
        expect(ref.fnName).toBe('testFn');
        expect(ref.bodyHash).toBe('hash0011');
        expect(ref.isFactory).toBe(false);
        expect(ref.pureFn).toBeDefined();
    });

    it('should use custom namespace when provided', () => {
        const ref = pureServerFn(
            {
                pureFn: function testFn(x: number) {
                    return x;
                },
                namespace: 'myNamespace',
            },
            'hash0012'
        );

        expect(ref.namespace).toBe('myNamespace');
    });

    it('should use custom fnName when provided', () => {
        const ref = pureServerFn({pureFn: (x: number) => x, fnName: 'myFnName'}, 'hash0013');

        expect(ref.fnName).toBe('myFnName');
    });
});

describe('pureServerFn - plain function overload', () => {
    it('should accept a named function expression and use bodyHash as fnName', () => {
        const ref = pureServerFn(function addOne(x: number) {
            return x + 1;
        }, 'hashPlain01');

        expect(ref.fnName).toBe('hashPlain01');
        expect(ref.bodyHash).toBe('hashPlain01');
        expect(ref.namespace).toBe('pureServerFn');
        expect(ref.isFactory).toBe(false);
        expect(ref.pureFn(5)).toBe(6);
    });

    it('should accept an arrow function and use bodyHash as fnName', () => {
        const ref = pureServerFn((x: number) => x * 2, 'hashPlain02');

        expect(ref.fnName).toBe('hashPlain02');
        expect(ref.bodyHash).toBe('hashPlain02');
        expect(ref.namespace).toBe('pureServerFn');
        expect(ref.isFactory).toBe(false);
        expect(ref.pureFn(3)).toBe(6);
    });

    it('should throw when bodyHash is not provided', () => {
        expect(() => pureServerFn((x: number) => x + 1)).toThrow(
            'pureServerFn requires mion vite plugin transform to inject bodyHash'
        );
    });

    it('should preserve the original function in pureFn', () => {
        const originalFn = (x: number) => x + 10;
        const ref = pureServerFn(originalFn, 'hashPlain03');

        expect(ref.pureFn).toBe(originalFn);
        expect(ref.pureFn(5)).toBe(15);
    });

    it('should always use bodyHash as fnName even for named functions', () => {
        const ref = pureServerFn(function myNamedFn(x: number) {
            return x;
        }, 'hashPlain04');

        // Plain function overload always uses bodyHash, not function.name
        expect(ref.fnName).toBe('hashPlain04');
    });
});
