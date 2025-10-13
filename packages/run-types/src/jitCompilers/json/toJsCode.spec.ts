/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {runType} from '../../lib/runType';
import {JitFunctions} from '../../constants.functions';

it('toJavascript should transform functions to code using toString()', () => {
    // Create a type with a function
    type TestType = {fn: (a: number, b: string) => boolean};
    const rt = runType<TestType>();
    const toJavascript = rt.createJitFunction(JitFunctions.toJavascript);
    // Create an object with a function
    const testObj: TestType = {
        fn: function (a, b) {
            return a > 0 && b.length > 0;
        },
    };
    // Get the code representation
    const code = toJavascript(testObj);
    // Parse the code back to an object
    const parsedObj = eval(`(${code})`);
    // Verify the function was properly transformed to code
    expect(typeof parsedObj.fn).toBe('function');
    expect(parsedObj.fn(1, 'test')).toBe(true);
    expect(parsedObj.fn(0, 'test')).toBe(false);
    expect(parsedObj.fn(1, '')).toBe(false);
});

it('toJavascript should use property names without double quotes', () => {
    // Create a type with properties
    type TestType = {name: string; age: number; 'hello world': string};
    const rt = runType<TestType>();
    const toJavascript = rt.createJitFunction(JitFunctions.toJavascript);
    const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);
    const testObj: TestType = {name: 'John', age: 30, 'hello world': 'test'};
    // Get the code representation
    const code = toJavascript(testObj);
    const json = jsonStringify(testObj);
    // Verify property names don't use double quotes in toJavascript
    expect(code).toContain('name:');
    expect(code).not.toContain('"name":');
    // Verify non-safe property names use double quotes in toJavascript
    expect(code).toContain('"hello world":');
    expect(code).not.toContain('hello world:');
    expect(json).toContain('"hello world":');
    // Verify JSON uses double quotes
    expect(json).toContain('"name":');
});

it('toJavascript should handle complex objects similar to jsonStringify', () => {
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
    const toJavascript = rt.createJitFunction(JitFunctions.toJavascript);
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
    const code = toJavascript(testObj);
    // Parse the code back to an object
    const parsedObj = eval(`(${code})`);
    // Verify the object was properly transformed
    expect(parsedObj.name).toBe('Test');
    expect(parsedObj.numbers).toEqual([1, 2, 3]);
    expect(parsedObj.nested.value).toBe(true);
    expect(parsedObj.date).toEqual(testDate);
});

it('toJavascript should handle arrow functions', () => {
    // Create a type with an arrow function
    const arrowFnObj = {arrowFn: (x): number => x * 2};
    type TestType = typeof arrowFnObj;
    const rt = runType<TestType>();
    const toJavascript = rt.createJitFunction(JitFunctions.toJavascript);
    // Create an object with an arrow function
    const testObj: TestType = {arrowFn: (x) => x * 2};
    // Get the code representation
    const code = toJavascript(testObj);
    // Parse the code back to an object
    const parsedObj = eval(`(${code})`);
    // Verify the function was properly transformed to code
    expect(typeof parsedObj.arrowFn).toBe('function');
    expect(parsedObj.arrowFn(5)).toBe(10);
});

it('toJavascript should handle objects with methods', () => {
    // Create a type with a method
    type TestType = {value: number; increment(): void; getValue(): number};
    const rt = runType<TestType>();
    const toJavascript = rt.createJitFunction(JitFunctions.toJavascript);
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
    const code = toJavascript(testObj);
    // Parse the code back to an object
    const parsedObj = eval(`(${code})`);
    // Verify the methods were properly transformed
    expect(parsedObj.value).toBe(5);
    parsedObj.increment();
    expect(parsedObj.value).toBe(6);
    expect(parsedObj.getValue()).toBe(6);
});

