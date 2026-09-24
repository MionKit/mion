import * as TF from '@mionjs/run-types/formats';
import type {SerializationCase} from './types.ts';
import '@mionjs/run-types/formats';
import {createJsonDecoderFn, createJsonEncoderFn} from '@mionjs/run-types';

export const BIGINT_FORMAT = {
  bigint_int64: {
    title: 'TF.BigInt64',
    description:
      'JSON (de)serialization of TF.BigInt64 (bigint branded with the full int64 min/max); JSON serializes the bigint as a decimal string.',
    serializeNotes: [
      'JSON has no bigint primitive, so the wire value is the decimal string form of the bigint, restored to a bigint on decode.',
    ],
    mutateEncoder: () => createJsonEncoderFn<TF.BigInt64>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<TF.BigInt64>(undefined, {strategy: 'clone'}),
    compactEncoder: () => createJsonEncoderFn<TF.BigInt64>(undefined, {strategy: 'compact'}),
    cloneDecoder: () => createJsonDecoderFn<TF.BigInt64>(),
    mutateDecoder: () => createJsonDecoderFn<TF.BigInt64>(undefined, {strategy: 'mutate'}),
    compactDecoder: () => createJsonDecoderFn<TF.BigInt64>(undefined, {strategy: 'compact'}),
    schemaEncoder: () => createJsonEncoderFn(TF.bigInt64()),
    schemaDecoder: () => createJsonDecoderFn(TF.bigInt64()),
    getTestData: () => ({values: [10n, -9223372036854775808n, 9223372036854775807n]}),
  },
  bigint_uint64: {
    title: 'TF.BigUInt64',
    description:
      'JSON (de)serialization of TF.BigUInt64 (bigint branded with the full unsigned uint64 min/max); JSON serializes the bigint as a decimal string.',
    serializeNotes: [
      'JSON has no bigint primitive, so the wire value is the decimal string form of the bigint, restored to a bigint on decode.',
    ],
    mutateEncoder: () => createJsonEncoderFn<TF.BigUInt64>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<TF.BigUInt64>(undefined, {strategy: 'clone'}),
    compactEncoder: () => createJsonEncoderFn<TF.BigUInt64>(undefined, {strategy: 'compact'}),
    cloneDecoder: () => createJsonDecoderFn<TF.BigUInt64>(),
    mutateDecoder: () => createJsonDecoderFn<TF.BigUInt64>(undefined, {strategy: 'mutate'}),
    compactDecoder: () => createJsonDecoderFn<TF.BigUInt64>(undefined, {strategy: 'compact'}),
    schemaEncoder: () => createJsonEncoderFn(TF.bigUInt64()),
    schemaDecoder: () => createJsonDecoderFn(TF.bigUInt64()),
    getTestData: () => ({values: [0n, 10n, 18446744073709551615n]}),
  },
  bigint_positive_string: {
    title: 'TF.BigPositive',
    description:
      'JSON (de)serialization of TF.BigPositive (TF.BigInt<{min:0n}>, lower bound only); JSON serializes the bigint as a decimal string.',
    serializeNotes: [
      'JSON carries the decimal string form (no bigint primitive); the >64-bit sample proves the string form is lossless beyond the native int widths.',
    ],
    mutateEncoder: () => createJsonEncoderFn<TF.BigPositive>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<TF.BigPositive>(undefined, {strategy: 'clone'}),
    compactEncoder: () => createJsonEncoderFn<TF.BigPositive>(undefined, {strategy: 'compact'}),
    cloneDecoder: () => createJsonDecoderFn<TF.BigPositive>(),
    mutateDecoder: () => createJsonDecoderFn<TF.BigPositive>(undefined, {strategy: 'mutate'}),
    compactDecoder: () => createJsonDecoderFn<TF.BigPositive>(undefined, {strategy: 'compact'}),
    schemaEncoder: () => createJsonEncoderFn(TF.bigPositive()),
    schemaDecoder: () => createJsonDecoderFn(TF.bigPositive()),
    getTestData: () => ({values: [0n, 42n, 123456789012345678901234567890n]}),
  },
  bigint_plain_brand: {
    title: 'TF.BigInt small range',
    description:
      'JSON (de)serialization of an ad-hoc TF.BigInt<{min:0n; max:255n}> (small [0,255] range); JSON writes the decimal string.',
    serializeNotes: ['JSON carries the decimal string form (no bigint primitive).'],
    mutateEncoder: () => createJsonEncoderFn<TF.BigInt<{min: 0n; max: 255n}>>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<TF.BigInt<{min: 0n; max: 255n}>>(undefined, {strategy: 'clone'}),
    compactEncoder: () => createJsonEncoderFn<TF.BigInt<{min: 0n; max: 255n}>>(undefined, {strategy: 'compact'}),
    cloneDecoder: () => createJsonDecoderFn<TF.BigInt<{min: 0n; max: 255n}>>(),
    mutateDecoder: () => createJsonDecoderFn<TF.BigInt<{min: 0n; max: 255n}>>(undefined, {strategy: 'mutate'}),
    compactDecoder: () => createJsonDecoderFn<TF.BigInt<{min: 0n; max: 255n}>>(undefined, {strategy: 'compact'}),
    schemaEncoder: () => createJsonEncoderFn(TF.bigInt({min: 0n, max: 255n})),
    schemaDecoder: () => createJsonDecoderFn(TF.bigInt({min: 0n, max: 255n})),
    getTestData: () => ({values: [0n, 128n, 255n]}),
  },
} as const satisfies Record<string, SerializationCase>;
