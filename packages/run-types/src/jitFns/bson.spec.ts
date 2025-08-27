/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {runType} from '../lib/runType';
import {BSON_TYPES, BSONWriter, BSONReader} from './bsonUtils';
import {JitFunctions} from '../constants.functions';

describe('BSON Utilities', () => {
    describe('BSONWriter', () => {
        it('should write basic types correctly', () => {
            const writer = new BSONWriter();

            // Test writing different types
            writer.writeUInt8(0x01);
            writer.writeInt32LE(42);
            writer.writeDoubleLE(3.14159);
            writer.writeCString('hello');
            writer.writeString('world');

            const buffer = writer.getBuffer();
            expect(buffer.length).toBeGreaterThan(0);
        });

        it('should handle buffer growth', () => {
            const writer = new BSONWriter(10); // Small initial size
            const largeString = 'x'.repeat(1000);
            writer.writeString(largeString);

            const buffer = writer.getBuffer();
            expect(buffer.length).toBeGreaterThan(1000);
        });
    });

    describe('BSONReader', () => {
        it('should read what BSONWriter writes', () => {
            const writer = new BSONWriter();
            writer.writeUInt8(0x42);
            writer.writeInt32LE(-123456);
            writer.writeDoubleLE(2.718281828);
            writer.writeCString('test');
            writer.writeString('hello world');

            const buffer = writer.getBuffer();
            const reader = new BSONReader(buffer);

            expect(reader.readUInt8()).toBe(0x42);
            expect(reader.readInt32LE()).toBe(-123456);
            expect(reader.readDoubleLE()).toBeCloseTo(2.718281828);
            expect(reader.readCString()).toBe('test');
            expect(reader.readString()).toBe('hello world');
        });

        it('should handle buffer underrun errors', () => {
            const buffer = new Uint8Array([0x01, 0x02]);
            const reader = new BSONReader(buffer);

            reader.readUInt8(); // OK
            reader.readUInt8(); // OK

            expect(() => reader.readUInt8()).toThrow('BSON buffer underrun');
            expect(() => reader.readInt32LE()).toThrow('BSON buffer underrun');
        });
    });

    describe('BSON Constants', () => {
        it('should have correct BSON type values', () => {
            expect(BSON_TYPES.DOUBLE).toBe(0x01);
            expect(BSON_TYPES.STRING).toBe(0x02);
            expect(BSON_TYPES.DOCUMENT).toBe(0x03);
            expect(BSON_TYPES.ARRAY).toBe(0x04);
            expect(BSON_TYPES.BINARY).toBe(0x05);
            expect(BSON_TYPES.BOOLEAN).toBe(0x08);
            expect(BSON_TYPES.NULL).toBe(0x0a);
            expect(BSON_TYPES.INT32).toBe(0x10);
            expect(BSON_TYPES.INT64).toBe(0x12);
        });
    });
});

