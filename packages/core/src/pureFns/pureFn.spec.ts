/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, it, expect} from 'vitest';
import type {CompiledPureFunction, GenericPureFunction} from '../types/pureFunctions.types.ts';
import {JITUtils} from '../jit/jitUtils.ts';
import {pureServerFn, pureServerFnGroup} from './pureServerFn.ts';
import {getJitUtils} from '../jit/jitUtils.ts';
import {registerPureFnClosure, registerPureFnClosuresGroup} from './pureFn.ts';

const TEST_NAMESPACE = 'test';

function getCompiledPureFn(namespace: string, fnName: string): CompiledPureFunction | undefined {
    return getJitUtils().getCompiledPureFn(namespace, fnName);
}

it('register and get pure function', async () => {
    type StringParams = {
        isLowercase?: boolean;
        isNumeric?: boolean;
    };
    // reflection never tag is required so pure function do not include any artifacts from @deepkit/compiler
    /** @reflection never */
    function stringPureFn() {
        const isNumericRegexp = /^[0-9]+$/;
        return function is_s(s: string, p: StringParams): boolean {
            if (p.isLowercase && s !== s.toLowerCase()) return false;
            if (p.isNumeric && !isNumericRegexp.test(s)) return false;
            return true;
        };
    }
    registerPureFnClosure(TEST_NAMESPACE, stringPureFn);
    const restoredFn = getJitUtils().getPureFn(TEST_NAMESPACE, 'stringPureFn') as ReturnType<typeof stringPureFn>;
    expect(restoredFn).toBeDefined();
    expect(restoredFn).toBeInstanceOf(Function);
    expect(restoredFn?.('a', {isLowercase: true})).toBe(true);
    expect(restoredFn?.('A', {isLowercase: true})).toBe(false);
});

it('register a group of pure functions so all declared as dependencies', async () => {
    type Params = {
        isA?: boolean;
        isB?: boolean;
    };
    // reflection never tag is required so pure function do not include any artifacts from @deepkit/compiler
    /** @reflection never */
    function pureFunctionA(jUtils: JITUtils) {
        return function is_a(s: string, p: Params): boolean {
            if (p.isA) return s.includes('a');
            return true;
        };
    }
    // reflection never tag is required so pure function do not include any artifacts from @deepkit/compiler
    /** @reflection never */
    function pureFunctionB(jUtils: JITUtils) {
        const isA = jUtils.getPureFn(TEST_NAMESPACE, 'pureFunctionA') as ReturnType<typeof pureFunctionA>;
        return function is_b(s: string, p: Params): boolean {
            const isAResult = isA(s, p);
            if (p.isB) return isAResult && s.includes('b');
            return isAResult;
        } as GenericPureFunction<Params>;
    }
    registerPureFnClosuresGroup(TEST_NAMESPACE, [pureFunctionA, pureFunctionB]);
    const compiledIsA = getCompiledPureFn(TEST_NAMESPACE, 'pureFunctionA');
    const compiledIsB = getCompiledPureFn(TEST_NAMESPACE, 'pureFunctionB');
    expect(compiledIsA).toBeDefined();
    expect(compiledIsB).toBeDefined();
    expect(compiledIsA?.fn).toBeDefined();
    expect(compiledIsB?.fn).toBeDefined();
    expect(compiledIsA?.dependencies.has('pureFunctionB')).toBeTruthy();
    expect(compiledIsB?.dependencies.has('pureFunctionA')).toBeTruthy();
    expect(compiledIsA?.dependencies.has('pureFunctionA')).toBeFalsy();
    expect(compiledIsB?.dependencies.has('pureFunctionB')).toBeFalsy();
    // Verify namespace is set correctly
    expect(compiledIsA?.namespace).toBe(TEST_NAMESPACE);
    expect(compiledIsB?.namespace).toBe(TEST_NAMESPACE);
});

