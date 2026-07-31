// Currency serialization cases — isCurrency is presentation metadata, so the
// wire behaviour is the plain number family's: JSON writes the plain number;
// binary uses the numberFormat integer ladder, so integer minor-unit bounds
// pack into the narrowest int and an unconstrained amount rides the base
// float64 arm.
import * as TF from '@ts-runtypes/core/formats';
import type {SerializationCase} from './types.ts';
import '@ts-runtypes/core/formats';
import {createBinaryDecoderFn, createBinaryEncoderFn, createJsonDecoderFn, createJsonEncoderFn} from '@ts-runtypes/core';

export const CURRENCY = {
  currency_amount: {
    title: 'Currency amount (float64)',
    description:
      'JSON + binary (de)serialization of an unconstrained TF.Currency; no integer bounds, so binary rides the base 8-byte float64 arm while JSON writes the plain number.',
    serializeNotes: 'The isCurrency mark never touches the wire — values serialize exactly like the equivalent plain number.',
    mutateEncoder: () => createJsonEncoderFn<TF.Currency>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<TF.Currency>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoderFn<TF.Currency>(undefined, {strategy: 'direct'}),
    compactEncoder: () => createJsonEncoderFn<TF.Currency>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoderFn<TF.Currency>(),
    preserveDecoder: () => createJsonDecoderFn<TF.Currency>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoderFn<TF.Currency>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoderFn<TF.Currency>(),
    binaryDecoder: () => createBinaryDecoderFn<TF.Currency>(),
    schemaEncoder: () => createJsonEncoderFn(TF.currency()),
    schemaDecoder: () => createJsonDecoderFn(TF.currency()),
    schemaBinaryEncoder: () => createBinaryEncoderFn(TF.currency()),
    schemaBinaryDecoder: () => createBinaryDecoderFn(TF.currency()),
    getTestData: () => ({values: [19.99, 0, -1234.56]}),
    getBinaryByteSizes: () => [8, 8, 8],
  },
  currency_minor_units: {
    title: 'Currency minor units (uint16)',
    description:
      'JSON + binary (de)serialization of TF.Currency<{integer:true; min:0; max:65535}> (cents); the uint16 bounds select the 2-byte binary encoding via the shared number-format ladder.',
    serializeNotes:
      'Format-aware binary width: the [0, 65535] integer bounds pin every value to 2 bytes (getBinaryByteSizes [2,2,2]); JSON is lossless plain-number text.',
    mutateEncoder: () => createJsonEncoderFn<TF.Currency<{integer: true; min: 0; max: 65535}>>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<TF.Currency<{integer: true; min: 0; max: 65535}>>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoderFn<TF.Currency<{integer: true; min: 0; max: 65535}>>(undefined, {strategy: 'direct'}),
    compactEncoder: () => createJsonEncoderFn<TF.Currency<{integer: true; min: 0; max: 65535}>>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoderFn<TF.Currency<{integer: true; min: 0; max: 65535}>>(),
    preserveDecoder: () =>
      createJsonDecoderFn<TF.Currency<{integer: true; min: 0; max: 65535}>>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoderFn<TF.Currency<{integer: true; min: 0; max: 65535}>>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoderFn<TF.Currency<{integer: true; min: 0; max: 65535}>>(),
    binaryDecoder: () => createBinaryDecoderFn<TF.Currency<{integer: true; min: 0; max: 65535}>>(),
    schemaEncoder: () => createJsonEncoderFn(TF.currency({integer: true, min: 0, max: 65535})),
    schemaDecoder: () => createJsonDecoderFn(TF.currency({integer: true, min: 0, max: 65535})),
    schemaBinaryEncoder: () => createBinaryEncoderFn(TF.currency({integer: true, min: 0, max: 65535})),
    schemaBinaryDecoder: () => createBinaryDecoderFn(TF.currency({integer: true, min: 0, max: 65535})),
    getTestData: () => ({values: [0, 1999, 65535]}),
    getBinaryByteSizes: () => [2, 2, 2],
  },
} as const satisfies Record<string, SerializationCase>;