describe('BSON Atomic Types Serialization', () => {
    describe('null and undefined', () => {
        it('should serialize null to BSON null type', () => {
            const rt = runType<null>();
            const toBSON = rt.createJitFunction(JitFunctions.toBSON);

            const result = toBSON(null);
            expect(result).toBeInstanceOf(Uint8Array);
            expect(result[0]).toBe(BSON_TYPES.NULL);
        });
    });

    describe('boolean', () => {
        it('should serialize true/false to BSON boolean', () => {
            const rt = runType<boolean>();
            const toBSON = rt.createJitFunction(JitFunctions.toBSON);

            const trueResult = toBSON(true);
            expect(trueResult).toBeInstanceOf(Uint8Array);
            expect(trueResult[0]).toBe(BSON_TYPES.BOOLEAN);
            expect(trueResult[1]).toBe(0x01);

            const falseResult = toBSON(false);
            expect(falseResult).toBeInstanceOf(Uint8Array);
            expect(falseResult[0]).toBe(BSON_TYPES.BOOLEAN);
            expect(falseResult[1]).toBe(0x00);
        });
    });

    describe('numbers', () => {
        it('should serialize integers as BSON int32 when in range', () => {
            const rt = runType<number>();
            const toBSON = rt.createJitFunction(JitFunctions.toBSON);

            const result = toBSON(42);
            expect(result).toBeInstanceOf(Uint8Array);
            expect(result[0]).toBe(BSON_TYPES.INT32);

            // Verify the int32 value
            const view = new DataView(result.buffer, result.byteOffset);
            expect(view.getInt32(1, true)).toBe(42); // little-endian
        });

        it('should serialize large integers as BSON int64', () => {
            const rt = runType<number>();
            const toBSON = rt.createJitFunction(JitFunctions.toBSON);

            const largeInt = 2147483648; // Larger than int32 max
            const result = toBSON(largeInt);
            expect(result).toBeInstanceOf(Uint8Array);
            expect(result[0]).toBe(BSON_TYPES.INT64);
        });

        it('should serialize floats as BSON double', () => {
            const rt = runType<number>();
            const toBSON = rt.createJitFunction(JitFunctions.toBSON);

            const result = toBSON(3.14159);
            expect(result).toBeInstanceOf(Uint8Array);
            expect(result[0]).toBe(BSON_TYPES.DOUBLE);

            // Verify the double value
            const view = new DataView(result.buffer, result.byteOffset);
            expect(view.getFloat64(1, true)).toBeCloseTo(3.14159); // little-endian
        });
    });

    describe('strings', () => {
        it('should serialize strings with UTF-8 encoding', () => {
            const rt = runType<string>();
            const toBSON = rt.createJitFunction(JitFunctions.toBSON);

            const result = toBSON('hello');
            expect(result).toBeInstanceOf(Uint8Array);
            expect(result[0]).toBe(BSON_TYPES.STRING);

            // Verify string length and content
            const view = new DataView(result.buffer, result.byteOffset);
            const stringLength = view.getInt32(1, true); // little-endian
            expect(stringLength).toBe(6); // 'hello' + null terminator

            const stringBytes = result.slice(5, 5 + stringLength - 1);
            const decodedString = new TextDecoder().decode(stringBytes);
            expect(decodedString).toBe('hello');
        });

        it('should handle empty strings', () => {
            const rt = runType<string>();
            const toBSON = rt.createJitFunction(JitFunctions.toBSON);

            const result = toBSON('');
            expect(result).toBeInstanceOf(Uint8Array);
            expect(result[0]).toBe(BSON_TYPES.STRING);

            const view = new DataView(result.buffer, result.byteOffset);
            const stringLength = view.getInt32(1, true);
            expect(stringLength).toBe(1); // Just null terminator
        });

        it('should handle unicode characters', () => {
            const rt = runType<string>();
            const toBSON = rt.createJitFunction(JitFunctions.toBSON);

            const unicodeString = '🚀 Hello 世界';
            const result = toBSON(unicodeString);
            expect(result).toBeInstanceOf(Uint8Array);
            expect(result[0]).toBe(BSON_TYPES.STRING);

            // Verify UTF-8 encoding
            const view = new DataView(result.buffer, result.byteOffset);
            const stringLength = view.getInt32(1, true);
            const stringBytes = result.slice(5, 5 + stringLength - 1);
            const decodedString = new TextDecoder().decode(stringBytes);
            expect(decodedString).toBe(unicodeString);
        });
    });

    describe('bigint', () => {
        it('should serialize bigint as BSON int64', () => {
            const rt = runType<bigint>();
            const toBSON = rt.createJitFunction(JitFunctions.toBSON);

            const result = toBSON(BigInt('9223372036854775807'));
            expect(result).toBeInstanceOf(Uint8Array);
            expect(result[0]).toBe(BSON_TYPES.INT64);

            // Verify the bigint value
            const view = new DataView(result.buffer, result.byteOffset);
            const readValue = view.getBigInt64(1, true); // little-endian
            expect(readValue).toBe(BigInt('9223372036854775807'));
        });
    });
});

describe('BSON Simple Collections', () => {
    describe('arrays', () => {
        it('should serialize arrays of atomic types', () => {
            const rt = runType<number[]>();
            const toBSON = rt.createJitFunction(JitFunctions.toBSON);

            const result = toBSON([1, 2, 3]);
            expect(result).toBeInstanceOf(Uint8Array);
            expect(result[0]).toBe(BSON_TYPES.ARRAY);
        });

        it('should handle empty arrays', () => {
            const rt = runType<string[]>();
            const toBSON = rt.createJitFunction(JitFunctions.toBSON);

            const result = toBSON([]);
            expect(result).toBeInstanceOf(Uint8Array);
            expect(result[0]).toBe(BSON_TYPES.ARRAY);
        });
    });

    describe('simple objects', () => {
        it('should serialize simple objects with atomic properties', () => {
            const rt = runType<{name: string; age: number}>();
            const toBSON = rt.createJitFunction(JitFunctions.toBSON);

            const result = toBSON({name: 'John', age: 30});
            expect(result).toBeInstanceOf(Uint8Array);
            expect(result[0]).toBe(BSON_TYPES.DOCUMENT);
        });

        it('should handle empty objects', () => {
            const rt = runType<Record<string, never>>();
            const toBSON = rt.createJitFunction(JitFunctions.toBSON);

            const result = toBSON({});
            expect(result).toBeInstanceOf(Uint8Array);
            expect(result[0]).toBe(BSON_TYPES.DOCUMENT);
        });
    });

    describe('literal types', () => {
        it('should serialize string literals', () => {
            const rt = runType<'hello'>();
            const toBSON = rt.createJitFunction(JitFunctions.toBSON);

            const result = toBSON('hello');
            expect(result).toBeInstanceOf(Uint8Array);
            expect(result[0]).toBe(BSON_TYPES.STRING);
        });

        it('should serialize number literals', () => {
            const rt = runType<42>();
            const toBSON = rt.createJitFunction(JitFunctions.toBSON);

            const result = toBSON(42);
            expect(result).toBeInstanceOf(Uint8Array);
            expect(result[0]).toBe(BSON_TYPES.INT32);
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
