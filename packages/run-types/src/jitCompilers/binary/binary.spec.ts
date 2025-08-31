/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {runType} from '../../lib/runType';
import {JitFunctions} from '../../constants.functions';

/**
 * Helper function to perform a full roundtrip test: JS -> Binary -> JS
 * @param value - The JavaScript value to test
 * @param toBinary - The toBinary function
 * @param fromBinary - The fromBinary function
 * @param debug - Whether to output debug information
 * @returns The deserialized value after roundtrip
 */
function testRoundtrip<T>(value: T, toBinary: (val: T) => any, fromBinary: (data: any) => T, debug = false): T {
    if (debug) {
        console.log('Original value:', value);
        console.log('Type:', typeof value);
    }

    // Serialize to Binary
    const bsonData = toBinary(value);
    if (debug) {
        console.log(
            'Binary bytes:',
            Array.from(bsonData as Uint8Array)
                .map((b) => '0x' + b.toString(16).padStart(2, '0'))
                .join(' ')
        );
        console.log('Binary length:', bsonData.length);
    }

    // Deserialize from Binary
    const result = fromBinary(bsonData);
    if (debug) {
        console.log('Deserialized value:', result);
        console.log('Result type:', typeof result);
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
            const floatValue = 3.14159;
            const largeIntValue = 2147483648; // Larger than int32

            expect(testRoundtrip(int32Value, toBinary, fromBinary)).toBe(int32Value);
            expect(testRoundtrip(negativeValue, toBinary, fromBinary)).toBe(negativeValue);
            expect(testRoundtrip(floatValue, toBinary, fromBinary)).toBeCloseTo(floatValue, 10);
            expect(testRoundtrip(largeIntValue, toBinary, fromBinary)).toBe(largeIntValue);
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

            const numberRt = runType<NumberEnum>();
            const numberToBinary = numberRt.createJitFunction(JitFunctions.toBinary);
            const numberFromBinary = numberRt.createJitFunction(JitFunctions.fromBinary);

            const stringRt = runType<StringEnum>();
            const stringToBinary = stringRt.createJitFunction(JitFunctions.toBinary);
            const stringFromBinary = stringRt.createJitFunction(JitFunctions.fromBinary);

            const numberEnumValue = NumberEnum.Second;
            const stringEnumValue = StringEnum.Green;

            expect(testRoundtrip(numberEnumValue, numberToBinary, numberFromBinary)).toBe(numberEnumValue);
            expect(testRoundtrip(stringEnumValue, stringToBinary, stringFromBinary)).toBe(stringEnumValue);
        });
    });

    describe('Literal Types', () => {
        it('should handle string literals', () => {
            type StringLiteral = 'hello';
            const rt = runType<StringLiteral>();
            const toBinary = rt.createJitFunction(JitFunctions.toBinary);
            const fromBinary = rt.createJitFunction(JitFunctions.fromBinary);

            const original: StringLiteral = 'hello';
            const bsonData = toBinary(original);
            const result = fromBinary(bsonData);

            expect(result).toBe('hello');
        });

        it('should handle number literals', () => {
            type NumberLiteral = 42;
            const rt = runType<NumberLiteral>();
            const toBinary = rt.createJitFunction(JitFunctions.toBinary);
            const fromBinary = rt.createJitFunction(JitFunctions.fromBinary);

            const original: NumberLiteral = 42;
            const bsonData = toBinary(original);
            const result = fromBinary(bsonData);

            expect(result).toBe(42);
        });

        it('should handle boolean literals', () => {
            type BooleanLiteral = true;
            const rt = runType<BooleanLiteral>();
            const toBinary = rt.createJitFunction(JitFunctions.toBinary);
            const fromBinary = rt.createJitFunction(JitFunctions.fromBinary);

            const original: BooleanLiteral = true;
            const bsonData = toBinary(original);
            const result = fromBinary(bsonData);

            expect(result).toBe(true);
        });

        it('should handle null literals', () => {
            type NullLiteral = null;
            const rt = runType<NullLiteral>();
            const toBinary = rt.createJitFunction(JitFunctions.toBinary);
            const fromBinary = rt.createJitFunction(JitFunctions.fromBinary);

            const original: NullLiteral = null;
            const bsonData = toBinary(original);
            const result = fromBinary(bsonData);

            expect(result).toBe(null);
        });

        it('should handle bigint literals', () => {
            type BigIntLiteral = 123n;
            const rt = runType<BigIntLiteral>();
            const toBinary = rt.createJitFunction(JitFunctions.toBinary);
            const fromBinary = rt.createJitFunction(JitFunctions.fromBinary);

            const original: BigIntLiteral = 123n;
            const bsonData = toBinary(original);
            const result = fromBinary(bsonData);

            expect(result).toBe(123n);
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
    });
});
