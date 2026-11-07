// JSON_SCHEMA group: only keywords that constrain beyond the shape (key shape, key counts, uniqueness, contains
// counts); plain shapes and combinators are benched by the other groups. ajv compiles the case's own `schema` bytes;
// every other competitor states the same constraint in its own dialect, with a leaf custom check (zod `.check`,
// TypeBox `Type.Refine`, typia custom tag) where no feature fits, and NOT_SUPPORTED (n-a) only when neither can.
// Samples encode mion's semantics, never a lowest common denominator: a competitor that would `fail` on a divergent
// value opts its timing lane out with a per-competitor `samples` override, which the alignment audit ignores.
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
