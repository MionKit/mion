// Builders and equivalent markers must return the same cached node (AGENTS.md marker coverage).
// The formats value import registers pure functions used by cache modules.

import * as TF from '@mionjs/run-types/formats';
import {describe, expect, it} from 'vitest';
import {getRunTypeId, type InferType} from '@mionjs/run-types';
import {getRTUtils} from '@mionjs/run-types/runtime';
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
