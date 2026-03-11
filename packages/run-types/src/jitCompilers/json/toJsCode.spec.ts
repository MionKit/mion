/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {it, expect} from 'vitest';
import {runType} from '../../createRunType.ts';
import {JitFunctions} from '../../constants.functions.ts';
import {createToJavascriptFn} from '../../createRunTypeFunctions.ts';
import {SrcCodeJITCompiledFnsCache, SrcCodePureFunctionsCache, JitFunctionsCache, PureFunctionsCache} from '@mionjs/core';

it('toJSCode should transform functions to code using toString()', () => {
    // Create a type with a function
    type TestType = {fn: (a: number, b: string) => boolean};
    const rt = runType<TestType>();
    const toJSCode = rt.createJitFunction(JitFunctions.toJSCode);
    // Create an object with a function
    const testObj: TestType = {
        fn: function (a, b) {
            return a > 0 && b.length > 0;
        },
    };
    // Get the code representation
    const code = toJSCode(testObj);
    // Parse the code back to an object
    const parsedObj = eval(`(${code})`);
    // Verify the function was properly transformed to code
    expect(typeof parsedObj.fn).toBe('function');
    expect(parsedObj.fn(1, 'test')).toBe(true);
    expect(parsedObj.fn(0, 'test')).toBe(false);
    expect(parsedObj.fn(1, '')).toBe(false);
});

it('toJSCode should use property names without double quotes', () => {
    // Create a type with properties
    type TestType = {name: string; age: number; 'hello world': string};
    const rt = runType<TestType>();
    const toJSCode = rt.createJitFunction(JitFunctions.toJSCode);
    const stringifyJson = rt.createJitFunction(JitFunctions.stringifyJson);
    const testObj: TestType = {name: 'John', age: 30, 'hello world': 'test'};
    // Get the code representation
    const code = toJSCode(testObj);
    const json = stringifyJson(testObj);
    // Verify property names don't use double quotes in toJSCode
    expect(code).toContain('name:');
    expect(code).not.toContain('"name":');
    // Verify non-safe property names use double quotes in toJSCode
    expect(code).toContain('"hello world":');
    expect(code).not.toContain('hello world:');
    expect(json).toContain('"hello world":');
    // Verify JSON uses double quotes
    expect(json).toContain('"name":');
});

it('toJSCode should handle complex objects similar to stringifyJson', () => {
    // Create a complex type
    type ComplexType = {
        name: string;
        numbers: number[];
        nested: {
            value: boolean;
        };
        date: Date;
    };
    const rt = runType<ComplexType>();
    const toJSCode = rt.createJitFunction(JitFunctions.toJSCode);
    const testDate = new Date('2023-01-01');
    const testObj: ComplexType = {
        name: 'Test',
        numbers: [1, 2, 3],
        nested: {
            value: true,
        },
        date: testDate,
    };
    // Get the code representation
    const code = toJSCode(testObj);
    // Parse the code back to an object
    const parsedObj = eval(`(${code})`);
    // Verify the object was properly transformed
    expect(parsedObj.name).toBe('Test');
    expect(parsedObj.numbers).toEqual([1, 2, 3]);
    expect(parsedObj.nested.value).toBe(true);
    expect(parsedObj.date).toEqual(testDate);
});

it('toJSCode should handle arrow functions', () => {
    // Create a type with an arrow function
    const arrowFnObj = {arrowFn: (x): number => x * 2};
    type TestType = typeof arrowFnObj;
    const rt = runType<TestType>();
    const toJSCode = rt.createJitFunction(JitFunctions.toJSCode);
    // Create an object with an arrow function
    const testObj: TestType = {arrowFn: (x) => x * 2};
    // Get the code representation
    const code = toJSCode(testObj);
    // Parse the code back to an object
    const parsedObj = eval(`(${code})`);
    // Verify the function was properly transformed to code
    expect(typeof parsedObj.arrowFn).toBe('function');
    expect(parsedObj.arrowFn(5)).toBe(10);
});

it('toJSCode should handle objects with methods', () => {
    // Create a type with a method
    type TestType = {value: number; increment(): void; getValue(): number};
    const rt = runType<TestType>();
    const toJSCode = rt.createJitFunction(JitFunctions.toJSCode);
    // Create an object with methods
    const testObj: TestType = {
        value: 5,
        increment() {
            this.value++;
        },
        getValue() {
            return this.value;
        },
    };
    // Get the code representation
    const code = toJSCode(testObj);
    // Parse the code back to an object
    const parsedObj = eval(`(${code})`);
    // Verify the methods were properly transformed
    expect(parsedObj.value).toBe(5);
    parsedObj.increment();
    expect(parsedObj.value).toBe(6);
    expect(parsedObj.getValue()).toBe(6);
});

