// Single runner for the whole overrides suite. The cases live in per-type-family
// fixtures (Atomic.ts, Interface.ts, …) — each declares a unique branded type and
// its module-scope overrides; importing them here registers those overrides. One
// case per type family runs all five universal families (validate,
// getValidationErrors, jsonEncoder, jsonDecoder, binary round-trip) via the
// shared assert helpers; ObjectFns adds the object-only families.

import {describe} from 'vitest';
import {ATOMIC_OVERRIDE} from './Atomic.ts';
import {INTERFACE_OVERRIDE} from './Interface.ts';
import {ARRAY_OVERRIDE} from './Arrays.ts';
import {TUPLE_OVERRIDE} from './Tuples.ts';
import {UNION_OVERRIDE} from './Unions.ts';
import {CIRCULAR_OVERRIDE} from './Circular.ts';
import {registerObjectFnsCase} from './ObjectFns.ts';
import {registerOverrideCase} from './overrideAsserts.ts';

describe('overrides', () => {
  for (const overrideCase of [
    ATOMIC_OVERRIDE,
    INTERFACE_OVERRIDE,
    ARRAY_OVERRIDE,
    TUPLE_OVERRIDE,
    UNION_OVERRIDE,
    CIRCULAR_OVERRIDE,
  ]) {
    registerOverrideCase(overrideCase);
  }
  registerObjectFnsCase();
});
