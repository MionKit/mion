/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, it, expect, beforeEach, vi} from 'vitest';
import {restoreCompiledJitFns} from './restoreJitFns.ts';
import {addAOTCaches, addSerializedJitCaches, getJitUtils, resetJitFnCaches} from '../jit/jitUtils.ts';
import type {
    PersistedJitFunctionsCache,
    PersistedPureFunctionsCache,
    FnsDataCache,
    PureFnsDataCache,
} from '../types/general.types.ts';

const TEST_NS = 'test';

describe('restoreJitFns', () => {
    beforeEach(() => {
        resetJitFnCaches();
    });

    describe('restoreCompiledJitFns with persisted functions (AOT)', () => {
        it('should restore a simple persisted JIT function with createJitFn', () => {
            const jitCache: PersistedJitFunctionsCache = {
                test_hash: {
                    isNoop: false,
                    typeName: 'string',
                    fnID: 'is',
                    jitFnHash: 'test_hash',
                    args: {vλl: 'v'},
                    defaultParamValues: {vλl: ''},
                    code: 'return function test_hash(v){return typeof v === "string"}',
                    jitDependencies: [],
                    pureFnDependencies: [],
                    createJitFn: function (utl) {
                        return function test_hash(v: any) {
                            return typeof v === 'string';
                        };
                    },
                    fn: undefined,
                },
            };
            const pureCache: PersistedPureFunctionsCache = {};

            addAOTCaches(jitCache, pureCache);

            const restored = getJitUtils().getJIT('test_hash')!;
            expect(restored.fn).toBeDefined();
            expect(restored.fn('hello')).toBe(true);
            expect(restored.fn(123)).toBe(false);
        });

        it('should restore a persisted pure function with createJitFn', () => {
            const jitCache: PersistedJitFunctionsCache = {};
            const pureCache: PersistedPureFunctionsCache = {
                [TEST_NS]: {
                    addNumbers: {
                        namespace: TEST_NS,
                        paramNames: ['a', 'b'],
                        code: 'return function addNumbers(a, b){return a + b}',
                        fnName: 'addNumbers',
                        bodyHash: 'addNumbers_hash',
                        pureFnDependencies: [],
                        createPureFn: function (utl) {
                            return function addNumbers(a: number, b: number) {
                                return a + b;
                            };
                        },
                        fn: undefined,
                    },
                },
            };

            addAOTCaches(jitCache, pureCache);

            const restored = getJitUtils().getPureFn(TEST_NS, 'addNumbers')!;
            expect(restored).toBeDefined();
            expect(restored(2, 3)).toBe(5);
        });

        it('should restore JIT function with pure function dependencies', () => {
            const jitCache: PersistedJitFunctionsCache = {
                test_with_pure: {
                    isNoop: false,
                    typeName: 'number',
                    fnID: 'is',
                    jitFnHash: 'test_with_pure',
                    args: {vλl: 'v'},
                    defaultParamValues: {vλl: ''},
                    code: `const helper = utl.getPureFn("${TEST_NS}", "helper"); return function test_with_pure(v){return helper(v)}`,
                    jitDependencies: [],
                    pureFnDependencies: [`${TEST_NS}::helper`],
                    createJitFn: function (utl) {
                        const helper = utl.getPureFn(TEST_NS, 'helper')!;
                        return function test_with_pure(v: any) {
                            return helper(v);
                        };
                    },
                    fn: undefined,
                },
            };
            const pureCache: PersistedPureFunctionsCache = {
                [TEST_NS]: {
                    helper: {
                        namespace: TEST_NS,
                        paramNames: ['v'],
                        code: 'return function helper(v){return typeof v === "number"}',
                        fnName: 'helper',
                        bodyHash: 'helper_hash',
                        pureFnDependencies: [],
                        createPureFn: function (utl) {
                            return function helper(v: any) {
                                return typeof v === 'number';
                            };
                        },
                        fn: undefined,
                    },
                },
            };

            addAOTCaches(jitCache, pureCache);

            const restoredJit = getJitUtils().getJIT('test_with_pure')!;
            const restoredPure = getJitUtils().getPureFn(TEST_NS, 'helper')!;
            expect(restoredPure).toBeDefined();
            expect(restoredJit.fn).toBeDefined();
            expect(restoredJit.fn(42)).toBe(true);
            expect(restoredJit.fn('hello')).toBe(false);
        });

        it('should restore JIT function with JIT dependencies', () => {
            const jitCache: PersistedJitFunctionsCache = {
                dep_hash: {
                    isNoop: false,
                    typeName: 'string',
                    fnID: 'is',
                    jitFnHash: 'dep_hash',
                    args: {vλl: 'v'},
                    defaultParamValues: {vλl: ''},
                    code: 'return function dep_hash(v){return typeof v === "string"}',
                    jitDependencies: [],
                    pureFnDependencies: [],
                    createJitFn: function (utl) {
                        return function dep_hash(v: any) {
                            return typeof v === 'string';
                        };
                    },
                    fn: undefined,
                },
                parent_hash: {
                    isNoop: false,
                    typeName: 'object',
                    fnID: 'is',
                    jitFnHash: 'parent_hash',
                    args: {vλl: 'v'},
                    defaultParamValues: {vλl: ''},
                    code: 'const dep = utl.getJIT("dep_hash"); return function parent_hash(v){return dep.fn(v.name)}',
                    jitDependencies: ['dep_hash'],
                    pureFnDependencies: [],
                    createJitFn: function (utl) {
                        const dep = utl.getJIT('dep_hash')!;
                        return function parent_hash(v: any) {
                            return dep.fn(v.name);
                        };
                    },
                    fn: undefined,
                },
            };
            const pureCache: PersistedPureFunctionsCache = {};

            addAOTCaches(jitCache, pureCache);

            const restoredDep = getJitUtils().getJIT('dep_hash')!;
            const restoredParent = getJitUtils().getJIT('parent_hash')!;
            expect(restoredDep.fn).toBeDefined();
            expect(restoredParent.fn).toBeDefined();
            expect(restoredParent.fn({name: 'test'})).toBe(true);
            expect(restoredParent.fn({name: 123})).toBe(false);
        });

        it('should restore pure function with pure dependencies', () => {
            const jitCache: PersistedJitFunctionsCache = {};
            const pureCache: PersistedPureFunctionsCache = {
                [TEST_NS]: {
                    multiply: {
                        namespace: TEST_NS,
                        paramNames: ['a', 'b'],
                        code: 'return function multiply(a, b){return a * b}',
                        fnName: 'multiply',
                        bodyHash: 'multiply_hash',
                        pureFnDependencies: [],
                        createPureFn: function (utl) {
                            return function multiply(a: number, b: number) {
                                return a * b;
                            };
                        },
                        fn: undefined,
                    },
                    square: {
                        namespace: TEST_NS,
                        paramNames: ['x'],
                        code: `const multiply = utl.getPureFn("${TEST_NS}", "multiply"); return function square(x){return multiply(x, x)}`,
                        fnName: 'square',
                        bodyHash: 'square_hash',
                        pureFnDependencies: ['multiply'],
                        createPureFn: function (utl) {
                            const multiply = utl.getPureFn(TEST_NS, 'multiply')!;
                            return function square(x: number) {
                                return multiply(x, x);
                            };
                        },
                        fn: undefined,
                    },
                },
            };

            addAOTCaches(jitCache, pureCache);

            const restoredMultiply = getJitUtils().getPureFn(TEST_NS, 'multiply')!;
            const restoredSquare = getJitUtils().getPureFn(TEST_NS, 'square')!;
            expect(restoredMultiply).toBeDefined();
            expect(restoredSquare).toBeDefined();
            expect(restoredSquare(5)).toBe(25);
        });

        it('should not restore functions that already have fn defined', () => {
            const existingFn = (v: any) => true;
            const jitCache: PersistedJitFunctionsCache = {
                already_restored: {
                    isNoop: false,
                    typeName: 'any',
                    fnID: 'is',
                    jitFnHash: 'already_restored',
                    args: {vλl: 'v'},
                    defaultParamValues: {vλl: ''},
                    code: 'return function already_restored(v){return true}',
                    jitDependencies: [],
                    pureFnDependencies: [],
                    createJitFn: function (utl) {
                        return function already_restored(v: any) {
                            return false; // Different from existing
                        };
                    },
                    fn: existingFn as any,
                },
            };
            const pureCache: PersistedPureFunctionsCache = {};

            addAOTCaches(jitCache, pureCache);

            // Should keep the existing fn, not call createJitFn
            const restored = getJitUtils().getJIT('already_restored')!;
            expect(restored.fn).toBe(existingFn);
        });
    });

    describe('restoreCompiledJitFns with serialized functions (network)', () => {
        it('should restore a serialized JIT function without createJitFn', () => {
            const jitCache: FnsDataCache = {
                serialized_hash: {
                    isNoop: false,
                    typeName: 'boolean',
                    fnID: 'is',
                    jitFnHash: 'serialized_hash',
                    args: {vλl: 'v'},
                    defaultParamValues: {vλl: ''},
                    code: 'return function serialized_hash(v){return typeof v === "boolean"}',
                    jitDependencies: [],
                    pureFnDependencies: [],
                },
            };
            const pureCache: PureFnsDataCache = {};

            addSerializedJitCaches(jitCache, pureCache);

            const restored = getJitUtils().getJIT('serialized_hash')!;
            expect(restored.fn).toBeDefined();
            expect(restored.createJitFn).toBeDefined();
            expect(restored.fn(true)).toBe(true);
            expect(restored.fn('not boolean')).toBe(false);
        });

        it('should restore a serialized pure function without createJitFn', () => {
            const jitCache: FnsDataCache = {};
            const pureCache: PureFnsDataCache = {
                [TEST_NS]: {
                    subtract: {
                        namespace: TEST_NS,
                        paramNames: ['a', 'b'],
                        code: 'return function subtract(a, b){return a - b}',
                        fnName: 'subtract',
                        bodyHash: 'subtract_hash',
                        pureFnDependencies: [],
                    },
                },
            };

            addSerializedJitCaches(jitCache, pureCache);

            const restored = getJitUtils().getPureFn(TEST_NS, 'subtract')!;
            expect(restored).toBeDefined();
            expect(restored(10, 3)).toBe(7);
        });

        it('should restore serialized JIT function with serialized pure dependencies', () => {
            const jitCache: FnsDataCache = {
                test_serialized: {
                    isNoop: false,
                    typeName: 'array',
                    fnID: 'is',
                    jitFnHash: 'test_serialized',
                    args: {vλl: 'v'},
                    defaultParamValues: {vλl: ''},
                    code: `const isArray = utl.getPureFn("${TEST_NS}", "isArray"); return function test_serialized(v){return isArray(v)}`,
                    jitDependencies: [],
                    pureFnDependencies: [`${TEST_NS}::isArray`],
                },
            };
            const pureCache: PureFnsDataCache = {
                [TEST_NS]: {
                    isArray: {
                        namespace: TEST_NS,
                        paramNames: ['v'],
                        code: 'return function isArray(v){return Array.isArray(v)}',
                        fnName: 'isArray',
                        bodyHash: 'isArray_hash',
                        pureFnDependencies: [],
                    },
                },
            };

            addSerializedJitCaches(jitCache, pureCache);

            const restoredJit = getJitUtils().getJIT('test_serialized')!;
            const restoredPure = getJitUtils().getPureFn(TEST_NS, 'isArray')!;
            expect(restoredPure).toBeDefined();
            expect(restoredJit.fn).toBeDefined();
            expect(restoredJit.createJitFn).toBeDefined();
            expect(restoredJit.fn([1, 2, 3])).toBe(true);
            expect(restoredJit.fn('not array')).toBe(false);
        });

        it('should restore serialized JIT function with serialized JIT dependencies', () => {
            const jitCache: FnsDataCache = {
                dep_serialized: {
                    isNoop: false,
                    typeName: 'number',
                    fnID: 'is',
                    jitFnHash: 'dep_serialized',
                    args: {vλl: 'v'},
                    defaultParamValues: {vλl: ''},
                    code: 'return function dep_serialized(v){return typeof v === "number"}',
                    jitDependencies: [],
                    pureFnDependencies: [],
                },
                parent_serialized: {
                    isNoop: false,
                    typeName: 'object',
                    fnID: 'is',
                    jitFnHash: 'parent_serialized',
                    args: {vλl: 'v'},
                    defaultParamValues: {vλl: ''},
                    code: 'const dep = utl.getJIT("dep_serialized"); return function parent_serialized(v){return dep.fn(v.age)}',
                    jitDependencies: ['dep_serialized'],
                    pureFnDependencies: [],
                },
            };
            const pureCache: PureFnsDataCache = {};

            addSerializedJitCaches(jitCache, pureCache);

            const restoredDep = getJitUtils().getJIT('dep_serialized')!;
            const restoredParent = getJitUtils().getJIT('parent_serialized')!;
            expect(restoredDep.fn).toBeDefined();
            expect(restoredDep.createJitFn).toBeDefined();
            expect(restoredParent.fn).toBeDefined();
            expect(restoredParent.createJitFn).toBeDefined();
            expect(restoredParent.fn({age: 25})).toBe(true);
            expect(restoredParent.fn({age: 'twenty'})).toBe(false);
        });

        it('should restore serialized pure function with serialized pure dependencies', () => {
            const jitCache: FnsDataCache = {};
            const pureCache: PureFnsDataCache = {
                [TEST_NS]: {
                    divide: {
                        namespace: TEST_NS,
                        paramNames: ['a', 'b'],
                        code: 'return function divide(a, b){return a / b}',
                        fnName: 'divide',
                        bodyHash: 'divide_hash',
                        pureFnDependencies: [],
                    },
                    half: {
                        namespace: TEST_NS,
                        paramNames: ['x'],
                        code: `const divide = utl.getPureFn("${TEST_NS}", "divide"); return function half(x){return divide(x, 2)}`,
                        fnName: 'half',
                        bodyHash: 'half_hash',
                        pureFnDependencies: ['divide'],
                    },
                },
            };

            addSerializedJitCaches(jitCache, pureCache);

            const restoredDivide = getJitUtils().getPureFn(TEST_NS, 'divide')!;
            const restoredHalf = getJitUtils().getPureFn(TEST_NS, 'half')!;
            expect(restoredDivide).toBeDefined();
            expect(restoredHalf).toBeDefined();
            expect(restoredHalf(10)).toBe(5);
        });
    });

    describe('error handling', () => {
        it('should throw error when JIT function is not found', () => {
            const jitCache: PersistedJitFunctionsCache = {
                parent: {
                    isNoop: false,
                    typeName: 'any',
                    fnID: 'is',
                    jitFnHash: 'parent',
                    args: {vλl: 'v'},
                    defaultParamValues: {vλl: ''},
                    code: 'const missing = utl.getJIT("missing"); return function parent(v){return missing.fn(v)}',
                    jitDependencies: ['missing'], // missing dependency
                    pureFnDependencies: [],
                    createJitFn: function (utl) {
                        const missing = utl.getJIT('missing');
                        return function parent(v: any) {
                            return missing!.fn(v);
                        };
                    },
                    fn: undefined,
                },
            };
            const pureCache: PersistedPureFunctionsCache = {};

            expect(() => restoreCompiledJitFns(jitCache, pureCache, getJitUtils())).toThrow('Jit function missing not found');
        });

        it('should throw error when pure function is not found', () => {
            const jitCache: PersistedJitFunctionsCache = {};
            const pureCache: PersistedPureFunctionsCache = {
                [TEST_NS]: {
                    parent: {
                        namespace: TEST_NS,
                        paramNames: ['x'],
                        code: `const missing = utl.getPureFn("${TEST_NS}", "missing"); return function parent(x){return missing(x)}`,
                        fnName: 'parent',
                        bodyHash: 'parent_hash',
                        pureFnDependencies: ['missing'], // missing dependency
                        createPureFn: function (utl) {
                            const missing = utl.getPureFn(TEST_NS, 'missing')!;
                            return function parent(x: any) {
                                return missing(x);
                            };
                        },
                        fn: undefined,
                    },
                },
            };

            expect(() => restoreCompiledJitFns(jitCache, pureCache, getJitUtils())).toThrow(
                `Pure function missing not found in namespace ${TEST_NS}`
            );
        });

        it('should throw TypedError when serialized JIT function code is invalid', () => {
            const jitCache: FnsDataCache = {
                invalid: {
                    isNoop: false,
                    typeName: 'any',
                    fnID: 'is',
                    jitFnHash: 'invalid',
                    args: {vλl: 'v'},
                    defaultParamValues: {vλl: ''},
                    code: 'this is invalid javascript code!!!',
                    jitDependencies: [],
                    pureFnDependencies: [],
                },
            };
            const pureCache: PureFnsDataCache = {};

            expect(() => restoreCompiledJitFns(jitCache, pureCache, getJitUtils())).toThrow();
        });

        it('should throw TypedError when serialized pure function code is invalid', () => {
            const jitCache: FnsDataCache = {};
            const pureCache: PureFnsDataCache = {
                [TEST_NS]: {
                    invalid: {
                        namespace: TEST_NS,
                        paramNames: ['x'],
                        code: 'this is also invalid!!!',
                        fnName: 'invalid',
                        bodyHash: 'invalid_hash',
                        pureFnDependencies: [],
                    },
                },
            };

            expect(() => restoreCompiledJitFns(jitCache, pureCache, getJitUtils())).toThrow();
        });
    });

    describe('complex dependency chains', () => {
        it('should restore complex dependency chain with mixed persisted and serialized functions', () => {
            // Mix of persisted (with createJitFn) and serialized (without createJitFn)
            const jitCache: any = {
                level1_persisted: {
                    isNoop: false,
                    typeName: 'string',
                    fnID: 'is',
                    jitFnHash: 'level1_persisted',
                    args: {vλl: 'v'},
                    defaultParamValues: {vλl: ''},
                    code: 'return function level1_persisted(v){return typeof v === "string"}',
                    jitDependencies: [],
                    pureFnDependencies: [],
                    createJitFn: function (utl: any) {
                        return function level1_persisted(v: any) {
                            return typeof v === 'string';
                        };
                    },
                    fn: undefined,
                },
                level2_serialized: {
                    isNoop: false,
                    typeName: 'object',
                    fnID: 'is',
                    jitFnHash: 'level2_serialized',
                    args: {vλl: 'v'},
                    defaultParamValues: {vλl: ''},
                    code: 'const level1 = utl.getJIT("level1_persisted"); return function level2_serialized(v){return level1.fn(v.name)}',
                    jitDependencies: ['level1_persisted'],
                    pureFnDependencies: [],
                    // No createJitFn - serialized
                },
            };
            const pureCache: any = {};

            // Use addAOTCaches since level1 has createJitFn (persisted)
            // This will handle both persisted and serialized functions
            addAOTCaches(jitCache, pureCache);

            const level1 = getJitUtils().getJIT('level1_persisted')!;
            const level2 = getJitUtils().getJIT('level2_serialized')!;
            expect(level1.fn).toBeDefined();
            expect(level2.fn).toBeDefined();
            expect(level2.fn({name: 'test'})).toBe(true);
            expect(level2.fn({name: 123})).toBe(false);
        });

        it('should restore deep dependency chain', () => {
            const jitCache: FnsDataCache = {};
            const pureCache: PureFnsDataCache = {
                [TEST_NS]: {
                    base: {
                        namespace: TEST_NS,
                        paramNames: ['x'],
                        code: 'return function base(x){return x + 1}',
                        fnName: 'base',
                        bodyHash: 'base_hash',
                        pureFnDependencies: [],
                    },
                    level1: {
                        namespace: TEST_NS,
                        paramNames: ['x'],
                        code: `const base = utl.getPureFn("${TEST_NS}", "base"); return function level1(x){return base(x) * 2}`,
                        fnName: 'level1',
                        bodyHash: 'level1_hash',
                        pureFnDependencies: ['base'],
                    },
                    level2: {
                        namespace: TEST_NS,
                        paramNames: ['x'],
                        code: `const level1 = utl.getPureFn("${TEST_NS}", "level1"); return function level2(x){return level1(x) + 10}`,
                        fnName: 'level2',
                        bodyHash: 'level2_hash',
                        pureFnDependencies: ['level1'],
                    },
                },
            };

            addSerializedJitCaches(jitCache, pureCache);

            const restoredBase = getJitUtils().getPureFn(TEST_NS, 'base')!;
            const restoredLevel1 = getJitUtils().getPureFn(TEST_NS, 'level1')!;
            const restoredLevel2 = getJitUtils().getPureFn(TEST_NS, 'level2')!;
            expect(restoredBase).toBeDefined();
            expect(restoredLevel1).toBeDefined();
            expect(restoredLevel2).toBeDefined();
            // level2(5) = level1(5) + 10 = (base(5) * 2) + 10 = (6 * 2) + 10 = 22
            expect(restoredLevel2(5)).toBe(22);
        });
    });

    describe('bodyHash versioning and cache eviction', () => {
        it('should evict cached pure function when bodyHash mismatches', () => {
            // First, add a pure function with a specific bodyHash
            const initialPureCache: PureFnsDataCache = {
                [TEST_NS]: {
                    versionedFn: {
                        namespace: TEST_NS,
                        paramNames: ['x'],
                        code: 'return function versionedFn(x){return x * 2}',
                        fnName: 'versionedFn',
                        bodyHash: 'hash_v1',
                        pureFnDependencies: [],
                    },
                },
            };

            addSerializedJitCaches({}, initialPureCache);

            // Verify initial function is loaded
            const initialFn = getJitUtils().getPureFn(TEST_NS, 'versionedFn')!;
            expect(initialFn).toBeDefined();
            expect(initialFn(5)).toBe(10);

            // Now add a new version with different bodyHash (simulating server update)
            const updatedPureCache: PureFnsDataCache = {
                [TEST_NS]: {
                    versionedFn: {
                        namespace: TEST_NS,
                        paramNames: ['x'],
                        code: 'return function versionedFn(x){return x * 3}',
                        fnName: 'versionedFn',
                        bodyHash: 'hash_v2', // Different hash
                        pureFnDependencies: [],
                    },
                },
            };

            // Spy on console.warn to verify eviction warning
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

            addSerializedJitCaches({}, updatedPureCache);

            // Verify warning was logged
            expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('cache eviction'));
            warnSpy.mockRestore();

            // Verify the function was replaced with the new version
            const updatedFn = getJitUtils().getPureFn(TEST_NS, 'versionedFn')!;
            expect(updatedFn).toBeDefined();
            expect(updatedFn(5)).toBe(15); // New version multiplies by 3
        });

        it('should keep cached pure function when bodyHash matches', () => {
            // First, add a pure function with a specific bodyHash
            const initialPureCache: PureFnsDataCache = {
                [TEST_NS]: {
                    stableFn: {
                        namespace: TEST_NS,
                        paramNames: ['x'],
                        code: 'return function stableFn(x){return x + 1}',
                        fnName: 'stableFn',
                        bodyHash: 'stable_hash',
                        pureFnDependencies: [],
                    },
                },
            };

            addSerializedJitCaches({}, initialPureCache);

            // Verify initial function is loaded
            const initialFn = getJitUtils().getPureFn(TEST_NS, 'stableFn')!;
            expect(initialFn).toBeDefined();
            expect(initialFn(5)).toBe(6);

            // Now add the same version with same bodyHash
            const samePureCache: PureFnsDataCache = {
                [TEST_NS]: {
                    stableFn: {
                        namespace: TEST_NS,
                        paramNames: ['x'],
                        code: 'return function stableFn(x){return x + 1}',
                        fnName: 'stableFn',
                        bodyHash: 'stable_hash', // Same hash
                        pureFnDependencies: [],
                    },
                },
            };

            // Spy on console.warn to verify no eviction warning
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

            addSerializedJitCaches({}, samePureCache);

            // Verify no warning was logged (no eviction)
            expect(warnSpy).not.toHaveBeenCalled();
            warnSpy.mockRestore();

            // Function should still work
            const sameFn = getJitUtils().getPureFn(TEST_NS, 'stableFn')!;
            expect(sameFn).toBeDefined();
            expect(sameFn(5)).toBe(6);
        });

        it('should add new pure function when no existing entry', () => {
            const newPureCache: PureFnsDataCache = {
                [TEST_NS]: {
                    brandNewFn: {
                        namespace: TEST_NS,
                        paramNames: ['x'],
                        code: 'return function brandNewFn(x){return x * x}',
                        fnName: 'brandNewFn',
                        bodyHash: 'new_hash',
                        pureFnDependencies: [],
                    },
                },
            };

            // Spy on console.warn to verify no eviction warning
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

            addSerializedJitCaches({}, newPureCache);

            // Verify no warning was logged (no eviction, just addition)
            expect(warnSpy).not.toHaveBeenCalled();
            warnSpy.mockRestore();

            // Verify the function was added
            const newFn = getJitUtils().getPureFn(TEST_NS, 'brandNewFn')!;
            expect(newFn).toBeDefined();
            expect(newFn(5)).toBe(25);
        });

        it('should handle missing bodyHash gracefully (backward compatibility)', () => {
            // First, add a pure function without bodyHash (old format)
            const oldFormatCache: PureFnsDataCache = {
                [TEST_NS]: {
                    legacyFn: {
                        namespace: TEST_NS,
                        paramNames: ['x'],
                        code: 'return function legacyFn(x){return x - 1}',
                        fnName: 'legacyFn',
                        bodyHash: '', // Empty/missing bodyHash
                        pureFnDependencies: [],
                    },
                },
            };

            addSerializedJitCaches({}, oldFormatCache);

            // Now add a new version with bodyHash
            const newFormatCache: PureFnsDataCache = {
                [TEST_NS]: {
                    legacyFn: {
                        namespace: TEST_NS,
                        paramNames: ['x'],
                        code: 'return function legacyFn(x){return x - 2}',
                        fnName: 'legacyFn',
                        bodyHash: 'new_hash',
                        pureFnDependencies: [],
                    },
                },
            };

            // Spy on console.warn
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

            addSerializedJitCaches({}, newFormatCache);

            // Should not warn because one hash is missing (graceful handling)
            expect(warnSpy).not.toHaveBeenCalled();
            warnSpy.mockRestore();

            // Original function should be kept (no eviction when hash is missing)
            const fn = getJitUtils().getPureFn(TEST_NS, 'legacyFn')!;
            expect(fn).toBeDefined();
            expect(fn(5)).toBe(4); // Original version
        });
    });
});
