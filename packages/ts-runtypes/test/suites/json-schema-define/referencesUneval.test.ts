// M5 — same-document anchors ($anchor / $dynamicAnchor / $dynamicRef) and
// the unevaluated* document-consulted lowering: `false` closes over the
// statically determinable applicator set (own + allOf, recursively);
// instance-dependent evaluation (if / dependentSchemas / anyOf / oneOf /
// refs in scope) resolves NEVER — loud over lossy, the same doctrine as an
// undecidable negation verdict. Marker rule: both getRunTypeId call shapes
// with a hash-equivalence pair.
import {describe, expect, it} from 'vitest';
import {createValidateFn, createMockDataFn, getRunTypeId} from '@ts-runtypes/core';
import {runTypeFromJsonSchema, type FromJsonSchema} from '@ts-runtypes/core/json-schema';

describe('$anchor / $dynamicAnchor / $dynamicRef — same-document resolution', () => {
  it('$ref: #name resolves a $defs anchor', () => {
    const fn = createValidateFn(
      runTypeFromJsonSchema({$defs: {pos: {$anchor: 'positive', type: 'number', minimum: 0}}, $ref: '#positive'})
    );
    expect(fn(5)).toBe(true);
    expect(fn(0)).toBe(true);
    expect(fn(-1)).toBe(false);
    expect(fn('x')).toBe(false);
  });

  it('$dynamicRef resolves a $dynamicAnchor statically (single resource)', () => {
    const fn = createValidateFn(runTypeFromJsonSchema({$defs: {node: {$dynamicAnchor: 'T', type: 'string'}}, $dynamicRef: '#T'}));
    expect(fn('x')).toBe(true);
    expect(fn(1)).toBe(false);
  });

  it('a $dynamicAnchor also registers as a plain anchor', () => {
    const fn = createValidateFn(runTypeFromJsonSchema({$defs: {node: {$dynamicAnchor: 'T', type: 'boolean'}}, $ref: '#T'}));
    expect(fn(true)).toBe(true);
    expect(fn('x')).toBe(false);
  });

  it('an unknown anchor is the never schema, loudly', () => {
    expect(getRunTypeId(runTypeFromJsonSchema({$defs: {a: {$anchor: 'x', type: 'string'}}, $ref: '#missing'}))).toBe(
      getRunTypeId<never>()
    );
  });

  it('anchors converge with the equivalent $defs pointer spelling', () => {
    const viaAnchor = getRunTypeId(runTypeFromJsonSchema({$defs: {pos: {$anchor: 'p', type: 'number', minimum: 0}}, $ref: '#p'}));
    const viaPointer = getRunTypeId(
      runTypeFromJsonSchema({$defs: {pos: {$anchor: 'p', type: 'number', minimum: 0}}, $ref: '#/$defs/pos'})
    );
    expect(viaAnchor).toBe(viaPointer);
  });
});

describe('unevaluatedProperties — determinable lowering', () => {
  it('false closes over own plus allOf-contributed keys', () => {
    const fn = createValidateFn(
      runTypeFromJsonSchema({
        type: 'object',
        properties: {a: {type: 'string'}},
        allOf: [{properties: {b: {type: 'number'}}}],
        unevaluatedProperties: false,
      })
    );
    expect(fn({a: 'x'})).toBe(true);
    expect(fn({a: 'x', b: 1})).toBe(true); // allOf's b is EVALUATED, not additional
    expect(fn({a: 'x', z: 1})).toBe(false);
  });

  it('allOf patternProperties contribute to the closed set', () => {
    const fn = createValidateFn(
      runTypeFromJsonSchema({
        type: 'object',
        properties: {id: {type: 'string'}},
        allOf: [{patternProperties: {'^x_': {type: 'number'}}}],
        unevaluatedProperties: false,
      })
    );
    expect(fn({id: 'a', x_1: 2})).toBe(true);
    expect(fn({id: 'a', z: 1})).toBe(false);
  });

  it('true is a no-op and instance-dependent scopes poison to never', () => {
    const open = createValidateFn(runTypeFromJsonSchema({type: 'object', unevaluatedProperties: true}));
    expect(open({anything: 1})).toBe(true);
    expect(
      getRunTypeId(runTypeFromJsonSchema({type: 'object', if: {type: 'object'}, then: true, unevaluatedProperties: false}))
    ).toBe(getRunTypeId<never>());
    expect(getRunTypeId(runTypeFromJsonSchema({type: 'object', anyOf: [{minProperties: 1}], unevaluatedProperties: false}))).toBe(
      getRunTypeId<never>()
    );
  });

  it('mocks stay inside the closed set', () => {
    const schema = runTypeFromJsonSchema({
      type: 'object',
      properties: {a: {type: 'string'}},
      required: ['a'],
      allOf: [{properties: {b: {type: 'number'}}}],
      unevaluatedProperties: false,
    });
    const mock = createMockDataFn(schema);
    const check = createValidateFn(schema);
    for (let i = 0; i < 16; i++) expect(check(mock())).toBe(true);
  });
});

