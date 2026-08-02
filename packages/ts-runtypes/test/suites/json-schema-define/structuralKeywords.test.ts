// Structural keywords — uniqueItems / maxItems / minProperties /
// maxProperties / additionalProperties: false, lowered onto the arrayFormat
// and objectFormat brands. The collapse lifts the brand off the base shape
// (array / tuple / record / object literal), validate AND-chains the exact
// check onto the — possibly hoisted — base, verr reports one format error
// per violated param, and mocks reject-sample into the constrained set.
// Marker rule: both getRunTypeId call shapes pinned with a hash-equivalence
// pair on the raw-sentinel spelling.
import {describe, expect, it} from 'vitest';
import {createValidateFn, createGetValidationErrorsFn, createMockDataFn, getRunTypeId} from '@ts-runtypes/core';
import * as RT from '@ts-runtypes/core/schema';
import * as TF from '@ts-runtypes/core/formats';
import {runTypeFromJsonSchema} from '@ts-runtypes/core/json-schema';

describe('uniqueItems — 2020-12 deep equality', () => {
  it('rejects duplicates by JSON value, not identity', () => {
    const fn = createValidateFn(runTypeFromJsonSchema({type: 'array', uniqueItems: true}));
    expect(fn([1, 2])).toBe(true);
    expect(fn([])).toBe(true);
    expect(fn([1, 1])).toBe(false);
    expect(fn([{a: 1}, {a: 1}])).toBe(false); // deep equality
    expect(fn([{a: 1}, {a: 2}])).toBe(true);
    expect(
      fn([
        {a: 1, b: 2},
        {b: 2, a: 1},
      ])
    ).toBe(false); // key order is irrelevant
    expect(fn(['1', 1])).toBe(true); // different kinds stay distinct
    expect(fn([0, -0])).toBe(false); // numbers compare mathematically
    expect(fn([[1], [1]])).toBe(false);
    expect(fn([true, false])).toBe(true);
    expect(fn([null, null])).toBe(false);
    expect(fn(null)).toBe(false);
    expect(fn(42)).toBe(false);
  });

  it('composes with typed items and prefixItems tuples', () => {
    const typed = createValidateFn(runTypeFromJsonSchema({type: 'array', items: {type: 'number'}, uniqueItems: true}));
    expect(typed([1, 2, 3])).toBe(true);
    expect(typed([1, 2, 1])).toBe(false);
    expect(typed(['x'])).toBe(false); // items gate still applies
    const tuple = createValidateFn(
      runTypeFromJsonSchema({type: 'array', prefixItems: [{type: 'number'}, {type: 'number'}], minItems: 2, uniqueItems: true})
    );
    expect(tuple([1, 2])).toBe(true);
    expect(tuple([1, 1])).toBe(false);
    expect(tuple([1])).toBe(false); // minItems via the tuple shape
  });

  it('reports a format error and mocks stay sound', () => {
    const errs = createGetValidationErrorsFn(runTypeFromJsonSchema({type: 'array', uniqueItems: true}));
    expect(errs([1, 1]).length).toBeGreaterThan(0);
    expect(errs([1, 2])).toEqual([]);
    expect(errs(null).length).toBeGreaterThan(0); // base error only, no throw
    const mock = createMockDataFn(runTypeFromJsonSchema({type: 'array', uniqueItems: true}));
    const check = createValidateFn(runTypeFromJsonSchema({type: 'array', uniqueItems: true}));
    for (let i = 0; i < 16; i++) expect(check(mock())).toBe(true);
  });
});

describe('maxItems — length bound via the arrayFormat brand', () => {
  it('bounds plain and typed arrays', () => {
    const fn = createValidateFn(runTypeFromJsonSchema({type: 'array', maxItems: 3}));
    expect(fn([])).toBe(true);
    expect(fn([1, 2, 3])).toBe(true);
    expect(fn([1, 2, 3, 4])).toBe(false);
    const both = createValidateFn(runTypeFromJsonSchema({type: 'array', items: {type: 'number'}, minItems: 1, maxItems: 2}));
    expect(both([])).toBe(false); // minItems via the padded tuple
    expect(both([1])).toBe(true);
    expect(both([1, 2])).toBe(true);
    expect(both([1, 2, 3])).toBe(false);
  });

  it('mocks respect the bounds', () => {
    const mock = createMockDataFn(runTypeFromJsonSchema({type: 'array', items: {type: 'number'}, minItems: 1, maxItems: 2}));
    const check = createValidateFn(runTypeFromJsonSchema({type: 'array', items: {type: 'number'}, minItems: 1, maxItems: 2}));
    for (let i = 0; i < 16; i++) expect(check(mock())).toBe(true);
  });
});