it('toJSCode should handle optional methods', () => {
    // Create a type with an optional method
    type TestType = {value: number; decrement?: () => void; getValue(): number};
    const rt = runType<TestType>();
    const toJSCode = rt.createJitFunction(JitFunctions.toJSCode);
    // Create an object with an optional method
    const testObj: TestType = {
        value: 5,
        getValue() {
            return this.value;
        },
    };
    // Get the code representation
    const code = toJSCode(testObj);
    // Parse the code back to an object
    const parsedObj = eval(`(${code})`);
    // Verify the methods were properly transformed
    expect(parsedObj.value).toBe(5);
    expect(parsedObj.getValue()).toBe(5);

    // Create an object with an optional method
    const testObj2: TestType = {
        value: 5,
        decrement() {
            this.value--;
        },
        getValue() {
            return this.value;
        },
    };
    // Get the code representation
    const code2 = toJSCode(testObj2);
    // Parse the code back to an object
    const parsedObj2 = eval(`(${code2})`);
    // Verify the methods were properly transformed
    expect(parsedObj2.value).toBe(5);
    parsedObj2.decrement();
    expect(parsedObj2.getValue()).toBe(4);
});

it('toJSCode should handle native Sets', () => {
    // Create a type with a Set
    type TestType = {set: Set<number>};
    const rt = runType<TestType>();
    const toJSCode = rt.createJitFunction(JitFunctions.toJSCode);
    // Create an object with a Set
    const testObj: TestType = {set: new Set([1, 2, 3])};
    // Get the code representation
    const code = toJSCode(testObj);
    // Parse the code back to an object
    const parsedObj = eval(`(${code})`);
    // Verify the Set was properly transformed
    expect(Array.from(parsedObj.set.values())).toEqual([1, 2, 3]);
});

it('toJSCode should handle native Maps', () => {
    // Create a type with a Map
    type TestType = {map: Map<string, number>};
    const rt = runType<TestType>();
    const toJSCode = rt.createJitFunction(JitFunctions.toJSCode);
    // Create an object with a Map
    const testObj: TestType = {
        map: new Map([
            ['one', 1],
            ['two', 2],
            ['three', 3],
        ]),
    };
    // Get the code representation
    const code = toJSCode(testObj);
    // Parse the code back to an object
    const parsedObj = eval(`(${code})`);
    // Verify the Map was properly transformed
    expect(Array.from(parsedObj.map.entries())).toEqual([
        ['one', 1],
        ['two', 2],
        ['three', 3],
    ]);
});

it('toJSCode should handle native Dates', () => {
    // Create a type with a Date
    type TestType = {date: Date};
    const rt = runType<TestType>();
    const toJSCode = rt.createJitFunction(JitFunctions.toJSCode);
    // Create an object with a Date
    const testObj: TestType = {date: new Date('2023-01-01')};
    // Get the code representation
    const code = toJSCode(testObj);
    // Parse the code back to an object
    const parsedObj = eval(`(${code})`);
    // Verify the Date was properly transformed
    expect(parsedObj.date).toEqual(testObj.date);
});

it('toJSCode should throw when trying to handle classes', () => {
    // Create a type with a class
    class TestClass {
        constructor(
            public name: string,
            public age: number
        ) {}
    }
    type TestType = {obj: TestClass};
    const rt = runType<TestType>();
    // throw when trying to compile toJSCode
    expect(() => rt.createJitFunction(JitFunctions.toJSCode)).toThrow(`Can not generate code for classes. Class: TestClass`);
});

// ################### AOT SrcCode Cache tests ###################
// These tests mirror the real aotEmitter scenario: createToJavascriptFn is created with
// SrcCode type parameters, but the actual values passed are runtime JitFunctionsCache/PureFunctionsCache
// (which have real fn and createJitFn/createPureFn). This ensures changes to those types are caught early.