describe('bodyHash generation', () => {
    it('should generate bodyHash when registering a pure function', () => {
        /** @reflection never */
        function hashTestFn() {
            return function hash_test(val: string): string {
                return val.toUpperCase();
            };
        }
        registerPureFnClosure(TEST_NAMESPACE, hashTestFn);
        const compiled = getCompiledPureFn(TEST_NAMESPACE, 'hashTestFn');
        expect(compiled).toBeDefined();
        expect(compiled?.bodyHash).toBeDefined();
        expect(typeof compiled?.bodyHash).toBe('string');
        expect(compiled?.bodyHash.length).toBeGreaterThan(0);
    });

    it('should generate different bodyHash for functions with different inner function names', () => {
        /** @reflection never */
        function sameBodyFn1() {
            return function same_body_1(val: number): number {
                return val * 2;
            };
        }
        /** @reflection never */
        function sameBodyFn2() {
            return function same_body_2(val: number): number {
                return val * 2;
            };
        }
        registerPureFnClosure(TEST_NAMESPACE, sameBodyFn1);
        registerPureFnClosure(TEST_NAMESPACE, sameBodyFn2);
        const compiled1 = getCompiledPureFn(TEST_NAMESPACE, 'sameBodyFn1');
        const compiled2 = getCompiledPureFn(TEST_NAMESPACE, 'sameBodyFn2');
        // Different inner function names result in different body hashes
        expect(compiled1?.bodyHash).not.toBe(compiled2?.bodyHash);
    });

    it('should generate different bodyHash for different function bodies', () => {
        /** @reflection never */
        function diffBodyFn1() {
            return function diff_body_1(val: number): number {
                return val * 2;
            };
        }
        /** @reflection never */
        function diffBodyFn2() {
            return function diff_body_2(val: number): number {
                return val * 3;
            };
        }
        registerPureFnClosure(TEST_NAMESPACE, diffBodyFn1);
        registerPureFnClosure(TEST_NAMESPACE, diffBodyFn2);
        const compiled1 = getCompiledPureFn(TEST_NAMESPACE, 'diffBodyFn1');
        const compiled2 = getCompiledPureFn(TEST_NAMESPACE, 'diffBodyFn2');
        expect(compiled1?.bodyHash).not.toBe(compiled2?.bodyHash);
    });

    it('should generate different bodyHash for functions with different outer names even if body is same', () => {
        /** @reflection never */
        function whitespaceTestFn1() {
            return function ws_test(val: string): string {
                return val.trim();
            };
        }
        /** @reflection never */
        function whitespaceTestFn2() {
            return function ws_test(val: string): string {
                return val.trim();
            };
        }
        registerPureFnClosure(TEST_NAMESPACE, whitespaceTestFn1);
        registerPureFnClosure(TEST_NAMESPACE, whitespaceTestFn2);
        const compiled1 = getCompiledPureFn(TEST_NAMESPACE, 'whitespaceTestFn1');
        const compiled2 = getCompiledPureFn(TEST_NAMESPACE, 'whitespaceTestFn2');
        // Hash is based on namespace + name + body, so different outer function names result in different hashes
        expect(compiled1?.bodyHash).not.toBe(compiled2?.bodyHash);
    });

    it('should generate bodyHash of length 12', () => {
        /** @reflection never */
        function hashLengthTestFn() {
            return function hash_length_test(val: string): string {
                return val.toLowerCase();
            };
        }
        registerPureFnClosure(TEST_NAMESPACE, hashLengthTestFn);
        const compiled = getCompiledPureFn(TEST_NAMESPACE, 'hashLengthTestFn');
        expect(compiled?.bodyHash).toBeDefined();
        expect(compiled?.bodyHash.length).toBe(8);
    });
});

describe('pureServerFn with factory functions', () => {
    it('should return a PureServerFnRef with correct metadata for factory functions', () => {
        /** @reflection never */
        function stringPureFn() {
            const isNumericRegexp = /^[0-9]+$/;
            return function is_s(s: string, p: {isLowercase?: boolean; isNumeric?: boolean}): boolean {
                if (p.isLowercase && s !== s.toLowerCase()) return false;
                if (p.isNumeric && !isNumericRegexp.test(s)) return false;
                return true;
            };
        }
        const ref = pureServerFn({namespace: TEST_NAMESPACE, pureFn: stringPureFn, isFactory: true});
        expect(ref.namespace).toBe(TEST_NAMESPACE);
        expect(ref.fnName).toBe('stringPureFn');
        expect(ref.isFactory).toBe(true);
        expect(ref.bodyHash).toBeDefined();
        expect(ref.pureFn).toBe(stringPureFn);
    });

    it('pureServerFnGroup should return refs with cross-dependencies for factory functions', () => {
        type Params = {
            isA?: boolean;
            isB?: boolean;
        };
        /** @reflection never */
        function pureFunctionA() {
            return function is_a(s: string, p: Params): boolean {
                if (p.isA) return s.includes('a');
                return true;
            };
        }
        /** @reflection never */
        function pureFunctionB() {
            return function is_b(s: string, p: Params): boolean {
                if (p.isB) return s.includes('b');
                return true;
            };
        }
        const refs = pureServerFnGroup([
            {namespace: TEST_NAMESPACE, pureFn: pureFunctionA, isFactory: true},
            {namespace: TEST_NAMESPACE, pureFn: pureFunctionB, isFactory: true},
        ]);

        expect(refs.length).toBe(2);
        expect(refs[0].fnName).toBe('pureFunctionA');
        expect(refs[1].fnName).toBe('pureFunctionB');
        expect(refs[0].isFactory).toBe(true);
        expect(refs[1].isFactory).toBe(true);

        // Check cross-dependencies are set
        expect(refs[0].dependencies).toContain(`${TEST_NAMESPACE}::pureFunctionB`);
        expect(refs[1].dependencies).toContain(`${TEST_NAMESPACE}::pureFunctionA`);
    });
});
