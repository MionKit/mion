/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {describe, it, expect} from 'vitest';
import {createBinaryEncoder, createBinaryDecoder} from '@mionjs/run-types';
import {FormatBigInt64, FormatBigUInt64} from '../../BigintFormats.ts';

// ts-runtypes migration: the old runType<T>() + createJitFunction(toBinary/fromBinary) +
// DataViewSerializer plumbing is replaced by createBinaryEncoder<T>() / createBinaryDecoder<T>()
// (the encoder sizes its own buffer and returns a Uint8Array view of the exact written bytes).

describe('BigInt Binary Serialization', () => {
    it('FormatBigInt64 uses 8 bytes for signed 64-bit integers', async () => {
        const toBinary = createBinaryEncoder<FormatBigInt64>();
        const fromBinary = createBinaryDecoder<FormatBigInt64>();
        const buffer = toBinary(10n);
        expect(buffer.byteLength).toBe(8);
        expect(fromBinary(buffer)).toBe(10n);
    });

    it('FormatBigInt64 handles negative values', async () => {
        const toBinary = createBinaryEncoder<FormatBigInt64>();
        const fromBinary = createBinaryDecoder<FormatBigInt64>();
        const buffer = toBinary(-9223372036854775808n); // min Int64
        expect(buffer.byteLength).toBe(8);
        expect(fromBinary(buffer)).toBe(-9223372036854775808n);
    });

    it('FormatBigInt64 handles max positive value', async () => {
        const toBinary = createBinaryEncoder<FormatBigInt64>();
        const fromBinary = createBinaryDecoder<FormatBigInt64>();
        const buffer = toBinary(9223372036854775807n); // max Int64
        expect(buffer.byteLength).toBe(8);
        expect(fromBinary(buffer)).toBe(9223372036854775807n);
    });

    it('FormatBigUInt64 uses 8 bytes for unsigned 64-bit integers', async () => {
        const toBinary = createBinaryEncoder<FormatBigUInt64>();
        const fromBinary = createBinaryDecoder<FormatBigUInt64>();
        const buffer = toBinary(10n);
        expect(buffer.byteLength).toBe(8);
        expect(fromBinary(buffer)).toBe(10n);
    });

    it('FormatBigUInt64 handles max unsigned value', async () => {
        const toBinary = createBinaryEncoder<FormatBigUInt64>();
        const fromBinary = createBinaryDecoder<FormatBigUInt64>();
        const buffer = toBinary(18446744073709551615n); // max UInt64
        expect(buffer.byteLength).toBe(8);
        expect(fromBinary(buffer)).toBe(18446744073709551615n);
    });

    it('FormatBigUInt64 handles zero', async () => {
        const toBinary = createBinaryEncoder<FormatBigUInt64>();
        const fromBinary = createBinaryDecoder<FormatBigUInt64>();
        const buffer = toBinary(0n);
        expect(buffer.byteLength).toBe(8);
        expect(fromBinary(buffer)).toBe(0n);
    });

    // Test plain bigint without any format (should use default string serialization)
    it('Plain bigint uses string serialization', async () => {
        const toBinary = createBinaryEncoder<bigint>();
        const fromBinary = createBinaryDecoder<bigint>();
        const buffer = toBinary(12345n);
        // new wire format: 1-byte varint length prefix + 5 utf8 digits of '12345'
        // (old assertion was byteLength > 8; the string arm is now more compact, still not 8-byte packing)
        expect(buffer.byteLength).toBe(6);
        expect(fromBinary(buffer)).toBe(12345n);
    });
});
