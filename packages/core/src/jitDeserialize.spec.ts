/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {deserializeMethods} from './jitDeserialize';
import {jitUtils} from './jitUtils';
import type {SerializableMethodsData, JitCompiledFnData, PureFunctionData} from './types';

describe('jitDeserialize', () => {
    it('should deserialize pure functions with dependencies', () => {
        const pureFunctionData1: PureFunctionData = {
            paramNames: ['utl'],
            code: 'function addNumbers(a, b) {return a + b;} return addNumbers;',
            pureFnHash: 'addNumbers',
            dependencies: new Set<string>(),
        };

        const pureFunctionData2: PureFunctionData = {
            paramNames: ['utl'],
            code: 'const addFn = utl.getPureFn("addNumbers"); function multiplyNumbers(a, b) {return addFn(a, b) * 2;} return multiplyNumbers;',
            pureFnHash: 'multiplyNumbers',
            dependencies: new Set<string>(['addNumbers']),
        };

        const serializedData: SerializableMethodsData = {
            methods: {},
            deps: {},
            purFnDeps: {
                addNumbers: pureFunctionData1,
                multiplyNumbers: pureFunctionData2,
            },
        };

        deserializeMethods(serializedData.deps, serializedData.purFnDeps);

        // Verify both functions are in cache
        expect(jitUtils.hasPureFn('addNumbers')).toBe(true);
        expect(jitUtils.hasPureFn('multiplyNumbers')).toBe(true);

        // Verify functions work correctly
        const addFn = jitUtils.getPureFn('addNumbers');
        const multiplyFn = jitUtils.getPureFn('multiplyNumbers');

        expect(addFn).toBeDefined();
        expect(multiplyFn).toBeDefined();
        expect(addFn!(3, 4)).toBe(7);
        expect(multiplyFn!(3, 4)).toBe(14); // (3 + 4) * 2
    });

    it('should deserialize JIT functions with dependencies', () => {
        const pureFunctionData: PureFunctionData = {
            paramNames: ['utl'],
            code: 'function addNumbers(a, b) {return a + b;} return addNumbers;',
            pureFnHash: 'addNumbers',
            dependencies: new Set<string>(),
        };

        const jitFunctionData: JitCompiledFnData = {
            typeName: 'string',
            fnID: 'prepareForJson',
            jitFnHash: 'testJitFn',
            args: {vλl: 'v'},
            defaultParamValues: {vλl: ''},
            code: 'function testFn(v) {return utl.getPureFn("addNumbers")(v, 1);} return testFn;',
            dependenciesSet: new Set<string>(),
            pureFnDependencies: new Set<string>(['addNumbers']),
        };

        const serializedData: SerializableMethodsData = {
            methods: {},
            deps: {
                testJitFn: jitFunctionData,
            },
            purFnDeps: {
                addNumbers: pureFunctionData,
            },
        };

        deserializeMethods(serializedData.deps, serializedData.purFnDeps);

        // Verify both functions are in cache
        expect(jitUtils.hasPureFn('addNumbers')).toBe(true);
        expect(jitUtils.hasJitFn('testJitFn')).toBe(true);

        // Verify JIT function works correctly
        const jitFn = jitUtils.getJitFn('testJitFn');
        expect(jitFn).toBeDefined();
        expect(jitFn(5)).toBe(6); // 5 + 1
    });

    it('should handle empty serialized data', () => {
        const serializedData: SerializableMethodsData = {
            methods: {},
            deps: {},
            purFnDeps: {},
        };

        expect(() => deserializeMethods(serializedData.deps, serializedData.purFnDeps)).not.toThrow();
    });

    it('should handle deep recursive dependencies', () => {
        // Create a chain of dependencies: fnA -> fnB -> fnC -> fnD
        const pureFnD: PureFunctionData = {
            paramNames: ['utl'],
            code: 'function fnD(x) {return x * 2;} return fnD;',
            pureFnHash: 'fnD',
            dependencies: new Set<string>(),
        };

        const pureFnC: PureFunctionData = {
            paramNames: ['utl'],
            code: 'const fnD = utl.getPureFn("fnD"); function fnC(x) {return fnD(x) + 1;} return fnC;',
            pureFnHash: 'fnC',
            dependencies: new Set<string>(['fnD']),
        };

        const pureFnB: PureFunctionData = {
            paramNames: ['utl'],
            code: 'const fnC = utl.getPureFn("fnC"); function fnB(x) {return fnC(x) + 2;} return fnB;',
            pureFnHash: 'fnB',
            dependencies: new Set<string>(['fnC']),
        };

        const pureFnA: PureFunctionData = {
            paramNames: ['utl'],
            code: 'const fnB = utl.getPureFn("fnB"); function fnA(x) {return fnB(x) + 3;} return fnA;',
            pureFnHash: 'fnA',
            dependencies: new Set<string>(['fnB']),
        };

        // JIT function that depends on the chain
        const jitFn: JitCompiledFnData = {
            typeName: 'number',
            fnID: 'prepareForJson',
            jitFnHash: 'chainJitFn',
            args: {vλl: 'v'},
            defaultParamValues: {vλl: ''},
            code: 'function chainFn(v) {return utl.getPureFn("fnA")(v);} return chainFn;',
            dependenciesSet: new Set<string>(),
            pureFnDependencies: new Set<string>(['fnA']),
        };

        const serializedData: SerializableMethodsData = {
            methods: {},
            deps: {
                chainJitFn: jitFn,
            },
            purFnDeps: {
                fnA: pureFnA,
                fnB: pureFnB,
                fnC: pureFnC,
                fnD: pureFnD,
            },
        };

        deserializeMethods(serializedData.deps, serializedData.purFnDeps);

        // Verify all functions are in cache
        expect(jitUtils.hasPureFn('fnA')).toBe(true);
        expect(jitUtils.hasPureFn('fnB')).toBe(true);
        expect(jitUtils.hasPureFn('fnC')).toBe(true);
        expect(jitUtils.hasPureFn('fnD')).toBe(true);
        expect(jitUtils.hasJitFn('chainJitFn')).toBe(true);

        // Verify the dependency chain works correctly
        // Input: 5 -> fnD(5) = 10 -> fnC(10) = 11 -> fnB(11) = 13 -> fnA(13) = 16
        const jitFunction = jitUtils.getJitFn('chainJitFn');
        expect(jitFunction).toBeDefined();
        expect(jitFunction(5)).toBe(16);
    });

    it('should deserialize all functions in deps collection', () => {
        const referencedJitFn: JitCompiledFnData = {
            typeName: 'string',
            fnID: 'prepareForJson',
            jitFnHash: 'referencedJitFn',
            args: {vλl: 'v'},
            defaultParamValues: {vλl: ''},
            code: 'function referencedFn(v) {return v;} return referencedFn;',
            dependenciesSet: new Set<string>(),
            pureFnDependencies: new Set<string>(),
        };

        const unreferencedJitFn: JitCompiledFnData = {
            typeName: 'string',
            fnID: 'prepareForJson',
            jitFnHash: 'unreferencedJitFn',
            args: {vλl: 'v'},
            defaultParamValues: {vλl: ''},
            code: 'function unreferencedFn(v) {return v;} return unreferencedFn;',
            dependenciesSet: new Set<string>(),
            pureFnDependencies: new Set<string>(),
        };

        const serializedData: SerializableMethodsData = {
            methods: {},
            deps: {
                referencedJitFn: referencedJitFn,
                unreferencedJitFn: unreferencedJitFn, // Both will be deserialized since we process all deps
            },
            purFnDeps: {},
        };

        deserializeMethods(serializedData.deps, serializedData.purFnDeps);

        // Both functions should be in cache since we deserialize all deps
        expect(jitUtils.hasJitFn('referencedJitFn')).toBe(true);
        expect(jitUtils.hasJitFn('unreferencedJitFn')).toBe(true);
    });
});
