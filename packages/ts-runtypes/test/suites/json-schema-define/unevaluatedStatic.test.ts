// `unevaluated*` where the DOCUMENT pins the evaluated set down. The keyword
// used to resolve `never` for everything except a bare `false`, which rejected
// values the schema plainly accepts. Four readings are decided statically:
//   noop     — something in scope already evaluates every member
//   closed   — `false` over a knowable evaluated set
//   leftover — a schema value with nothing else evaluating members
//   sweep    — the value decides, so the check runs over the members instead
import {describe, expect, it} from 'vitest';
import {createValidateFn} from '@ts-runtypes/core';
import {runTypeFromJsonSchema} from '@ts-runtypes/core/json-schema';

describe('a schema value covers whatever is left', () => {
  it('reads unevaluatedProperties as the value check it is', () => {
    const isType = createValidateFn(runTypeFromJsonSchema({unevaluatedProperties: {type: 'string', minLength: 3}} as const));
    expect(isType({})).toBe(true);
    expect(isType({foo: 'foo'})).toBe(true);
    expect(isType({foo: 'fo'})).toBe(false);
    expect(isType({foo: 12})).toBe(false);
  });

  it('reads unevaluatedItems the same way', () => {
    const isType = createValidateFn(runTypeFromJsonSchema({unevaluatedItems: {type: 'string'}} as const));
    expect(isType([])).toBe(true);
    expect(isType(['foo'])).toBe(true);
    expect(isType([12])).toBe(false);
  });

  it('keeps null a legal value', () => {
    const props = createValidateFn(runTypeFromJsonSchema({unevaluatedProperties: {type: 'null'}} as const));
    const items = createValidateFn(runTypeFromJsonSchema({unevaluatedItems: {type: 'null'}} as const));
    expect(props({foo: null})).toBe(true);
    expect(props({foo: 1})).toBe(false);
    expect(items([null])).toBe(true);
    expect(items([1])).toBe(false);
  });

  it('is unaffected by propertyNames, which evaluates no value', () => {
    const isType = createValidateFn(
      runTypeFromJsonSchema({propertyNames: {maxLength: 1}, unevaluatedProperties: {type: 'number'}} as const)
    );
    expect(isType({a: 1})).toBe(true);
    expect(isType({a: 'no'})).toBe(false);
    expect(isType({toolong: 1})).toBe(false);
  });
});

describe('something else evaluating everything makes it a no-op', () => {
  it('an adjacent additionalProperties, boolean or schema', () => {
    const openAll = createValidateFn(
      runTypeFromJsonSchema({
        type: 'object',
        properties: {foo: {type: 'string'}},
        additionalProperties: true,
        unevaluatedProperties: false,
      } as const)
    );
    expect(openAll({foo: 'foo', bar: 'bar'})).toBe(true);
    const typedAll = createValidateFn(
      runTypeFromJsonSchema({
        type: 'object',
        properties: {foo: {type: 'string'}},
        additionalProperties: {type: 'string'},
        unevaluatedProperties: false,
      } as const)
    );
    expect(typedAll({foo: 'foo', bar: 'bar'})).toBe(true);
    expect(typedAll({foo: 'foo', bar: 12})).toBe(false);
  });

  it('an additionalProperties nested in allOf', () => {
    const isType = createValidateFn(
      runTypeFromJsonSchema({
        properties: {foo: {type: 'string'}},
        allOf: [{additionalProperties: true}],
        unevaluatedProperties: false,
      } as const)
    );
    expect(isType({foo: 'foo', bar: 'bar'})).toBe(true);
  });

  it('an items in scope, for the array side', () => {
    const isType = createValidateFn(
      runTypeFromJsonSchema({items: {type: 'number'}, unevaluatedItems: {type: 'string'}} as const)
    );
    expect(isType([5, 6, 7, 8])).toBe(true);
    expect(isType(['no'])).toBe(false);
  });

  it('an items nested in allOf, beside that arm own prefixItems', () => {
    // The arm lowers to a tuple, the outer to an array, and the collapse
    // merges the pair slot-wise — before it did, this rejected every array.
    const isType = createValidateFn(
      runTypeFromJsonSchema({
        allOf: [{prefixItems: [{type: 'string'}], items: true}],
        unevaluatedItems: false,
      } as const)
    );
    expect(isType(['foo'])).toBe(true);
    expect(isType(['foo', 42, true])).toBe(true);
    expect(isType([42])).toBe(false); // the arm prefix slot still enforces
  });

  it('an unevaluatedItems: true in a sibling allOf arm', () => {
    const isType = createValidateFn(
      runTypeFromJsonSchema({
        allOf: [{prefixItems: [{type: 'string'}]}, {unevaluatedItems: true}],
        unevaluatedItems: false,
      } as const)
    );
    expect(isType(['foo'])).toBe(true);
    expect(isType(['foo', 42, true])).toBe(true);
  });

  it('an unevaluatedProperties: true anywhere in scope', () => {
    const inside = createValidateFn(
      runTypeFromJsonSchema({
        allOf: [{properties: {foo: {type: 'string'}}, unevaluatedProperties: true}],
        unevaluatedProperties: false,
      } as const)
    );
    expect(inside({foo: 'foo', bar: 'bar'})).toBe(true);
    const outside = createValidateFn(
      runTypeFromJsonSchema({
        properties: {foo: {type: 'string'}},
        allOf: [{unevaluatedProperties: true}],
        unevaluatedProperties: false,
      } as const)
    );
    expect(outside({foo: 'foo', bar: 'bar'})).toBe(true);
  });
});

