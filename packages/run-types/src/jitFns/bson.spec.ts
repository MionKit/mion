/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {runType} from '../lib/runType';
import {JitFunctions} from '../constants.functions';
import {BSONWriter, BSONReader, BSON_TYPES as BSON_TYPES_CLASS} from './bsonUtils';
import * as PureBSON from './bsonPureFunctions';

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

    describe('Edge Cases', () => {
        it('should handle empty strings', () => {
            const rt = runType<string>();
            const toBSON = rt.createJitFunction(JitFunctions.toBSON);

            const result = toBSON('');
            expect(result).toBeInstanceOf(Uint8Array);
            expect(result[0]).toBe(BSON_TYPES.STRING);

            // Empty string should have length 1 (just null terminator)
            const view = new DataView(result.buffer, result.byteOffset + 1, 4);
            const stringLength = view.getInt32(0, true);
            expect(stringLength).toBe(1);

            // Total length: type(1) + length(4) + null(1) = 6
            expect(result.length).toBe(6);
        });

        it('should handle Unicode strings', () => {
            const rt = runType<string>();
            const toBSON = rt.createJitFunction(JitFunctions.toBSON);

            const unicodeString = 'Hello 世界 🌍';
            const result = toBSON(unicodeString);
            expect(result).toBeInstanceOf(Uint8Array);
            expect(result[0]).toBe(BSON_TYPES.STRING);

            // Verify we can decode the string back
            const utf8Bytes = new TextEncoder().encode(unicodeString);
            const view = new DataView(result.buffer, result.byteOffset + 1, 4);
            const stringLength = view.getInt32(0, true);
            expect(stringLength).toBe(utf8Bytes.length + 1); // +1 for null terminator

            const stringBytes = result.slice(5, 5 + utf8Bytes.length);
            const decodedString = new TextDecoder().decode(stringBytes);
            expect(decodedString).toBe(unicodeString);
        });

        it('should handle negative numbers correctly', () => {
            const rt = runType<number>();
            const toBSON = rt.createJitFunction(JitFunctions.toBSON);

            const result = toBSON(-42);
            expect(result).toBeInstanceOf(Uint8Array);
            expect(result[0]).toBe(BSON_TYPES.INT32);

            const view = new DataView(result.buffer, result.byteOffset + 1, 4);
            expect(view.getInt32(0, true)).toBe(-42);
        });

        it('should handle zero correctly', () => {
            const rt = runType<number>();
            const toBSON = rt.createJitFunction(JitFunctions.toBSON);

            const result = toBSON(0);
            expect(result).toBeInstanceOf(Uint8Array);
            expect(result[0]).toBe(BSON_TYPES.INT32);

            const view = new DataView(result.buffer, result.byteOffset + 1, 4);
            expect(view.getInt32(0, true)).toBe(0);
        });

        it('should handle very large bigints', () => {
            const rt = runType<bigint>();
            const toBSON = rt.createJitFunction(JitFunctions.toBSON);

            const largeBigInt = BigInt('18446744073709551615'); // Max uint64
            const result = toBSON(largeBigInt);
            expect(result).toBeInstanceOf(Uint8Array);
            expect(result[0]).toBe(BSON_TYPES.INT64);

            const view = new DataView(result.buffer, result.byteOffset + 1, 8);
            expect(view.getBigUint64(0, true)).toBe(largeBigInt);
        });
    });

    describe('Reference Implementations', () => {
        describe('Class-based BSONWriter/BSONReader', () => {
            it('should write and read basic types', () => {
                const writer = new BSONWriter();

                // Write different types
                writer.writeUInt8(BSON_TYPES_CLASS.STRING);
                writer.writeString('hello');
                writer.writeUInt8(BSON_TYPES_CLASS.INT32);
                writer.writeInt32LE(42);
                writer.writeUInt8(BSON_TYPES_CLASS.BOOLEAN);
                writer.writeUInt8(1);

                const buffer = writer.getBuffer();
                const reader = new BSONReader(buffer);

                // Read back
                expect(reader.readUInt8()).toBe(BSON_TYPES_CLASS.STRING);
                expect(reader.readString()).toBe('hello');
                expect(reader.readUInt8()).toBe(BSON_TYPES_CLASS.INT32);
                expect(reader.readInt32LE()).toBe(42);
                expect(reader.readUInt8()).toBe(BSON_TYPES_CLASS.BOOLEAN);
                expect(reader.readUInt8()).toBe(1);
            });
        });

        describe('Pure Functional BSON', () => {
            it('should write and read basic types functionally', () => {
                let ctx = PureBSON.createBSONContext();

                // Write different types
                let result = PureBSON.writeUInt8(ctx, BSON_TYPES.STRING);
                ctx = result.context;

                result = PureBSON.writeBSONString(ctx, 'hello');
                ctx = result.context;

                result = PureBSON.writeUInt8(ctx, BSON_TYPES.INT32);
                ctx = result.context;

                result = PureBSON.writeInt32LE(ctx, 42);
                ctx = result.context;

                result = PureBSON.writeUInt8(ctx, BSON_TYPES.BOOLEAN);
                ctx = result.context;

                result = PureBSON.writeUInt8(ctx, 1);
                ctx = result.context;

                const buffer = PureBSON.getBuffer(ctx);

                // Read back
                let readCtx: PureBSON.BSONContext = {buffer, position: 0};

                let readResult = PureBSON.readUInt8(readCtx);
                expect(readResult.value).toBe(BSON_TYPES.STRING);
                readCtx = readResult.context;

                const stringResult = PureBSON.readBSONString(readCtx);
                expect(stringResult.value).toBe('hello');
                readCtx = stringResult.context;

                readResult = PureBSON.readUInt8(readCtx);
                expect(readResult.value).toBe(BSON_TYPES.INT32);
                readCtx = readResult.context;

                const intResult = PureBSON.readInt32LE(readCtx);
                expect(intResult.value).toBe(42);
                readCtx = intResult.context;

                readResult = PureBSON.readUInt8(readCtx);
                expect(readResult.value).toBe(BSON_TYPES.BOOLEAN);
                readCtx = readResult.context;

                readResult = PureBSON.readUInt8(readCtx);
                expect(readResult.value).toBe(1);
            });

            it('should handle buffer growth in pure functions', () => {
                let ctx = PureBSON.createBSONContext(10); // Small initial size
                const largeString = 'x'.repeat(1000);

                const result = PureBSON.writeBSONString(ctx, largeString);
                ctx = result.context;

                expect(ctx.buffer.length).toBeGreaterThan(1000);
                expect(result.bytesWritten).toBe(4 + 1000 + 1); // length + string + null

                // Verify we can read it back
                const readCtx: PureBSON.BSONContext = {buffer: PureBSON.getBuffer(ctx), position: 0};
                const stringResult = PureBSON.readBSONString(readCtx);
                expect(stringResult.value).toBe(largeString);
            });
        });
    });
});
