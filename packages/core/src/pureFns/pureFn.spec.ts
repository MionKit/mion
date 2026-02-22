/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, it, expect} from 'vitest';
import type {CompiledPureFunction, GenericPureFunction} from '../types/pureFunctions.types.ts';
import {JITUtils} from '../jit/jitUtils.ts';
import {pureServerFn} from './pureServerFn.ts';
import {getJitUtils} from '../jit/jitUtils.ts';
import {registerPureFnFactory} from './pureFn.ts';

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
    registerPureFnFactory(TEST_NAMESPACE, 'stringPureFn', stringPureFn);
    const restoredFn = getJitUtils().getPureFn(TEST_NAMESPACE, 'stringPureFn') as ReturnType<typeof stringPureFn>;
    expect(restoredFn).toBeDefined();
    expect(restoredFn).toBeInstanceOf(Function);
    expect(restoredFn?.('a', {isLowercase: true})).toBe(true);
    expect(restoredFn?.('A', {isLowercase: true})).toBe(false);
});

it('auto-detect dependencies via proxy when factory calls getPureFn', async () => {
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
    // Register A first, then B (B depends on A)
    registerPureFnFactory(TEST_NAMESPACE, 'pureFunctionA', pureFunctionA);
    registerPureFnFactory(TEST_NAMESPACE, 'pureFunctionB', pureFunctionB);
    const compiledIsA = getCompiledPureFn(TEST_NAMESPACE, 'pureFunctionA');
    const compiledIsB = getCompiledPureFn(TEST_NAMESPACE, 'pureFunctionB');
    expect(compiledIsA).toBeDefined();
    expect(compiledIsB).toBeDefined();
    expect(compiledIsA?.fn).toBeDefined();
    expect(compiledIsB?.fn).toBeDefined();
    // B depends on A (auto-detected via proxy)
    expect(compiledIsB?.pureFnDependencies.includes('pureFunctionA')).toBeTruthy();
    // A has no dependencies (it doesn't call getPureFn)
    expect(compiledIsA?.pureFnDependencies.length).toBe(0);
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
        registerPureFnFactory(TEST_NAMESPACE, 'hashTestFn', hashTestFn);
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
        registerPureFnFactory(TEST_NAMESPACE, 'sameBodyFn1', sameBodyFn1);
        registerPureFnFactory(TEST_NAMESPACE, 'sameBodyFn2', sameBodyFn2);
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
        registerPureFnFactory(TEST_NAMESPACE, 'diffBodyFn1', diffBodyFn1);
        registerPureFnFactory(TEST_NAMESPACE, 'diffBodyFn2', diffBodyFn2);
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
        registerPureFnFactory(TEST_NAMESPACE, 'whitespaceTestFn1', whitespaceTestFn1);
        registerPureFnFactory(TEST_NAMESPACE, 'whitespaceTestFn2', whitespaceTestFn2);
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
        registerPureFnFactory(TEST_NAMESPACE, 'hashLengthTestFn', hashLengthTestFn);
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
});