describe('minProperties / maxProperties — key-count bounds', () => {
  it('bounds record key counts', () => {
    const fn = createValidateFn(runTypeFromJsonSchema({type: 'object', minProperties: 1, maxProperties: 2}));
    expect(fn({})).toBe(false);
    expect(fn({a: 1})).toBe(true);
    expect(fn({a: 1, b: 2})).toBe(true);
    expect(fn({a: 1, b: 2, c: 3})).toBe(false);
    expect(fn(null)).toBe(false);
    expect(fn([])).toBe(false); // JSON object kind excludes arrays
  });

  it('reports format errors and mocks stay sound', () => {
    const errs = createGetValidationErrorsFn(runTypeFromJsonSchema({type: 'object', minProperties: 2}));
    expect(errs({a: 1}).length).toBeGreaterThan(0);
    expect(errs({a: 1, b: 2})).toEqual([]);
    expect(errs(null).length).toBeGreaterThan(0); // guarded — no Object.keys throw
    const mock = createMockDataFn(runTypeFromJsonSchema({type: 'object', minProperties: 1, maxProperties: 3}));
    const check = createValidateFn(runTypeFromJsonSchema({type: 'object', minProperties: 1, maxProperties: 3}));
    for (let i = 0; i < 16; i++) expect(check(mock())).toBe(true);
  });
});

describe('additionalProperties: false — closedness', () => {
  it('closes a properties shape over its declared keys', () => {
    const fn = createValidateFn(
      runTypeFromJsonSchema({
        type: 'object',
        properties: {a: {type: 'string'}, b: {type: 'number'}},
        required: ['a'],
        additionalProperties: false,
      })
    );
    expect(fn({a: 'x'})).toBe(true);
    expect(fn({a: 'x', b: 1})).toBe(true);
    expect(fn({a: 'x', z: 1})).toBe(false); // undeclared key
    expect(fn({})).toBe(false); // required still applies
  });

  it('without properties only the empty object validates', () => {
    const fn = createValidateFn(runTypeFromJsonSchema({type: 'object', additionalProperties: false}));
    expect(fn({})).toBe(true);
    expect(fn({a: 1})).toBe(false);
  });

  it('true and schema-valued additionalProperties stay open / typed', () => {
    const open = createValidateFn(
      runTypeFromJsonSchema({type: 'object', properties: {a: {type: 'string'}}, additionalProperties: true})
    );
    expect(open({a: 'x', z: 1})).toBe(true);
    const typed = createValidateFn(runTypeFromJsonSchema({type: 'object', additionalProperties: {type: 'number'}}));
    expect(typed({a: 1})).toBe(true);
    expect(typed({a: 'x'})).toBe(false);
  });

  it('mocks of closed shapes stay sound', () => {
    const closed = runTypeFromJsonSchema({
      type: 'object',
      properties: {a: {type: 'string'}, b: {type: 'number'}},
      required: ['a'],
      additionalProperties: false,
    });
    const mock = createMockDataFn(closed);
    const check = createValidateFn(closed);
    for (let i = 0; i < 16; i++) expect(check(mock())).toBe(true);
  });
});

