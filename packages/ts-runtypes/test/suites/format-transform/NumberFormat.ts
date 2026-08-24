import type * as TF from '@ts-runtypes/core/formats';
import type {FormatTransformCase} from './types.ts';
import '@ts-runtypes/core/formats';
import {createFormatTransformFn} from '@ts-runtypes/core';

export const NUMBER_FORMAT = {
  identity_integer: {
    title: 'TF.Integer — no transform, passes through unchanged',
    formatTransform: () => createFormatTransformFn<TF.Integer>(),
    getCases: () => [
      {input: 42, expected: 42},
      {input: -7, expected: -7},
    ],
  },
  identity_int8: {
    title: 'TF.Int8 — no transform',
    formatTransform: () => createFormatTransformFn<TF.Int8>(),
    getCases: () => [{input: 127, expected: 127}],
  },
  identity_ranged: {
    title: 'TF.Number<{min:0; max:100}> — no transform',
    formatTransform: () => createFormatTransformFn<TF.Number<{min: 0; max: 100}>>(),
    getCases: () => [{input: 50, expected: 50}],
  },
  nested_number_field: {
    title: 'nested object — number-branded field passes through unchanged',
    formatTransform: () => createFormatTransformFn<{count: TF.Int8; label: string}>(),
    getCases: () => [{input: {count: 5, label: 'KEEP'}, expected: {count: 5, label: 'KEEP'}}],
  },
} as const satisfies Record<string, FormatTransformCase>;
