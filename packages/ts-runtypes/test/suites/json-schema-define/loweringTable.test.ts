// Is each row of `SchemaLoweringByKeyword` TRUE?
//
// The table (src/json-schema/fromJsonSchema.ts) names, for every accepted JSON
// Schema keyword, where it lands: shape / format / params / slot / desugar /
// ref / ignored. Its TOTALITY is already compiler-enforced — a keyword with no
// row, or a row naming an invented channel, fails the build. What the compiler
// cannot check is whether a row is HONEST: nothing stops a keyword that quietly
// changes the recovered type from being filed under `ignored`.
//
// That gap is not hypothetical. It is what this file was written to catch:
// `readOnly` was filed as `ignored: annotation` when it actually lifts a
// property to a `readonly` member.
//
// Each group is checked against the behaviour its channel claims, with the
// structural id as the arbiter — the id is the whole point of the mapping, and
// two schemas share one only when they lower identically:
//
//   ignored → adding the keyword must NOT move the id
//   shape / params / format / slot → adding it MUST move the id
//
// The keywords are named individually rather than derived from the table: a
// test that read the table would agree with it by construction. A keyword that
// gains a row but no case here is still covered for totality by the compiler;
// this is the truthfulness half.
//
// NOTE: every schema literal is written INLINE at its `runTypeFromJsonSchema`
// call. The lowering is resolved from the literal AT THE CALL SITE, so routing
// them through a `(schema) => id` helper collapses every case onto one id — and
// the `ignored` group then passes vacuously, asserting nothing. Keep them inline.

import {describe, expect, it} from 'vitest';
import {getRunTypeId} from '@ts-runtypes/core';
import {runTypeFromJsonSchema} from '@ts-runtypes/core/json-schema';
import '@ts-runtypes/core/formats';
import type {SchemaLoweringByKeyword} from '../../../src/json-schema/fromJsonSchema.ts';

// Tie the behaviour below to the ROW TEXT, so the two cannot drift apart. The
// behavioural cases prove what a keyword does; these pin what its row CLAIMS it
// does. Re-filing `readOnly` back under `ignored` — the exact mistake this file
// exists for — stops compiling here, instead of leaving a test that quietly
// proves the opposite of what the table says.
type ChannelOf<K extends keyof SchemaLoweringByKeyword> = SchemaLoweringByKeyword[K] extends `${infer Channel}:${string}`
  ? Channel
  : never;
type ExpectChannel<K extends keyof SchemaLoweringByKeyword, Channel extends ChannelOf<K>> = Channel;

type _readOnlyIsShape = ExpectChannel<'readOnly', 'shape'>;
type _writeOnlyIsIgnored = ExpectChannel<'writeOnly', 'ignored'>;
type _titleIsIgnored = ExpectChannel<'title', 'ignored'>;
type _defaultIsIgnored = ExpectChannel<'default', 'ignored'>;
type _typeIsShape = ExpectChannel<'type', 'shape'>;
type _requiredIsShape = ExpectChannel<'required', 'shape'>;
type _minLengthIsParams = ExpectChannel<'minLength', 'params'>;
type _maxItemsIsParams = ExpectChannel<'maxItems', 'params'>;
type _formatIsFormat = ExpectChannel<'format', 'format'>;
type _containsIsSlot = ExpectChannel<'contains', 'slot'>;

describe('SchemaLoweringByKeyword — rows filed as `ignored` really are ignored', () => {
  it('annotations do not change what a string lowers to', () => {
    const bare = getRunTypeId(runTypeFromJsonSchema({type: 'string'}));
    expect(getRunTypeId(runTypeFromJsonSchema({type: 'string', title: 'Name'}))).toBe(bare);
    expect(getRunTypeId(runTypeFromJsonSchema({type: 'string', description: 'the name'}))).toBe(bare);
    expect(getRunTypeId(runTypeFromJsonSchema({type: 'string', $comment: 'internal note'}))).toBe(bare);
    expect(getRunTypeId(runTypeFromJsonSchema({type: 'string', default: 'anon'}))).toBe(bare);
    expect(getRunTypeId(runTypeFromJsonSchema({type: 'string', examples: ['a', 'b']}))).toBe(bare);
    expect(getRunTypeId(runTypeFromJsonSchema({type: 'string', deprecated: true}))).toBe(bare);
    expect(getRunTypeId(runTypeFromJsonSchema({type: 'string', writeOnly: true}))).toBe(bare);
  });

  it('annotations are ignored on a nested property schema too', () => {
    const bare = getRunTypeId(runTypeFromJsonSchema({type: 'object', properties: {a: {type: 'string'}}, required: ['a']}));
    expect(
      getRunTypeId(runTypeFromJsonSchema({type: 'object', title: 'User', properties: {a: {type: 'string'}}, required: ['a']}))
    ).toBe(bare);
    // A nested annotation is the easiest to confuse with something load-bearing.
    expect(
      getRunTypeId(
        runTypeFromJsonSchema({
          type: 'object',
          properties: {a: {type: 'string', description: 'x', default: 'y'}},
          required: ['a'],
        })
      )
    ).toBe(bare);
  });

  it('the root-only identity keywords are ignored', () => {
    const bare = getRunTypeId(runTypeFromJsonSchema({type: 'string'}));
    expect(getRunTypeId(runTypeFromJsonSchema({type: 'string', $schema: 'https://json-schema.org/draft/2020-12/schema'}))).toBe(
      bare
    );
    expect(getRunTypeId(runTypeFromJsonSchema({type: 'string', $id: 'https://example.com/s'}))).toBe(bare);
  });
});