describe('structural keywords under negation', () => {
  it('not uniqueItems accepts exactly the arrays with duplicates', () => {
    const fn = createValidateFn(runTypeFromJsonSchema({not: {uniqueItems: true}}));
    expect(fn([1, 1])).toBe(true);
    expect(fn([{a: 1}, {a: 1}])).toBe(true);
    expect(fn([1, 2])).toBe(false); // unique arrays match the child
    expect(fn([])).toBe(false);
    expect(fn('x')).toBe(false); // type-less child excludes untouched kinds
    expect(fn(null)).toBe(false);
    const mock = createMockDataFn(runTypeFromJsonSchema({not: {uniqueItems: true}}));
    for (let i = 0; i < 16; i++) expect(fn(mock())).toBe(true);
  });

  it('not maxItems accepts exactly the arrays beyond the bound', () => {
    const fn = createValidateFn(runTypeFromJsonSchema({not: {maxItems: 2}}));
    expect(fn([1, 2, 3])).toBe(true);
    expect(fn([1, 2])).toBe(false);
    expect(fn([])).toBe(false);
    expect(fn(42)).toBe(false);
  });

  it('sibling-typed structural negation keeps the outer gate', () => {
    const fn = createValidateFn(runTypeFromJsonSchema({type: 'object', not: {minProperties: 2}}));
    expect(fn({})).toBe(true);
    expect(fn({a: 1})).toBe(true);
    expect(fn({a: 1, b: 2})).toBe(false);
    expect(fn('x')).toBe(false);
  });
});

describe('structural brands and the marker rule', () => {
  type UniqueArray = unknown[] & {readonly __rtFormatName?: 'arrayFormat'; readonly __rtFormatParams?: {uniqueItems: true}};

  it('the schema door converges with the raw-sentinel spelling (static shape)', () => {
    expect(getRunTypeId(runTypeFromJsonSchema({type: 'array', uniqueItems: true}))).toBe(getRunTypeId<UniqueArray>());
  });

  it('both call shapes resolve one cache entry (reflection shape)', () => {
    const value = [1, 2] as UniqueArray;
    expect(getRunTypeId(value)).toBe(getRunTypeId<UniqueArray>());
  });

  it('the hand-written brand validates and mocks like the schema door', () => {
    const fn = createValidateFn<UniqueArray>();
    expect(fn([1, 2])).toBe(true);
    expect(fn([1, 1])).toBe(false);
    const mock = createMockDataFn<UniqueArray>();
    for (let i = 0; i < 8; i++) expect(fn(mock())).toBe(true);
  });
});