describe('the closed reading still holds', () => {
  it('closes over the merged own + allOf key set', () => {
    const isType = createValidateFn(
      runTypeFromJsonSchema({
        type: 'object',
        properties: {a: {type: 'string'}},
        allOf: [{properties: {b: {type: 'number'}}}],
        unevaluatedProperties: false,
      } as const)
    );
    expect(isType({a: 'x', b: 1})).toBe(true);
    expect(isType({a: 'x'})).toBe(true);
    expect(isType({a: 'x', z: 1})).toBe(false);
  });
});

describe('a run-time decided scope sweeps instead of resolving never', () => {
  it('lets a matching branch contribute its keys', () => {
    const isType = createValidateFn(
      runTypeFromJsonSchema({
        properties: {foo: {type: 'string'}},
        anyOf: [{properties: {bar: {const: 'bar'}}, required: ['bar']}],
        unevaluatedProperties: false,
      } as const)
    );
    // `bar` counts as evaluated only because the arm that declares it PASSED.
    expect(isType({foo: 'a', bar: 'bar'})).toBe(true);
    expect(isType({foo: 'a', bar: 'bar', baz: 1})).toBe(false);
  });

  it('keeps `true` a no-op', () => {
    const open = createValidateFn(runTypeFromJsonSchema({type: 'object', unevaluatedProperties: true} as const));
    expect(open({anything: 1})).toBe(true);
  });

  it('counts the prefix an `if` evaluated, with no then and no else', () => {
    // 2020-12: a passing `if` still annotates, even with no branch attached.
    const isType = createValidateFn(runTypeFromJsonSchema({if: {prefixItems: [{const: 'a'}]}, unevaluatedItems: false} as const));
    expect(isType(['a'])).toBe(true);
    expect(isType(['b'])).toBe(false);
  });

  it('takes the else-branch prefix when the if fails', () => {
    const isType = createValidateFn(
      runTypeFromJsonSchema({
        prefixItems: [{const: 'foo'}],
        if: {prefixItems: [true, {const: 'bar'}]},
        then: {prefixItems: [true, true, {const: 'then'}]},
        else: {prefixItems: [true, true, true, {const: 'else'}]},
        unevaluatedItems: false,
      } as const)
    );
    expect(isType(['foo', 'bar', 'then'])).toBe(true);
    expect(isType(['foo', 'bar', 'then', 'else'])).toBe(false);
    expect(isType(['foo', 42, 42, 'else'])).toBe(true);
    expect(isType(['foo', 42, 42, 'else', 42])).toBe(false);
  });

  it('lets contains decide which indexes count as evaluated', () => {
    const isType = createValidateFn(
      runTypeFromJsonSchema({type: 'array', contains: {type: 'number'}, unevaluatedItems: false} as const)
    );
    expect(isType([1, 2, 3])).toBe(true);
    expect(isType([1, 'a'])).toBe(false);
  });
});

describe('a $ref target evaluates unconditionally', () => {
  it('counts the referenced keys, whichever side the keyword is written', () => {
    const after = createValidateFn(
      runTypeFromJsonSchema({
        $ref: '#/$defs/bar',
        properties: {foo: {type: 'string'}},
        unevaluatedProperties: false,
        $defs: {bar: {properties: {bar: {type: 'string'}}}},
      } as const)
    );
    const before = createValidateFn(
      runTypeFromJsonSchema({
        unevaluatedProperties: false,
        properties: {foo: {type: 'string'}},
        $ref: '#/$defs/bar',
        $defs: {bar: {properties: {bar: {type: 'string'}}}},
      } as const)
    );
    for (const isType of [after, before]) {
      expect(isType({foo: 'foo', bar: 'bar'})).toBe(true);
      expect(isType({foo: 'foo', bar: 'bar', baz: 'baz'})).toBe(false);
    }
  });

  it('counts the referenced prefix on the array side', () => {
    const isType = createValidateFn(
      runTypeFromJsonSchema({
        $ref: '#/$defs/bar',
        prefixItems: [{type: 'string'}],
        unevaluatedItems: false,
        $defs: {bar: {prefixItems: [true, {type: 'string'}]}},
      } as const)
    );
    expect(isType(['foo', 'bar'])).toBe(true);
    expect(isType(['foo', 'bar', 'baz'])).toBe(false);
  });
});
