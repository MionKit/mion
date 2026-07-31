// Currency cases — `TF.Currency<P>` is a param preset over the plain number
// format (`Number<P & {isCurrency: true}>`), so validation, serialization and
// mocking are identical to `TF.Number<P>`. The `isCurrency` param is pure
// presentation metadata: the emitter echoes it onto every format error, the
// discriminator `createFriendlyTextI18n` uses to render a violated bound via
// `Intl.NumberFormat(locale, {style: 'currency', currency})` with the
// app-supplied currency code. WHICH currency a value is in is runtime data,
// deliberately never fixed in the type.
import * as TF from '@ts-runtypes/core/formats';
import type {FormatValidationCase} from './types.ts';
import '@ts-runtypes/core/formats';
import {
  createValidateFn,
  createGetValidationErrorsFn,
  createMockDataFn,
  createStandardSchema,
  type DataOnly,
} from '@ts-runtypes/core';
import {deserializeValidate, deserializeGetValidationErrors} from '../../util/deserializeRTFunctions.ts';

export const CURRENCY = {
  currency_plain: {
    title: 'Unconstrained currency amount',
    description: 'A bare Currency mark: validates as a plain number (isCurrency is presentation metadata, not a constraint).',
    validateNotes:
      'Any finite number passes — the isCurrency param adds no numeric constraint of its own. A non-number ("5") fails the number typeof gate.',
    validate: () => createValidateFn<TF.Currency>(),
    standardSchema: () => createStandardSchema<TF.Currency>(),
    validateReflect: () => {
      const v: TF.Currency = 19.99;
      return createValidateFn(v);
    },
    deserializeValidate: () => deserializeValidate<TF.Currency>(),
    deserializeValidateReflect: () => {
      const v: TF.Currency = 19.99;
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.Currency = 19.99;
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<TF.Currency>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.Currency = 19.99;
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.Currency = 19.99;
      return createMockDataFn(v);
    },
    validateDataOnly: () => createValidateFn<DataOnly<TF.Currency>>(),
    validateSchema: () => createValidateFn(TF.currency()),
    getValidationErrors: () => createGetValidationErrorsFn<TF.Currency>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<TF.Currency>>(),
    getValidationErrorsSchema: () => createGetValidationErrorsFn(TF.currency()),
    mockType: () => createMockDataFn<TF.Currency>(),
    getSamples: () => ({valid: [19.99, 0, -50.25], invalid: ['5']}),
    expectedFormatErrors: () => [null],
  },
  currency_max: {
    title: 'Currency with inclusive max',
    description: 'Currency with an upper bound; the format error echoes isCurrency (the friendly-renderer discriminator).',
    validateNotes:
      'Boundary value 100 passes (inclusive); 101 fails on `max` with an isCurrency-flagged format error. A non-number ("5") fails the number typeof gate before any format check.',
    validate: () => createValidateFn<TF.Currency<{max: 100}>>(),
    standardSchema: () => createStandardSchema<TF.Currency<{max: 100}>>(),
    // One hand-authored Standard Schema expectation per file (see
    // NumberFormat.ts): pins the consumer-facing {message, path} output — and
    // here specifically that the issue's format payload carries the echoed
    // isCurrency mark end-to-end.
    getExpectedStandardErrors: () => [
      [
        {
          message: 'Failed max constraint (100)',
          path: [],
          expected: 'number',
          format: {name: 'numberFormat', formatPath: ['max'], val: 100, isCurrency: true},
        },
      ],
      [{message: 'Expected number', path: [], expected: 'number'}],
    ],
    validateReflect: () => {
      const v: TF.Currency<{max: 100}> = 100;
      return createValidateFn(v);
    },
    deserializeValidate: () => deserializeValidate<TF.Currency<{max: 100}>>(),
    deserializeValidateReflect: () => {
      const v: TF.Currency<{max: 100}> = 100;
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.Currency<{max: 100}> = 100;
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<TF.Currency<{max: 100}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.Currency<{max: 100}> = 100;
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.Currency<{max: 100}> = 100;
      return createMockDataFn(v);
    },
    validateDataOnly: () => createValidateFn<DataOnly<TF.Currency<{max: 100}>>>(),
    validateSchema: () => createValidateFn(TF.currency({max: 100})),
    getValidationErrors: () => createGetValidationErrorsFn<TF.Currency<{max: 100}>>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<TF.Currency<{max: 100}>>>(),
    getValidationErrorsSchema: () => createGetValidationErrorsFn(TF.currency({max: 100})),
    mockType: () => createMockDataFn<TF.Currency<{max: 100}>>(),
    getSamples: () => ({valid: [100, 0, -50], invalid: [101, '5']}),
    expectedFormatErrors: () => [{name: 'numberFormat', val: 100, formatPathTail: 'max'}, null],
  },
  currency_minor_units: {
    title: 'Currency in integer minor units',
    description:
      'Currency stored as integer minor units (cents) with a uint16 range; validation mirrors the equivalent Number brand.',
    validateNotes:
      'Non-integers fail on `integer`; values above 65535 fail on `max`; negatives fail on `min`. The [0, 65535] bounds also drive the 2-byte binary packing (see the format-serialization suite).',
    validate: () => createValidateFn<TF.Currency<{integer: true; min: 0; max: 65535}>>(),
    standardSchema: () => createStandardSchema<TF.Currency<{integer: true; min: 0; max: 65535}>>(),
    validateReflect: () => {
      const v: TF.Currency<{integer: true; min: 0; max: 65535}> = 1999;
      return createValidateFn(v);
    },
    deserializeValidate: () => deserializeValidate<TF.Currency<{integer: true; min: 0; max: 65535}>>(),
    deserializeValidateReflect: () => {
      const v: TF.Currency<{integer: true; min: 0; max: 65535}> = 1999;
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.Currency<{integer: true; min: 0; max: 65535}> = 1999;
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<TF.Currency<{integer: true; min: 0; max: 65535}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.Currency<{integer: true; min: 0; max: 65535}> = 1999;
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.Currency<{integer: true; min: 0; max: 65535}> = 1999;
      return createMockDataFn(v);
    },
    validateDataOnly: () => createValidateFn<DataOnly<TF.Currency<{integer: true; min: 0; max: 65535}>>>(),
    validateSchema: () => createValidateFn(TF.currency({integer: true, min: 0, max: 65535})),
    getValidationErrors: () => createGetValidationErrorsFn<TF.Currency<{integer: true; min: 0; max: 65535}>>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<TF.Currency<{integer: true; min: 0; max: 65535}>>>(),
    getValidationErrorsSchema: () => createGetValidationErrorsFn(TF.currency({integer: true, min: 0, max: 65535})),
    mockType: () => createMockDataFn<TF.Currency<{integer: true; min: 0; max: 65535}>>(),
    getSamples: () => ({valid: [0, 1999, 65535], invalid: [19.99, 65536, -1]}),
    expectedFormatErrors: () => [
      {name: 'numberFormat', val: true, formatPathTail: 'integer'},
      {name: 'numberFormat', val: 65535, formatPathTail: 'max'},
      {name: 'numberFormat', val: 0, formatPathTail: 'min'},
    ],
  },
} as const satisfies Record<string, FormatValidationCase>;
