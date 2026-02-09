/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {restoreCompiledJitFns} from './restoreJitFns';
import {addAOTCaches, addSerializedJitCaches, getJitUtils, resetJitFnCaches} from './jitUtils';
import type {
    PersistedJitFunctionsCache,
    NamespacedPersistedPureFunctionsCache,
    FnsDataCache,
    NamespacedPureFnsDataCache,
} from './types/general.types';

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
                    dependenciesSet: new Set(),
                    pureFnDependencies: new Set(),
                    createJitFn: function (utl) {
                        return function test_hash(v: any) {
                            return typeof v === 'string';
                        };
                    },
                    fn: undefined,
                },
            };
            const pureCache: NamespacedPersistedPureFunctionsCache = {};

            addAOTCaches(jitCache, pureCache);

            const restored = getJitUtils().getJIT('test_hash')!;
            expect(restored.fn).toBeDefined();
            expect(restored.fn('hello')).toBe(true);
            expect(restored.fn(123)).toBe(false);
        });

        it('should restore a persisted pure function with createJitFn', () => {
            const jitCache: PersistedJitFunctionsCache = {};
            const pureCache: NamespacedPersistedPureFunctionsCache = {
                [TEST_NS]: {
                    addNumbers: {
                        namespace: TEST_NS,
                        paramNames: ['a', 'b'],
                        code: 'return function addNumbers(a, b){return a + b}',
                        pureFnHash: 'addNumbers',
                        dependencies: new Set(),
                        createJitFn: function (utl) {
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
                    dependenciesSet: new Set(),
                    pureFnDependencies: new Set([`${TEST_NS}::helper`]),
                    createJitFn: function (utl) {
                        const helper = utl.getPureFn(TEST_NS, 'helper')!;
                        return function test_with_pure(v: any) {
                            return helper(v);
                        };
                    },
                    fn: undefined,
                },
            };
            const pureCache: NamespacedPersistedPureFunctionsCache = {
                [TEST_NS]: {
                    helper: {
                        namespace: TEST_NS,
                        paramNames: ['v'],
                        code: 'return function helper(v){return typeof v === "number"}',
                        pureFnHash: 'helper',
                        dependencies: new Set(),
                        createJitFn: function (utl) {
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
                    dependenciesSet: new Set(),
                    pureFnDependencies: new Set(),
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
                    dependenciesSet: new Set(['dep_hash']),
                    pureFnDependencies: new Set(),
                    createJitFn: function (utl) {
                        const dep = utl.getJIT('dep_hash')!;
                        return function parent_hash(v: any) {
                            return dep.fn(v.name);
                        };
                    },
                    fn: undefined,
                },
            };
            const pureCache: NamespacedPersistedPureFunctionsCache = {};

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
            const pureCache: NamespacedPersistedPureFunctionsCache = {
                [TEST_NS]: {
                    multiply: {
                        namespace: TEST_NS,
                        paramNames: ['a', 'b'],
                        code: 'return function multiply(a, b){return a * b}',
                        pureFnHash: 'multiply',
                        dependencies: new Set(),
                        createJitFn: function (utl) {
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
                        pureFnHash: 'square',
                        dependencies: new Set(['multiply']),
                        createJitFn: function (utl) {
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
                    dependenciesSet: new Set(),
                    pureFnDependencies: new Set(),
                    createJitFn: function (utl) {
                        return function already_restored(v: any) {
                            return false; // Different from existing
                        };
                    },
                    fn: existingFn as any,
                },
            };
            const pureCache: NamespacedPersistedPureFunctionsCache = {};

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
                    dependenciesSet: new Set(),
                    pureFnDependencies: new Set(),
                },
            };
            const pureCache: NamespacedPureFnsDataCache = {};

            addSerializedJitCaches(jitCache, pureCache);

            const restored = getJitUtils().getJIT('serialized_hash')!;
            expect(restored.fn).toBeDefined();
            expect(restored.createJitFn).toBeDefined();
            expect(restored.fn(true)).toBe(true);
            expect(restored.fn('not boolean')).toBe(false);
        });

        it('should restore a serialized pure function without createJitFn', () => {
            const jitCache: FnsDataCache = {};
            const pureCache: NamespacedPureFnsDataCache = {
                [TEST_NS]: {
                    subtract: {
                        namespace: TEST_NS,
                        paramNames: ['a', 'b'],
                        code: 'return function subtract(a, b){return a - b}',
                        pureFnHash: 'subtract',
                        dependencies: new Set(),
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
                    dependenciesSet: new Set(),
                    pureFnDependencies: new Set([`${TEST_NS}::isArray`]),
                },
            };
            const pureCache: NamespacedPureFnsDataCache = {
                [TEST_NS]: {
                    isArray: {
                        namespace: TEST_NS,
                        paramNames: ['v'],
                        code: 'return function isArray(v){return Array.isArray(v)}',
                        pureFnHash: 'isArray',
                        dependencies: new Set(),
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
                    dependenciesSet: new Set(),
                    pureFnDependencies: new Set(),
                },
                parent_serialized: {
                    isNoop: false,
                    typeName: 'object',
                    fnID: 'is',
                    jitFnHash: 'parent_serialized',
                    args: {vλl: 'v'},
                    defaultParamValues: {vλl: ''},
                    code: 'const dep = utl.getJIT("dep_serialized"); return function parent_serialized(v){return dep.fn(v.age)}',
                    dependenciesSet: new Set(['dep_serialized']),
                    pureFnDependencies: new Set(),
                },
            };
            const pureCache: NamespacedPureFnsDataCache = {};

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
            const pureCache: NamespacedPureFnsDataCache = {
                [TEST_NS]: {
                    divide: {
                        namespace: TEST_NS,
                        paramNames: ['a', 'b'],
                        code: 'return function divide(a, b){return a / b}',
                        pureFnHash: 'divide',
                        dependencies: new Set(),
                    },
                    half: {
                        namespace: TEST_NS,
                        paramNames: ['x'],
                        code: `const divide = utl.getPureFn("${TEST_NS}", "divide"); return function half(x){return divide(x, 2)}`,
                        pureFnHash: 'half',
                        dependencies: new Set(['divide']),
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
                    dependenciesSet: new Set(['missing']), // missing dependency
                    pureFnDependencies: new Set(),
                    createJitFn: function (utl) {
                        const missing = utl.getJIT('missing');
                        return function parent(v: any) {
                            return missing!.fn(v);
                        };
                    },
                    fn: undefined,
                },
            };
            const pureCache: NamespacedPersistedPureFunctionsCache = {};

            expect(() => restoreCompiledJitFns(jitCache, pureCache, getJitUtils())).toThrow('Jit function missing not found');
        });

        it('should throw error when pure function is not found', () => {
            const jitCache: PersistedJitFunctionsCache = {};
            const pureCache: NamespacedPersistedPureFunctionsCache = {
                [TEST_NS]: {
                    parent: {
                        namespace: TEST_NS,
                        paramNames: ['x'],
                        code: `const missing = utl.getPureFn("${TEST_NS}", "missing"); return function parent(x){return missing(x)}`,
                        pureFnHash: 'parent',
                        dependencies: new Set(['missing']), // missing dependency
                        createJitFn: function (utl) {
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
                    dependenciesSet: new Set(),
                    pureFnDependencies: new Set(),
                },
            };
            const pureCache: NamespacedPureFnsDataCache = {};

            expect(() => restoreCompiledJitFns(jitCache, pureCache, getJitUtils())).toThrow();
        });

        it('should throw TypedError when serialized pure function code is invalid', () => {
            const jitCache: FnsDataCache = {};
            const pureCache: NamespacedPureFnsDataCache = {
                [TEST_NS]: {
                    invalid: {
                        namespace: TEST_NS,
                        paramNames: ['x'],
                        code: 'this is also invalid!!!',
                        pureFnHash: 'invalid',
                        dependencies: new Set(),
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
                    dependenciesSet: new Set(),
                    pureFnDependencies: new Set(),
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
                    dependenciesSet: new Set(['level1_persisted']),
                    pureFnDependencies: new Set(),
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
            const pureCache: NamespacedPureFnsDataCache = {
                [TEST_NS]: {
                    base: {
                        namespace: TEST_NS,
                        paramNames: ['x'],
                        code: 'return function base(x){return x + 1}',
                        pureFnHash: 'base',
                        dependencies: new Set(),
                    },
                    level1: {
                        namespace: TEST_NS,
                        paramNames: ['x'],
                        code: `const base = utl.getPureFn("${TEST_NS}", "base"); return function level1(x){return base(x) * 2}`,
                        pureFnHash: 'level1',
                        dependencies: new Set(['base']),
                    },
                    level2: {
                        namespace: TEST_NS,
                        paramNames: ['x'],
                        code: `const level1 = utl.getPureFn("${TEST_NS}", "level1"); return function level2(x){return level1(x) + 10}`,
                        pureFnHash: 'level2',
                        dependencies: new Set(['level1']),
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
});
