import * as TF from '@mionjs/run-types/formats';
import type {SerializationCase} from './types.ts';
import '@mionjs/run-types/formats';
import {createJsonDecoderFn, createJsonEncoderFn} from '@mionjs/run-types';

export const NUMBER_FORMAT = {
  number_integer: {
    title: 'Integer',
    description:
      'JSON (de)serialization of TF.Integer (number branded {integer:true}, no min/max); JSON writes the plain number, with samples including MAX_SAFE_INTEGER / MIN_SAFE_INTEGER.',
    mutateEncoder: () => createJsonEncoderFn<TF.Integer>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<TF.Integer>(undefined, {strategy: 'clone'}),
    compactEncoder: () => createJsonEncoderFn<TF.Integer>(undefined, {strategy: 'compact'}),
    cloneDecoder: () => createJsonDecoderFn<TF.Integer>(),
    mutateDecoder: () => createJsonDecoderFn<TF.Integer>(undefined, {strategy: 'mutate'}),
    compactDecoder: () => createJsonDecoderFn<TF.Integer>(undefined, {strategy: 'compact'}),
    schemaEncoder: () => createJsonEncoderFn(TF.integer()),
    schemaDecoder: () => createJsonDecoderFn(TF.integer()),
    getTestData: () => ({values: [10, Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER]}),
  },
  number_float: {
    title: 'Float',
    description:
      'JSON (de)serialization of TF.Float (number branded {float:true}); JSON writes the plain number, with samples including a negative and an exponent literal (1.23e10).',
    mutateEncoder: () => createJsonEncoderFn<TF.Float>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<TF.Float>(undefined, {strategy: 'clone'}),
    compactEncoder: () => createJsonEncoderFn<TF.Float>(undefined, {strategy: 'compact'}),
    cloneDecoder: () => createJsonDecoderFn<TF.Float>(),
    mutateDecoder: () => createJsonDecoderFn<TF.Float>(undefined, {strategy: 'mutate'}),
    compactDecoder: () => createJsonDecoderFn<TF.Float>(undefined, {strategy: 'compact'}),
    schemaEncoder: () => createJsonEncoderFn(TF.float()),
    schemaDecoder: () => createJsonDecoderFn(TF.float()),
    getTestData: () => ({values: [10.5, -3.14, 1.23e10]}),
  },
} as const satisfies Record<string, SerializationCase>;
