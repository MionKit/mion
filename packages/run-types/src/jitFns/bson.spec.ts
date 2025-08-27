/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {runType} from '../lib/runType';
import {JitFunctions} from '../constants.functions';

// BSON type constants for testing
const BSON_TYPES = {
    DOUBLE: 0x01,
    STRING: 0x02,
    DOCUMENT: 0x03,
    ARRAY: 0x04,
    BINARY: 0x05,
    BOOLEAN: 0x08,
    NULL: 0x0a,
    INT32: 0x10,
    INT64: 0x12,
} as const;

describe('BSON JIT Serialization', () => {
    describe('Atomic Types', () => {
        it('should serialize null to BSON null type', () => {
            const rt = runType<null>();
            const toBSON = rt.createJitFunction(JitFunctions.toBSON);

            const result = toBSON(null);

            expect(result).toBeInstanceOf(Uint8Array);
            expect(result[0]).toBe(BSON_TYPES.NULL);
            expect(result.length).toBe(1);
        });

        it('should serialize boolean values', () => {
            const rt = runType<boolean>();
            const toBSON = rt.createJitFunction(JitFunctions.toBSON);

            const trueResult = toBSON(true);
            expect(trueResult).toBeInstanceOf(Uint8Array);
            expect(trueResult[0]).toBe(BSON_TYPES.BOOLEAN);
            expect(trueResult[1]).toBe(0x01);
            expect(trueResult.length).toBe(2);

            const falseResult = toBSON(false);
            expect(falseResult).toBeInstanceOf(Uint8Array);
            expect(falseResult[0]).toBe(BSON_TYPES.BOOLEAN);
            expect(falseResult[1]).toBe(0x00);
            expect(falseResult.length).toBe(2);
        });

        it('should serialize strings with UTF-8 encoding', () => {
            const rt = runType<string>();
            const toBSON = rt.createJitFunction(JitFunctions.toBSON);

            const result = toBSON('hello');
            expect(result).toBeInstanceOf(Uint8Array);
            expect(result[0]).toBe(BSON_TYPES.STRING);

            // Check string length (4 bytes little-endian)
            const view = new DataView(result.buffer, result.byteOffset + 1, 4);
            const stringLength = view.getInt32(0, true);
            expect(stringLength).toBe(6); // 'hello' + null terminator

            // Check string content
            const stringBytes = result.slice(5, 5 + 5); // Skip type + length
            const decodedString = new TextDecoder().decode(stringBytes);
            expect(decodedString).toBe('hello');

            // Check null terminator
            expect(result[result.length - 1]).toBe(0);

            // Total length should be: type(1) + length(4) + string(5) + null(1) = 11
            expect(result.length).toBe(11);
        });

        it('should serialize integers as BSON int32 when in range', () => {
            const rt = runType<number>();
            const toBSON = rt.createJitFunction(JitFunctions.toBSON);

            const result = toBSON(42);
            expect(result).toBeInstanceOf(Uint8Array);
            expect(result[0]).toBe(BSON_TYPES.INT32);
            expect(result.length).toBe(5); // type(1) + int32(4)

            // Verify the int32 value
            const view = new DataView(result.buffer, result.byteOffset + 1, 4);
            expect(view.getInt32(0, true)).toBe(42); // little-endian
        });

        it('should serialize large integers as BSON int64', () => {
            const rt = runType<number>();
            const toBSON = rt.createJitFunction(JitFunctions.toBSON);

            const largeInt = 2147483648; // Larger than int32 max
            const result = toBSON(largeInt);
            expect(result).toBeInstanceOf(Uint8Array);
            expect(result[0]).toBe(BSON_TYPES.INT64);
            expect(result.length).toBe(9); // type(1) + int64(8)
        });

        it('should serialize floats as BSON double', () => {
            const rt = runType<number>();
            const toBSON = rt.createJitFunction(JitFunctions.toBSON);

            const result = toBSON(3.14159);
            expect(result).toBeInstanceOf(Uint8Array);
            expect(result[0]).toBe(BSON_TYPES.DOUBLE);
            expect(result.length).toBe(9); // type(1) + double(8)

            // Verify the double value
            const view = new DataView(result.buffer, result.byteOffset + 1, 8);
            expect(view.getFloat64(0, true)).toBeCloseTo(3.14159); // little-endian
        });

        it('should serialize bigint as BSON int64', () => {
            const rt = runType<bigint>();
            const toBSON = rt.createJitFunction(JitFunctions.toBSON);

            const result = toBSON(BigInt('9223372036854775807'));
            expect(result).toBeInstanceOf(Uint8Array);
            expect(result[0]).toBe(BSON_TYPES.INT64);
            expect(result.length).toBe(9); // type(1) + int64(8)

            // Verify the bigint value
            const view = new DataView(result.buffer, result.byteOffset + 1, 8);
            expect(view.getBigInt64(0, true)).toBe(BigInt('9223372036854775807')); // little-endian
        });
    });

    describe('Literal Types', () => {
        it('should serialize string literals', () => {
            const rt = runType<'hello'>();
            const toBSON = rt.createJitFunction(JitFunctions.toBSON);

            const result = toBSON('hello');
            expect(result).toBeInstanceOf(Uint8Array);
            expect(result[0]).toBe(BSON_TYPES.STRING);

            // Verify string content
            const stringBytes = result.slice(5, 5 + 5);
            const decodedString = new TextDecoder().decode(stringBytes);
            expect(decodedString).toBe('hello');
        });

        it('should serialize number literals', () => {
            const rt = runType<42>();
            const toBSON = rt.createJitFunction(JitFunctions.toBSON);

            const result = toBSON(42);
            expect(result).toBeInstanceOf(Uint8Array);
            expect(result[0]).toBe(BSON_TYPES.INT32);

            const view = new DataView(result.buffer, result.byteOffset + 1, 4);
            expect(view.getInt32(0, true)).toBe(42);
        });

        it('should serialize boolean literals', () => {
            const rt = runType<true>();
            const toBSON = rt.createJitFunction(JitFunctions.toBSON);

            const result = toBSON(true);
            expect(result).toBeInstanceOf(Uint8Array);
            expect(result[0]).toBe(BSON_TYPES.BOOLEAN);
            expect(result[1]).toBe(0x01);
        });
    });
});