describe('arrow function factory functions', () => {
    it('should register and get arrow function pure factory with parentheses', () => {
        type StringParams = {
            isLowercase?: boolean;
        };
        /** @reflection never */
        const arrowWithParens = (jUtils: JITUtils) => {
            return function is_s(s: string, p: StringParams): boolean {
                if (p.isLowercase) return s === s.toLowerCase();
                return true;
            };
        };
        registerPureFnFactory(TEST_NAMESPACE, 'arrowWithParens', arrowWithParens);
        const restoredFn = getJitUtils().getPureFn(TEST_NAMESPACE, 'arrowWithParens') as ReturnType<typeof arrowWithParens>;
        expect(restoredFn).toBeDefined();
        expect(restoredFn).toBeInstanceOf(Function);
        expect(restoredFn?.('abc', {isLowercase: true})).toBe(true);
        expect(restoredFn?.('ABC', {isLowercase: true})).toBe(false);
    });

    it('should register and get arrow function pure factory without parentheses', () => {
        type StringParams = {
            isUppercase?: boolean;
        };
        /** @reflection never */
        const arrowNoParens = (x) => {
            return function is_upper(s: string, p: StringParams): boolean {
                if (p.isUppercase) return s === s.toUpperCase();
                return true;
            };
        };
        registerPureFnFactory(TEST_NAMESPACE, 'arrowNoParens', arrowNoParens);
        const restoredFn = getJitUtils().getPureFn(TEST_NAMESPACE, 'arrowNoParens') as ReturnType<typeof arrowNoParens>;
        expect(restoredFn).toBeDefined();
        expect(restoredFn).toBeInstanceOf(Function);
        expect(restoredFn?.('ABC', {isUppercase: true})).toBe(true);
        expect(restoredFn?.('abc', {isUppercase: true})).toBe(false);
    });

    it('should register arrow function with expression body', () => {
        type NumParams = {
            multiplier?: number;
        };
        /** @reflection never */
        const arrowExpression = (jUtils: JITUtils) =>
            function multiply(n: number, p: NumParams): number {
                return n * (p.multiplier ?? 1);
            };
        registerPureFnFactory(TEST_NAMESPACE, 'arrowExpression', arrowExpression);
        const restoredFn = getJitUtils().getPureFn(TEST_NAMESPACE, 'arrowExpression') as ReturnType<typeof arrowExpression>;
        expect(restoredFn).toBeDefined();
        expect(restoredFn).toBeInstanceOf(Function);
        expect(restoredFn?.(5, {multiplier: 3})).toBe(15);
        expect(restoredFn?.(5, {})).toBe(5);
    });

    it('should auto-detect dependencies for arrow functions', () => {
        type Params = {
            isA?: boolean;
            isB?: boolean;
        };
        /** @reflection never */
        const arrowFnA = (jUtils: JITUtils) => {
            return function is_a(s: string, p: Params): boolean {
                if (p.isA) return s.includes('a');
                return true;
            };
        };
        /** @reflection never */
        const arrowFnB = (jUtils) => {
            const isA = jUtils.getPureFn(TEST_NAMESPACE, 'arrowFnA') as ReturnType<typeof arrowFnA>;
            return function is_b(s: string, p: Params): boolean {
                const isAResult = isA(s, p);
                if (p.isB) return isAResult && s.includes('b');
                return isAResult;
            };
        };
        registerPureFnFactory(TEST_NAMESPACE, 'arrowFnA', arrowFnA);
        registerPureFnFactory(TEST_NAMESPACE, 'arrowFnB', arrowFnB);
        const compiledA = getCompiledPureFn(TEST_NAMESPACE, 'arrowFnA');
        const compiledB = getCompiledPureFn(TEST_NAMESPACE, 'arrowFnB');
        expect(compiledA).toBeDefined();
        expect(compiledB).toBeDefined();
        // B depends on A (auto-detected via proxy)
        expect(compiledB?.pureFnDependencies.includes('arrowFnA')).toBeTruthy();
        // A has no dependencies
        expect(compiledA?.pureFnDependencies.length).toBe(0);
    });

    it('should generate correct bodyHash for arrow functions', () => {
        /** @reflection never */
        const arrowHashTest = (jUtils: JITUtils) => {
            return function hash_test(val: string): string {
                return val.toUpperCase();
            };
        };
        registerPureFnFactory(TEST_NAMESPACE, 'arrowHashTest', arrowHashTest);
        const compiled = getCompiledPureFn(TEST_NAMESPACE, 'arrowHashTest');
        expect(compiled).toBeDefined();
        expect(compiled?.bodyHash).toBeDefined();
        expect(typeof compiled?.bodyHash).toBe('string');
        expect(compiled?.bodyHash.length).toBeGreaterThan(0);
    });
});
