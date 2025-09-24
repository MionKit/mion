/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {runType} from '../../lib/runType';
import {JitFunctions} from '../../constants.functions';
import {FunctionRunType} from '../../runType/function/function';

/**
 * Helper function to perform a full roundtrip test: JS -> XYZ -> JS
 * @param value - The JavaScript value to test
 * @param toXYZ - The toXYZ function
 * @param fromXYZ - The fromXYZ function
 * @param debug - Whether to output debug information
 * @returns The deserialized value after roundtrip
 */
function testRoundtrip<T>(value: T, toXYZ: (val: T) => any, fromXYZ: (data: any) => T, debug = false): T {
    if (debug) {
        console.log('Original value:', value);
        console.log('Type:', typeof value);
    }

    // Serialize to XYZ
    const bsonData = toXYZ(value);
    if (debug) {
        console.log(
            'XYZ bytes:',
            Array.from(bsonData as Uint8Array)
                .map((b) => '0x' + b.toString(16).padStart(2, '0'))
                .join(' ')
        );
        console.log('XYZ length:', bsonData.length);
    }

    // Deserialize from XYZ
    const result = fromXYZ(bsonData);
    if (debug) {
        console.log('Deserialized value:', result);
        console.log('Result type:', typeof result);
    }

    return result;
}

