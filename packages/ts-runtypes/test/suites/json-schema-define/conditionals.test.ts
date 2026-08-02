// if/then/else + dependentRequired/dependentSchemas + root $id/$vocabulary —
// the conditional applicators desugar through the negation machinery
// ((If ∧ Then) ∨ (¬If ∧ Else)) and the dependency keywords through
// (has-key ∧ consequence) ∨ ¬has-key, all combined with the distributive
// Conj so no intersection-with-union ever reaches the resolver.
import {describe, expect, it} from 'vitest';
import {createValidateFn, createMockDataFn, getRunTypeId} from '@ts-runtypes/core';
import {runTypeFromJsonSchema} from '@ts-runtypes/core/json-schema';
import type {ExactJsonSchema, RootJsonSchemaInput} from '@ts-runtypes/core/json-schema';

const US_ZIP = {
  type: 'object',
  properties: {country: {type: 'string'}, zip: {type: 'string'}},
  required: ['country'],
  if: {properties: {country: {const: 'US'}}, required: ['country']},
  then: {required: ['zip']},
} as const;

describe('JSON Schema conditional applicators', () => {
  it('if/then refines by branch (the classic country/zip shape)', () => {
    const fn = createValidateFn(runTypeFromJsonSchema(US_ZIP));
    expect(fn({country: 'US', zip: '90210'})).toBe(true);
    expect(fn({country: 'US'})).toBe(false);
    expect(fn({country: 'DE'})).toBe(true);
    expect(fn({country: 'DE', zip: '10115'})).toBe(true);
    expect(fn({zip: 'x'})).toBe(false); // country required by the base
    expect(fn(null)).toBe(false);
  });

  it('boolean if collapses to the taken branch', () => {
    const alwaysThen = createValidateFn(runTypeFromJsonSchema({if: true, then: {type: 'string'}}));
    expect(alwaysThen('s')).toBe(true);
    expect(alwaysThen(1)).toBe(false);
    const alwaysElse = createValidateFn(runTypeFromJsonSchema({if: false, then: {type: 'string'}, else: {type: 'number'}}));
    expect(alwaysElse(1)).toBe(true);
    expect(alwaysElse('s')).toBe(false);
  });

  it('if without else leaves the negative branch unconstrained', () => {
    const fn = createValidateFn(runTypeFromJsonSchema({if: {type: 'string'}, then: {minLength: 3}}));
    expect(fn('abc')).toBe(true);
    expect(fn('ab')).toBe(false); // string → then branch asserts minLength
    expect(fn(42)).toBe(true); // non-string → no else, accepted
  });

  it('dependentRequired upgrades co-required keys', () => {
    const fn = createValidateFn(
      runTypeFromJsonSchema({
        type: 'object',
        properties: {a: {type: 'string'}, b: {type: 'number'}},
        dependentRequired: {a: ['b']},
      })
    );
    expect(fn({})).toBe(true);
    expect(fn({b: 2})).toBe(true);
    expect(fn({a: 'x', b: 2})).toBe(true);
    expect(fn({a: 'x'})).toBe(false);
  });

  it('dependentSchemas applies the consequence schema on key presence', () => {
    const fn = createValidateFn(
      runTypeFromJsonSchema({
        type: 'object',
        properties: {credit: {type: 'string'}, cvv: {type: 'string'}},
        dependentSchemas: {credit: {required: ['cvv']}},
      })
    );
    expect(fn({})).toBe(true);
    expect(fn({credit: 'card', cvv: '123'})).toBe(true);
    expect(fn({credit: 'card'})).toBe(false);
  });

  it('root $id and $vocabulary are accepted and id-neutral', () => {
    const plain = getRunTypeId(runTypeFromJsonSchema({type: 'string'}));
    const withId = getRunTypeId(
      runTypeFromJsonSchema({
        $id: 'https://example.com/schemas/name',
        $vocabulary: {'https://json-schema.org/draft/2020-12/vocab/core': true},
        type: 'string',
      })
    );
    expect(withId).toBe(plain);
  });

  it('mocks stay sound under conditionals and dependencies', () => {
    const iteMock = createMockDataFn(runTypeFromJsonSchema(US_ZIP));
    const iteCheck = createValidateFn(runTypeFromJsonSchema(US_ZIP));
    for (let i = 0; i < 16; i++) expect(iteCheck(iteMock())).toBe(true);
  });
});

