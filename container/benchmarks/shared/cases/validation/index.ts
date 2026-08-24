// Slim, marker-free validation suite — mirrors src/suites/validation/index.ts
// but recombines the marker-free group files under shared/cases/validation.
// Every case carries samples + metadata only (no createValidateFn / RT.* thunks).

import {ATOMIC} from './Atomic.ts';
import {ARRAY} from './Array.ts';
import {OBJECT} from './Object.ts';
import {TUPLE} from './Tuple.ts';
import {UNION} from './Union.ts';
import {TEMPLATE_LITERAL} from './TemplateLiteral.ts';
import {NATIVE} from './Native.ts';
import {CIRCULAR} from './Circular.ts';
import {CIRCULAR_REFS} from './CircularRefs.ts';
import {UTILITY} from './Utility.ts';
import {TYPE_MAPPINGS} from './TypeMappings.ts';
import {DATETIME} from './DateTime.ts';
import {JSON_SCHEMA} from './JsonSchema.ts';
import type {SharedCase} from '../types.ts';

export const VALIDATION_SUITE = {
  ATOMIC,
  ARRAY,
  OBJECT,
  TUPLE,
  UNION,
  TEMPLATE_LITERAL,
  NATIVE,
  CIRCULAR,
  CIRCULAR_REFS,
  UTILITY,
  TYPE_MAPPINGS,
  DATETIME,
  JSON_SCHEMA,
} as const satisfies {
  ATOMIC: Record<string, SharedCase>;
  ARRAY: Record<string, SharedCase>;
  OBJECT: Record<string, SharedCase>;
  TUPLE: Record<string, SharedCase>;
  UNION: Record<string, SharedCase>;
  TEMPLATE_LITERAL: Record<string, SharedCase>;
  NATIVE: Record<string, SharedCase>;
  CIRCULAR: Record<string, SharedCase>;
  CIRCULAR_REFS: Record<string, SharedCase>;
  UTILITY: Record<string, SharedCase>;
  TYPE_MAPPINGS: Record<string, SharedCase>;
  DATETIME: Record<string, SharedCase>;
  JSON_SCHEMA: Record<string, SharedCase>;
};
