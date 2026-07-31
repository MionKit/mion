// Reflect-form thunks author a REAL example value of the (now transparent) format
// type — the case's first valid sample (e.g. 100n, 9, 'john@example.com'). The value
// only drives `T` inference and is discarded at runtime, but a realistic literal keeps
// these snippets self-explanatory and safe to lift into docs. Every form is exercised:
// validate + getValidationErrors (static / reflect / deserialize-static /
// deserialize-reflect) + mockType; the getValidationErrors format-payload forms assert
// the exact format error survives every resolution path.
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

export const BIGINT_FORMAT = {
  bigint_max: {
    title: 'BigInt Max',
    description: 'bigintFormat with an inclusive upper bound that rejects bigints above max.',
    validateNotes:
      'Boundary value 100n passes (inclusive); 101n fails on `max`. A non-bigint (5) fails the bigint typeof gate before any format check.',
    validate: () => createValidateFn<TF.BigInt<{max: 100n}>>(),
    standardSchema: () => createStandardSchema<TF.BigInt<{max: 100n}>>(),
    // One hand-authored Standard Schema expectation per file. Every other case
    // derives its expected issues from getExpectedErrors via runTypeErrorsToIssues
    // (the same mapping the factory uses), so this single case pins the real
    // consumer-facing {message, path} output independently: it trips if error
    // generation or the issue mapping changes. One case per file covers this
    // file's shapes without the ~265x maintenance of authoring every case.
    getExpectedStandardErrors: () => [
      [
        {
          message: 'Failed max constraint (100)',
          path: [],
          expected: 'bigint',
          format: {name: 'bigintFormat', formatPath: ['max'], val: 100n},
        },
      ],
      [{message: 'Expected bigint', path: [], expected: 'bigint'}],
    ],
    validateReflect: () => {
      const v: TF.BigInt<{max: 100n}> = 100n;
      return createValidateFn(v);
    },
    deserializeValidate: () => deserializeValidate<TF.BigInt<{max: 100n}>>(),
    deserializeValidateReflect: () => {
      const v: TF.BigInt<{max: 100n}> = 100n;
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.BigInt<{max: 100n}> = 100n;
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<TF.BigInt<{max: 100n}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.BigInt<{max: 100n}> = 100n;
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.BigInt<{max: 100n}> = 100n;
      return createMockDataFn(v);
    },
    validateDataOnly: () => createValidateFn<DataOnly<TF.BigInt<{max: 100n}>>>(),
    validateSchema: () => createValidateFn(TF.bigInt({max: 100n})),
    getValidationErrors: () => createGetValidationErrorsFn<TF.BigInt<{max: 100n}>>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<TF.BigInt<{max: 100n}>>>(),
    getValidationErrorsSchema: () => createGetValidationErrorsFn(TF.bigInt({max: 100n})),
    mockType: () => createMockDataFn<TF.BigInt<{max: 100n}>>(),
    getSamples: () => ({valid: [100n, 0n, -50n], invalid: [101n, 5]}),
    expectedFormatErrors: () => [{name: 'bigintFormat', val: 100n, formatPathTail: 'max'}, null],
  },
  bigint_min: {
    title: 'BigInt Min',
    description: 'bigintFormat with an inclusive lower bound that rejects bigints below min.',
    validateNotes: 'Boundary value 0n passes (inclusive); -1n fails on `min`.',
    validate: () => createValidateFn<TF.BigInt<{min: 0n}>>(),
    standardSchema: () => createStandardSchema<TF.BigInt<{min: 0n}>>(),
    validateReflect: () => {
      const v: TF.BigInt<{min: 0n}> = 0n;
      return createValidateFn(v);
    },
    deserializeValidate: () => deserializeValidate<TF.BigInt<{min: 0n}>>(),
    deserializeValidateReflect: () => {
      const v: TF.BigInt<{min: 0n}> = 0n;
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.BigInt<{min: 0n}> = 0n;
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<TF.BigInt<{min: 0n}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.BigInt<{min: 0n}> = 0n;
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.BigInt<{min: 0n}> = 0n;
      return createMockDataFn(v);
    },
    validateDataOnly: () => createValidateFn<DataOnly<TF.BigInt<{min: 0n}>>>(),
    validateSchema: () => createValidateFn(TF.bigInt({min: 0n})),
    getValidationErrors: () => createGetValidationErrorsFn<TF.BigInt<{min: 0n}>>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<TF.BigInt<{min: 0n}>>>(),
    getValidationErrorsSchema: () => createGetValidationErrorsFn(TF.bigInt({min: 0n})),
    mockType: () => createMockDataFn<TF.BigInt<{min: 0n}>>(),
    getSamples: () => ({valid: [0n, 1n, 9999n], invalid: [-1n]}),
    expectedFormatErrors: () => [{name: 'bigintFormat', val: 0n, formatPathTail: 'min'}],
  },
  bigint_lt: {
    title: 'BigInt LessThan',
    description: 'bigintFormat with an exclusive upper bound where the bound itself is rejected.',
    validateNotes:
      'Exclusive `lt`: 9n passes but the boundary 10n fails (and 11n above it). Lower bound is unconstrained, so -5n passes.',
    validate: () => createValidateFn<TF.BigInt<{lt: 10n}>>(),
    standardSchema: () => createStandardSchema<TF.BigInt<{lt: 10n}>>(),
    validateReflect: () => {
      const v: TF.BigInt<{lt: 10n}> = 9n;
      return createValidateFn(v);
    },
    deserializeValidate: () => deserializeValidate<TF.BigInt<{lt: 10n}>>(),
    deserializeValidateReflect: () => {
      const v: TF.BigInt<{lt: 10n}> = 9n;
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.BigInt<{lt: 10n}> = 9n;
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<TF.BigInt<{lt: 10n}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.BigInt<{lt: 10n}> = 9n;
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.BigInt<{lt: 10n}> = 9n;
      return createMockDataFn(v);
    },
    validateDataOnly: () => createValidateFn<DataOnly<TF.BigInt<{lt: 10n}>>>(),
    validateSchema: () => createValidateFn(TF.bigInt({lt: 10n})),
    getValidationErrors: () => createGetValidationErrorsFn<TF.BigInt<{lt: 10n}>>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<TF.BigInt<{lt: 10n}>>>(),
    getValidationErrorsSchema: () => createGetValidationErrorsFn(TF.bigInt({lt: 10n})),
    mockType: () => createMockDataFn<TF.BigInt<{lt: 10n}>>(),
    getSamples: () => ({valid: [9n, -5n], invalid: [10n, 11n]}),
    expectedFormatErrors: () => [
      {name: 'bigintFormat', val: 10n, formatPathTail: 'lt'},
      {name: 'bigintFormat', val: 10n, formatPathTail: 'lt'},
    ],
  },
  bigint_gt: {
    title: 'BigInt GreaterThan',
    description: 'bigintFormat with an exclusive lower bound where the bound itself is rejected.',
    validateNotes: 'Exclusive `gt`: 1n passes but the boundary 0n fails (and -1n below it).',
    validate: () => createValidateFn<TF.BigInt<{gt: 0n}>>(),
    standardSchema: () => createStandardSchema<TF.BigInt<{gt: 0n}>>(),
    validateReflect: () => {
      const v: TF.BigInt<{gt: 0n}> = 1n;
      return createValidateFn(v);
    },
    deserializeValidate: () => deserializeValidate<TF.BigInt<{gt: 0n}>>(),
    deserializeValidateReflect: () => {
      const v: TF.BigInt<{gt: 0n}> = 1n;
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.BigInt<{gt: 0n}> = 1n;
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<TF.BigInt<{gt: 0n}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.BigInt<{gt: 0n}> = 1n;
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.BigInt<{gt: 0n}> = 1n;
      return createMockDataFn(v);
    },
    validateDataOnly: () => createValidateFn<DataOnly<TF.BigInt<{gt: 0n}>>>(),
    validateSchema: () => createValidateFn(TF.bigInt({gt: 0n})),
    getValidationErrors: () => createGetValidationErrorsFn<TF.BigInt<{gt: 0n}>>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<TF.BigInt<{gt: 0n}>>>(),
    getValidationErrorsSchema: () => createGetValidationErrorsFn(TF.bigInt({gt: 0n})),
    mockType: () => createMockDataFn<TF.BigInt<{gt: 0n}>>(),
    getSamples: () => ({valid: [1n, 100n], invalid: [0n, -1n]}),
    expectedFormatErrors: () => [
      {name: 'bigintFormat', val: 0n, formatPathTail: 'gt'},
      {name: 'bigintFormat', val: 0n, formatPathTail: 'gt'},
    ],
  },
  bigint_multipleOf: {
    title: 'BigInt MultipleOf',
    description: 'bigintFormat divisibility constraint where only multiples of 5n pass.',
    validateNotes:
      '0n counts as a multiple and passes; non-multiples (3n, 7n) fail on `multipleOf`. Negative multiples like -15n pass.',
    validate: () => createValidateFn<TF.BigInt<{multipleOf: 5n}>>(),
    standardSchema: () => createStandardSchema<TF.BigInt<{multipleOf: 5n}>>(),
    validateReflect: () => {
      const v: TF.BigInt<{multipleOf: 5n}> = 0n;
      return createValidateFn(v);
    },
    deserializeValidate: () => deserializeValidate<TF.BigInt<{multipleOf: 5n}>>(),
    deserializeValidateReflect: () => {
      const v: TF.BigInt<{multipleOf: 5n}> = 0n;
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.BigInt<{multipleOf: 5n}> = 0n;
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<TF.BigInt<{multipleOf: 5n}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.BigInt<{multipleOf: 5n}> = 0n;
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.BigInt<{multipleOf: 5n}> = 0n;
      return createMockDataFn(v);
    },
    validateDataOnly: () => createValidateFn<DataOnly<TF.BigInt<{multipleOf: 5n}>>>(),
    validateSchema: () => createValidateFn(TF.bigInt({multipleOf: 5n})),
    getValidationErrors: () => createGetValidationErrorsFn<TF.BigInt<{multipleOf: 5n}>>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<TF.BigInt<{multipleOf: 5n}>>>(),
    getValidationErrorsSchema: () => createGetValidationErrorsFn(TF.bigInt({multipleOf: 5n})),
    mockType: () => createMockDataFn<TF.BigInt<{multipleOf: 5n}>>(),
    getSamples: () => ({valid: [0n, 5n, -15n], invalid: [3n, 7n]}),
    expectedFormatErrors: () => [
      {name: 'bigintFormat', val: 5n, formatPathTail: 'multipleOf'},
      {name: 'bigintFormat', val: 5n, formatPathTail: 'multipleOf'},
    ],
  },
  bigint_combined: {
    title: 'BigInt Combined',
    description: 'bigintFormat combining min, max, and multipleOf where each invalid sample trips a distinct constraint.',
    validateNotes:
      'All three bounds enforced together: -10n fails `min`, 1010n fails `max`, 7n fails `multipleOf`. Boundary values 0n and 1000n pass (both inclusive and multiples of 10n).',
    validate: () => createValidateFn<TF.BigInt<{min: 0n; max: 1000n; multipleOf: 10n}>>(),
    standardSchema: () => createStandardSchema<TF.BigInt<{min: 0n; max: 1000n; multipleOf: 10n}>>(),
    validateReflect: () => {
      const v: TF.BigInt<{min: 0n; max: 1000n; multipleOf: 10n}> = 0n;
      return createValidateFn(v);
    },
    deserializeValidate: () => deserializeValidate<TF.BigInt<{min: 0n; max: 1000n; multipleOf: 10n}>>(),
    deserializeValidateReflect: () => {
      const v: TF.BigInt<{min: 0n; max: 1000n; multipleOf: 10n}> = 0n;
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.BigInt<{min: 0n; max: 1000n; multipleOf: 10n}> = 0n;
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<TF.BigInt<{min: 0n; max: 1000n; multipleOf: 10n}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.BigInt<{min: 0n; max: 1000n; multipleOf: 10n}> = 0n;
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.BigInt<{min: 0n; max: 1000n; multipleOf: 10n}> = 0n;
      return createMockDataFn(v);
    },
    validateDataOnly: () => createValidateFn<DataOnly<TF.BigInt<{min: 0n; max: 1000n; multipleOf: 10n}>>>(),
    validateSchema: () => createValidateFn(TF.bigInt({min: 0n, max: 1000n, multipleOf: 10n})),
    getValidationErrors: () => createGetValidationErrorsFn<TF.BigInt<{min: 0n; max: 1000n; multipleOf: 10n}>>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<TF.BigInt<{min: 0n; max: 1000n; multipleOf: 10n}>>>(),
    getValidationErrorsSchema: () => createGetValidationErrorsFn(TF.bigInt({min: 0n, max: 1000n, multipleOf: 10n})),
    mockType: () => createMockDataFn<TF.BigInt<{min: 0n; max: 1000n; multipleOf: 10n}>>(),
    getSamples: () => ({valid: [0n, 10n, 1000n], invalid: [-10n, 1010n, 7n]}),
    expectedFormatErrors: () => [
      {name: 'bigintFormat', formatPathTail: 'min'},
      {name: 'bigintFormat', formatPathTail: 'max'},
      {name: 'bigintFormat', formatPathTail: 'multipleOf'},
    ],
  },
  bigint_int64: {
    title: 'Int64',
    description: 'bigintFormat preset for the signed 64-bit range [-2^63, 2^63-1] that selects 8-byte binary packing.',
    validateNotes:
      'Inclusive bounds min -9223372036854775808n / max 9223372036854775807n; one past either end (2^63 / -(2^63)-1) fails on `max` / `min` respectively.',
    validate: () => createValidateFn<TF.BigInt64>(),
    standardSchema: () => createStandardSchema<TF.BigInt64>(),
    validateReflect: () => {
      const v: TF.BigInt64 = -9223372036854775808n;
      return createValidateFn(v);
    },
    deserializeValidate: () => deserializeValidate<TF.BigInt64>(),
    deserializeValidateReflect: () => {
      const v: TF.BigInt64 = -9223372036854775808n;
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.BigInt64 = -9223372036854775808n;
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<TF.BigInt64>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.BigInt64 = -9223372036854775808n;
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.BigInt64 = -9223372036854775808n;
      return createMockDataFn(v);
    },
    validateDataOnly: () => createValidateFn<DataOnly<TF.BigInt64>>(),
    validateSchema: () => createValidateFn(TF.bigInt64()),
    getValidationErrors: () => createGetValidationErrorsFn<TF.BigInt64>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<TF.BigInt64>>(),
    getValidationErrorsSchema: () => createGetValidationErrorsFn(TF.bigInt64()),
    mockType: () => createMockDataFn<TF.BigInt64>(),
    getSamples: () => ({
      valid: [-9223372036854775808n, 0n, 9223372036854775807n],
      invalid: [9223372036854775808n, -9223372036854775809n],
    }),
    expectedFormatErrors: () => [
      {name: 'bigintFormat', val: 9223372036854775807n, formatPathTail: 'max'},
      {name: 'bigintFormat', val: -9223372036854775808n, formatPathTail: 'min'},
    ],
  },
  bigint_uint64: {
    title: 'UInt64',
    description: 'bigintFormat preset for the unsigned 64-bit range [0, 2^64-1] that selects 8-byte binary packing.',
    validateNotes: 'Inclusive bounds min 0n / max 18446744073709551615n; 2^64 fails `max` and -1n fails `min`.',
    validate: () => createValidateFn<TF.BigUInt64>(),
    standardSchema: () => createStandardSchema<TF.BigUInt64>(),
    validateReflect: () => {
      const v: TF.BigUInt64 = 0n;
      return createValidateFn(v);
    },
    deserializeValidate: () => deserializeValidate<TF.BigUInt64>(),
    deserializeValidateReflect: () => {
      const v: TF.BigUInt64 = 0n;
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.BigUInt64 = 0n;
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<TF.BigUInt64>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.BigUInt64 = 0n;
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.BigUInt64 = 0n;
      return createMockDataFn(v);
    },
    validateDataOnly: () => createValidateFn<DataOnly<TF.BigUInt64>>(),
    validateSchema: () => createValidateFn(TF.bigUInt64()),
    getValidationErrors: () => createGetValidationErrorsFn<TF.BigUInt64>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<TF.BigUInt64>>(),
    getValidationErrorsSchema: () => createGetValidationErrorsFn(TF.bigUInt64()),
    mockType: () => createMockDataFn<TF.BigUInt64>(),
    getSamples: () => ({valid: [0n, 18446744073709551615n], invalid: [18446744073709551616n, -1n]}),
    expectedFormatErrors: () => [
      {name: 'bigintFormat', val: 18446744073709551615n, formatPathTail: 'max'},
      {name: 'bigintFormat', val: 0n, formatPathTail: 'min'},
    ],
  },
} as const satisfies Record<string, FormatValidationCase>;
