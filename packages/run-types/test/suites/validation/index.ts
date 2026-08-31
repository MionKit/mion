// Shared **validation** suite — single source of truth for every
// behavioral assertion ported from the reference
// packages/run-types/src/nodes/**/*.spec.ts (atomic, collection,
// member, utility, native).
//
// **Scope: validate + getValidationErrors only.** JSON serializer cases live
// in the dedicated serialization suite. Cases are organized by
// category at the top level (ATOMIC / ARRAY / OBJECT / TUPLE / UNION /
// TEMPLATE_LITERAL / NATIVE / CIRCULAR / UTILITY / TYPE_MAPPINGS), one
// file per group, recombined here into `VALIDATION_SUITE`.

import {ATOMIC} from './Atomic.ts';
import {ARRAY} from './Array.ts';
import {OBJECT} from './Object.ts';
import {TUPLE} from './Tuple.ts';
import {UNION} from './Union.ts';
import {TEMPLATE_LITERAL} from './TemplateLiteral.ts';
import {NATIVE} from './Native.ts';
import {CIRCULAR} from './Circular.ts';
import {UTILITY} from './Utility.ts';
import {TYPE_MAPPINGS} from './TypeMappings.ts';
import {DATETIME} from './DateTime.ts';
import {REALWORLD} from './Realworld.ts';
import type {ValidationCase} from './types.ts';

export const VALIDATION_SUITE = {
  REALWORLD,
  ATOMIC,
  ARRAY,
  OBJECT,
  TUPLE,
  UNION,
  TEMPLATE_LITERAL,
  NATIVE,
  CIRCULAR,
  UTILITY,
  TYPE_MAPPINGS,
  DATETIME,
} as const satisfies {
  REALWORLD: Record<string, ValidationCase>;
  ATOMIC: Record<string, ValidationCase>;
  ARRAY: Record<string, ValidationCase>;
  OBJECT: Record<string, ValidationCase>;
  TUPLE: Record<string, ValidationCase>;
  UNION: Record<string, ValidationCase>;
  TEMPLATE_LITERAL: Record<string, ValidationCase>;
  NATIVE: Record<string, ValidationCase>;
  CIRCULAR: Record<string, ValidationCase>;
  UTILITY: Record<string, ValidationCase>;
  TYPE_MAPPINGS: Record<string, ValidationCase>;
  DATETIME: Record<string, ValidationCase>;
};

export * from './types.ts';