describe('SchemaLoweringByKeyword — rows that claim to lower really do', () => {
  it('readOnly is NOT an annotation: it lifts the member to readonly', () => {
    // The row this file was written for. `readOnly` sits in the `shape`
    // channel, so it must move the id at a property position…
    const plain = getRunTypeId(runTypeFromJsonSchema({type: 'object', properties: {id: {type: 'string'}}, required: ['id']}));
    const lifted = getRunTypeId(
      runTypeFromJsonSchema({type: 'object', properties: {id: {type: 'string', readOnly: true}}, required: ['id']})
    );
    expect(lifted).not.toBe(plain);
    // …while its `writeOnly` sibling, filed as an annotation, must not.
    const written = getRunTypeId(
      runTypeFromJsonSchema({type: 'object', properties: {id: {type: 'string', writeOnly: true}}, required: ['id']})
    );
    expect(written).toBe(plain);
  });

  it('shape keywords move the id', () => {
    expect(getRunTypeId(runTypeFromJsonSchema({type: 'string'}))).not.toBe(getRunTypeId(runTypeFromJsonSchema({type: 'number'})));
    expect(getRunTypeId(runTypeFromJsonSchema({type: 'object', properties: {a: {type: 'string'}}}))).not.toBe(
      getRunTypeId(runTypeFromJsonSchema({type: 'object'}))
    );
    expect(getRunTypeId(runTypeFromJsonSchema({type: 'object', properties: {a: {type: 'string'}}, required: ['a']}))).not.toBe(
      getRunTypeId(runTypeFromJsonSchema({type: 'object', properties: {a: {type: 'string'}}}))
    );
    expect(getRunTypeId(runTypeFromJsonSchema({type: 'array', items: {type: 'string'}}))).not.toBe(
      getRunTypeId(runTypeFromJsonSchema({type: 'array'}))
    );
    expect(getRunTypeId(runTypeFromJsonSchema({const: 'active'}))).not.toBe(
      getRunTypeId(runTypeFromJsonSchema({type: 'string'}))
    );
  });

  it('params keywords move the id', () => {
    expect(getRunTypeId(runTypeFromJsonSchema({type: 'string', minLength: 3}))).not.toBe(
      getRunTypeId(runTypeFromJsonSchema({type: 'string'}))
    );
    expect(getRunTypeId(runTypeFromJsonSchema({type: 'number', minimum: 0}))).not.toBe(
      getRunTypeId(runTypeFromJsonSchema({type: 'number'}))
    );
    expect(getRunTypeId(runTypeFromJsonSchema({type: 'number', multipleOf: 5}))).not.toBe(
      getRunTypeId(runTypeFromJsonSchema({type: 'number'}))
    );
    expect(getRunTypeId(runTypeFromJsonSchema({type: 'array', items: {type: 'string'}, maxItems: 3}))).not.toBe(
      getRunTypeId(runTypeFromJsonSchema({type: 'array', items: {type: 'string'}}))
    );
    expect(getRunTypeId(runTypeFromJsonSchema({type: 'object', minProperties: 1}))).not.toBe(
      getRunTypeId(runTypeFromJsonSchema({type: 'object'}))
    );
  });

  it('format keywords move the id, and different formats differ from each other', () => {
    const bare = getRunTypeId(runTypeFromJsonSchema({type: 'string'}));
    const email = getRunTypeId(runTypeFromJsonSchema({type: 'string', format: 'email'}));
    const uuid = getRunTypeId(runTypeFromJsonSchema({type: 'string', format: 'uuid'}));
    expect(email).not.toBe(bare);
    expect(uuid).not.toBe(bare);
    expect(email).not.toBe(uuid);
  });

  it('slot keywords move the id, and the slot carries its child type', () => {
    const bareArray = getRunTypeId(runTypeFromJsonSchema({type: 'array', items: {type: 'string'}}));
    const withContains = getRunTypeId(
      runTypeFromJsonSchema({type: 'array', items: {type: 'string'}, contains: {type: 'string', format: 'uuid'}})
    );
    expect(withContains).not.toBe(bareArray);
    // The CHILD is part of the identity — a different contains child is a
    // different type, which is the whole reason it rides a slot instead of
    // being flattened into the params bag.
    const otherChild = getRunTypeId(
      runTypeFromJsonSchema({type: 'array', items: {type: 'string'}, contains: {type: 'string', format: 'email'}})
    );
    expect(otherChild).not.toBe(withContains);
  });

  it('a desugared bound is its own type, distinct from the inclusive one', () => {
    // `exclusiveMinimum` normalises to the canonical `gt` bound before it
    // reaches the params bag, so it must neither vanish nor collide with
    // `minimum`.
    expect(getRunTypeId(runTypeFromJsonSchema({type: 'number', exclusiveMinimum: 0}))).not.toBe(
      getRunTypeId(runTypeFromJsonSchema({type: 'number'}))
    );
    expect(getRunTypeId(runTypeFromJsonSchema({type: 'number', exclusiveMinimum: 0}))).not.toBe(
      getRunTypeId(runTypeFromJsonSchema({type: 'number', minimum: 0}))
    );
  });
});
