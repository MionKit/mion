// `$ref` as a real URI-reference: the pointer is percent-decoded (RFC 3986)
// and then `~1`/`~0`-unescaped (RFC 6901) per token, empty tokens are real
// tokens, the walk reaches anywhere in the document rather than only `$defs`,
// and a ref repeating the root's own `$id` names THIS document.
import {describe, expect, it} from 'vitest';
import {createValidateFn, getRunTypeId} from '@ts-runtypes/core';
import {runTypeFromJsonSchema} from '@ts-runtypes/core/json-schema';

describe('$ref pointer escapes', () => {
  it('decodes ~0, ~1 and percent escapes in a definition name', () => {
    const isType = createValidateFn(
      runTypeFromJsonSchema({
        $defs: {
          'tilde~field': {type: 'integer'},
          'slash/field': {type: 'integer'},
          'percent%field': {type: 'integer'},
        },
        properties: {
          tilde: {$ref: '#/$defs/tilde~0field'},
          slash: {$ref: '#/$defs/slash~1field'},
          percent: {$ref: '#/$defs/percent%25field'},
        },
      } as const)
    );
    expect(isType({tilde: 1})).toBe(true);
    expect(isType({slash: 1})).toBe(true);
    expect(isType({percent: 1})).toBe(true);
    expect(isType({tilde: 'no'})).toBe(false);
    expect(isType({slash: 'no'})).toBe(false);
    expect(isType({percent: 'no'})).toBe(false);
  });

  it('decodes a quote in a member name', () => {
    const isType = createValidateFn(
      runTypeFromJsonSchema({
        properties: {'foo"bar': {$ref: '#/$defs/foo%22bar'}},
        $defs: {'foo"bar': {type: 'number'}},
      } as const)
    );
    expect(isType({'foo"bar': 1})).toBe(true);
    expect(isType({'foo"bar': 'no'})).toBe(false);
  });

  it('treats an empty path token as a real token', () => {
    const isType = createValidateFn(
      runTypeFromJsonSchema({$defs: {'': {$defs: {'': {type: 'number'}}}}, allOf: [{$ref: '#/$defs//$defs/'}]} as const)
    );
    expect(isType(1)).toBe(true);
    expect(isType('no')).toBe(false);
  });

  it('leaves a name that only LOOKS escaped alone', () => {
    // `~` and `%` decode; a name with neither still has to exist verbatim.
    const missing = createValidateFn(runTypeFromJsonSchema({$defs: {a: {type: 'string'}}, $ref: '#/$defs/nope'} as const));
    expect(missing('anything' as never)).toBe(false);
    expect(getRunTypeId(runTypeFromJsonSchema({$defs: {a: {type: 'string'}}, $ref: '#/$defs/nope'} as const))).toBe(
      getRunTypeId<never>()
    );
  });
});

describe('$ref reaches outside $defs', () => {
  it('points at a sibling property schema', () => {
    const isType = createValidateFn(
      runTypeFromJsonSchema({properties: {foo: {type: 'integer'}, bar: {$ref: '#/properties/foo'}}} as const)
    );
    expect(isType({bar: 3})).toBe(true);
    expect(isType({bar: 'no'})).toBe(false);
  });

  it('points at a tuple position', () => {
    const isType = createValidateFn(
      runTypeFromJsonSchema({prefixItems: [{type: 'integer'}, {$ref: '#/prefixItems/0'}]} as const)
    );
    expect(isType([1, 2])).toBe(true);
    expect(isType([1, 'no'])).toBe(false);
  });
});

describe('an absolute $id names this document', () => {
  it('resolves a bare URN back to the root', () => {
    const isType = createValidateFn(
      runTypeFromJsonSchema({
        $id: 'urn:uuid:deadbeef-1234-ffff-ffff-4321feebdaed',
        minimum: 30,
        properties: {foo: {$ref: 'urn:uuid:deadbeef-1234-ffff-ffff-4321feebdaed'}},
      } as const)
    );
    expect(isType({foo: 37})).toBe(true);
    expect(isType({foo: 12})).toBe(false);
  });

  it('resolves an anchor after the URN', () => {
    const isType = createValidateFn(
      runTypeFromJsonSchema({
        $id: 'urn:uuid:deadbeef-1234-ff00-00ff-4321feebdaed',
        properties: {foo: {$ref: 'urn:uuid:deadbeef-1234-ff00-00ff-4321feebdaed#something'}},
        $defs: {bar: {$anchor: 'something', type: 'string'}},
      } as const)
    );
    expect(isType({foo: 'a string'})).toBe(true);
    expect(isType({foo: 12})).toBe(false);
  });

  it('resolves a pointer after the URN', () => {
    const isType = createValidateFn(
      runTypeFromJsonSchema({
        $id: 'urn:uuid:deadbeef-1234-0000-0000-4321feebdaed',
        properties: {foo: {$ref: 'urn:uuid:deadbeef-1234-0000-0000-4321feebdaed#/$defs/bar'}},
        $defs: {bar: {type: 'string'}},
      } as const)
    );
    expect(isType({foo: 'a string'})).toBe(true);
    expect(isType({foo: 12})).toBe(false);
  });

  it('leaves a ref naming ANOTHER document unresolved rather than guessing', () => {
    // Out of scope by design: the fetch would sit inside type-checking. The
    // ref contributes no constraint instead of a wrong one.
    const isType = createValidateFn(runTypeFromJsonSchema({$ref: 'https://example.com/other#/$defs/thing'} as const));
    expect(isType('anything')).toBe(true);
    expect(isType(12)).toBe(true);
  });
});

describe('the ordinary shapes are unchanged', () => {
  it('still resolves the root and a plain definition name', () => {
    const recursive = createValidateFn(runTypeFromJsonSchema({type: 'array', items: {$ref: '#'}} as const));
    expect(recursive([[], [[]]])).toBe(true);
    expect(recursive([1] as never)).toBe(false);
    const named = createValidateFn(
      runTypeFromJsonSchema({
        $defs: {address: {type: 'object', properties: {street: {type: 'string'}}, required: ['street']}},
        $ref: '#/$defs/address',
      } as const)
    );
    expect(named({street: 'Main'})).toBe(true);
    expect(named({})).toBe(false);
  });
});