describe('contains / minContains / maxContains', () => {
  it('asserts at least one matching item by default', () => {
    const fn = createValidateFn(runTypeFromJsonSchema({type: 'array', contains: {type: 'number'}}));
    expect(fn([1, 'a'])).toBe(true);
    expect(fn([2])).toBe(true);
    expect(fn(['a'])).toBe(false);
    expect(fn([])).toBe(false);
    expect(fn(42)).toBe(false);
  });

  it('minContains and maxContains bound the occurrence count', () => {
    const fn = createValidateFn(
      runTypeFromJsonSchema({type: 'array', contains: {type: 'number'}, minContains: 2, maxContains: 3})
    );
    expect(fn([1])).toBe(false);
    expect(fn([1, 2, 'a'])).toBe(true);
    expect(fn([1, 2, 3])).toBe(true);
    expect(fn([1, 2, 3, 4])).toBe(false);
  });

  it('minContains 0 keeps empty arrays valid while maxContains still bounds', () => {
    const fn = createValidateFn(
      runTypeFromJsonSchema({type: 'array', contains: {type: 'number'}, minContains: 0, maxContains: 1})
    );
    expect(fn([])).toBe(true);
    expect(fn(['a'])).toBe(true);
    expect(fn([1])).toBe(true);
    expect(fn([1, 2])).toBe(false);
  });

  it('boolean contains follow the spec (true needs any item, false rejects all arrays)', () => {
    const anyItem = createValidateFn(runTypeFromJsonSchema({type: 'array', contains: true}));
    expect(anyItem([])).toBe(false);
    expect(anyItem(['x'])).toBe(true);
    const noArray = createValidateFn(runTypeFromJsonSchema({type: 'array', contains: false}));
    expect(noArray([])).toBe(false);
    expect(noArray([1])).toBe(false);
  });

  it('minContains and maxContains WITHOUT contains are annotations', () => {
    const fn = createValidateFn(runTypeFromJsonSchema({type: 'array', minContains: 2}));
    expect(fn([])).toBe(true);
    expect(fn([1])).toBe(true);
  });

  it('reports one error per violated bound and mocks stay sound', () => {
    const errs = createGetValidationErrorsFn(runTypeFromJsonSchema({type: 'array', contains: {type: 'number'}, maxContains: 1}));
    expect(errs(['a']).length).toBeGreaterThan(0); // minContains 1 unmet
    expect(errs([1, 2]).length).toBeGreaterThan(0); // maxContains exceeded
    expect(errs([1])).toEqual([]);
    expect(errs(null).length).toBeGreaterThan(0); // base error only, no throw
    const bounded = runTypeFromJsonSchema({type: 'array', contains: {type: 'number'}, minContains: 2, maxContains: 3});
    const mock = createMockDataFn(bounded);
    const check = createValidateFn(bounded);
    for (let i = 0; i < 16; i++) expect(check(mock())).toBe(true);
  });

  it('composes with uniqueItems (distinct matching items)', () => {
    const schema = runTypeFromJsonSchema({type: 'array', contains: {type: 'number'}, minContains: 2, uniqueItems: true});
    const check = createValidateFn(schema);
    expect(check([1, 2, 'a'])).toBe(true);
    expect(check([1, 1, 'a'])).toBe(false); // duplicates
    expect(check([1, 'a'])).toBe(false); // only one match
    const mock = createMockDataFn(schema);
    for (let i = 0; i < 12; i++) expect(check(mock())).toBe(true);
  });

  it('negated contains accepts exactly the arrays failing the count', () => {
    const fn = createValidateFn(runTypeFromJsonSchema({not: {contains: {type: 'number'}}}));
    expect(fn(['a'])).toBe(true);
    expect(fn([])).toBe(true);
    expect(fn([1])).toBe(false);
    expect(fn(42)).toBe(false); // type-less child excludes untouched kinds
    const mock = createMockDataFn(runTypeFromJsonSchema({not: {contains: {type: 'number'}}}));
    for (let i = 0; i < 12; i++) expect(fn(mock())).toBe(true);
  });

  it('converges with the raw-sentinel spelling through both marker shapes', () => {
    type HasNumber = unknown[] & {readonly __rtContains?: {readonly rt$child: number; readonly rt$min: 1}};
    const doorId = getRunTypeId(runTypeFromJsonSchema({type: 'array', contains: {type: 'number'}}));
    expect(doorId).toBe(getRunTypeId<HasNumber>());
    const reflected = [1] as HasNumber;
    expect(getRunTypeId(reflected)).toBe(doorId);
  });
});

describe('patternProperties — pattern-keyed value schemas', () => {
  it('values under matching keys validate; other keys stay unconstrained', () => {
    const fn = createValidateFn(runTypeFromJsonSchema({type: 'object', patternProperties: {'^n_': {type: 'number'}}}));
    expect(fn({n_a: 1})).toBe(true);
    expect(fn({n_a: 'x'})).toBe(false);
    expect(fn({other: 'x'})).toBe(true);
    expect(fn({})).toBe(true);
    expect(fn(null)).toBe(false);
  });

  it('multiple patterns each gate their keys', () => {
    const fn = createValidateFn(
      runTypeFromJsonSchema({type: 'object', patternProperties: {'^n_': {type: 'number'}, '^s_': {type: 'string'}}})
    );
    expect(fn({n_a: 1, s_b: 'x'})).toBe(true);
    expect(fn({s_b: 2})).toBe(false);
    expect(fn({n_a: 'x'})).toBe(false);
  });

  it('additionalProperties: false admits pattern-matching keys', () => {
    const fn = createValidateFn(
      runTypeFromJsonSchema({
        type: 'object',
        properties: {id: {type: 'string'}},
        patternProperties: {'^x_': {type: 'number'}},
        additionalProperties: false,
      })
    );
    expect(fn({id: 'a'})).toBe(true);
    expect(fn({id: 'a', x_1: 2})).toBe(true);
    expect(fn({id: 'a', z: 1})).toBe(false);
  });

  it('reports a canonical error per violated pattern and mocks stay sound', () => {
    const errs = createGetValidationErrorsFn(
      runTypeFromJsonSchema({type: 'object', patternProperties: {'^n_': {type: 'number'}}})
    );
    expect(errs({n_a: 'x'}).length).toBeGreaterThan(0);
    expect(errs({n_a: 1})).toEqual([]);
    expect(errs(null).length).toBeGreaterThan(0);
    const schema = runTypeFromJsonSchema({type: 'object', patternProperties: {'^n_': {type: 'number'}}});
    const mock = createMockDataFn(schema);
    const check = createValidateFn(schema);
    for (let i = 0; i < 16; i++) expect(check(mock())).toBe(true);
  });
});

