import * as TF from '@mionjs/run-types/formats';
import type {SerializationCase} from './types.ts';
import '@mionjs/run-types/formats';
import {createJsonDecoderFn, createJsonEncoderFn} from '@mionjs/run-types';

export const BIGINT_FORMAT = {
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
} as const satisfies Record<string, SerializationCase>;
