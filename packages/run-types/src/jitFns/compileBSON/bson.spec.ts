/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {runType} from '../../lib/runType';
import {JitFunctions} from '../../constants.functions';

/**
 * Helper function to perform a full roundtrip test: JS -> BSON -> JS
 * @param value - The JavaScript value to test
 * @param toBSON - The toBSON function
 * @param fromBSON - The fromBSON function
 * @param debug - Whether to output debug information
 * @returns The deserialized value after roundtrip
 */
function testRoundtrip<T>(value: T, toBSON: (val: T) => any, fromBSON: (data: any) => T, debug = false): T {
    if (debug) {
        console.log('Original value:', value);
        console.log('Type:', typeof value);
    }

    // Serialize to BSON
    const bsonData = toBSON(value);
    if (debug) {
        console.log(
            'BSON bytes:',
            Array.from(bsonData as Uint8Array)
                .map((b) => '0x' + b.toString(16).padStart(2, '0'))
                .join(' ')
        );
        console.log('BSON length:', bsonData.length);
    }

    // Deserialize from BSON
    const result = fromBSON(bsonData);
    if (debug) {
        console.log('Deserialized value:', result);
        console.log('Result type:', typeof result);
    }

    return result;
}

describe('BSON JIT Serialization', () => {
    describe('Atomic Types', () => {
        it('should handle null values', () => {
            const rt = runType<null>();
            const toBSON = rt.createJitFunction(JitFunctions.toBSON);
            const fromBSON = rt.createJitFunction(JitFunctions.fromBSON);

            const original = null;
            const result = testRoundtrip(original, toBSON, fromBSON);
            expect(result).toBe(null);
        });

        it('should handle boolean values', () => {
            const rt = runType<boolean>();
            const toBSON = rt.createJitFunction(JitFunctions.toBSON);
            const fromBSON = rt.createJitFunction(JitFunctions.fromBSON);

            const trueValue = true;
            const falseValue = false;

            const resultTrue = testRoundtrip(trueValue, toBSON, fromBSON);
            const resultFalse = testRoundtrip(falseValue, toBSON, fromBSON);

            expect(resultTrue).toBe(true);
            expect(resultFalse).toBe(false);
        });

        it('should handle number values', () => {
            const rt = runType<number>();
            const toBSON = rt.createJitFunction(JitFunctions.toBSON);
            const fromBSON = rt.createJitFunction(JitFunctions.fromBSON);

            // Test different number types
            const int32Value = 42;
            const negativeValue = -123;
            const floatValue = 3.14159;
            const largeIntValue = 2147483648; // Larger than int32

            expect(testRoundtrip(int32Value, toBSON, fromBSON)).toBe(int32Value);
            expect(testRoundtrip(negativeValue, toBSON, fromBSON)).toBe(negativeValue);
            expect(testRoundtrip(floatValue, toBSON, fromBSON)).toBeCloseTo(floatValue, 10);
            expect(testRoundtrip(largeIntValue, toBSON, fromBSON)).toBe(largeIntValue);
        });

        it('should handle string values', () => {
            const rt = runType<string>();
            const toBSON = rt.createJitFunction(JitFunctions.toBSON);
            const fromBSON = rt.createJitFunction(JitFunctions.fromBSON);

            const simpleString = 'hello world';
            const emptyString = '';
            const unicodeString = '🚀 Hello 世界 مرحبا';
            const specialChars = 'Line1\nLine2\tTabbed"Quoted\'Single';

            expect(testRoundtrip(simpleString, toBSON, fromBSON)).toBe(simpleString);
            expect(testRoundtrip(emptyString, toBSON, fromBSON)).toBe(emptyString);
            expect(testRoundtrip(unicodeString, toBSON, fromBSON)).toBe(unicodeString);
            expect(testRoundtrip(specialChars, toBSON, fromBSON)).toBe(specialChars);
        });

        it('should handle bigint values', () => {
            const rt = runType<bigint>();
            const toBSON = rt.createJitFunction(JitFunctions.toBSON);
            const fromBSON = rt.createJitFunction(JitFunctions.fromBSON);

            const smallBigInt = 123n;
            const largeBigInt = 9223372036854775807n; // Max safe int64
            const negativeBigInt = -456n;

            expect(testRoundtrip(smallBigInt, toBSON, fromBSON)).toBe(smallBigInt);
            expect(testRoundtrip(largeBigInt, toBSON, fromBSON)).toBe(largeBigInt);
            expect(testRoundtrip(negativeBigInt, toBSON, fromBSON)).toBe(negativeBigInt);
        });

        it('should handle undefined values', () => {
            const rt = runType<undefined>();
            const toBSON = rt.createJitFunction(JitFunctions.toBSON);
            const fromBSON = rt.createJitFunction(JitFunctions.fromBSON);

            const original = undefined;
            const result = testRoundtrip(original, toBSON, fromBSON);
            expect(result).toBe(undefined);
        });

        it('should handle symbol values', () => {
            const rt = runType<symbol>();
            const toBSON = rt.createJitFunction(JitFunctions.toBSON);
            const fromBSON = rt.createJitFunction(JitFunctions.fromBSON);

            const namedSymbol = Symbol('test');
            const anonymousSymbol = Symbol();

            const resultNamed = testRoundtrip(namedSymbol, toBSON, fromBSON);
            const resultAnonymous = testRoundtrip(anonymousSymbol, toBSON, fromBSON);

            expect(typeof resultNamed).toBe('symbol');
            expect(resultNamed.description).toBe('test');
            expect(typeof resultAnonymous).toBe('symbol');
            expect(resultAnonymous.description).toBe(undefined);
        });

        it('should handle regexp values', () => {
            const rt = runType<RegExp>();
            const toBSON = rt.createJitFunction(JitFunctions.toBSON);
            const fromBSON = rt.createJitFunction(JitFunctions.fromBSON);

            const simpleRegex = /hello/;
            const complexRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/gi;
            const regexWithFlags = /test/gim;

            const resultSimple = testRoundtrip(simpleRegex, toBSON, fromBSON);
            const resultComplex = testRoundtrip(complexRegex, toBSON, fromBSON);
            const resultFlags = testRoundtrip(regexWithFlags, toBSON, fromBSON);

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
            const numberToBSON = numberRt.createJitFunction(JitFunctions.toBSON);
            const numberFromBSON = numberRt.createJitFunction(JitFunctions.fromBSON);

            const stringRt = runType<StringEnum>();
            const stringToBSON = stringRt.createJitFunction(JitFunctions.toBSON);
            const stringFromBSON = stringRt.createJitFunction(JitFunctions.fromBSON);

            const numberEnumValue = NumberEnum.Second;
            const stringEnumValue = StringEnum.Green;

            expect(testRoundtrip(numberEnumValue, numberToBSON, numberFromBSON)).toBe(numberEnumValue);
            expect(testRoundtrip(stringEnumValue, stringToBSON, stringFromBSON)).toBe(stringEnumValue);
        });
    });

    describe('Literal Types', () => {
        it('should handle string literals', () => {
            type StringLiteral = 'hello';
            const rt = runType<StringLiteral>();
            const toBSON = rt.createJitFunction(JitFunctions.toBSON);
            const fromBSON = rt.createJitFunction(JitFunctions.fromBSON);

            const original: StringLiteral = 'hello';
            const bsonData = toBSON(original);
            const result = fromBSON(bsonData);

            expect(result).toBe('hello');
        });

        it('should handle number literals', () => {
            type NumberLiteral = 42;
            const rt = runType<NumberLiteral>();
            const toBSON = rt.createJitFunction(JitFunctions.toBSON);
            const fromBSON = rt.createJitFunction(JitFunctions.fromBSON);

            const original: NumberLiteral = 42;
            const bsonData = toBSON(original);
            const result = fromBSON(bsonData);

            expect(result).toBe(42);
        });

        it('should handle boolean literals', () => {
            type BooleanLiteral = true;
            const rt = runType<BooleanLiteral>();
            const toBSON = rt.createJitFunction(JitFunctions.toBSON);
            const fromBSON = rt.createJitFunction(JitFunctions.fromBSON);

            const original: BooleanLiteral = true;
            const bsonData = toBSON(original);
            const result = fromBSON(bsonData);

            expect(result).toBe(true);
        });

        it('should handle null literals', () => {
            type NullLiteral = null;
            const rt = runType<NullLiteral>();
            const toBSON = rt.createJitFunction(JitFunctions.toBSON);
            const fromBSON = rt.createJitFunction(JitFunctions.fromBSON);

            const original: NullLiteral = null;
            const bsonData = toBSON(original);
            const result = fromBSON(bsonData);

            expect(result).toBe(null);
        });

        it('should handle bigint literals', () => {
            type BigIntLiteral = 123n;
            const rt = runType<BigIntLiteral>();
            const toBSON = rt.createJitFunction(JitFunctions.toBSON);
            const fromBSON = rt.createJitFunction(JitFunctions.fromBSON);

            const original: BigIntLiteral = 123n;
            const bsonData = toBSON(original);
            const result = fromBSON(bsonData);

            expect(result).toBe(123n);
        });
    });

    describe('Error Cases', () => {
        it('should throw for unknown types', () => {
            expect(() => {
                type UnknownType = unknown;
                const rt = runType<UnknownType>();
                rt.createJitFunction(JitFunctions.toBSON);
            }).toThrow('BSON serialization not supported for unknown/any types');
        });

        it('should throw for generic object types', () => {
            expect(() => {
                type ObjectType = object;
                const rt = runType<ObjectType>();
                rt.createJitFunction(JitFunctions.toBSON);
            }).toThrow('BSON serialization not supported for generic object types');
        });

        it('should throw for never types', () => {
            expect(() => {
                type NeverType = never;
                const rt = runType<NeverType>();
                rt.createJitFunction(JitFunctions.toBSON);
            }).toThrow('Never type cannot be serialized to BSON');
        });
    });
});
