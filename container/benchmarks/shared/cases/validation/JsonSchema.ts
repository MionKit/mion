// The JSON_SCHEMA group of the VALIDATION suite: structural constraints stated
// as a JSON Schema document for ajv, expressed natively by each competitor.
//
// Every other group here asks "how fast does each library validate this shape",
// each library describing the shape in its own dialect. This group asks the same
// question, but only about keywords whose whole point is that they constrain
// beyond the shape: a constraint on the keys themselves, key counts, item
// uniqueness, a contains count. Plain shapes (objects, arrays, tuples, $ref
// recursion) and the union-ish combinators are deliberately NOT here — the
// other groups already bench those in every dialect, and duplicating them told
// the reader nothing new.
//
// The document lives on the case as plain data so ajv compiles the very same
// bytes. The other competitors do NOT consume it: they express the same
// constraint in their own dialect, which is what makes the row a comparison
// rather than a capability check. Where a dialect cannot state the constraint at
// all, that competitor declares NOT_SUPPORTED and the cell reads n-a — verified
// against the pinned versions, never assumed:
//   - TypeBox carries `propertyNames` in the schema but never compiles it into
//     a check.
//   - zod has no array `uniqueItems` / `contains` and no key-count bounds.
//   - typia has no regex-keyed index signature, no count-of-matching-items tag,
//     and no key-count bounds.
//
// The samples encode OUR semantics, always — they are the mion truth the
// alignment audit measures everyone against, never a lowest common denominator.
// A competitor that would be marked `fail` on a divergent value opts its timing
// lane out with a per-competitor `samples` override, which the audit ignores.
import type {JsonSchemaCase} from '../types.ts';

export const JSON_SCHEMA = {
  property_names: {
    title: 'Key shape via propertyNames',
    description: 'The constraint is on the keys themselves, not on the values',
    schema: {
      type: 'object',
      propertyNames: {pattern: '^[a-z]+$'},
      additionalProperties: {type: 'number'},
    },
    getSamples: () => ({
      valid: [{}, {abc: 1}, {a: 1, bc: 2}],
      invalid: [{Abc: 1}, {'a-b': 1}, {a1: 1}, {abc: 'x'}, 'nope', null],
    }),
  },
  contains_count: {
    title: 'At least two matching items via contains + minContains',
    description: 'A count over matching items, which no element type can express',
    schema: {
      type: 'array',
      items: {type: 'number'},
      contains: {type: 'number', minimum: 10},
      minContains: 2,
    },
    getSamples: () => ({
      valid: [
        [10, 11],
        [1, 10, 2, 20],
        [10, 10, 10],
      ],
      invalid: [[10, 1], [1, 2], [], [10, 'x', 11], 'nope', null],
    }),
  },
  unique_items: {
    title: 'No duplicates via uniqueItems',
    description: '2020-12 uniqueness is deep equality, not identity',
    schema: {type: 'array', items: {type: 'number'}, uniqueItems: true},
    getSamples: () => ({
      valid: [[], [1], [1, 2, 3]],
      invalid: [[1, 1], [1, 2, 1], ['a', 'a'], 'nope', null],
    }),
  },
  object_size: {
    title: 'Key-count bounds via minProperties and maxProperties',
    schema: {
      type: 'object',
      additionalProperties: {type: 'number'},
      minProperties: 1,
      maxProperties: 3,
    },
    getSamples: () => ({
      valid: [{a: 1}, {a: 1, b: 2}, {a: 1, b: 2, c: 3}],
      invalid: [{}, {a: 1, b: 2, c: 3, d: 4}, {a: 'x'}, 'nope', null],
    }),
  },
} as const satisfies Record<string, JsonSchemaCase>;
