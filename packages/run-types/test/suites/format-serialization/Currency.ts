// Currency serialization cases — isCurrency is presentation metadata, so JSON writes the plain number.
import * as TF from '@mionjs/run-types/formats';
import type {SerializationCase} from './types.ts';
import '@mionjs/run-types/formats';
import {createJsonDecoderFn, createJsonEncoderFn} from '@mionjs/run-types';

export const CURRENCY = {
  currency_amount: {
    title: 'Currency amount',
    description: 'JSON (de)serialization of an unconstrained TF.Currency; JSON writes the plain number.',
    serializeNotes: ['The isCurrency mark never touches the wire — values serialize exactly like the equivalent plain number.'],
    mutateEncoder: () => createJsonEncoderFn<TF.Currency>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<TF.Currency>(undefined, {strategy: 'clone'}),
    compactEncoder: () => createJsonEncoderFn<TF.Currency>(undefined, {strategy: 'compact'}),
    cloneDecoder: () => createJsonDecoderFn<TF.Currency>(),
    mutateDecoder: () => createJsonDecoderFn<TF.Currency>(undefined, {strategy: 'mutate'}),
    compactDecoder: () => createJsonDecoderFn<TF.Currency>(undefined, {strategy: 'compact'}),
    schemaEncoder: () => createJsonEncoderFn(TF.currency()),
    schemaDecoder: () => createJsonDecoderFn(TF.currency()),
    getTestData: () => ({values: [19.99, 0, -1234.56]}),
  },
} as const satisfies Record<string, SerializationCase>;
