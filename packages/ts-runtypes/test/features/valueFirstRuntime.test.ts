// Tier-2 — value-first builders as injectable markers. Asserts that a builder
// CALL returns, AT RUNTIME, the LIVE RunType node the type compiler produces for
// the equivalent written type: the exact same cached node
// `getRunType(getRunTypeId<…>())` / `getRunType(getRunTypeId(v))` resolves
// (reference identity — runTypesCache is a singleton per structural id). This is
// the "builders return a RunType struct, the same one the type compiler returns"
// guarantee, and the doc's probe #5 (the builder's injected id equals the
// canonical marker id for its return type).
//
// Per the CLAUDE.md marker-coverage rule every scenario carries BOTH forms — the
// static `getRunTypeId<T>()` and the reflection `getRunTypeId(value)` — and
// both must resolve to the same node the builder returns.
//
// `import '@mionjs/run-types/formats'` is the load-bearing side-effect
// import (registers the format pure-fns the cache module reaches).

import * as TF from '@mionjs/run-types/formats';
import {describe, expect, it} from 'vitest';
import {getRunTypeId, getRTUtils, type InferType} from '@mionjs/run-types';
import * as RT from '@mionjs/run-types/builders';
import '@mionjs/run-types/formats';

describe('value-first / builders return the live RunType (Tier 2)', () => {
  it('string builder returns the RunType for TF.String<P> — static', () => {
    const built = TF.string({maxLength: 5});
    const canonical = getRTUtils().getRunType(getRunTypeId<TF.String<{maxLength: 5}>>());
    expect(canonical).toBeDefined();
    expect(built as unknown).toBe(canonical);
  });

  it('string builder returns the RunType for TF.String<P> — reflect', () => {
    const built = TF.string({maxLength: 5});
    const probe = 'abc' as unknown as TF.String<{maxLength: 5}>;
    const canonical = getRTUtils().getRunType(getRunTypeId(probe));
    expect(canonical).toBeDefined();
    expect(built as unknown).toBe(canonical);
  });

  it('number builder returns the RunType for TF.Number<P> — static', () => {
    const built = TF.number({min: 0});
    const canonical = getRTUtils().getRunType(getRunTypeId<TF.Number<{min: 0}>>());
    expect(canonical).toBeDefined();
    expect(built as unknown).toBe(canonical);
  });

  it('number builder returns the RunType for TF.Number<P> — reflect', () => {
    const built = TF.number({min: 0});
    const probe = 0 as unknown as TF.Number<{min: 0}>;
    const canonical = getRTUtils().getRunType(getRunTypeId(probe));
    expect(canonical).toBeDefined();
    expect(built as unknown).toBe(canonical);
  });

  it('object() returns the live composite RunType for the whole model — static', () => {
    const Model = RT.object({name: TF.string({maxLength: 5}), age: TF.number({min: 0})});
    const canonical = getRTUtils().getRunType(getRunTypeId<InferType<typeof Model>>());
    expect(canonical).toBeDefined();
    // The nested string/number builders are skipped by the scanner; `object`
    // alone resolves the composite node — so the model value IS that node.
    expect(Model as unknown).toBe(canonical);
  });

  it('object() composite RunType converges via reflect form', () => {
    const Model = RT.object({name: TF.string({maxLength: 5}), age: TF.number({min: 0})});
    const probe = {name: 'x', age: 1} as unknown as InferType<typeof Model>;
    const canonical = getRTUtils().getRunType(getRunTypeId(probe));
    expect(canonical).toBeDefined();
    expect(Model as unknown).toBe(canonical);
  });
});
