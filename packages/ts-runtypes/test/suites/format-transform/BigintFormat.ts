import type * as TF from '@ts-runtypes/core/formats';
import type {FormatTransformCase} from './types.ts';
import '@ts-runtypes/core/formats';
import {createFormatTransformFn} from '@ts-runtypes/core';

export const BIGINT_FORMAT = {
  identity_int64: {
    title: 'TF.BigInt64 — no transform, passes through unchanged',
    formatTransform: () => createFormatTransformFn<TF.BigInt64>(),
    getCases: () => [
      {input: 5n, expected: 5n},
      {input: -9223372036854775808n, expected: -9223372036854775808n},
    ],
  },
  identity_ranged: {
    title: 'TF.BigInt<{min:0n; max:1000n}> — no transform',
    formatTransform: () => createFormatTransformFn<TF.BigInt<{min: 0n; max: 1000n}>>(),
    getCases: () => [{input: 500n, expected: 500n}],
  },
} as const satisfies Record<string, FormatTransformCase>;