it('toJSCode should auto-detect JitCompiledFn and emit fn as undefined and generate closure from code property', () => {
    // SrcCode type parameter provides structural info for auto-detection of createJitFn/fn properties
    const toJSCode = createToJavascriptFn<SrcCodeJITCompiledFnsCache>();

    // Runtime JitFunctionsCache has real fn and createJitFn (like the aotEmitter receives)
    const runtimeCache: JitFunctionsCache = {
        hash_abc123: {
            typeName: 'MyTestType',
            fnID: 'isType',
            jitFnHash: 'hash_abc123',
            args: {vλl: 'val'},
            defaultParamValues: {vλl: 'val'},
            code: 'return function(val){return val}',
            jitDependencies: [],
            pureFnDependencies: ['ns::pureFn1'],
            createJitFn: () => (val: any) => 'SHOULD_NOT_APPEAR_IN_OUTPUT',
            fn: (val: any) => 'SHOULD_NOT_APPEAR_IN_OUTPUT',
        },
    };

    // Cast to SrcCode type like the real aotEmitter does
    const code = toJSCode(runtimeCache as unknown as SrcCodeJITCompiledFnsCache);

    // createJitFn should be a closure using jitFnHash as the function name
    expect(code).toContain('function get_hash_abc123(utl)');
    // The closure body should use the code property, not createJitFn.toString()
    expect(code).toContain('return function(val){return val}');
    expect(code).not.toContain('SHOULD_NOT_APPEAR_IN_OUTPUT');
    // fn should be emitted as undefined despite having a real function at runtime
    expect(code).toContain('fn:undefined');
    // Data properties should be preserved
    expect(code).toContain('MyTestType');
    expect(code).toContain('isType');

    // Generated code should be valid JS that can be evaluated
    const parsed = eval(`(${code})`);
    const entry = parsed['hash_abc123'];
    expect(entry.typeName).toBe('MyTestType');
    expect(entry.fnID).toBe('isType');
    expect(entry.jitFnHash).toBe('hash_abc123');
    expect(entry.code).toBe('return function(val){return val}');
    expect(entry.jitDependencies).toEqual([]);
    expect(entry.pureFnDependencies).toEqual(['ns::pureFn1']);
    expect(entry.fn).toBeUndefined();
    expect(typeof entry.createJitFn).toBe('function');
    // The closure should recreate a working function from the code property
    const createdFn = entry.createJitFn({});
    expect(typeof createdFn).toBe('function');
});

it('toJSCode should auto-detect CompiledPureFunction and emit fn as undefined and generate closure from code property', () => {
    // SrcCode type parameter provides structural info for auto-detection of createPureFn/fn properties
    const toJSCode = createToJavascriptFn<SrcCodePureFunctionsCache>();

    // Runtime PureFunctionsCache has createPureFn (not createJitFn) and fn
    const runtimeCache: PureFunctionsCache = {
        testNamespace: {
            myPureFn: {
                namespace: 'testNamespace',
                paramNames: ['val'],
                code: 'return function(val){return val*2}',
                fnName: 'myPureFn',
                bodyHash: 'bodyHash456',
                pureFnDependencies: [],
                createPureFn: () => (val: any) => 'SHOULD_NOT_APPEAR_IN_OUTPUT',
                fn: (val: any) => 'SHOULD_NOT_APPEAR_IN_OUTPUT',
            },
        },
    };

    // Cast to SrcCode type like the real aotEmitter does
    const code = toJSCode(runtimeCache as unknown as SrcCodePureFunctionsCache);

    // createPureFn should be a closure using fnName and paramNames (not hardcoded utl)
    expect(code).toContain('function get_myPureFn(val)');
    // The closure body should use the code property
    expect(code).toContain('return function(val){return val*2}');
    expect(code).not.toContain('SHOULD_NOT_APPEAR_IN_OUTPUT');
    // fn should be emitted as undefined despite having a real function at runtime
    expect(code).toContain('fn:undefined');
    // Data properties should be preserved
    expect(code).toContain('testNamespace');
    expect(code).toContain('bodyHash456');

    // Generated code should be valid JS that can be evaluated
    const parsed = eval(`(${code})`);
    const entry = parsed['testNamespace']['myPureFn'];
    expect(entry.namespace).toBe('testNamespace');
    expect(entry.fnName).toBe('myPureFn');
    expect(entry.bodyHash).toBe('bodyHash456');
    expect(entry.paramNames).toEqual(['val']);
    expect(entry.code).toBe('return function(val){return val*2}');
    expect(entry.pureFnDependencies).toEqual([]);
    expect(entry.fn).toBeUndefined();
    expect(typeof entry.createPureFn).toBe('function');
    // The closure should recreate a working function from the code property
    const createdFn = entry.createPureFn({});
    expect(typeof createdFn).toBe('function');
    expect(createdFn(5)).toBe(10);
});

