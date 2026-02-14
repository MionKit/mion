/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, it, expect, beforeAll} from 'vitest';
import {pureServerFn, pureServerFnGroup, extractDataFromPureFnDef, extractDataFromPureFnDefList} from './pureServerFn.ts';
import {resetHashes, pureFnHashLength} from '@mionkit/core';

beforeAll(() => {
    resetHashes();
});

describe('pureServerFn', () => {
    it('should return a reference with fnName and bodyHash for named functions', () => {
        const ref = pureServerFn({
            pureFn: function mapUsers(users: any[]) {
                return users.map((u: any) => ({userId: u.id}));
            },
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
        const ref = pureServerFn({pureFn: originalFn});

        expect(ref.pureFn).toBe(originalFn);
        expect(ref.pureFn!(5)).toBe(6);
    });

    it('should use bodyHash as fnName when no name is available', () => {
        // Create a function without a name by using Object.defineProperty
        const fn = function () {
            return 1;
        };
        Object.defineProperty(fn, 'name', {value: ''});

        const ref = pureServerFn({
            pureFn: fn as any,
        });

        // Functions without a name use bodyHash as fnName
        expect(ref.fnName).toBe(ref.bodyHash);
        expect(ref.bodyHash).toBeDefined();
        expect(ref.bodyHash.length).toBe(pureFnHashLength);
    });

    it('should allow arrow functions', () => {
        const ref = pureServerFn({pureFn: (x: number) => x * 2});

        // Arrow functions assigned to properties get the property name from deepkit compiler
        // If no name is available, bodyHash is used as fnName
        expect(ref.fnName).toBeDefined();
        expect(ref.bodyHash).toBeDefined();
        expect(ref.bodyHash.length).toBe(pureFnHashLength);
    });

    it('should generate deterministic hashes for same body', () => {
        const ref1 = pureServerFn({
            pureFn: function stableFn(x: number) {
                return x * 2;
            },
        });
        resetHashes();
        const ref2 = pureServerFn({
            pureFn: function stableFn(x: number) {
                return x * 2;
            },
        });

        expect(ref1.bodyHash).toBe(ref2.bodyHash);
    });

    it('should generate different hashes for different function bodies', () => {
        const ref1 = pureServerFn({
            pureFn: function fnA(x: number) {
                return x + 1;
            },
        });
        const ref2 = pureServerFn({
            pureFn: function fnB(x: number) {
                return x + 2;
            },
        });

        expect(ref1.bodyHash).not.toBe(ref2.bodyHash);
    });

    it('should generate same hash for same body regardless of function name', () => {
        const ref1 = pureServerFn({
            pureFn: function nameA(x: number) {
                return x + 1;
            },
        });
        const ref2 = pureServerFn({
            pureFn: function nameB(x: number) {
                return x + 1;
            },
        });

        expect(ref1.bodyHash).toBe(ref2.bodyHash);
    });

    it('should handle functions with no parameters', () => {
        const ref = pureServerFn({
            pureFn: function getDefault() {
                return 42;
            },
        });

        expect(ref.fnName).toBe('getDefault');
        expect(ref.bodyHash).toBeDefined();
    });

    it('should handle functions with multiple parameters', () => {
        const ref = pureServerFn({
            pureFn: function combine(a: string, b: string, c: string) {
                return [a, b, c].join('-');
            },
        });

        expect(ref.fnName).toBe('combine');
        expect(ref.bodyHash).toBeDefined();
    });

    it('should allow custom namespace', () => {
        const ref = pureServerFn({
            pureFn: function myFn(x: number) {
                return x;
            },
            namespace: 'customNamespace',
        });

        expect(ref.namespace).toBe('customNamespace');
    });

    it('should allow custom fnName', () => {
        const ref = pureServerFn({
            pureFn: (x: number) => x,
            fnName: 'customName',
        });

        expect(ref.fnName).toBe('customName');
    });

    it('should set isFactory to false by default', () => {
        const ref = pureServerFn({
            pureFn: (x: number) => x,
        });

        expect(ref.isFactory).toBe(false);
    });

    it('should allow isFactory to be set to true', () => {
        const ref = pureServerFn({
            pureFn: (jitUtils: any) => (x: number) => x,
            isFactory: true,
        });

        expect(ref.isFactory).toBe(true);
    });
});

describe('extractDataFromPureFnDef', () => {
    it('should extract all data from a PureFnDef', () => {
        const ref = extractDataFromPureFnDef({
            pureFn: function testFn(x: number) {
                return x * 2;
            },
        });

        expect(ref.namespace).toBe('pureServerFn');
        expect(ref.fnName).toBe('testFn');
        expect(ref.bodyHash).toBeDefined();
        expect(ref.isFactory).toBe(false);
        expect(ref.pureFn).toBeDefined();
    });

    it('should use custom namespace when provided', () => {
        const ref = extractDataFromPureFnDef({
            pureFn: function testFn(x: number) {
                return x;
            },
            namespace: 'myNamespace',
        });

        expect(ref.namespace).toBe('myNamespace');
    });

    it('should use custom fnName when provided', () => {
        const ref = extractDataFromPureFnDef({
            pureFn: (x: number) => x,
            fnName: 'myFnName',
        });

        expect(ref.fnName).toBe('myFnName');
    });
});

describe('extractDataFromPureFnDefList', () => {
    it('should extract data from a list of PureFnDef objects', () => {
        const refs = extractDataFromPureFnDefList([
            {
                pureFn: function fnA(x: number) {
                    return x + 1;
                },
            },
            {
                pureFn: function fnB(x: number) {
                    return x + 2;
                },
            },
        ]);

        expect(refs.length).toBe(2);
        expect(refs[0].fnName).toBe('fnA');
        expect(refs[1].fnName).toBe('fnB');
    });

    it('should add cross-dependencies to all functions', () => {
        const refs = extractDataFromPureFnDefList([
            {
                pureFn: function fnA(x: number) {
                    return x + 1;
                },
            },
            {
                pureFn: function fnB(x: number) {
                    return x + 2;
                },
            },
            {
                pureFn: function fnC(x: number) {
                    return x + 3;
                },
            },
        ]);

        // fnA should depend on fnB and fnC
        expect(refs[0].dependencies).toContain('pureServerFn::fnB');
        expect(refs[0].dependencies).toContain('pureServerFn::fnC');
        expect(refs[0].dependencies).not.toContain('pureServerFn::fnA');

        // fnB should depend on fnA and fnC
        expect(refs[1].dependencies).toContain('pureServerFn::fnA');
        expect(refs[1].dependencies).toContain('pureServerFn::fnC');
        expect(refs[1].dependencies).not.toContain('pureServerFn::fnB');

        // fnC should depend on fnA and fnB
        expect(refs[2].dependencies).toContain('pureServerFn::fnA');
        expect(refs[2].dependencies).toContain('pureServerFn::fnB');
        expect(refs[2].dependencies).not.toContain('pureServerFn::fnC');
    });
});

describe('pureServerFnGroup', () => {
    it('should return an array of PureServerFnRef with cross-dependencies', () => {
        const [refA, refB] = pureServerFnGroup([
            {
                pureFn: function fnA(x: number) {
                    return x + 1;
                },
            },
            {
                pureFn: function fnB(x: number) {
                    return x + 2;
                },
            },
        ]);

        expect(refA.fnName).toBe('fnA');
        expect(refB.fnName).toBe('fnB');

        // refA should depend on refB
        expect(refA.dependencies).toContain('pureServerFn::fnB');
        expect(refA.dependencies).not.toContain('pureServerFn::fnA');

        // refB should depend on refA
        expect(refB.dependencies).toContain('pureServerFn::fnA');
        expect(refB.dependencies).not.toContain('pureServerFn::fnB');
    });

    it('should use custom namespace for all functions', () => {
        const refs = pureServerFnGroup([
            {
                pureFn: function fnA(x: number) {
                    return x;
                },
                namespace: 'myNs',
            },
            {
                pureFn: function fnB(x: number) {
                    return x;
                },
                namespace: 'myNs',
            },
        ]);

        expect(refs[0].namespace).toBe('myNs');
        expect(refs[1].namespace).toBe('myNs');
        expect(refs[0].dependencies).toContain('myNs::fnB');
        expect(refs[1].dependencies).toContain('myNs::fnA');
    });

    it('should handle mixed namespaces', () => {
        const refs = pureServerFnGroup([
            {
                pureFn: function fnA(x: number) {
                    return x;
                },
                namespace: 'nsA',
            },
            {
                pureFn: function fnB(x: number) {
                    return x;
                },
                namespace: 'nsB',
            },
        ]);

        expect(refs[0].namespace).toBe('nsA');
        expect(refs[1].namespace).toBe('nsB');
        expect(refs[0].dependencies).toContain('nsB::fnB');
        expect(refs[1].dependencies).toContain('nsA::fnA');
    });
});