describe('unevaluatedItems — determinable lowering', () => {
  it('false closes the array at the longest merged prefix', () => {
    const fn = createValidateFn(
      runTypeFromJsonSchema({type: 'array', prefixItems: [{type: 'string'}, {type: 'number'}], unevaluatedItems: false})
    );
    expect(fn(['a'])).toBe(true);
    expect(fn(['a', 1])).toBe(true);
    expect(fn(['a', 1, 2])).toBe(false);
  });

  it('no prefix in scope closes at zero (only the empty array)', () => {
    const fn = createValidateFn(runTypeFromJsonSchema({type: 'array', unevaluatedItems: false}));
    expect(fn([])).toBe(true);
    expect(fn([1])).toBe(false);
  });

  it('allOf prefixes extend the closed bound to the longest merged prefix', () => {
    // The merged case the M5 lowering always computed, testable since the
    // tuple ∩ tuple collapse merge closed the engine gap
    // (docs/done/allof-tuple-intersection-collapse-gap.md): the member's
    // longer prefix is EVALUATED, so the close lands at index 2, and the
    // member's number slot still enforces.
    const fn = createValidateFn(
      runTypeFromJsonSchema({
        type: 'array',
        prefixItems: [{type: 'string'}],
        allOf: [{prefixItems: [true, {type: 'number'}]}],
        unevaluatedItems: false,
      })
    );
    expect(fn(['a'])).toBe(true);
    expect(fn(['a', 1])).toBe(true);
    expect(fn(['a', 1, 2])).toBe(false); // closed at the merged bound of 2
    expect(fn(['a', 'b'])).toBe(false);
    expect(fn([])).toBe(true);
  });

  it('items in scope makes it a no-op; contains in scope poisons', () => {
    const noop = createValidateFn(runTypeFromJsonSchema({type: 'array', items: {type: 'number'}, unevaluatedItems: false}));
    expect(noop([1, 2, 3])).toBe(true);
    expect(getRunTypeId(runTypeFromJsonSchema({type: 'array', contains: {type: 'number'}, unevaluatedItems: false}))).toBe(
      getRunTypeId<never>()
    );
  });
});

describe('marker rule — anchors resolve one cache entry through both shapes', () => {
  type Anchored = number;

  it('static and reflection shapes agree', () => {
    const doorId = getRunTypeId(runTypeFromJsonSchema({$defs: {n: {$anchor: 'num', type: 'number'}}, $ref: '#num'}));
    expect(doorId).toBe(getRunTypeId<Anchored>());
    const value: Anchored = 7;
    expect(getRunTypeId(value)).toBe(doorId);
  });
});

describe('union semantics truth — pinned', () => {
  // The contract every union-shaped mapping rests on: PLAIN union
  // validation (and anyOf, its faithful spelling) accepts a value matching
  // AT LEAST ONE arm. oneOf is the EXACTLY-ONE combinator (the M7 ruling):
  // it rides the OneOf branch tuple and a value matching two branches is
  // REJECTED, exactly as a strict JSON Schema validator would. If this pin
  // ever flips, the guide's anyOf/oneOf rows must flip with it.
  it('a two-arm match passes anyOf and fails oneOf', () => {
    const overlapping = [
      {type: 'object', properties: {a: {type: 'string'}}, required: ['a']},
      {type: 'object', properties: {a: {type: 'string'}, b: {type: 'number'}}, required: ['a', 'b']},
    ] as const;
    const viaAnyOf = createValidateFn(runTypeFromJsonSchema({anyOf: overlapping}));
    const viaOneOf = createValidateFn(runTypeFromJsonSchema({oneOf: overlapping}));
    const both = {a: 'x', b: 1}; // matches BOTH arms
    expect(viaAnyOf(both)).toBe(true);
    expect(viaOneOf(both)).toBe(false); // exactly-one — enforced since M7
    expect(viaOneOf({a: 'x'})).toBe(true); // one arm only
    expect(viaAnyOf({b: 1})).toBe(false);
  });

  it('format uuid is version-agnostic per 2020-12', () => {
    const fn = createValidateFn(runTypeFromJsonSchema({type: 'string', format: 'uuid'}));
    expect(fn('a3bb189e-8bf9-3888-9912-ace4e6543002')).toBe(true); // v3
    expect(fn('c232ab00-9414-11ec-b3c8-9f68deced846')).toBe(true); // v1
    expect(fn('017f22e2-79b0-7cc3-98c4-dc0c0c07398f')).toBe(true); // v7
    expect(fn('not-a-uuid')).toBe(false);
    const mock = createMockDataFn(runTypeFromJsonSchema({type: 'string', format: 'uuid'}));
    for (let i = 0; i < 8; i++) expect(fn(mock())).toBe(true);
  });
});

