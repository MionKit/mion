// The keyword-semantics divergences the official JSON-Schema-Test-Suite lane
// caught, one describe per root cause:
//   - an object arm inside a KIND UNION has to stay OPEN (2020-12 objects admit
//     undeclared keys; a members-only arm silently rejected them)
//   - dependentRequired / dependentSchemas are OBJECT-scoped, so every
//     non-object instance passes them untouched
//   - a REQUIRED member whose type checks nothing still enforces PRESENCE
//   - allOf arms conjoin kind-by-kind, so same-family constraints all survive
//   - a sibling keyword beside oneOf pushes INTO each branch instead of
//     collapsing the whole thing to never
//   - a key matched by patternProperties is not "additional"
import {describe, expect, it} from 'vitest';
import {createValidateFn, createGetValidationErrorsFn, createMockDataFn, getRunTypeId} from '@ts-runtypes/core';
import {runTypeFromJsonSchema} from '@ts-runtypes/core/json-schema';

describe('object arms stay open without a `type` keyword', () => {
  it('accepts undeclared keys, with or without the type gate', () => {
    const untyped = createValidateFn(runTypeFromJsonSchema({properties: {foo: {type: 'integer'}}} as const));
    const typed = createValidateFn(runTypeFromJsonSchema({type: 'object', properties: {foo: {type: 'integer'}}} as const));
    for (const isType of [untyped, typed]) {
      expect(isType({quux: []})).toBe(true);
      expect(isType({})).toBe(true);
      expect(isType({foo: 1, quux: []})).toBe(true);
      expect(isType({foo: 'no'})).toBe(false);
    }
    // Only the untyped spelling admits the other five JSON kinds.
    expect(untyped(12)).toBe(true);
    expect(typed(12)).toBe(false);
  });

  it('keeps a `not` member enforced while unrelated keys pass', () => {
    const isType = createValidateFn(runTypeFromJsonSchema({properties: {foo: {not: {}}}} as const));
    expect(isType({bar: 1, baz: 2})).toBe(true);
    expect(isType({})).toBe(true);
    expect(isType({foo: 1})).toBe(false);
  });

  it('still closes when the schema says so', () => {
    const closed = createValidateFn(
      runTypeFromJsonSchema({properties: {foo: {type: 'integer'}}, additionalProperties: false} as const)
    );
    expect(closed({foo: 1})).toBe(true);
    expect(closed({foo: 1, quux: 2})).toBe(false);
    const typedValues = createValidateFn(
      runTypeFromJsonSchema({properties: {foo: {type: 'integer'}}, additionalProperties: {type: 'boolean'}} as const)
    );
    expect(typedValues({foo: 1, quux: true})).toBe(true);
    expect(typedValues({foo: 1, quux: 2})).toBe(false);
  });
});

describe('dependentRequired / dependentSchemas ignore non-objects', () => {
  it('leaves every other JSON kind alone', () => {
    const required = createValidateFn(runTypeFromJsonSchema({dependentRequired: {bar: ['foo']}} as const));
    const schemas = createValidateFn(
      runTypeFromJsonSchema({dependentSchemas: {bar: {properties: {foo: {type: 'integer'}}}}} as const)
    );
    for (const isType of [required, schemas]) {
      expect(isType(12)).toBe(true);
      expect(isType('foobar')).toBe(true);
      expect(isType(['bar'])).toBe(true);
      expect(isType(null)).toBe(true);
      expect(isType(true)).toBe(true);
    }
  });

  it('only asserts once the trigger key is present', () => {
    const isType = createValidateFn(runTypeFromJsonSchema({dependentRequired: {bar: ['foo']}} as const));
    expect(isType({foo: 1})).toBe(true);
    expect(isType({unrelated: 1})).toBe(true);
    expect(isType({bar: 1, foo: 2})).toBe(true);
    expect(isType({bar: 1})).toBe(false);
  });

  it('applies the dependent SCHEMA only under the trigger key', () => {
    const isType = createValidateFn(
      runTypeFromJsonSchema({dependentSchemas: {bar: {properties: {foo: {type: 'integer'}}}}} as const)
    );
    expect(isType({foo: 'quux'})).toBe(true);
    expect(isType({bar: 1, foo: 2})).toBe(true);
    expect(isType({bar: 1, foo: 'quux'})).toBe(false);
  });
});

describe('a required member with no value constraint still has to be present', () => {
  it('enforces presence through the door', () => {
    const isType = createValidateFn(runTypeFromJsonSchema({properties: {foo: {}, bar: {}}, required: ['foo']} as const));
    expect(isType({foo: 1})).toBe(true);
    expect(isType({foo: undefined})).toBe(true);
    expect(isType({bar: 1})).toBe(false);
    expect(isType({})).toBe(false);
  });

  it('enforces presence for the type-first twin too', () => {
    // `{}` is not assignable to `{foo: unknown}` in TypeScript either — the
    // member checks no VALUE but it does check that the key exists.
    const isType = createValidateFn<{foo: unknown; bar?: unknown}>();
    expect(isType({foo: 1})).toBe(true);
    expect(isType({} as never)).toBe(false);
    const errors = createGetValidationErrorsFn<{foo: unknown}>();
    expect(errors({foo: 1})).toEqual([]);
    expect(errors({} as never)).toEqual([{path: ['foo'], expected: 'unknown'}]);
  });

  it('converges the door and the type-first spelling on one id', () => {
    // The type gate is what makes the two spellings the SAME type — a schema
    // with no `type` keyword denotes the six-kind union, not just the object.
    const typeFirst = getRunTypeId<{foo: unknown; bar?: unknown}>();
    expect(
      getRunTypeId(runTypeFromJsonSchema({type: 'object', properties: {foo: {}, bar: {}}, required: ['foo']} as const))
    ).toBe(typeFirst);
    const value: {foo: unknown; bar?: unknown} = {foo: 1};
    expect(getRunTypeId(value)).toBe(typeFirst);
  });
});

