/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {runType} from '../../lib/runType';
import {JitFunctions} from '../../constants.functions';
import {FunctionRunType} from '../../runType/function/function';
import {createBinaryDeserializer, createBinarySerializer} from './binaryPureFns';
import type {BinaryDeserializer, BinarySerializer} from './types';

const serContext = createBinarySerializer({bufferSize: 1024});
const desContext = createBinaryDeserializer(new ArrayBuffer(0));

/**
 * Helper function to perform a full roundtrip test: JS -> Binary -> JS
 * @param value - The JavaScript value to test
 * @param toBinary - The toBinary function
 * @param fromBinary - The fromBinary function
 * @param debug - Whether to output debug information
 * @returns The deserialized value after roundtrip
 */
function testRoundtrip<T>(
    value: T,
    toBinary: (val: T, serContext: BinarySerializer) => any,
    fromBinary: (data: any, desContext: BinaryDeserializer) => T,
    debug = false
): T {
    // Serialize to Binary
    serContext.reset();
    toBinary(value, serContext);
    const buffer = serContext.getBuffer();
    if (debug) {
        console.log(
            'Binary length:',
            buffer.byteLength,
            'Binary bytes:',
            Array.from(new Uint32Array(buffer))
                .map((b) => '0x' + b.toString(16).padStart(8, '0'))
                .join(' ')
        );
    }

    // Deserialize from Binary
    desContext.setBuffer(buffer);
    const result = fromBinary(undefined, desContext);
    if (debug) {
        console.log('Original value:', value, 'Deserialized value:', result);
    }
    return result;
}

