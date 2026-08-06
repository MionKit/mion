// `unevaluated*` where the DOCUMENT pins the evaluated set down. The keyword
// used to resolve `never` for everything except a bare `false`, which rejected
// values the schema plainly accepts. Four readings are decided statically:
//   noop     — something in scope already evaluates every member
//   closed   — `false` over a knowable evaluated set
//   leftover — a schema value with nothing else evaluating members
//   poison   — still `never`, and only when a branch decides it at run time
import {describe, expect, it} from 'vitest';
import {createValidateFn, getRunTypeId} from '@ts-runtypes/core';
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

describe('a run-time decided scope is still refused loudly', () => {
  it('resolves never rather than checking less than the schema says', () => {
    // Which keys `anyOf` evaluated depends on which branch matched THIS value,
    // so there is no honest static answer yet.
    expect(
      getRunTypeId(runTypeFromJsonSchema({type: 'object', anyOf: [{minProperties: 1}], unevaluatedProperties: false} as const))
    ).toBe(getRunTypeId<never>());
    expect(
      getRunTypeId(
        runTypeFromJsonSchema({type: 'object', if: {type: 'object'}, then: true, unevaluatedProperties: false} as const)
      )
    ).toBe(getRunTypeId<never>());
  });
});