describe('propertyNames — every key validates against the subschema', () => {
  it('string constraints apply to keys by kind relevance', () => {
    const fn = createValidateFn(runTypeFromJsonSchema({type: 'object', propertyNames: {maxLength: 3}}));
    expect(fn({ab: 1})).toBe(true);
    expect(fn({abcd: 1})).toBe(false);
    expect(fn({})).toBe(true);
    const pattern = createValidateFn(runTypeFromJsonSchema({type: 'object', propertyNames: {pattern: '^[a-z]+$'}}));
    expect(pattern({abc: 1})).toBe(true);
    expect(pattern({Abc: 1})).toBe(false);
  });

  it('boolean forms follow the spec (true is a no-op, false admits only {})', () => {
    const anyKeys = createValidateFn(runTypeFromJsonSchema({type: 'object', propertyNames: true}));
    expect(anyKeys({whatever: 1})).toBe(true);
    const noKeys = createValidateFn(runTypeFromJsonSchema({type: 'object', propertyNames: false}));
    expect(noKeys({})).toBe(true);
    expect(noKeys({a: 1})).toBe(false);
  });

  it('reports a canonical error and mocks re-key into the constraint', () => {
    const errs = createGetValidationErrorsFn(runTypeFromJsonSchema({type: 'object', propertyNames: {maxLength: 3}}));
    expect(errs({abcd: 1}).length).toBeGreaterThan(0);
    expect(errs({ab: 1})).toEqual([]);
    const schema = runTypeFromJsonSchema({type: 'object', propertyNames: {maxLength: 3}});
    const mock = createMockDataFn(schema);
    const check = createValidateFn(schema);
    for (let i = 0; i < 16; i++) expect(check(mock())).toBe(true);
  });

  it('negated patternProperties and propertyNames stay exact', () => {
    const notPP = createValidateFn(runTypeFromJsonSchema({not: {patternProperties: {'^n_': {type: 'number'}}}}));
    expect(notPP({n_a: 'x'})).toBe(true); // fails the child
    expect(notPP({n_a: 1})).toBe(false); // satisfies the child
    expect(notPP({other: 1})).toBe(false); // vacuously satisfies
    expect(notPP('x')).toBe(false); // type-less child excludes untouched kinds
    const notPN = createValidateFn(runTypeFromJsonSchema({not: {propertyNames: {maxLength: 3}}}));
    expect(notPN({abcd: 1})).toBe(true);
    expect(notPN({ab: 1})).toBe(false);
  });
});

