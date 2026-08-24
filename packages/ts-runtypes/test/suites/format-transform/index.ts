import {STRING_FORMAT} from './StringFormat.ts';
import {NUMBER_FORMAT} from './NumberFormat.ts';
import {BIGINT_FORMAT} from './BigintFormat.ts';

export const FORMAT_TRANSFORM_SUITE = {STRING_FORMAT, NUMBER_FORMAT, BIGINT_FORMAT} as const satisfies {
  STRING_FORMAT: Record<string, import('./types.ts').FormatTransformCase>;
  NUMBER_FORMAT: Record<string, import('./types.ts').FormatTransformCase>;
  BIGINT_FORMAT: Record<string, import('./types.ts').FormatTransformCase>;
};

export * from './types.ts';
