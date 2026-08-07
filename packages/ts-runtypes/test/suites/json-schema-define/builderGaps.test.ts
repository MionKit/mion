// The four builder gaps (docs/done/schema-builder-gaps.md): dependentRequired,
// dependentSchemas and conditional now have first-class value-first builders
// that return the schema door's EXACT lowering, so a schema → builder
// translation keeps the intent instead of expanding it. Every convergence pin
// here asserts the two doors resolve to ONE structural id — the property the
// translation matrix stands on.
import {describe, expect, it} from 'vitest';
import {createValidateFn, getRunTypeId} from '@ts-runtypes/core';
import * as RT from '@ts-runtypes/core/schema';
import * as TF from '@ts-runtypes/core/formats';
import {runTypeFromJsonSchema} from '@ts-runtypes/core/json-schema';

describe('dependentRequired — builder and door converge on one id', () => {
  const doorId = getRunTypeId(runTypeFromJsonSchema({dependentRequired: {card: ['cvv']}} as const));
  const builderId = getRunTypeId(RT.dependentRequired({card: ['cvv']}));

  it('resolves both doors to the same cache entry', () => {
    expect(builderId).toBe(doorId);
  });

  it('enforces the dependency exactly like the door', () => {
    const isValid = createValidateFn(RT.dependentRequired({card: ['cvv']}));
    const doorValid = createValidateFn(runTypeFromJsonSchema({dependentRequired: {card: ['cvv']}} as const));
    const samples = [
      {card: '4111', cvv: '123'}, // trigger + requirement — valid
      {card: '4111'}, // trigger without requirement — invalid
      {cvv: '123'}, // requirement alone (no trigger) — valid
      {}, // no trigger — valid
      12, // non-object — unconstrained by the keyword
      'x',
      null,
      [1, 2],
    ];
    for (const sample of samples) expect(isValid(sample), JSON.stringify(sample)).toBe(doorValid(sample));
    expect(isValid({card: '4111'})).toBe(false);
    expect(isValid({card: '4111', cvv: '123'})).toBe(true);
  });

  it('folds multi-entry maps like the door', () => {
    const schema = {dependentRequired: {a: ['b'], c: ['d', 'e']}} as const;
    expect(getRunTypeId(RT.dependentRequired({a: ['b'], c: ['d', 'e']}))).toBe(getRunTypeId(runTypeFromJsonSchema(schema)));
  });
});

describe('dependentSchemas — builder and door converge on one id', () => {
  it('resolves both doors to the same cache entry', () => {
    const doorId = getRunTypeId(
      runTypeFromJsonSchema({dependentSchemas: {card: {properties: {cvv: {type: 'string'}}, required: ['cvv']}}} as const)
    );
    const builderId = getRunTypeId(RT.dependentSchemas({card: RT.object({cvv: TF.string()})}));
    expect(builderId).toBe(doorId);
  });

  it('enforces the consequence exactly like the door', () => {
    const isValid = createValidateFn(RT.dependentSchemas({card: RT.object({cvv: TF.string()})}));
    expect(isValid({card: 1, cvv: 'x'})).toBe(true);
    expect(isValid({card: 1})).toBe(false); // trigger present, consequence unmet
    expect(isValid({other: true})).toBe(true); // no trigger
    expect(isValid(12)).toBe(true); // non-object — unconstrained
  });
});

describe('conditional — builder and door converge on one id', () => {
  // The door twin of the corpus's if/then/else-over-consts case: same-base
  // branches, where the door's negation and the builder's Not-slot encoding
  // provably collapse to the same arms.
  const schema = {if: {maxLength: 4}, then: {const: 'yes'}, else: {const: 'other'}} as const;

  it('resolves both doors to the same cache entry', () => {
    const doorId = getRunTypeId(runTypeFromJsonSchema(schema));
    const builderId = getRunTypeId(
      RT.conditional({if: TF.string({maxLength: 4}), then: RT.literal('yes'), else: RT.literal('other')})
    );
    expect(builderId).toBe(doorId);
  });

  it('takes the then branch when the condition holds, the else branch otherwise', () => {
    const isValid = createValidateFn(
      RT.conditional({if: TF.string({maxLength: 4}), then: RT.literal('yes'), else: RT.literal('other')})
    );
    expect(isValid('yes')).toBe(true); // short string, then-branch
    expect(isValid('other')).toBe(true); // long string, else-branch
    expect(isValid('no')).toBe(false); // short but not 'yes'
    expect(isValid('wrong-long')).toBe(false); // long but not 'other'
  });

  it('a missing branch asserts nothing on its side', () => {
    const thenOnly = createValidateFn(RT.conditional({if: TF.string({maxLength: 4}), then: RT.literal('yes')}));
    expect(thenOnly('yes')).toBe(true);
    expect(thenOnly('anything-long')).toBe(true); // condition fails, no else assertion
    expect(thenOnly('no')).toBe(false); // condition holds, then must hold
  });

  it('pins both marker call shapes to one hash (marker rule)', () => {
    // Static shape: the caller names the lowered type; reflection shape: the
    // id comes off the builder value. Equivalent T, one cache entry.
    const staticId = getRunTypeId<{card: unknown; cvv: unknown}>();
    const value: {card: unknown; cvv: unknown} = {card: 1, cvv: 2};
    expect(getRunTypeId(value)).toBe(staticId);
  });
});