describe('allOf over prefixItems — tuple ∩ tuple merges slot-wise', () => {
  // docs/done/allof-tuple-intersection-collapse-gap.md: this exact shape used
  // to surface two tuples as a junk objectLiteral whose validator passed
  // EVERYTHING. The collapse now merges the slots (unknown sides defer, equal
  // sides collapse) and the merged node is indistinguishable from the
  // equivalent hand-written tuple; a genuine slot conflict projects never
  // (over-rejects, never a silent noop).
  it('the historical repro now validates exactly', () => {
    const fn = createValidateFn(
      runTypeFromJsonSchema({
        type: 'array',
        prefixItems: [{type: 'string'}],
        allOf: [{prefixItems: [true, {type: 'number'}]}],
      })
    );
    expect(fn([1, 2, 3])).toBe(false); // the todo's noop witness
    expect(fn(['a', 1, 2])).toBe(true);
    expect(fn(['a', 'b'])).toBe(false); // member's number slot enforced
    expect(fn(['a'])).toBe(true);
    expect(fn([])).toBe(true);
  });

  it('the merged id converges with the hand-written merged tuple', () => {
    const doorId = getRunTypeId(
      runTypeFromJsonSchema({
        type: 'array',
        prefixItems: [{type: 'string'}],
        allOf: [{prefixItems: [true, {type: 'number'}]}],
      })
    );
    expect(doorId).toBe(getRunTypeId<[string?, number?, ...unknown[]]>());
  });

  it('marker rule: the hand-written intersection twin through both shapes', () => {
    type Twin = [string, ...unknown[]] & [unknown?, number?, ...unknown[]];
    const staticId = getRunTypeId<Twin>();
    expect(staticId).toBe(getRunTypeId<[string, number?, ...unknown[]]>());
    const value: Twin = ['a', 1];
    expect(getRunTypeId(value)).toBe(staticId); // reflection shape agrees
    const fn = createValidateFn<Twin>();
    expect(fn(['a'])).toBe(true); // slot 0 required by the left tuple
    expect(fn(['a', 1])).toBe(true);
    expect(fn(['a', 'b'])).toBe(false);
    expect(fn([1])).toBe(false);
    expect(fn([])).toBe(false);
    expect(fn(['a', 1, 'x'])).toBe(true); // both tails open — tail stays open
  });

  it('a genuine slot conflict projects never', () => {
    type Conflict = [string] & [number];
    expect(getRunTypeId<Conflict>()).toBe(getRunTypeId<never>());
    const fn = createValidateFn<Conflict>();
    expect(fn(['a'] as never)).toBe(false);
    expect(fn([1] as never)).toBe(false);
  });

  it('verr and mocks ride the ordinary merged-tuple node', () => {
    const errs = createGetValidationErrorsFn(
      runTypeFromJsonSchema({
        type: 'array',
        prefixItems: [{type: 'string'}],
        allOf: [{prefixItems: [true, {type: 'number'}]}],
      })
    );
    expect(errs(['a', 'b']).length).toBeGreaterThan(0);
    expect(errs(['a', 1])).toEqual([]);
    const schema = runTypeFromJsonSchema({
      type: 'array',
      prefixItems: [{type: 'string'}],
      allOf: [{prefixItems: [true, {type: 'number'}]}],
    });
    const mock = createMockDataFn(schema);
    const check = createValidateFn(schema);
    for (let i = 0; i < 16; i++) expect(check(mock())).toBe(true);
  });
});

describe('boolean subschemas in array positions (2020-12 core §4.3.2)', () => {
  it('a true prefix slot is the no-constraint padding', () => {
    const fn = createValidateFn(runTypeFromJsonSchema({type: 'array', prefixItems: [true, {type: 'number'}]}));
    expect(fn(['anything', 2])).toBe(true);
    expect(fn([null, 2])).toBe(true);
    expect(fn([null, 'x'])).toBe(false); // the constrained slot still enforces
    expect(fn([])).toBe(true);
  });

  it('a false prefix slot forbids a real value at the position', () => {
    expect(getRunTypeId(runTypeFromJsonSchema({type: 'array', prefixItems: [{type: 'string'}, false]}))).toBe(
      getRunTypeId<[string?, undefined?, ...unknown[]]>()
    );
    const fn = createValidateFn(runTypeFromJsonSchema({type: 'array', prefixItems: [{type: 'string'}, false]}));
    expect(fn(['a'])).toBe(true);
    expect(fn([])).toBe(true);
    expect(fn(['a', 1])).toBe(false);
    expect(fn(['a', undefined])).toBe(true); // undefined ≡ absent — the optional-slot doctrine
  });

  it('items: true keeps the tail open, same as absent', () => {
    const fn = createValidateFn(runTypeFromJsonSchema({type: 'array', prefixItems: [{type: 'number'}], items: true}));
    expect(fn([1, 'x', null])).toBe(true);
    expect(fn(['x'])).toBe(false);
    expect(getRunTypeId(runTypeFromJsonSchema({type: 'array', prefixItems: [{type: 'number'}], items: true}))).toBe(
      getRunTypeId(runTypeFromJsonSchema({type: 'array', prefixItems: [{type: 'number'}]}))
    );
  });
});

