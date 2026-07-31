import * as TF from '@ts-runtypes/core/formats';
import type {SerializationCase} from './types.ts';
import '@ts-runtypes/core/formats';
import {createBinaryDecoderFn, createBinaryEncoderFn, createJsonDecoderFn, createJsonEncoderFn} from '@ts-runtypes/core';

export const BIGINT_FORMAT = {
  bigint_int64: {
    title: 'TF.BigInt64',
    description:
      'JSON + binary (de)serialization of TF.BigInt64 (bigint branded with the full int64 min/max); the signed 64-bit bounds select an 8-byte setBigInt64 binary packing while JSON serializes the bigint as a decimal string.',
    serializeNotes: [
      'Format-aware binary width: int64 bounds pack each bigint into exactly 8 bytes via setBigInt64 (getBinaryByteSizes [8,8,8]).',
      'JSON has no bigint primitive, so the wire value is the decimal string form of the bigint, restored to a bigint on decode.',
    ],
    mutateEncoder: () => createJsonEncoderFn<TF.BigInt64>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<TF.BigInt64>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoderFn<TF.BigInt64>(undefined, {strategy: 'direct'}),
    compactEncoder: () => createJsonEncoderFn<TF.BigInt64>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoderFn<TF.BigInt64>(),
    preserveDecoder: () => createJsonDecoderFn<TF.BigInt64>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoderFn<TF.BigInt64>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoderFn<TF.BigInt64>(),
    binaryDecoder: () => createBinaryDecoderFn<TF.BigInt64>(),
    schemaEncoder: () => createJsonEncoderFn(TF.bigInt64()),
    schemaDecoder: () => createJsonDecoderFn(TF.bigInt64()),
    schemaBinaryEncoder: () => createBinaryEncoderFn(TF.bigInt64()),
    schemaBinaryDecoder: () => createBinaryDecoderFn(TF.bigInt64()),
    getTestData: () => ({values: [10n, -9223372036854775808n, 9223372036854775807n]}),
    getBinaryByteSizes: () => [8, 8, 8],
    // JSON serializes bigint as a decimal string and restores it; the
    // round-trip is exercised via the binary half above, but JSON must
    // still round-trip — bigint stringifies to its decimal form.
  },
  bigint_uint64: {
    title: 'TF.BigUInt64',
    description:
      'JSON + binary (de)serialization of TF.BigUInt64 (bigint branded with the full unsigned uint64 min/max); the unsigned 64-bit bounds select an 8-byte setBigUint64 binary packing while JSON serializes the bigint as a decimal string.',
    serializeNotes: [
      'Format-aware binary width: uint64 bounds pack each bigint into exactly 8 bytes via setBigUint64 (getBinaryByteSizes [8,8,8]); uint64 packing takes precedence over int64 when both fit.',
      'JSON has no bigint primitive, so the wire value is the decimal string form of the bigint, restored to a bigint on decode.',
    ],
    mutateEncoder: () => createJsonEncoderFn<TF.BigUInt64>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<TF.BigUInt64>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoderFn<TF.BigUInt64>(undefined, {strategy: 'direct'}),
    compactEncoder: () => createJsonEncoderFn<TF.BigUInt64>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoderFn<TF.BigUInt64>(),
    preserveDecoder: () => createJsonDecoderFn<TF.BigUInt64>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoderFn<TF.BigUInt64>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoderFn<TF.BigUInt64>(),
    binaryDecoder: () => createBinaryDecoderFn<TF.BigUInt64>(),
    schemaEncoder: () => createJsonEncoderFn(TF.bigUInt64()),
    schemaDecoder: () => createJsonDecoderFn(TF.bigUInt64()),
    schemaBinaryEncoder: () => createBinaryEncoderFn(TF.bigUInt64()),
    schemaBinaryDecoder: () => createBinaryDecoderFn(TF.bigUInt64()),
    getTestData: () => ({values: [0n, 10n, 18446744073709551615n]}),
    getBinaryByteSizes: () => [8, 8, 8],
  },
  bigint_positive_string: {
    title: 'TF.BigPositive',
    description:
      'JSON + binary (de)serialization of TF.BigPositive (TF.BigInt<{min:0n}>, lower bound only); with no max, neither the int64 nor uint64 width can be selected, so BINARY ALSO falls back to the decimal-string serialization (variable length).',
    serializeNotes: [
      'No fixed binary width: setBigInt64/setBigUint64 require BOTH min and max, so an unbounded-above bigint packs as a variable-length decimal string in binary too — hence no getBinaryByteSizes.',
      'JSON likewise carries the decimal string form (no bigint primitive); the >64-bit sample proves the string fallback is lossless beyond the native int widths.',
    ],
    mutateEncoder: () => createJsonEncoderFn<TF.BigPositive>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<TF.BigPositive>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoderFn<TF.BigPositive>(undefined, {strategy: 'direct'}),
    compactEncoder: () => createJsonEncoderFn<TF.BigPositive>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoderFn<TF.BigPositive>(),
    preserveDecoder: () => createJsonDecoderFn<TF.BigPositive>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoderFn<TF.BigPositive>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoderFn<TF.BigPositive>(),
    binaryDecoder: () => createBinaryDecoderFn<TF.BigPositive>(),
    schemaEncoder: () => createJsonEncoderFn(TF.bigPositive()),
    schemaDecoder: () => createJsonDecoderFn(TF.bigPositive()),
    schemaBinaryEncoder: () => createBinaryEncoderFn(TF.bigPositive()),
    schemaBinaryDecoder: () => createBinaryDecoderFn(TF.bigPositive()),
    getTestData: () => ({values: [0n, 42n, 123456789012345678901234567890n]}),
    // No getBinaryByteSizes — string encoding is variable-length.
  },
  bigint_plain_brand: {
    title: 'TF.BigInt small range',
    description:
      'JSON + binary (de)serialization of an ad-hoc TF.BigInt<{min:0n; max:255n}> (small [0,255] range); unlike the number formats, bigint has NO sub-8-byte path, so even this tiny range packs the full 8 bytes via setBigUint64 while JSON writes the decimal string.',
    serializeNotes: [
      'TS DIVERGENCE from the number widths: [0,255] picks a 1-byte width for TF.UInt8 but a bigint always uses the 8-byte int64/uint64 packing — bigint binary has only the 8-byte path and a variable-length string fallback, nothing narrower (getBinaryByteSizes [8,8,8]).',
      'JSON carries the decimal string form (no bigint primitive).',
    ],
    mutateEncoder: () => createJsonEncoderFn<TF.BigInt<{min: 0n; max: 255n}>>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<TF.BigInt<{min: 0n; max: 255n}>>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoderFn<TF.BigInt<{min: 0n; max: 255n}>>(undefined, {strategy: 'direct'}),
    compactEncoder: () => createJsonEncoderFn<TF.BigInt<{min: 0n; max: 255n}>>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoderFn<TF.BigInt<{min: 0n; max: 255n}>>(),
    preserveDecoder: () => createJsonDecoderFn<TF.BigInt<{min: 0n; max: 255n}>>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoderFn<TF.BigInt<{min: 0n; max: 255n}>>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoderFn<TF.BigInt<{min: 0n; max: 255n}>>(),
    binaryDecoder: () => createBinaryDecoderFn<TF.BigInt<{min: 0n; max: 255n}>>(),
    schemaEncoder: () => createJsonEncoderFn(TF.bigInt({min: 0n, max: 255n})),
    schemaDecoder: () => createJsonDecoderFn(TF.bigInt({min: 0n, max: 255n})),
    schemaBinaryEncoder: () => createBinaryEncoderFn(TF.bigInt({min: 0n, max: 255n})),
    schemaBinaryDecoder: () => createBinaryDecoderFn(TF.bigInt({min: 0n, max: 255n})),
    getTestData: () => ({values: [0n, 128n, 255n]}),
    getBinaryByteSizes: () => [8, 8, 8],
  },
} as const satisfies Record<string, SerializationCase>;