describe('allOf arms conjoin kind by kind', () => {
  it('keeps BOTH bounds of a split numeric constraint', () => {
    const isType = createValidateFn(runTypeFromJsonSchema({allOf: [{maximum: 30}, {minimum: 20}]} as const));
    expect(isType(25)).toBe(true);
    expect(isType(35)).toBe(false);
    expect(isType(15)).toBe(false);
    // Type-less arms constrain by kind relevance, so a string is untouched.
    expect(isType('anything')).toBe(true);
  });

  it('folds several multipleOf constraints into their least common multiple', () => {
    const isType = createValidateFn(
      runTypeFromJsonSchema({allOf: [{multipleOf: 2}], anyOf: [{multipleOf: 3}], oneOf: [{multipleOf: 5}]} as const)
    );
    expect(isType(30)).toBe(true);
    expect(isType(60)).toBe(true);
    expect(isType(10)).toBe(false);
    expect(isType(6)).toBe(false);
  });

  it('tightens same-key bounds rather than dropping one', () => {
    const isType = createValidateFn(runTypeFromJsonSchema({allOf: [{minimum: 20}, {minimum: 30}]} as const));
    expect(isType(30)).toBe(true);
    expect(isType(25)).toBe(false);
  });
});

describe('a sibling keyword beside oneOf pushes into every branch', () => {
  it('counts exactly-one against the base-constrained branches', () => {
    const isType = createValidateFn(runTypeFromJsonSchema({type: 'string', oneOf: [{minLength: 2}, {maxLength: 4}]} as const));
    expect(isType('foobar')).toBe(true); // long enough for arm 1 only
    expect(isType('a')).toBe(true); // short enough for arm 2 only
    expect(isType('abc')).toBe(false); // both arms match — not exactly one
    expect(isType(12 as never)).toBe(false); // the base still gates the kind
  });

  it('works for required-key branches under an object gate', () => {
    const isType = createValidateFn(
      runTypeFromJsonSchema({
        type: 'object',
        oneOf: [{required: ['foo', 'bar']}, {required: ['foo', 'baz']}],
      } as const)
    );
    expect(isType({foo: 1, bar: 2})).toBe(true);
    expect(isType({foo: 1, baz: 3})).toBe(true);
    expect(isType({foo: 1, bar: 2, baz: 3})).toBe(false);
    expect(isType({bar: 2})).toBe(false);
  });
});

describe('patternProperties keys are not additional', () => {
  const schema = {
    properties: {foo: {type: 'array', maxItems: 3}, bar: {type: 'array'}},
    patternProperties: {'f.o': {minItems: 2}},
    additionalProperties: {type: 'integer'},
  } as const;

  it('exempts a pattern-matched key from the additionalProperties value check', () => {
    const isType = createValidateFn(runTypeFromJsonSchema(schema));
    expect(isType({fxo: [1, 2]})).toBe(true); // matches the pattern, so not additional
    expect(isType({fxo: []})).toBe(false); // matched, and it fails the pattern's own rule
    expect(isType({quux: 3})).toBe(true); // genuinely additional, and an integer
    expect(isType({quux: 'foo'})).toBe(false); // genuinely additional, and not
    expect(isType({bar: []})).toBe(true); // declared, so never additional
  });

  it('reports the same verdict through the error reporter', () => {
    const errors = createGetValidationErrorsFn(runTypeFromJsonSchema(schema));
    expect(errors({fxo: [1, 2]})).toEqual([]);
    expect(errors({quux: 3})).toEqual([]);
    expect(errors({quux: 'foo'}).length).toBeGreaterThan(0);
  });

  it('mocks inside a closed object that also carries a record', () => {
    const closedSchema = runTypeFromJsonSchema({
      type: 'object',
      properties: {a: {type: 'string'}},
      required: ['a'],
      allOf: [{properties: {b: {type: 'number'}}}],
      unevaluatedProperties: false,
    } as const);
    const mock = createMockDataFn(closedSchema);
    const isType = createValidateFn(closedSchema);
    for (let i = 0; i < 16; i++) expect(isType(mock())).toBe(true);
  });
});

describe('additionalProperties looks at its OWN siblings only', () => {
  it('does not exempt a property an allOf member declares', () => {
    const isType = createValidateFn(
      runTypeFromJsonSchema({allOf: [{properties: {foo: {}}}], additionalProperties: {type: 'boolean'}} as const)
    );
    // `additionalProperties` has no sibling `properties`, so EVERY key must be
    // boolean — `foo` living in the allOf arm does not exempt it.
    expect(isType({foo: 1, bar: true})).toBe(false);
    expect(isType({foo: true, bar: true})).toBe(true);
  });

  it('still exempts the schema own declared keys', () => {
    const isType = createValidateFn(
      runTypeFromJsonSchema({
        properties: {foo: {type: 'integer'}},
        allOf: [{properties: {bar: {}}}],
        additionalProperties: {type: 'boolean'},
      } as const)
    );
    expect(isType({foo: 1, baz: true})).toBe(true);
    expect(isType({foo: 1, bar: 'not boolean'})).toBe(false);
  });
});