describe('value-first structural builders — three-mode convergence (M9-P6)', () => {
  // RT.arrayFormat / RT.objectFormat / RT.contains / RT.patternProperties /
  // RT.propertyNames are the schema door's exact twins: same sentinel
  // encodings, one structural id per shape across all three authoring modes.
  it('arrayFormat: door ↔ RT ↔ type-first, both marker shapes', () => {
    const door = getRunTypeId(runTypeFromJsonSchema({type: 'array', items: {type: 'number'}, uniqueItems: true}));
    expect(getRunTypeId(RT.arrayFormat(RT.array(TF.number()), {uniqueItems: true}))).toBe(door);
    type Branded = RT.ArrayFormat<number[], {uniqueItems: true}>;
    expect(getRunTypeId<Branded>()).toBe(door);
    const value = [1, 2] as Branded;
    expect(getRunTypeId(value)).toBe(door); // reflection shape agrees
  });

  it('objectFormat: key-count bounds converge', () => {
    const door = getRunTypeId(runTypeFromJsonSchema({type: 'object', minProperties: 1, maxProperties: 2}));
    expect(getRunTypeId(RT.objectFormat(RT.record(RT.unknown()), {minProperties: 1, maxProperties: 2}))).toBe(door);
    expect(getRunTypeId<RT.ObjectFormat<Record<string, unknown>, {minProperties: 1; maxProperties: 2}>>()).toBe(door);
  });

  it('contains: default and explicit occurrence bounds converge', () => {
    const door = getRunTypeId(runTypeFromJsonSchema({type: 'array', contains: {type: 'number'}, minContains: 1}));
    expect(getRunTypeId(RT.contains(RT.array(RT.unknown()), TF.number()))).toBe(door);
    expect(getRunTypeId<RT.Contains<unknown[], number>>()).toBe(door);
    const bounded = getRunTypeId(RT.contains(RT.array(RT.unknown()), TF.number(), {minContains: 2, maxContains: 3}));
    expect(bounded).toBe(
      getRunTypeId(runTypeFromJsonSchema({type: 'array', contains: {type: 'number'}, minContains: 2, maxContains: 3}))
    );
    const fn = createValidateFn(RT.contains(RT.array(RT.unknown()), TF.number(), {minContains: 2, maxContains: 3}));
    expect(fn([1, 2])).toBe(true);
    expect(fn([1])).toBe(false);
    expect(fn([1, 2, 3, 4])).toBe(false);
  });

  it('patternProperties: pattern-keyed value schemas converge', () => {
    const door = getRunTypeId(runTypeFromJsonSchema({type: 'object', patternProperties: {'^a': {type: 'number'}}}));
    expect(getRunTypeId(RT.patternProperties(RT.record(RT.unknown()), {'^a': TF.number()}))).toBe(door);
    expect(getRunTypeId<RT.PatternProperties<Record<string, unknown>, {'^a': number}>>()).toBe(door);
  });

  it('propertyNames: the TYPED child is the value-first twin', () => {
    // A type-less door child ({maxLength: 3}) is the six-kind union per
    // 2020-12 kind relevance; the value-first key schema is
    // string-constrained, so its twin is the typed spelling.
    const door = getRunTypeId(runTypeFromJsonSchema({type: 'object', propertyNames: {type: 'string', maxLength: 3}}));
    expect(getRunTypeId(RT.propertyNames(RT.record(RT.unknown()), TF.string({maxLength: 3})))).toBe(door);
    expect(getRunTypeId<RT.PropertyNames<Record<string, unknown>, TF.String<{maxLength: 3}>>>()).toBe(door);
    const fn = createValidateFn(RT.propertyNames(RT.record(RT.unknown()), TF.string({maxLength: 3})));
    expect(fn({ab: 1})).toBe(true);
    expect(fn({abcd: 1})).toBe(false);
  });

  it('mocks stay inside the value-first structural constraints', () => {
    const schema = RT.arrayFormat(RT.array(TF.number()), {uniqueItems: true, maxItems: 3});
    const mock = createMockDataFn(schema);
    const check = createValidateFn(schema);
    for (let i = 0; i < 16; i++) expect(check(mock())).toBe(true);
  });
});