describe('format sibling keywords — conjunction enforced, never dropped', () => {
  // 2020-12: siblings beside a named format apply conjunctively. The door
  // REPLACES the brand's default bounds with the document's (the RFC-ish
  // defaults are the type-first surface's opinion, not the schema's);
  // fixed-width families and second-pattern stacks resolve never, loud.
  it('email + maxLength enforces the tighter document bound', () => {
    const fn = createValidateFn(runTypeFromJsonSchema({type: 'string', format: 'email', maxLength: 20}));
    expect(fn('ada@example.com')).toBe(true); // 15 chars, valid email
    expect(fn('a-quite-long-local-part@example.com')).toBe(false); // valid email, over 20
    expect(fn('not-an-email-at-all')).toBe(false); // under 20, not an email
    const mock = createMockDataFn(runTypeFromJsonSchema({type: 'string', format: 'email', maxLength: 20}));
    for (let i = 0; i < 8; i++) expect(fn(mock())).toBe(true);
  });

  it('email + minLength above the default is enforced too', () => {
    const fn = createValidateFn(runTypeFromJsonSchema({type: 'string', format: 'email', minLength: 12}));
    expect(fn('ada@example.com')).toBe(true); // 15 ≥ 12
    expect(fn('ab@cd.co')).toBe(false); // valid email, only 8 chars
  });

  it('the sibling-bearing form is a DISTINCT identity from the bare format', () => {
    const bare = getRunTypeId(runTypeFromJsonSchema({type: 'string', format: 'email'}));
    const bounded = getRunTypeId(runTypeFromJsonSchema({type: 'string', format: 'email', maxLength: 20}));
    expect(bounded).not.toBe(bare);
  });

  it('fixed-width formats and second-pattern stacks poison to never', () => {
    type UuidLen = FromJsonSchema<{readonly type: 'string'; readonly format: 'uuid'; readonly minLength: 10}>;
    const uuidPin: [UuidLen] extends [never] ? true : false = true;
    expect(uuidPin).toBe(true);
    type EmailPattern = FromJsonSchema<{readonly type: 'string'; readonly format: 'email'; readonly pattern: '^a'}>;
    const patternPin: [EmailPattern] extends [never] ? true : false = true;
    expect(patternPin).toBe(true);
    type EmailEncoding = FromJsonSchema<{readonly type: 'string'; readonly format: 'email'; readonly contentEncoding: 'base64'}>;
    const encodingPin: [EmailEncoding] extends [never] ? true : false = true;
    expect(encodingPin).toBe(true);
  });

  it('marker pair: static and reflect shapes resolve the same bounded brand', () => {
    type BoundedEmail = FromJsonSchema<{readonly type: 'string'; readonly format: 'email'; readonly maxLength: 20}>;
    const staticId = getRunTypeId<BoundedEmail>();
    const v: BoundedEmail = 'ada@example.com';
    expect(getRunTypeId(v)).toBe(staticId);
    expect(staticId).toBe(getRunTypeId(runTypeFromJsonSchema({type: 'string', format: 'email', maxLength: 20})));
  });
});

describe('content keywords', () => {
  it('contentEncoding enforces the RFC 4648 shapes', () => {
    const b64 = createValidateFn(runTypeFromJsonSchema({type: 'string', contentEncoding: 'base64'}));
    expect(b64('SGVsbG8=')).toBe(true);
    expect(b64('')).toBe(true);
    expect(b64('QQ=')).toBe(false); // bad padding
    expect(b64('not base64!')).toBe(false);
    const b16 = createValidateFn(runTypeFromJsonSchema({type: 'string', contentEncoding: 'base16'}));
    expect(b16('DEADBEEF')).toBe(true);
    expect(b16('deadbeef')).toBe(true);
    expect(b16('XYZ')).toBe(false);
  });

  it('contentMediaType application/json parse-checks, decoded when encoded', () => {
    const json = createValidateFn(runTypeFromJsonSchema({type: 'string', contentMediaType: 'application/json'}));
    expect(json('{"a":1}')).toBe(true);
    expect(json('null')).toBe(true);
    expect(json('{oops')).toBe(false);
    expect(json(42)).toBe(false);
    const encoded = createValidateFn(
      runTypeFromJsonSchema({type: 'string', contentEncoding: 'base64', contentMediaType: 'application/json'})
    );
    expect(encoded('e30=')).toBe(true); // base64 of {}
    expect(encoded('SGVsbG8=')).toBe(false); // decodes, but not JSON
    expect(encoded('{"a":1}')).toBe(false); // raw JSON is not base64
  });

  it('content mocks stay sound', () => {
    for (const schema of [
      runTypeFromJsonSchema({type: 'string', contentEncoding: 'base64'}),
      runTypeFromJsonSchema({type: 'string', contentMediaType: 'application/json'}),
      runTypeFromJsonSchema({type: 'string', contentEncoding: 'base64', contentMediaType: 'application/json'}),
    ]) {
      const mock = createMockDataFn(schema);
      const check = createValidateFn(schema);
      for (let i = 0; i < 8; i++) expect(check(mock())).toBe(true);
    }
  });
});