describe('Binary JIT Serialization', () => {
    describe('Atomic Types', () => {
        it('should handle null values', () => {
            const rt = runType<null>();
            const toBinary = rt.createJitFunction(JitFunctions.toBinary);
            const fromBinary = rt.createJitFunction(JitFunctions.fromBinary);

            const original = null;
            const result = testRoundtrip(original, toBinary, fromBinary);
            expect(result).toBe(null);
        });

        it('should handle boolean values', () => {
            const rt = runType<boolean>();
            const toBinary = rt.createJitFunction(JitFunctions.toBinary);
            const fromBinary = rt.createJitFunction(JitFunctions.fromBinary);

            const trueValue = true;
            const falseValue = false;

            const resultTrue = testRoundtrip(trueValue, toBinary, fromBinary);
            const resultFalse = testRoundtrip(falseValue, toBinary, fromBinary);

            expect(resultTrue).toBe(true);
            expect(resultFalse).toBe(false);
        });

        it('should handle number values', () => {
            const rt = runType<number>();
            const toBinary = rt.createJitFunction(JitFunctions.toBinary);
            const fromBinary = rt.createJitFunction(JitFunctions.fromBinary);

            // Test different number types
            const int32Value = 42;
            const negativeValue = -123;
            const floatValue = 3.14159; // float exact precision
            const largeIntValue = 2147483648; // Larger than int32
            const negativeLargeIntValue = -2147483649; // Smaller than int32
            const PiValue = Math.PI; // float exact precision

            expect(testRoundtrip(int32Value, toBinary, fromBinary)).toBe(int32Value);
            expect(testRoundtrip(negativeValue, toBinary, fromBinary)).toBe(negativeValue);
            expect(testRoundtrip(floatValue, toBinary, fromBinary)).toBe(floatValue);
            expect(testRoundtrip(largeIntValue, toBinary, fromBinary)).toBe(largeIntValue);
            expect(testRoundtrip(negativeLargeIntValue, toBinary, fromBinary)).toBe(negativeLargeIntValue);
            expect(testRoundtrip(PiValue, toBinary, fromBinary)).toBe(PiValue);
            expect(testRoundtrip(Infinity, toBinary, fromBinary)).toBe(Infinity);
            expect(testRoundtrip(-Infinity, toBinary, fromBinary)).toBe(-Infinity);
            expect(testRoundtrip(NaN, toBinary, fromBinary)).toBe(NaN);
            expect(testRoundtrip(-0, toBinary, fromBinary)).toBe(0);
            expect(testRoundtrip(0, toBinary, fromBinary)).toBe(0);
            expect(testRoundtrip(Number.MAX_SAFE_INTEGER, toBinary, fromBinary)).toBe(Number.MAX_SAFE_INTEGER);
        });

        it('should handle string values', () => {
            const rt = runType<string>();
            const toBinary = rt.createJitFunction(JitFunctions.toBinary);
            const fromBinary = rt.createJitFunction(JitFunctions.fromBinary);

            const simpleString = 'hello world';
            const emptyString = '';
            const unicodeString = '🚀 Hello 世界 مرحبا';
            const specialChars = 'Line1\nLine2\tTabbed"Quoted\'Single';

            expect(testRoundtrip(simpleString, toBinary, fromBinary)).toBe(simpleString);
            expect(testRoundtrip(emptyString, toBinary, fromBinary)).toBe(emptyString);
            expect(testRoundtrip(unicodeString, toBinary, fromBinary)).toBe(unicodeString);
            expect(testRoundtrip(specialChars, toBinary, fromBinary)).toBe(specialChars);
        });

        it('should handle bigint values', () => {
            const rt = runType<bigint>();
            const toBinary = rt.createJitFunction(JitFunctions.toBinary);
            const fromBinary = rt.createJitFunction(JitFunctions.fromBinary);

            const smallBigInt = 123n;
            const largeBigInt = 9223372036854775807n; // Max safe int64
            const negativeBigInt = -456n;

            expect(testRoundtrip(smallBigInt, toBinary, fromBinary)).toBe(smallBigInt);
            expect(testRoundtrip(largeBigInt, toBinary, fromBinary)).toBe(largeBigInt);
            expect(testRoundtrip(negativeBigInt, toBinary, fromBinary)).toBe(negativeBigInt);
        });

        it('should handle undefined values', () => {
            const rt = runType<undefined>();
            const toBinary = rt.createJitFunction(JitFunctions.toBinary);
            const fromBinary = rt.createJitFunction(JitFunctions.fromBinary);

            const original = undefined;
            const result = testRoundtrip(original, toBinary, fromBinary);
            expect(result).toBe(undefined);
        });

        it('should handle symbol values', () => {
            const rt = runType<symbol>();
            const toBinary = rt.createJitFunction(JitFunctions.toBinary);
            const fromBinary = rt.createJitFunction(JitFunctions.fromBinary);

            const namedSymbol = Symbol('test');
            const anonymousSymbol = Symbol();

            const resultNamed = testRoundtrip(namedSymbol, toBinary, fromBinary);
            const resultAnonymous = testRoundtrip(anonymousSymbol, toBinary, fromBinary);

            expect(typeof resultNamed).toBe('symbol');
            expect(resultNamed.description).toBe('test');
            expect(typeof resultAnonymous).toBe('symbol');
            expect(resultAnonymous.description).toBe(undefined);
        });

        it('should handle regexp values', () => {
            const rt = runType<RegExp>();
            const toBinary = rt.createJitFunction(JitFunctions.toBinary);
            const fromBinary = rt.createJitFunction(JitFunctions.fromBinary);

            const simpleRegex = /hello/;
            const complexRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/gi;
            const regexWithFlags = /test/gim;

            const resultSimple = testRoundtrip(simpleRegex, toBinary, fromBinary);
            const resultComplex = testRoundtrip(complexRegex, toBinary, fromBinary);
            const resultFlags = testRoundtrip(regexWithFlags, toBinary, fromBinary);

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

            enum MixedEnum {
                First = 1,
                Second = 'second',
                Third = 3,
            }

            const numberRt = runType<NumberEnum>();
            const numberToBinary = numberRt.createJitFunction(JitFunctions.toBinary);
            const numberFromBinary = numberRt.createJitFunction(JitFunctions.fromBinary);

            const stringRt = runType<StringEnum>();
            const stringToBinary = stringRt.createJitFunction(JitFunctions.toBinary);
            const stringFromBinary = stringRt.createJitFunction(JitFunctions.fromBinary);

            const mixedRt = runType<MixedEnum>();
            const mixedToBinary = mixedRt.createJitFunction(JitFunctions.toBinary);
            const mixedFromBinary = mixedRt.createJitFunction(JitFunctions.fromBinary);

            const numberEnumValue = NumberEnum.Second;
            const stringEnumValue = StringEnum.Green;
            const mixedEnumValue = MixedEnum.Second;
            const mixedEnumValue2 = MixedEnum.Third;

            expect(testRoundtrip(numberEnumValue, numberToBinary, numberFromBinary)).toBe(numberEnumValue);
            expect(testRoundtrip(stringEnumValue, stringToBinary, stringFromBinary)).toBe(stringEnumValue);
            expect(testRoundtrip(mixedEnumValue, mixedToBinary, mixedFromBinary)).toBe(mixedEnumValue);
            expect(testRoundtrip(mixedEnumValue2, mixedToBinary, mixedFromBinary)).toBe(mixedEnumValue2);
        });
    });

    describe('Literal Types', () => {
        it('should handle string literals', () => {
            type StringLiteral = 'hello';
            const rt = runType<StringLiteral>();
            const toBinary = rt.createJitFunction(JitFunctions.toBinary);
            const fromBinary = rt.createJitFunction(JitFunctions.fromBinary);

            expect(testRoundtrip(undefined, toBinary, fromBinary)).toBe('hello');
        });

        it('should handle number literals', () => {
            type NumberLiteral = 42;
            const rt = runType<NumberLiteral>();
            const toBinary = rt.createJitFunction(JitFunctions.toBinary);
            const fromBinary = rt.createJitFunction(JitFunctions.fromBinary);

            expect(testRoundtrip(undefined, toBinary, fromBinary)).toBe(42);
        });

        it('should handle boolean literals', () => {
            type BooleanLiteral = true;
            const rt = runType<BooleanLiteral>();
            const toBinary = rt.createJitFunction(JitFunctions.toBinary);
            const fromBinary = rt.createJitFunction(JitFunctions.fromBinary);

            expect(testRoundtrip(undefined, toBinary, fromBinary)).toBe(true);
        });

        it('should handle null literals', () => {
            type NullLiteral = null;
            const rt = runType<NullLiteral>();
            const toBinary = rt.createJitFunction(JitFunctions.toBinary);
            const fromBinary = rt.createJitFunction(JitFunctions.fromBinary);

            expect(testRoundtrip(undefined, toBinary, fromBinary)).toBe(null);
        });

        it('should handle bigint literals', () => {
            type BigIntLiteral = 123n;
            const rt = runType<BigIntLiteral>();
            const toBinary = rt.createJitFunction(JitFunctions.toBinary);
            const fromBinary = rt.createJitFunction(JitFunctions.fromBinary);

            expect(testRoundtrip(undefined, toBinary, fromBinary)).toBe(123n);
        });

        it('should handle regexp literals', () => {
            const regexp = /abc/;
            type RegExpLiteral = typeof regexp;
            const rt = runType<RegExpLiteral>();
            const toBinary = rt.createJitFunction(JitFunctions.toBinary);
            const fromBinary = rt.createJitFunction(JitFunctions.fromBinary);

            expect(testRoundtrip(undefined, toBinary, fromBinary)).toEqual(regexp);
        });
    });

    describe('Member RunTypes', () => {
        it('should handle array types', () => {
            const rt = runType<number[]>();
            const toBinary = rt.createJitFunction(JitFunctions.toBinary);
            const fromBinary = rt.createJitFunction(JitFunctions.fromBinary);

            const emptyArray: number[] = [];
            const simpleArray = [1, 2, 3, 4, 5];
            const mixedNumbers = [0, -1, 3.14, 1000000];

            expect(testRoundtrip(emptyArray, toBinary, fromBinary)).toEqual(emptyArray);
            expect(testRoundtrip(simpleArray, toBinary, fromBinary)).toEqual(simpleArray);
            expect(testRoundtrip(mixedNumbers, toBinary, fromBinary)).toEqual(mixedNumbers);
        });

        it('should handle string array types', () => {
            const rt = runType<string[]>();
            const toBinary = rt.createJitFunction(JitFunctions.toBinary);
            const fromBinary = rt.createJitFunction(JitFunctions.fromBinary);

            const stringArray = ['hello', 'world', '🚀', ''];
            const unicodeArray = ['世界', 'مرحبا', 'Здравствуй'];

            expect(testRoundtrip(stringArray, toBinary, fromBinary)).toEqual(stringArray);
            expect(testRoundtrip(unicodeArray, toBinary, fromBinary)).toEqual(unicodeArray);
        });

        it('should handle nested array types', () => {
            const rt = runType<number[][]>();
            const toBinary = rt.createJitFunction(JitFunctions.toBinary);
            const fromBinary = rt.createJitFunction(JitFunctions.fromBinary);

            const nestedArray = [[1, 2], [3, 4], [5]];
            const emptyNested: number[][] = [[], []];

            expect(testRoundtrip(nestedArray, toBinary, fromBinary)).toEqual(nestedArray);
            expect(testRoundtrip(emptyNested, toBinary, fromBinary)).toEqual(emptyNested);
        });

        it('should handle tuple types', () => {
            const rt = runType<[string, number, boolean]>();
            const toBinary = rt.createJitFunction(JitFunctions.toBinary);
            const fromBinary = rt.createJitFunction(JitFunctions.fromBinary);

            const tuple: [string, number, boolean] = ['hello', 42, true];
            const result = testRoundtrip(tuple, toBinary, fromBinary);

            expect(result).toEqual(tuple);
            expect(result[0]).toBe('hello');
            expect(result[1]).toBe(42);
            expect(result[2]).toBe(true);
        });

        it('should handle optional tuple members', () => {
            const rt = runType<[string, number?]>();
            const toBinary = rt.createJitFunction(JitFunctions.toBinary);
            const fromBinary = rt.createJitFunction(JitFunctions.fromBinary);

            const completeTuple: [string, number?] = ['hello', 42];
            const incompleteTuple: [string, number?] = ['world'];

            expect(testRoundtrip(completeTuple, toBinary, fromBinary)).toEqual(completeTuple);
            expect(testRoundtrip(incompleteTuple, toBinary, fromBinary)).toEqual(incompleteTuple);
        });

        it('should handle rest parameters in tuples', () => {
            const rt = runType<[string, ...number[]]>();
            const toBinary = rt.createJitFunction(JitFunctions.toBinary);
            const fromBinary = rt.createJitFunction(JitFunctions.fromBinary);

            const restTuple: [string, ...number[]] = ['prefix', 1, 2, 3, 4];
            const minimalRest: [string, ...number[]] = ['only'];

            expect(testRoundtrip(restTuple, toBinary, fromBinary)).toEqual(restTuple);
            expect(testRoundtrip(minimalRest, toBinary, fromBinary)).toEqual(minimalRest);
        });
    });

    describe('Collection RunTypes', () => {
        it('should handle object literal types', () => {
            const rt = runType<{name: string; age: number}>();
            const toBinary = rt.createJitFunction(JitFunctions.toBinary);
            const fromBinary = rt.createJitFunction(JitFunctions.fromBinary);

            const person = {name: 'John', age: 30};
            const result = testRoundtrip(person, toBinary, fromBinary);

            expect(result).toEqual(person);
            expect(result.name).toBe('John');
            expect(result.age).toBe(30);
        });

        it('should handle optional properties', () => {
            const rt = runType<{name: string; age?: number}>();
            const toBinary = rt.createJitFunction(JitFunctions.toBinary);
            const fromBinary = rt.createJitFunction(JitFunctions.fromBinary);

            const withAge = {name: 'John', age: 30};
            const withoutAge = {name: 'Jane'};

            expect(testRoundtrip(withAge, toBinary, fromBinary)).toEqual(withAge);
            expect(testRoundtrip(withoutAge, toBinary, fromBinary)).toEqual(withoutAge);
        });

        it('should handle index signatures in objects (Records)', () => {
            const rt = runType<{[key: string]: number}>();
            const toBinary = rt.createJitFunction(JitFunctions.toBinary);
            const fromBinary = rt.createJitFunction(JitFunctions.fromBinary);

            const record = {a: 1, b: 2, c: 3};
            const result = testRoundtrip(record, toBinary, fromBinary);

            expect(result).toEqual(record);
        });

        it('should handle nested object types', () => {
            const rt = runType<{user: {name: string; profile: {email: string}}}>();
            const toBinary = rt.createJitFunction(JitFunctions.toBinary);
            const fromBinary = rt.createJitFunction(JitFunctions.fromBinary);

            const nested = {
                user: {
                    name: 'John',
                    profile: {
                        email: 'john@example.com',
                    },
                },
            };

            const result = testRoundtrip(nested, toBinary, fromBinary);
            expect(result).toEqual(nested);
            expect(result.user.name).toBe('John');
            expect(result.user.profile.email).toBe('john@example.com');
        });

        it('should handle intersection types', () => {
            type Person = {name: string};
            type Employee = {id: number};
            const rt = runType<Person & Employee>();
            const toBinary = rt.createJitFunction(JitFunctions.toBinary);
            const fromBinary = rt.createJitFunction(JitFunctions.fromBinary);

            const intersection = {name: 'John', id: 123};
            const result = testRoundtrip(intersection, toBinary, fromBinary);

            expect(result).toEqual(intersection);
            expect(result.name).toBe('John');
            expect(result.id).toBe(123);
        });

        it('should handle union types', () => {
            const rt = runType<string | number>();
            const toBinary = rt.createJitFunction(JitFunctions.toBinary);
            const fromBinary = rt.createJitFunction(JitFunctions.fromBinary);

            const stringValue: string | number = 'hello';
            const numberValue: string | number = 42;

            expect(testRoundtrip(stringValue, toBinary, fromBinary)).toBe(stringValue);
            expect(testRoundtrip(numberValue, toBinary, fromBinary)).toBe(numberValue);
        });

        it('should handle complex union types', () => {
            type ComplexUnion = {type: 'user'; name: string} | {type: 'admin'; permissions: string[]};
            const rt = runType<ComplexUnion>();
            const toBinary = rt.createJitFunction(JitFunctions.toBinary);
            const fromBinary = rt.createJitFunction(JitFunctions.fromBinary);

            const user: ComplexUnion = {type: 'user', name: 'John'};
            const admin: ComplexUnion = {type: 'admin', permissions: ['read', 'write']};

            expect(testRoundtrip(user, toBinary, fromBinary)).toEqual(user);
            expect(testRoundtrip(admin, toBinary, fromBinary)).toEqual(admin);
        });

        it('should handle class types', () => {
            class Person {
                constructor(
                    public name: string,
                    public age: number
                ) {}
            }

            const rt = runType<Person>();
            const toBinary = rt.createJitFunction(JitFunctions.toBinary);
            const fromBinary = rt.createJitFunction(JitFunctions.fromBinary);

            const person = new Person('John', 30);
            const result = testRoundtrip(person, toBinary, fromBinary);

            expect(result.name).toBe('John');
            expect(result.age).toBe(30);
        });

        it('should handle Date class', () => {
            const rt = runType<Date>();
            const toBinary = rt.createJitFunction(JitFunctions.toBinary);
            const fromBinary = rt.createJitFunction(JitFunctions.fromBinary);

            const date = new Date('2023-12-25T10:30:00.000Z');
            const result = testRoundtrip(date, toBinary, fromBinary);

            expect(result).toEqual(date);
            expect(result.getTime()).toBe(date.getTime());
        });

        it('should handle Map class', () => {
            const rt = runType<Map<string, number>>();
            const toBinary = rt.createJitFunction(JitFunctions.toBinary);
            const fromBinary = rt.createJitFunction(JitFunctions.fromBinary);

            const map = new Map([
                ['a', 1],
                ['b', 2],
                ['c', 3],
            ]);
            const result = testRoundtrip(map, toBinary, fromBinary);

            expect(result).toEqual(map);
            expect(result.get('a')).toBe(1);
            expect(result.get('b')).toBe(2);
            expect(result.get('c')).toBe(3);
        });

        it('should handle Set class', () => {
            const rt = runType<Set<string>>();
            const toBinary = rt.createJitFunction(JitFunctions.toBinary);
            const fromBinary = rt.createJitFunction(JitFunctions.fromBinary);

            const set = new Set(['a', 'b', 'c']);
            const result = testRoundtrip(set, toBinary, fromBinary);

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
                const toBinary = rt.createJitParamsFunction(JitFunctions.toBinary);
                const fromBinary = rt.createJitParamsFunction(JitFunctions.fromBinary);

                const params: [string, number] = ['John', 30];
                const result = testRoundtrip(params, toBinary, fromBinary);

                expect(result).toEqual(params);
                expect(result[0]).toBe('John');
                expect(result[1]).toBe(30);
            });

            it('should handle function parameters with optional values', () => {
                const rt = runType<OptionalParamsFunction>() as FunctionRunType;
                const toBinary = rt.createJitParamsFunction(JitFunctions.toBinary);
                const fromBinary = rt.createJitParamsFunction(JitFunctions.fromBinary);

                const completeParams: [number, boolean, string] = [42, true, 'hello'];
                const incompleteParams: [number, boolean] = [42, false];

                expect(testRoundtrip(completeParams, toBinary, fromBinary)).toEqual(completeParams);
                expect(testRoundtrip(incompleteParams, toBinary, fromBinary)).toEqual(incompleteParams);
            });

            it('should handle function parameters with rest parameters', () => {
                const rt = runType<RestParamsFunction>() as FunctionRunType;
                const toBinary = rt.createJitParamsFunction(JitFunctions.toBinary);
                const fromBinary = rt.createJitParamsFunction(JitFunctions.fromBinary);

                const restParams: [string, ...number[]] = ['sum:', 1, 2, 3, 4, 5];
                const minimalParams: [string, ...number[]] = ['empty:'];

                expect(testRoundtrip(restParams, toBinary, fromBinary)).toEqual(restParams);
                expect(testRoundtrip(minimalParams, toBinary, fromBinary)).toEqual(minimalParams);
            });

            it('should handle complex function parameters', () => {
                const rt = runType<ComplexFunction>() as FunctionRunType;
                const toBinary = rt.createJitParamsFunction(JitFunctions.toBinary);
                const fromBinary = rt.createJitParamsFunction(JitFunctions.fromBinary);

                const complexParams: [{name: string; age: number}, {format: boolean}] = [
                    {name: 'Alice', age: 25},
                    {format: true},
                ];
                const minimalParams: [{name: string; age: number}] = [{name: 'Bob', age: 30}];

                expect(testRoundtrip(complexParams, toBinary, fromBinary)).toEqual(complexParams);
                expect(testRoundtrip(minimalParams, toBinary, fromBinary)).toEqual(minimalParams);
            });

            it('should handle array parameters', () => {
                type ArrayFunction = (items: string[], counts: number[]) => boolean;
                const rt = runType<ArrayFunction>() as FunctionRunType;
                const toBinary = rt.createJitParamsFunction(JitFunctions.toBinary);
                const fromBinary = rt.createJitParamsFunction(JitFunctions.fromBinary);

                const arrayParams: [string[], number[]] = [
                    ['apple', 'banana', 'cherry'],
                    [1, 2, 3],
                ];

                const result = testRoundtrip(arrayParams, toBinary, fromBinary);
                expect(result).toEqual(arrayParams);
                expect(result[0]).toEqual(['apple', 'banana', 'cherry']);
                expect(result[1]).toEqual([1, 2, 3]);
            });
        });

        describe('Function Return Values', () => {
            it('should handle simple return values', () => {
                const rt = runType<SimpleFunction>() as FunctionRunType;
                const toBinary = rt.createJitReturnFunction(JitFunctions.toBinary);
                const fromBinary = rt.createJitReturnFunction(JitFunctions.fromBinary);

                const returnValue = 'Hello, John (30 years old)';
                const result = testRoundtrip(returnValue, toBinary, fromBinary);

                expect(result).toBe(returnValue);
            });

            it('should handle Date return values', () => {
                const rt = runType<OptionalParamsFunction>() as FunctionRunType;
                const toBinary = rt.createJitReturnFunction(JitFunctions.toBinary);
                const fromBinary = rt.createJitReturnFunction(JitFunctions.fromBinary);

                const returnValue = new Date('2023-12-25T10:30:00.000Z');
                const result = testRoundtrip(returnValue, toBinary, fromBinary);

                expect(result).toEqual(returnValue);
                expect(result.getTime()).toBe(returnValue.getTime());
            });

            it('should handle complex object return values', () => {
                const rt = runType<ComplexFunction>() as FunctionRunType;
                const toBinary = rt.createJitReturnFunction(JitFunctions.toBinary);
                const fromBinary = rt.createJitReturnFunction(JitFunctions.fromBinary);

                const returnValue = {
                    result: 'Processed user: Alice',
                    timestamp: new Date('2023-12-25T10:30:00.000Z'),
                };

                const result = testRoundtrip(returnValue, toBinary, fromBinary);
                expect(result).toEqual(returnValue);
                expect(result.result).toBe('Processed user: Alice');
                expect(result.timestamp.getTime()).toBe(returnValue.timestamp.getTime());
            });

            it('should handle array return values', () => {
                type ArrayReturnFunction = (input: string) => string[];
                const rt = runType<ArrayReturnFunction>() as FunctionRunType;
                const toBinary = rt.createJitReturnFunction(JitFunctions.toBinary);
                const fromBinary = rt.createJitReturnFunction(JitFunctions.fromBinary);

                const returnValue = ['hello', 'world', '🚀'];
                const result = testRoundtrip(returnValue, toBinary, fromBinary);

                expect(result).toEqual(returnValue);
                expect(result.length).toBe(3);
                expect(result[2]).toBe('🚀');
            });

            it('should handle union return values', () => {
                type UnionReturnFunction = (success: boolean) => string | number;
                const rt = runType<UnionReturnFunction>() as FunctionRunType;
                const toBinary = rt.createJitReturnFunction(JitFunctions.toBinary);
                const fromBinary = rt.createJitReturnFunction(JitFunctions.fromBinary);

                const stringReturn: string | number = 'success';
                const numberReturn: string | number = 404;

                expect(testRoundtrip(stringReturn, toBinary, fromBinary)).toBe(stringReturn);
                expect(testRoundtrip(numberReturn, toBinary, fromBinary)).toBe(numberReturn);
            });

            it('should handle null and undefined return values', () => {
                type NullableReturnFunction = (input: string) => string | null | undefined;
                const rt = runType<NullableReturnFunction>() as FunctionRunType;
                const toBinary = rt.createJitReturnFunction(JitFunctions.toBinary);
                const fromBinary = rt.createJitReturnFunction(JitFunctions.fromBinary);

                const nullReturn: string | null | undefined = null;
                const undefinedReturn: string | null | undefined = undefined;
                const stringReturn: string | null | undefined = 'valid';

                expect(testRoundtrip(nullReturn, toBinary, fromBinary)).toBe(nullReturn);
                expect(testRoundtrip(undefinedReturn, toBinary, fromBinary)).toBe(undefinedReturn);
                expect(testRoundtrip(stringReturn, toBinary, fromBinary)).toBe(stringReturn);
            });
        });
    });

    describe('Error Cases', () => {
        it('should throw for unknown types', () => {
            expect(() => {
                type UnknownType = unknown;
                const rt = runType<UnknownType>();
                rt.createJitFunction(JitFunctions.toBinary);
            }).toThrow('Binary serialization not supported for unknown/any types');
        });

        it('should throw for generic object types', () => {
            expect(() => {
                type ObjectType = object;
                const rt = runType<ObjectType>();
                rt.createJitFunction(JitFunctions.toBinary);
            }).toThrow('Binary serialization not supported for generic object types');
        });

        it('should throw for never types', () => {
            expect(() => {
                type NeverType = never;
                const rt = runType<NeverType>();
                rt.createJitFunction(JitFunctions.toBinary);
            }).toThrow('Never type cannot be serialized to Binary');
        });

        it('should throw for Promise types', () => {
            expect(() => {
                const rt = runType<Promise<string>>();
                rt.createJitFunction(JitFunctions.toBinary);
            }).toThrow('Binary serialization not supported for Promise types');
        });

        it('should throw for non-serializable types', () => {
            expect(() => {
                // This would be a type marked as non-serializable
                // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
                const rt = runType<Function>();
                rt.createJitFunction(JitFunctions.toBinary);
            }).toThrow();
        });
    });
});
