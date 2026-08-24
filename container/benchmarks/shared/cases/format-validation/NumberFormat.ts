import type {FormatValidationCase} from '../types.ts';

export const NUMBER_FORMAT = {
  number_max: {
    title: 'FormatNumber<{max: 100}> — inclusive upper bound',
    getSamples: () => ({valid: [100, 0, -50], invalid: [101, '5']}),
    expectedFormatErrors: () => [{name: 'numberFormat', val: 100, formatPathTail: 'max'}, null],
  },
  number_min: {
    title: 'FormatNumber<{min: 0}> — inclusive lower bound',
    getSamples: () => ({valid: [0, 1, 9999], invalid: [-1]}),
    expectedFormatErrors: () => [{name: 'numberFormat', val: 0, formatPathTail: 'min'}],
  },
  number_lt: {
    title: 'FormatNumber<{lt: 10}> — exclusive upper bound',
    getSamples: () => ({valid: [9, 0, -100], invalid: [10, 11]}),
    expectedFormatErrors: () => [
      {name: 'numberFormat', val: 10, formatPathTail: 'lt'},
      {name: 'numberFormat', val: 10, formatPathTail: 'lt'},
    ],
  },
  number_gt: {
    title: 'FormatNumber<{gt: 0}> — exclusive lower bound',
    getSamples: () => ({valid: [1, 100], invalid: [0, -1]}),
    expectedFormatErrors: () => [
      {name: 'numberFormat', val: 0, formatPathTail: 'gt'},
      {name: 'numberFormat', val: 0, formatPathTail: 'gt'},
    ],
  },
  number_integer: {
    title: 'FormatInteger — whole numbers only',
    getSamples: () => ({valid: [0, 1, -1, 42], invalid: [1.5, 3.14]}),
    expectedFormatErrors: () => [
      {name: 'numberFormat', val: true, formatPathTail: 'integer'},
      {name: 'numberFormat', val: true, formatPathTail: 'integer'},
    ],
  },
  number_float: {
    title: 'FormatFloat — non-integer only',
    getSamples: () => ({valid: [1.5, -0.5, 3.14], invalid: [1, 0, -2]}),
    expectedFormatErrors: () => [
      {name: 'numberFormat', val: true, formatPathTail: 'float'},
      {name: 'numberFormat', val: true, formatPathTail: 'float'},
      {name: 'numberFormat', val: true, formatPathTail: 'float'},
    ],
  },
  number_multipleOf: {
    title: 'FormatNumber<{multipleOf: 5}> — divisible by 5',
    getSamples: () => ({valid: [0, 5, 10, -15], invalid: [3, 7]}),
    expectedFormatErrors: () => [
      {name: 'numberFormat', val: 5, formatPathTail: 'multipleOf'},
      {name: 'numberFormat', val: 5, formatPathTail: 'multipleOf'},
    ],
  },
  number_combined: {
    title: 'FormatNumber<{min:0; max:100; integer:true; multipleOf:5}> — all constraints',
    getSamples: () => ({valid: [0, 5, 50, 100], invalid: [-5, 105, 7, 2.5]}),
    expectedFormatErrors: () => [
      {name: 'numberFormat', formatPathTail: 'min'},
      {name: 'numberFormat', formatPathTail: 'max'},
      {name: 'numberFormat', formatPathTail: 'multipleOf'},
      {name: 'numberFormat', formatPathTail: 'integer'},
    ],
  },
  number_int8: {
    title: 'FormatInt8 — signed 8-bit range',
    getSamples: () => ({valid: [-128, 0, 127], invalid: [128, -129, 1.5]}),
    expectedFormatErrors: () => [
      {name: 'numberFormat', val: 127, formatPathTail: 'max'},
      {name: 'numberFormat', val: -128, formatPathTail: 'min'},
      {name: 'numberFormat', val: true, formatPathTail: 'integer'},
    ],
  },
  number_uint8: {
    title: 'FormatUInt8 — unsigned 8-bit range',
    getSamples: () => ({valid: [0, 128, 255], invalid: [256, -1]}),
    expectedFormatErrors: () => [
      {name: 'numberFormat', val: 255, formatPathTail: 'max'},
      {name: 'numberFormat', val: 0, formatPathTail: 'min'},
    ],
  },
} as const satisfies Record<string, FormatValidationCase>;
