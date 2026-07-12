/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {it, expect} from 'vitest';
import {createBinaryEncoder, createBinaryDecoder} from '@mionjs/run-types';
import {
    FormatInteger,
    FormatFloat,
    FormatPositive,
    FormatNegative,
    FormatPositiveInt,
    FormatNegativeInt,
    FormatInt8,
    FormatInt16,
    FormatInt32,
    FormatUInt8,
    FormatUInt16,
    FormatUInt32,
} from '../../NumberFormats.ts';

// ts-runtypes migration: the old runType<T>() + createJitFunction(toBinary/fromBinary) +
// DataViewSerializer plumbing is replaced by createBinaryEncoder<T>() / createBinaryDecoder<T>()
// (the encoder sizes its own buffer and returns a Uint8Array view of the exact written bytes).

it('FormatInteger uses 8 bytes as MAX_SAFE_INTEGER does not fit in 4 bytes', async () => {
    const toBinary = createBinaryEncoder<FormatInteger>();
    const fromBinary = createBinaryDecoder<FormatInteger>();
    const buffer = toBinary(10);
    expect(buffer.byteLength).toBe(8);
    expect(fromBinary(buffer)).toBe(10);
});

it('FormatFloat uses 8 bytes', async () => {
    const toBinary = createBinaryEncoder<FormatFloat>();
    const fromBinary = createBinaryDecoder<FormatFloat>();
    const buffer = toBinary(10.5);
    expect(buffer.byteLength).toBe(8);
    expect(fromBinary(buffer)).toBe(10.5);
});

it('FormatPositive uses 8 bytes as we do not know if it could be integer or float', async () => {
    const toBinary = createBinaryEncoder<FormatPositive>();
    const fromBinary = createBinaryDecoder<FormatPositive>();
    const buffer = toBinary(10.5);
    expect(buffer.byteLength).toBe(8);
    expect(fromBinary(buffer)).toBe(10.5);
});

it('FormatNegative uses 8 bytes as we do not know if it could be integer or float', async () => {
    const toBinary = createBinaryEncoder<FormatNegative>();
    const fromBinary = createBinaryDecoder<FormatNegative>();
    const buffer = toBinary(-10.5);
    expect(buffer.byteLength).toBe(8);
    expect(fromBinary(buffer)).toBe(-10.5);
});

it('FormatPositiveInt uses 8 bytes as MAX_SAFE_INTEGER does not fit in 4 bytes', async () => {
    const toBinary = createBinaryEncoder<FormatPositiveInt>();
    const fromBinary = createBinaryDecoder<FormatPositiveInt>();
    const buffer = toBinary(Number.MAX_SAFE_INTEGER);
    expect(buffer.byteLength).toBe(8);
    expect(fromBinary(buffer)).toBe(Number.MAX_SAFE_INTEGER);
});

it('FormatNegativeInt uses 8 bytes as MIN_SAFE_INTEGER does not fit in 4 bytes', async () => {
    const toBinary = createBinaryEncoder<FormatNegativeInt>();
    const fromBinary = createBinaryDecoder<FormatNegativeInt>();
    const buffer = toBinary(Number.MIN_SAFE_INTEGER);
    expect(buffer.byteLength).toBe(8);
    expect(fromBinary(buffer)).toBe(Number.MIN_SAFE_INTEGER);
});

// SERIALIZAION/DESERIALIZATION DOES NOT CHECK CORRECTNESS OF THE VALUE, that should be checked before serialization/deserialization
// so passing wrong number here could send incorrect values

it('FormatInt8 uses 1 byte', async () => {
    const toBinary = createBinaryEncoder<FormatInt8>();
    const fromBinary = createBinaryDecoder<FormatInt8>();
    const buffer = toBinary(10);
    expect(buffer.byteLength).toBe(1);
    expect(fromBinary(buffer)).toBe(10);
});

it('FormatInt16 uses 2 bytes', async () => {
    const toBinary = createBinaryEncoder<FormatInt16>();
    const fromBinary = createBinaryDecoder<FormatInt16>();
    const buffer = toBinary(10);
    expect(buffer.byteLength).toBe(2);
    expect(fromBinary(buffer)).toBe(10);
});

it('FormatInt32 uses 4 bytes', async () => {
    const toBinary = createBinaryEncoder<FormatInt32>();
    const fromBinary = createBinaryDecoder<FormatInt32>();
    const buffer = toBinary(10);
    expect(buffer.byteLength).toBe(4);
    expect(fromBinary(buffer)).toBe(10);
});

it('FormatUInt8 uses 1 byte', async () => {
    const toBinary = createBinaryEncoder<FormatUInt8>();
    const fromBinary = createBinaryDecoder<FormatUInt8>();
    const buffer = toBinary(10);
    expect(buffer.byteLength).toBe(1);
    expect(fromBinary(buffer)).toBe(10);
});

it('FormatUInt16 uses 2 bytes', async () => {
    const toBinary = createBinaryEncoder<FormatUInt16>();
    const fromBinary = createBinaryDecoder<FormatUInt16>();
    const buffer = toBinary(10);
    expect(buffer.byteLength).toBe(2);
    expect(fromBinary(buffer)).toBe(10);
});

it('FormatUInt32 correct length and roundtrip', async () => {
    const toBinary = createBinaryEncoder<FormatUInt32>();
    const fromBinary = createBinaryDecoder<FormatUInt32>();
    const buffer = toBinary(10);
    expect(buffer.byteLength).toBe(4);
    expect(fromBinary(buffer)).toBe(10);
});