it('toJSCode should auto-detect and handle multiple JitCompiledFn cache entries', () => {
    const toJSCode = createToJavascriptFn<SrcCodeJITCompiledFnsCache>();

    const runtimeCache: JitFunctionsCache = {
        hash_first: {
            typeName: 'TypeA',
            fnID: 'isType',
            jitFnHash: 'hash_first',
            args: {vλl: 'val'},
            defaultParamValues: {vλl: 'val'},
            code: 'return function(v){return true}',
            jitDependencies: ['hash_second'],
            pureFnDependencies: [],
            createJitFn: () => () => true,
            fn: () => true,
        },
        hash_second: {
            typeName: 'TypeB',
            fnID: 'typeErrors',
            jitFnHash: 'hash_second',
            args: {vλl: 'val'},
            defaultParamValues: {vλl: 'val'},
            code: 'return function(v){return []}',
            jitDependencies: [],
            pureFnDependencies: [],
            createJitFn: () => () => [],
            fn: () => [],
        },
    };

    const code = toJSCode(runtimeCache as unknown as SrcCodeJITCompiledFnsCache);
    const parsed = eval(`(${code})`);

    // Both entries should be present with correct data
    expect(parsed['hash_first'].typeName).toBe('TypeA');
    expect(parsed['hash_first'].jitDependencies).toEqual(['hash_second']);
    expect(typeof parsed['hash_first'].createJitFn).toBe('function');
    expect(parsed['hash_first'].fn).toBeUndefined();

    expect(parsed['hash_second'].typeName).toBe('TypeB');
    expect(parsed['hash_second'].fnID).toBe('typeErrors');
    expect(typeof parsed['hash_second'].createJitFn).toBe('function');
    expect(parsed['hash_second'].fn).toBeUndefined();
});

it('toJSCode should auto-detect and handle multiple namespaces and pure functions', () => {
    const toJSCode = createToJavascriptFn<SrcCodePureFunctionsCache>();

    const runtimeCache: PureFunctionsCache = {
        nsA: {
            fnOne: {
                namespace: 'nsA',
                paramNames: ['a'],
                code: 'return function(a){return a}',
                fnName: 'fnOne',
                bodyHash: 'hashA1',
                pureFnDependencies: [],
                createPureFn: () => (a: any) => a,
                fn: (a: any) => a,
            },
            fnTwo: {
                namespace: 'nsA',
                paramNames: ['a', 'b'],
                code: 'return function(a,b){return a+b}',
                fnName: 'fnTwo',
                bodyHash: 'hashA2',
                pureFnDependencies: ['nsA::fnOne'],
                createPureFn: () => (a: any, b: any) => a + b,
                fn: (a: any, b: any) => a + b,
            },
        },
        nsB: {
            fnThree: {
                namespace: 'nsB',
                paramNames: [],
                code: 'return function(){return 42}',
                fnName: 'fnThree',
                bodyHash: 'hashB1',
                pureFnDependencies: [],
                createPureFn: () => () => 42,
                fn: () => 42,
            },
        },
    };

    const code = toJSCode(runtimeCache as unknown as SrcCodePureFunctionsCache);
    const parsed = eval(`(${code})`);

    // Verify nested namespace structure
    expect(parsed.nsA.fnOne.namespace).toBe('nsA');
    expect(parsed.nsA.fnOne.fnName).toBe('fnOne');
    expect(typeof parsed.nsA.fnOne.createPureFn).toBe('function');
    expect(parsed.nsA.fnOne.fn).toBeUndefined();

    expect(parsed.nsA.fnTwo.fnName).toBe('fnTwo');
    expect(parsed.nsA.fnTwo.pureFnDependencies).toEqual(['nsA::fnOne']);
    expect(typeof parsed.nsA.fnTwo.createPureFn).toBe('function');

    expect(parsed.nsB.fnThree.namespace).toBe('nsB');
    expect(parsed.nsB.fnThree.bodyHash).toBe('hashB1');
    expect(typeof parsed.nsB.fnThree.createPureFn).toBe('function');
    expect(parsed.nsB.fnThree.fn).toBeUndefined();
});

it('toJSCode should use paramNames for pure function closure parameter (not hardcoded utl)', () => {
    const toJSCode = createToJavascriptFn<SrcCodePureFunctionsCache>();

    const runtimeCache: PureFunctionsCache = {
        testNs: {
            myFn: {
                namespace: 'testNs',
                paramNames: ['jUtil'],
                code: 'const dep = jUtil.getPureFn("ns","fn"); return function(v){ return dep(v); }',
                fnName: 'myFn',
                bodyHash: 'hash123',
                pureFnDependencies: ['ns::fn'],
                createPureFn: () => () => 'test',
                fn: () => 'test',
            },
        },
    };

    const code = toJSCode(runtimeCache as unknown as SrcCodePureFunctionsCache);
    // closure should use the actual paramNames (jUtil), not hardcoded utl
    expect(code).toContain('function get_myFn(jUtil)');
    expect(code).not.toContain('function get_myFn(utl)');
    // the code body should be included and reference jUtil correctly
    expect(code).toContain('jUtil.getPureFn');

    const parsed = eval(`(${code})`);
    const entry = parsed['testNs']['myFn'];
    expect(typeof entry.createPureFn).toBe('function');
    expect(entry.fn).toBeUndefined();
});