describe('XYZ JIT Serialization', () => {
    describe('Atomic Types', () => {
        it('should handle null values', () => {
            const rt = runType<null>();
            const toXYZ = rt.createJitFunction(JitFunctions.toXYZ);
            const fromXYZ = rt.createJitFunction(JitFunctions.fromXYZ);

            const original = null;
            const result = testRoundtrip(original, toXYZ, fromXYZ);
            expect(result).toBe(null);
        });

        it('should handle boolean values', () => {
            const rt = runType<boolean>();
            const toXYZ = rt.createJitFunction(JitFunctions.toXYZ);
            const fromXYZ = rt.createJitFunction(JitFunctions.fromXYZ);

            const trueValue = true;
            const falseValue = false;

            const resultTrue = testRoundtrip(trueValue, toXYZ, fromXYZ);
            const resultFalse = testRoundtrip(falseValue, toXYZ, fromXYZ);

            expect(resultTrue).toBe(true);
            expect(resultFalse).toBe(false);
        });

        it('should handle number values', () => {
            const rt = runType<number>();
            const toXYZ = rt.createJitFunction(JitFunctions.toXYZ);
            const fromXYZ = rt.createJitFunction(JitFunctions.fromXYZ);

            // Test different number types
            const int32Value = 42;
            const negativeValue = -123;
            const floatValue = 3.14159;
            const largeIntValue = 2147483648; // Larger than int32

            expect(testRoundtrip(int32Value, toXYZ, fromXYZ)).toBe(int32Value);
            expect(testRoundtrip(negativeValue, toXYZ, fromXYZ)).toBe(negativeValue);
            expect(testRoundtrip(floatValue, toXYZ, fromXYZ)).toBeCloseTo(floatValue, 10);
            expect(testRoundtrip(largeIntValue, toXYZ, fromXYZ)).toBe(largeIntValue);
        });

        it('should handle string values', () => {
            const rt = runType<string>();
            const toXYZ = rt.createJitFunction(JitFunctions.toXYZ);
            const fromXYZ = rt.createJitFunction(JitFunctions.fromXYZ);

            const simpleString = 'hello world';
            const emptyString = '';
            const unicodeString = '🚀 Hello 世界 مرحبا';
            const specialChars = 'Line1\nLine2\tTabbed"Quoted\'Single';

            expect(testRoundtrip(simpleString, toXYZ, fromXYZ)).toBe(simpleString);
            expect(testRoundtrip(emptyString, toXYZ, fromXYZ)).toBe(emptyString);
            expect(testRoundtrip(unicodeString, toXYZ, fromXYZ)).toBe(unicodeString);
            expect(testRoundtrip(specialChars, toXYZ, fromXYZ)).toBe(specialChars);
        });

        it('should handle bigint values', () => {
            const rt = runType<bigint>();
            const toXYZ = rt.createJitFunction(JitFunctions.toXYZ);
            const fromXYZ = rt.createJitFunction(JitFunctions.fromXYZ);

            const smallBigInt = 123n;
            const largeBigInt = 9223372036854775807n; // Max safe int64
            const negativeBigInt = -456n;

            expect(testRoundtrip(smallBigInt, toXYZ, fromXYZ)).toBe(smallBigInt);
            expect(testRoundtrip(largeBigInt, toXYZ, fromXYZ)).toBe(largeBigInt);
            expect(testRoundtrip(negativeBigInt, toXYZ, fromXYZ)).toBe(negativeBigInt);
        });

        it('should handle undefined values', () => {
            const rt = runType<undefined>();
            const toXYZ = rt.createJitFunction(JitFunctions.toXYZ);
            const fromXYZ = rt.createJitFunction(JitFunctions.fromXYZ);

            const original = undefined;
            const result = testRoundtrip(original, toXYZ, fromXYZ);
            expect(result).toBe(undefined);
        });

        it('should handle symbol values', () => {
            const rt = runType<symbol>();
            const toXYZ = rt.createJitFunction(JitFunctions.toXYZ);
            const fromXYZ = rt.createJitFunction(JitFunctions.fromXYZ);

            const namedSymbol = Symbol('test');
            const anonymousSymbol = Symbol();

            const resultNamed = testRoundtrip(namedSymbol, toXYZ, fromXYZ);
            const resultAnonymous = testRoundtrip(anonymousSymbol, toXYZ, fromXYZ);

            expect(typeof resultNamed).toBe('symbol');
            expect(resultNamed.description).toBe('test');
            expect(typeof resultAnonymous).toBe('symbol');
            expect(resultAnonymous.description).toBe(undefined);
        });

        it('should handle regexp values', () => {
            const rt = runType<RegExp>();
            const toXYZ = rt.createJitFunction(JitFunctions.toXYZ);
            const fromXYZ = rt.createJitFunction(JitFunctions.fromXYZ);

            const simpleRegex = /hello/;
            const complexRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/gi;
            const regexWithFlags = /test/gim;

            const resultSimple = testRoundtrip(simpleRegex, toXYZ, fromXYZ);
            const resultComplex = testRoundtrip(complexRegex, toXYZ, fromXYZ);
            const resultFlags = testRoundtrip(regexWithFlags, toXYZ, fromXYZ);

            expect(resultSimple).toEqual(simpleRegex);
            expect(resultSimple.source).toBe(simpleRegex.source);
            expect(resultSimple.flags).toBe(simpleRegex.flags);

            expect(resultComplex).toEqual(complexRegex);
            expect(resultComplex.source).toBe(complexRegex.source);
            expect(resultComplex.flags).toBe(complexRegex.flags);

            expect(resultFlags).toEqual(regexWithFlags);
            expect(resultFlags.source).toBe(regexWithFlags.source);
            expect(resultFlags.flags).toBe(regexWithFlags.flags);
        });

        it('should handle enum values', () => {
            enum NumberEnum {
                First = 1,
                Second = 2,
                Third = 3,
            }

            enum StringEnum {
                Red = 'red',
                Green = 'green',
                Blue = 'blue',
            }

            const numberRt = runType<NumberEnum>();
            const numberToXYZ = numberRt.createJitFunction(JitFunctions.toXYZ);
            const numberFromXYZ = numberRt.createJitFunction(JitFunctions.fromXYZ);

            const stringRt = runType<StringEnum>();
            const stringToXYZ = stringRt.createJitFunction(JitFunctions.toXYZ);
            const stringFromXYZ = stringRt.createJitFunction(JitFunctions.fromXYZ);

            const numberEnumValue = NumberEnum.Second;
            const stringEnumValue = StringEnum.Green;

            expect(testRoundtrip(numberEnumValue, numberToXYZ, numberFromXYZ)).toBe(numberEnumValue);
            expect(testRoundtrip(stringEnumValue, stringToXYZ, stringFromXYZ)).toBe(stringEnumValue);
        });
    });

    describe('Literal Types', () => {
        it('should handle string literals', () => {
            type StringLiteral = 'hello';
            const rt = runType<StringLiteral>();
            const toXYZ = rt.createJitFunction(JitFunctions.toXYZ);
            const fromXYZ = rt.createJitFunction(JitFunctions.fromXYZ);

            const original: StringLiteral = 'hello';
            const bsonData = toXYZ(original);
            const result = fromXYZ(bsonData);

            expect(result).toBe('hello');
        });

        it('should handle number literals', () => {
            type NumberLiteral = 42;
            const rt = runType<NumberLiteral>();
            const toXYZ = rt.createJitFunction(JitFunctions.toXYZ);
            const fromXYZ = rt.createJitFunction(JitFunctions.fromXYZ);

            const original: NumberLiteral = 42;
            const bsonData = toXYZ(original);
            const result = fromXYZ(bsonData);

            expect(result).toBe(42);
        });

        it('should handle boolean literals', () => {
            type BooleanLiteral = true;
            const rt = runType<BooleanLiteral>();
            const toXYZ = rt.createJitFunction(JitFunctions.toXYZ);
            const fromXYZ = rt.createJitFunction(JitFunctions.fromXYZ);

            const original: BooleanLiteral = true;
            const bsonData = toXYZ(original);
            const result = fromXYZ(bsonData);

            expect(result).toBe(true);
        });

        it('should handle null literals', () => {
            type NullLiteral = null;
            const rt = runType<NullLiteral>();
            const toXYZ = rt.createJitFunction(JitFunctions.toXYZ);
            const fromXYZ = rt.createJitFunction(JitFunctions.fromXYZ);

            const original: NullLiteral = null;
            const bsonData = toXYZ(original);
            const result = fromXYZ(bsonData);

            expect(result).toBe(null);
        });

        it('should handle bigint literals', () => {
            type BigIntLiteral = 123n;
            const rt = runType<BigIntLiteral>();
            const toXYZ = rt.createJitFunction(JitFunctions.toXYZ);
            const fromXYZ = rt.createJitFunction(JitFunctions.fromXYZ);

            const original: BigIntLiteral = 123n;
            const bsonData = toXYZ(original);
            const result = fromXYZ(bsonData);

            expect(result).toBe(123n);
        });
    });

    describe('Member RunTypes', () => {
        it('should handle array types', () => {
            const rt = runType<number[]>();
            const toXYZ = rt.createJitFunction(JitFunctions.toXYZ);
            const fromXYZ = rt.createJitFunction(JitFunctions.fromXYZ);

            const emptyArray: number[] = [];
            const simpleArray = [1, 2, 3, 4, 5];
            const mixedNumbers = [0, -1, 3.14, 1000000];

            expect(testRoundtrip(emptyArray, toXYZ, fromXYZ)).toEqual(emptyArray);
            expect(testRoundtrip(simpleArray, toXYZ, fromXYZ)).toEqual(simpleArray);
            expect(testRoundtrip(mixedNumbers, toXYZ, fromXYZ)).toEqual(mixedNumbers);
        });

        it('should handle nested array types', () => {
            const rt = runType<number[][]>();
            const toXYZ = rt.createJitFunction(JitFunctions.toXYZ);
            const fromXYZ = rt.createJitFunction(JitFunctions.fromXYZ);

            const nestedArray = [[1, 2], [3, 4], [5]];
            const emptyNested: number[][] = [[], []];

            expect(testRoundtrip(nestedArray, toXYZ, fromXYZ)).toEqual(nestedArray);
            expect(testRoundtrip(emptyNested, toXYZ, fromXYZ)).toEqual(emptyNested);
        });

        it('should handle string array types', () => {
            const rt = runType<string[]>();
            const toXYZ = rt.createJitFunction(JitFunctions.toXYZ);
            const fromXYZ = rt.createJitFunction(JitFunctions.fromXYZ);

            const stringArray = ['hello', 'world', '🚀', ''];
            const unicodeArray = ['世界', 'مرحبا', 'Здравствуй'];

            expect(testRoundtrip(stringArray, toXYZ, fromXYZ)).toEqual(stringArray);
            expect(testRoundtrip(unicodeArray, toXYZ, fromXYZ)).toEqual(unicodeArray);
        });

        it('should handle tuple types', () => {
            const rt = runType<[string, number, boolean]>();
            const toXYZ = rt.createJitFunction(JitFunctions.toXYZ);
            const fromXYZ = rt.createJitFunction(JitFunctions.fromXYZ);

            const tuple: [string, number, boolean] = ['hello', 42, true];
            const result = testRoundtrip(tuple, toXYZ, fromXYZ);

            expect(result).toEqual(tuple);
            expect(result[0]).toBe('hello');
            expect(result[1]).toBe(42);
            expect(result[2]).toBe(true);
        });

        it('should handle optional tuple members', () => {
            const rt = runType<[string, number?]>();
            const toXYZ = rt.createJitFunction(JitFunctions.toXYZ);
            const fromXYZ = rt.createJitFunction(JitFunctions.fromXYZ);

            const completeTuple: [string, number?] = ['hello', 42];
            const incompleteTuple: [string, number?] = ['world'];

            expect(testRoundtrip(completeTuple, toXYZ, fromXYZ)).toEqual(completeTuple);
            expect(testRoundtrip(incompleteTuple, toXYZ, fromXYZ)).toEqual(incompleteTuple);
        });

        it('should handle rest parameters in tuples', () => {
            const rt = runType<[string, ...number[]]>();
            const toXYZ = rt.createJitFunction(JitFunctions.toXYZ);
            const fromXYZ = rt.createJitFunction(JitFunctions.fromXYZ);

            const restTuple: [string, ...number[]] = ['prefix', 1, 2, 3, 4];
            const minimalRest: [string, ...number[]] = ['only'];

            expect(testRoundtrip(restTuple, toXYZ, fromXYZ)).toEqual(restTuple);
            expect(testRoundtrip(minimalRest, toXYZ, fromXYZ)).toEqual(minimalRest);
        });
    });

    describe('Collection RunTypes', () => {
        it('should handle object literal types', () => {
            const rt = runType<{name: string; age: number}>();
            const toXYZ = rt.createJitFunction(JitFunctions.toXYZ);
            const fromXYZ = rt.createJitFunction(JitFunctions.fromXYZ);

            const person = {name: 'John', age: 30};
            const result = testRoundtrip(person, toXYZ, fromXYZ);

            expect(result).toEqual(person);
            expect(result.name).toBe('John');
            expect(result.age).toBe(30);
        });

        it('should handle optional properties', () => {
            const rt = runType<{name: string; age?: number}>();
            const toXYZ = rt.createJitFunction(JitFunctions.toXYZ);
            const fromXYZ = rt.createJitFunction(JitFunctions.fromXYZ);

            const withAge = {name: 'John', age: 30};
            const withoutAge = {name: 'Jane'};

            expect(testRoundtrip(withAge, toXYZ, fromXYZ)).toEqual(withAge);
            expect(testRoundtrip(withoutAge, toXYZ, fromXYZ)).toEqual(withoutAge);
        });

        it('should handle nested object types', () => {
            const rt = runType<{user: {name: string; profile: {email: string}}}>();
            const toXYZ = rt.createJitFunction(JitFunctions.toXYZ);
            const fromXYZ = rt.createJitFunction(JitFunctions.fromXYZ);

            const nested = {
                user: {
                    name: 'John',
                    profile: {
                        email: 'john@example.com',
                    },
                },
            };

            const result = testRoundtrip(nested, toXYZ, fromXYZ);
            expect(result).toEqual(nested);
            expect(result.user.name).toBe('John');
            expect(result.user.profile.email).toBe('john@example.com');
        });

        it('should handle intersection types', () => {
            type Person = {name: string};
            type Employee = {id: number};
            const rt = runType<Person & Employee>();
            const toXYZ = rt.createJitFunction(JitFunctions.toXYZ);
            const fromXYZ = rt.createJitFunction(JitFunctions.fromXYZ);

            const intersection = {name: 'John', id: 123};
            const result = testRoundtrip(intersection, toXYZ, fromXYZ);

            expect(result).toEqual(intersection);
            expect(result.name).toBe('John');
            expect(result.id).toBe(123);
        });

        it('should handle union types', () => {
            const rt = runType<string | number>();
            const toXYZ = rt.createJitFunction(JitFunctions.toXYZ);
            const fromXYZ = rt.createJitFunction(JitFunctions.fromXYZ);

            const stringValue: string | number = 'hello';
            const numberValue: string | number = 42;

            expect(testRoundtrip(stringValue, toXYZ, fromXYZ)).toBe(stringValue);
            expect(testRoundtrip(numberValue, toXYZ, fromXYZ)).toBe(numberValue);
        });

        it('should handle complex union types', () => {
            type ComplexUnion = {type: 'user'; name: string} | {type: 'admin'; permissions: string[]};
            const rt = runType<ComplexUnion>();
            const toXYZ = rt.createJitFunction(JitFunctions.toXYZ);
            const fromXYZ = rt.createJitFunction(JitFunctions.fromXYZ);

            const user: ComplexUnion = {type: 'user', name: 'John'};
            const admin: ComplexUnion = {type: 'admin', permissions: ['read', 'write']};

            expect(testRoundtrip(user, toXYZ, fromXYZ)).toEqual(user);
            expect(testRoundtrip(admin, toXYZ, fromXYZ)).toEqual(admin);
        });

        it('should handle class types', () => {
            class Person {
                constructor(
                    public name: string,
                    public age: number
                ) {}
            }

            const rt = runType<Person>();
            const toXYZ = rt.createJitFunction(JitFunctions.toXYZ);
            const fromXYZ = rt.createJitFunction(JitFunctions.fromXYZ);

            const person = new Person('John', 30);
            const result = testRoundtrip(person, toXYZ, fromXYZ);

            expect(result.name).toBe('John');
            expect(result.age).toBe(30);
        });

        it('should handle Date class', () => {
            const rt = runType<Date>();
            const toXYZ = rt.createJitFunction(JitFunctions.toXYZ);
            const fromXYZ = rt.createJitFunction(JitFunctions.fromXYZ);

            const date = new Date('2023-12-25T10:30:00.000Z');
            const result = testRoundtrip(date, toXYZ, fromXYZ);

            expect(result).toEqual(date);
            expect(result.getTime()).toBe(date.getTime());
        });

        it('should handle Map class', () => {
            const rt = runType<Map<string, number>>();
            const toXYZ = rt.createJitFunction(JitFunctions.toXYZ);
            const fromXYZ = rt.createJitFunction(JitFunctions.fromXYZ);

            const map = new Map([
                ['a', 1],
                ['b', 2],
                ['c', 3],
            ]);
            const result = testRoundtrip(map, toXYZ, fromXYZ);

            expect(result).toEqual(map);
            expect(result.get('a')).toBe(1);
            expect(result.get('b')).toBe(2);
            expect(result.get('c')).toBe(3);
        });

        it('should handle Set class', () => {
            const rt = runType<Set<string>>();
            const toXYZ = rt.createJitFunction(JitFunctions.toXYZ);
            const fromXYZ = rt.createJitFunction(JitFunctions.fromXYZ);

            const set = new Set(['a', 'b', 'c']);
            const result = testRoundtrip(set, toXYZ, fromXYZ);

            expect(result).toEqual(set);
            expect(result.has('a')).toBe(true);
            expect(result.has('b')).toBe(true);
            expect(result.has('c')).toBe(true);
            expect(result.has('d')).toBe(false);
        });
    });

    describe('Function Parameters and Return Values', () => {
        // Define function types for testing
        type SimpleFunction = (name: string, age: number) => string;
        type OptionalParamsFunction = (a: number, b: boolean, c?: string) => Date;
        type RestParamsFunction = (prefix: string, ...numbers: number[]) => string;
        type ComplexFunction = (
            user: {name: string; age: number},
            options?: {format: boolean}
        ) => {result: string; timestamp: Date};

        describe('Function Parameters', () => {
            it('should handle simple function parameters', () => {
                const rt = runType<SimpleFunction>() as FunctionRunType;
                const toXYZ = rt.createJitParamsFunction(JitFunctions.toXYZ);
                const fromXYZ = rt.createJitParamsFunction(JitFunctions.fromXYZ);

                const params: [string, number] = ['John', 30];
                const result = testRoundtrip(params, toXYZ, fromXYZ);

                expect(result).toEqual(params);
                expect(result[0]).toBe('John');
                expect(result[1]).toBe(30);
            });

            it('should handle function parameters with optional values', () => {
                const rt = runType<OptionalParamsFunction>() as FunctionRunType;
                const toXYZ = rt.createJitParamsFunction(JitFunctions.toXYZ);
                const fromXYZ = rt.createJitParamsFunction(JitFunctions.fromXYZ);

                const completeParams: [number, boolean, string] = [42, true, 'hello'];
                const incompleteParams: [number, boolean] = [42, false];

                expect(testRoundtrip(completeParams, toXYZ, fromXYZ)).toEqual(completeParams);
                expect(testRoundtrip(incompleteParams, toXYZ, fromXYZ)).toEqual(incompleteParams);
            });

            it('should handle function parameters with rest parameters', () => {
                const rt = runType<RestParamsFunction>() as FunctionRunType;
                const toXYZ = rt.createJitParamsFunction(JitFunctions.toXYZ);
                const fromXYZ = rt.createJitParamsFunction(JitFunctions.fromXYZ);

                const restParams: [string, ...number[]] = ['sum:', 1, 2, 3, 4, 5];
                const minimalParams: [string, ...number[]] = ['empty:'];

                expect(testRoundtrip(restParams, toXYZ, fromXYZ)).toEqual(restParams);
                expect(testRoundtrip(minimalParams, toXYZ, fromXYZ)).toEqual(minimalParams);
            });

            it('should handle complex function parameters', () => {
                const rt = runType<ComplexFunction>() as FunctionRunType;
                const toXYZ = rt.createJitParamsFunction(JitFunctions.toXYZ);
                const fromXYZ = rt.createJitParamsFunction(JitFunctions.fromXYZ);

                const complexParams: [{name: string; age: number}, {format: boolean}] = [
                    {name: 'Alice', age: 25},
                    {format: true},
                ];
                const minimalParams: [{name: string; age: number}] = [{name: 'Bob', age: 30}];

                expect(testRoundtrip(complexParams, toXYZ, fromXYZ)).toEqual(complexParams);
                expect(testRoundtrip(minimalParams, toXYZ, fromXYZ)).toEqual(minimalParams);
            });

            it('should handle array parameters', () => {
                type ArrayFunction = (items: string[], counts: number[]) => boolean;
                const rt = runType<ArrayFunction>() as FunctionRunType;
                const toXYZ = rt.createJitParamsFunction(JitFunctions.toXYZ);
                const fromXYZ = rt.createJitParamsFunction(JitFunctions.fromXYZ);

                const arrayParams: [string[], number[]] = [
                    ['apple', 'banana', 'cherry'],
                    [1, 2, 3],
                ];

                const result = testRoundtrip(arrayParams, toXYZ, fromXYZ);
                expect(result).toEqual(arrayParams);
                expect(result[0]).toEqual(['apple', 'banana', 'cherry']);
                expect(result[1]).toEqual([1, 2, 3]);
            });
        });

        describe('Function Return Values', () => {
            it('should handle simple return values', () => {
                const rt = runType<SimpleFunction>() as FunctionRunType;
                const toXYZ = rt.createJitReturnFunction(JitFunctions.toXYZ);
                const fromXYZ = rt.createJitReturnFunction(JitFunctions.fromXYZ);

                const returnValue = 'Hello, John (30 years old)';
                const result = testRoundtrip(returnValue, toXYZ, fromXYZ);

                expect(result).toBe(returnValue);
            });

            it('should handle Date return values', () => {
                const rt = runType<OptionalParamsFunction>() as FunctionRunType;
                const toXYZ = rt.createJitReturnFunction(JitFunctions.toXYZ);
                const fromXYZ = rt.createJitReturnFunction(JitFunctions.fromXYZ);

                const returnValue = new Date('2023-12-25T10:30:00.000Z');
                const result = testRoundtrip(returnValue, toXYZ, fromXYZ);

                expect(result).toEqual(returnValue);
                expect(result.getTime()).toBe(returnValue.getTime());
            });

            it('should handle complex object return values', () => {
                const rt = runType<ComplexFunction>() as FunctionRunType;
                const toXYZ = rt.createJitReturnFunction(JitFunctions.toXYZ);
                const fromXYZ = rt.createJitReturnFunction(JitFunctions.fromXYZ);

                const returnValue = {
                    result: 'Processed user: Alice',
                    timestamp: new Date('2023-12-25T10:30:00.000Z'),
                };

                const result = testRoundtrip(returnValue, toXYZ, fromXYZ);
                expect(result).toEqual(returnValue);
                expect(result.result).toBe('Processed user: Alice');
                expect(result.timestamp.getTime()).toBe(returnValue.timestamp.getTime());
            });

            it('should handle array return values', () => {
                type ArrayReturnFunction = (input: string) => string[];
                const rt = runType<ArrayReturnFunction>() as FunctionRunType;
                const toXYZ = rt.createJitReturnFunction(JitFunctions.toXYZ);
                const fromXYZ = rt.createJitReturnFunction(JitFunctions.fromXYZ);

                const returnValue = ['hello', 'world', '🚀'];
                const result = testRoundtrip(returnValue, toXYZ, fromXYZ);

                expect(result).toEqual(returnValue);
                expect(result.length).toBe(3);
                expect(result[2]).toBe('🚀');
            });

            it('should handle union return values', () => {
                type UnionReturnFunction = (success: boolean) => string | number;
                const rt = runType<UnionReturnFunction>() as FunctionRunType;
                const toXYZ = rt.createJitReturnFunction(JitFunctions.toXYZ);
                const fromXYZ = rt.createJitReturnFunction(JitFunctions.fromXYZ);

                const stringReturn: string | number = 'success';
                const numberReturn: string | number = 404;

                expect(testRoundtrip(stringReturn, toXYZ, fromXYZ)).toBe(stringReturn);
                expect(testRoundtrip(numberReturn, toXYZ, fromXYZ)).toBe(numberReturn);
            });

            it('should handle null and undefined return values', () => {
                type NullableReturnFunction = (input: string) => string | null | undefined;
                const rt = runType<NullableReturnFunction>() as FunctionRunType;
                const toXYZ = rt.createJitReturnFunction(JitFunctions.toXYZ);
                const fromXYZ = rt.createJitReturnFunction(JitFunctions.fromXYZ);

                const nullReturn: string | null | undefined = null;
                const undefinedReturn: string | null | undefined = undefined;
                const stringReturn: string | null | undefined = 'valid';

                expect(testRoundtrip(nullReturn, toXYZ, fromXYZ)).toBe(nullReturn);
                expect(testRoundtrip(undefinedReturn, toXYZ, fromXYZ)).toBe(undefinedReturn);
                expect(testRoundtrip(stringReturn, toXYZ, fromXYZ)).toBe(stringReturn);
            });
        });
    });

    describe('Error Cases', () => {
        it('should throw for unknown types', () => {
            expect(() => {
                type UnknownType = unknown;
                const rt = runType<UnknownType>();
                rt.createJitFunction(JitFunctions.toXYZ);
            }).toThrow('XYZ serialization not supported for unknown/any types');
        });

        it('should throw for generic object types', () => {
            expect(() => {
                type ObjectType = object;
                const rt = runType<ObjectType>();
                rt.createJitFunction(JitFunctions.toXYZ);
            }).toThrow('XYZ serialization not supported for generic object types');
        });

        it('should throw for never types', () => {
            expect(() => {
                type NeverType = never;
                const rt = runType<NeverType>();
                rt.createJitFunction(JitFunctions.toXYZ);
            }).toThrow('Never type cannot be serialized to XYZ');
        });

        it('should throw for Promise types', () => {
            expect(() => {
                const rt = runType<Promise<string>>();
                rt.createJitFunction(JitFunctions.toXYZ);
            }).toThrow('XYZ serialization not supported for Promise types');
        });

        it('should throw for non-serializable types', () => {
            expect(() => {
                // This would be a type marked as non-serializable
                // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
                const rt = runType<Function>();
                rt.createJitFunction(JitFunctions.toXYZ);
            }).toThrow();
        });
    });
});