// ── Rejection pins (typecheck-time, enforced by `pnpm run lint`) ──────────
// Embedded $id re-scopes $ref resolution and stays rejected AT the key;
// the mirror carries the builder's exact constraint without a marker site.
declare function acceptsRoot<const S extends RootJsonSchemaInput>(schema: ExactJsonSchema<S, RootJsonSchemaInput>): void;
declare const embeddedId: {
  readonly type: 'object';
  readonly properties: {readonly a: {readonly $id: 'https://example.com/inner'; readonly type: 'string'}};
};
function _rootOnlyPins(): void {
  // @ts-expect-error — $id inside properties re-scopes refs; root-only
  acceptsRoot(embeddedId);
}
void _rootOnlyPins;

describe('sibling keywords apply conjunctively', () => {
  it('constraints beside $ref intersect with the referenced definition', () => {
    const fn = createValidateFn(
      runTypeFromJsonSchema({$defs: {positive: {type: 'number', minimum: 0}}, $ref: '#/$defs/positive', maximum: 10})
    );
    expect(fn(5)).toBe(true);
    expect(fn(0)).toBe(true);
    expect(fn(10)).toBe(true);
    expect(fn(-1)).toBe(false);
    expect(fn(11)).toBe(false);
    expect(fn('5')).toBe(false);
  });

  it('type beside anyOf gates the union arms', () => {
    const fn = createValidateFn(runTypeFromJsonSchema({type: 'string', anyOf: [{minLength: 5}, {maxLength: 2}]}));
    expect(fn('abcdef')).toBe(true);
    expect(fn('ab')).toBe(true);
    expect(fn('abc')).toBe(false); // neither arm
    expect(fn(42)).toBe(false); // sibling type gate
  });

  it('allOf beside properties merges both object shapes', () => {
    const fn = createValidateFn(
      runTypeFromJsonSchema({
        type: 'object',
        properties: {a: {type: 'string'}},
        required: ['a'],
        allOf: [{properties: {b: {type: 'number'}}, required: ['b']}],
      })
    );
    expect(fn({a: 'x', b: 1})).toBe(true);
    expect(fn({a: 'x'})).toBe(false);
    expect(fn({b: 1})).toBe(false);
  });

  it('const beside type still narrows to the literal', () => {
    const fn = createValidateFn(runTypeFromJsonSchema({type: 'string', const: 'exact'}));
    expect(fn('exact')).toBe(true);
    expect(fn('other')).toBe(false);
  });
});

describe('presence markers accept every JSON value', () => {
  // Regression: the marker used to be `{} | null`, which the engine compiles
  // as an object-or-null member check — primitive-valued present members were
  // rejected. It is now the six-kind JSON domain (see PresentValue).
  it('required without properties accepts primitive members', () => {
    const fn = createValidateFn(runTypeFromJsonSchema({type: 'object', required: ['zip']}));
    expect(fn({zip: '12345'})).toBe(true);
    expect(fn({zip: 7})).toBe(true);
    expect(fn({zip: null})).toBe(true);
    expect(fn({zip: true})).toBe(true);
    expect(fn({zip: [1]})).toBe(true);
    expect(fn({zip: {nested: true}})).toBe(true);
    expect(fn({})).toBe(false);
  });

  it('dependentRequired over undeclared keys enforces presence, not shape', () => {
    const fn = createValidateFn(runTypeFromJsonSchema({type: 'object', dependentRequired: {credit_card: ['billing_address']}}));
    expect(fn({})).toBe(true);
    expect(fn({credit_card: 5551234, billing_address: '555 Main'})).toBe(true);
    expect(fn({credit_card: 5551234})).toBe(false);
  });

  it('dependentSchemas consequence with primitive trigger values', () => {
    const fn = createValidateFn(
      runTypeFromJsonSchema({type: 'object', dependentSchemas: {credit_card: {required: ['billing_address']}}})
    );
    expect(fn({})).toBe(true);
    expect(fn({credit_card: 5551234, billing_address: 'x'})).toBe(true);
    expect(fn({credit_card: 5551234})).toBe(false);
  });

  it('declared-property types survive the marker intersection', () => {
    const fn = createValidateFn(
      runTypeFromJsonSchema({
        type: 'object',
        properties: {a: {type: 'string'}, b: {type: 'number'}},
        dependentRequired: {a: ['b']},
      })
    );
    expect(fn({a: 'x', b: 1})).toBe(true);
    expect(fn({a: 'x'})).toBe(false);
    expect(fn({a: 1, b: 1})).toBe(false); // declared type still enforced
  });
});