it('toJavascript should handle optional methods', () => {
    // Create a type with an optional method
    type TestType = {value: number; increment?: () => void; getValue(): number};
    const rt = runType<TestType>();
    const toJavascript = rt.createJitFunction(JitFunctions.toJavascript);
    // Create an object with an optional method
    const testObj: TestType = {
        value: 5,
        getValue() {
            return this.value;
        },
    };
    // TODO this is failing due to a Deepkit bug, so should fail once Deepkit fixes it
    // PR here https://github.com/deepkit/deepkit-framework/pull/649
    expect(() => {
        // Get the code representation
        const code = toJavascript(testObj);
        // Parse the code back to an object
        const parsedObj = eval(`(${code})`);
        // Verify the methods were properly transformed
        expect(parsedObj.value).toBe(5);
        expect(parsedObj.getValue()).toBe(5);
    }).toThrow();

    type TestType2 = {value: number; increment2?(): void; getValue(): number};
    const rt2 = runType<TestType2>();
    const toJavascript2 = rt2.createJitFunction(JitFunctions.toJavascript);
    // Create an object with an optional method
    const testObj2: TestType2 = {
        value: 5,
        getValue() {
            return this.value;
        },
    };
    // TODO this is failing due to a Deepkit bug, so should fail once Deepkit fixes it
    // PR here https://github.com/deepkit/deepkit-framework/pull/649
    expect(() => {
        // Get the code representation
        const code2 = toJavascript2(testObj2);
        // Parse the code back to an object
        const parsedObj2 = eval(`(${code2})`);
        // Verify the methods were properly transformed
        expect(parsedObj2.value).toBe(5);
        expect(parsedObj2.getValue()).toBe(5);
    }).toThrow();
});

it('toJavascript should handle native Sets', () => {
    // Create a type with a Set
    type TestType = {set: Set<number>};
    const rt = runType<TestType>();
    const toJavascript = rt.createJitFunction(JitFunctions.toJavascript);
    // Create an object with a Set
    const testObj: TestType = {set: new Set([1, 2, 3])};
    // Get the code representation
    const code = toJavascript(testObj);
    // Parse the code back to an object
    const parsedObj = eval(`(${code})`);
    // Verify the Set was properly transformed
    expect(Array.from(parsedObj.set.values())).toEqual([1, 2, 3]);
});

it('toJavascript should handle native Maps', () => {
    // Create a type with a Map
    type TestType = {map: Map<string, number>};
    const rt = runType<TestType>();
    const toJavascript = rt.createJitFunction(JitFunctions.toJavascript);
    // Create an object with a Map
    const testObj: TestType = {
        map: new Map([
            ['one', 1],
            ['two', 2],
            ['three', 3],
        ]),
    };
    // Get the code representation
    const code = toJavascript(testObj);
    // Parse the code back to an object
    const parsedObj = eval(`(${code})`);
    // Verify the Map was properly transformed
    expect(Array.from(parsedObj.map.entries())).toEqual([
        ['one', 1],
        ['two', 2],
        ['three', 3],
    ]);
});

it('toJavascript should handle native Dates', () => {
    // Create a type with a Date
    type TestType = {date: Date};
    const rt = runType<TestType>();
    const toJavascript = rt.createJitFunction(JitFunctions.toJavascript);
    // Create an object with a Date
    const testObj: TestType = {date: new Date('2023-01-01')};
    // Get the code representation
    const code = toJavascript(testObj);
    // Parse the code back to an object
    const parsedObj = eval(`(${code})`);
    // Verify the Date was properly transformed
    expect(parsedObj.date).toEqual(testObj.date);
});

it('toJavascript should throw when trying to handle classes', () => {
    // Create a type with a class
    class TestClass {
        constructor(
            public name: string,
            public age: number
        ) {}
    }
    type TestType = {obj: TestClass};
    const rt = runType<TestType>();
    // throw when trying to compile toJavascript
    expect(() => rt.createJitFunction(JitFunctions.toJavascript)).toThrow(`Can not generate code for classes. Class: TestClass`);
});
