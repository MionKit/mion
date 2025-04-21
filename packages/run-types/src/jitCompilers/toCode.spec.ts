/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {runType} from '@mionkit/run-types/src/lib/runType';
import {JitFunctions} from '@mionkit/run-types/src/constants';

it('toCode should transform functions to code using toString()', () => {
    // Create a type with a function
    type TestType = {fn: (a: number, b: string) => boolean};
    const rt = runType<TestType>();
    const toCode = rt.createJitFunction(JitFunctions.toCode);
    // Create an object with a function
    const testObj: TestType = {
        fn: function (a, b) {
            return a > 0 && b.length > 0;
        },
    };
    // Get the code representation
    const code = toCode(testObj);
    // Parse the code back to an object
    const parsedObj = eval(`(${code})`);
    // Verify the function was properly transformed to code
    expect(typeof parsedObj.fn).toBe('function');
    expect(parsedObj.fn(1, 'test')).toBe(true);
    expect(parsedObj.fn(0, 'test')).toBe(false);
    expect(parsedObj.fn(1, '')).toBe(false);
});

it('toCode should use property names without double quotes', () => {
    // Create a type with properties
    type TestType = {name: string; age: number; 'hello world': string};
    const rt = runType<TestType>();
    const toCode = rt.createJitFunction(JitFunctions.toCode);
    const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);
    const testObj: TestType = {name: 'John', age: 30, 'hello world': 'test'};
    // Get the code representation
    const code = toCode(testObj);
    const json = jsonStringify(testObj);
    // Verify property names don't use double quotes in toCode
    expect(code).toContain('name:');
    expect(code).not.toContain('"name":');
    // Verify non-safe property names use double quotes in toCode
    expect(code).toContain('"hello world":');
    expect(code).not.toContain('hello world:');
    expect(json).toContain('"hello world":');
    // Verify JSON uses double quotes
    expect(json).toContain('"name":');
});

it('toCode should handle complex objects similar to jsonStringify', () => {
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
    const toCode = rt.createJitFunction(JitFunctions.toCode);
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
    const code = toCode(testObj);
    // Parse the code back to an object
    const parsedObj = eval(`(${code})`);
    // Verify the object was properly transformed
    expect(parsedObj.name).toBe('Test');
    expect(parsedObj.numbers).toEqual([1, 2, 3]);
    expect(parsedObj.nested.value).toBe(true);
    expect(parsedObj.date).toEqual(testDate);
});

const x = {arrowFn: (x) => x * 2};

it('toCode should handle arrow functions', () => {
    // Create a type with an arrow function
    type TestType = {arrowFn: (x: number) => number};
    const rt = runType<TestType>();
    const toCode = rt.createJitFunction(JitFunctions.toCode);
    // Create an object with an arrow function
    const testObj: TestType = {arrowFn: (x) => x * 2};
    // Get the code representation
    const code = toCode(testObj);
    console.log(code);
    // Parse the code back to an object
    const parsedObj = eval(`(${code})`);
    // Verify the function was properly transformed to code
    expect(typeof parsedObj.arrowFn).toBe('function');
    expect(parsedObj.arrowFn(5)).toBe(10);
});

it('toCode should handle objects with methods', () => {
    // Create a type with a method
    type TestType = {value: number; increment(): void; getValue(): number};
    const rt = runType<TestType>();
    const toCode = rt.createJitFunction(JitFunctions.toCode);
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
    const code = toCode(testObj);
    // Parse the code back to an object
    const parsedObj = eval(`(${code})`);
    // Verify the methods were properly transformed
    expect(parsedObj.value).toBe(5);
    parsedObj.increment();
    expect(parsedObj.value).toBe(6);
    expect(parsedObj.getValue()).toBe(6);
});
