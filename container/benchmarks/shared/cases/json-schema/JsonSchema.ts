// The JSON Schema lane: cases whose SUBJECT is a draft 2020-12 schema literal.
//
// Every other suite here asks "how fast does each library validate this shape,
// each library describing the shape in its own dialect". This one asks the
// narrower, fairer question: given ONE schema document, how fast is each library
// that can consume it directly? The literal therefore lives on the case itself,
// as plain library-free data (satisfying this tree's no-imports rule), so the ajv
// column compiles the very same bytes rather than a re-typed lookalike. Only two
// columns can answer at all: zod and typia have no JSON Schema input door, and
// TypeBox's compiler dispatches on its own Kind symbol.
//
// ts-runtypes is the one competitor that must re-author the literal inline: its
// `runTypeFromJsonSchema(…)` reads the schema at BUILD time off the call site, so a
// cross-module reference has nothing to read. That copy is kept honest by the
// alignment audit, which runs every competitor against the shared samples below
// — a drifted copy shows up as a divergence, not as a silent pass.
//
// The samples encode OUR semantics, always — they are the ts-runtypes truth the
// audit measures everyone against, never a lowest common denominator. Where a
// document is genuinely read differently by the two libraries, the disagreeing
// value BELONGS here: that is the only way the divergence reaches the
// correctness page. A competitor that would be marked `fail` on it in the timing
// lane opts out there with a per-competitor `samples` override, which the audit
// deliberately ignores (see audit.ts). Same mechanism ATOMIC.number and
// UNION.atomic_union already use.
//
// ONE divergence is live in this group: `{type: 'number'}` (bare, and reached
// through the anyOf arm and additionalProperties) takes NaN and Infinity in ajv,
// while we require Number.isFinite. Aligning is a caller's choice
// (`numberMode: 'typeof'`), never a property of the authoring form, so the
// samples state our default and ajv opts its timing lane out.
//
// Two near-misses, both verified by running ajv rather than reading its source,
// and both genuinely aligned — do not "fix" them into overrides:
//   - `{type: 'integer'}` rejects NaN and Infinity in ajv too (not integers), so
//     int_bounded and realworld_user's `age` need no override.
//   - `format: 'email'` under `addFormats(ajv, {mode: 'full'})` rejects
//     `missing@tld` exactly as our Email does. The looser regex that accepts it
//     is ajv-formats' DEFAULT mode, which this lane does not use.
//
// Values marked "mock" were produced by
// `createMockDataFn(runTypeFromJsonSchema(<the same literal>))` and snapshotted, so ajv
// double-checks RunTypes' own generator against the document it came from.
import type {SharedCase} from '../types.ts';

export interface JsonSchemaCase extends SharedCase {
  /** The draft 2020-12 document under test. Plain data: no library types. */
  schema: unknown;
}

export const JSON_SCHEMA = {
  string_email: {
    title: 'String with format: email',
    description: 'The format keyword as a real constraint, not an annotation',
    schema: {type: 'string', format: 'email'},
    getSamples: () => ({
      // 'john@example.com' / 'contact@test.org' are mock output.
      valid: ['ada@example.com', 'a.b+c@sub.example.co.uk', 'john@example.com', 'contact@test.org'],
      // 'missing@tld' is the format divergence: our Email requires a dotted TLD,
      // ajv-formats' regex makes the dot optional and accepts it. Shared truth is
      // ours, so the audit reports it; ajv drops it via a `samples` override.
      invalid: ['not-an-email', 'missing@tld', '@example.com', 'no-at-sign.example.com', 42, null, undefined],
    }),
  },
  int_bounded: {
    title: 'Integer with minimum and maximum',
    schema: {type: 'integer', minimum: 0, maximum: 130},
    getSamples: () => ({
      // 95 / 7 are mock output.
      valid: [0, 36, 130, 95, 7],
      invalid: [-1, 131, 36.5, '36', null, undefined, NaN],
    }),
  },
  string_pattern: {
    title: 'String with a pattern',
    description: 'A bare 2020-12 regex string, anchored to the empty flag set',
    schema: {type: 'string', pattern: '^[a-z][a-z0-9-]*$'},
    getSamples: () => ({
      // 'p711q' / 'm90p' are mock output — the pool the build generates from the
      // regex, so ajv proves those generated values really do match the document.
      valid: ['a', 'my-slug-42', 'p711q', 'm90p'],
      invalid: ['9lives', 'Upper', 'has space', '', 42, null],
    }),
  },
  string_array: {
    title: 'Array of strings',
    schema: {type: 'array', items: {type: 'string'}},
    getSamples: () => ({
      valid: [[], ['a'], ['a', 'b', 'c']],
      invalid: [['a', 1], [null], 'nope', {}, null, undefined],
    }),
  },
  tuple_pair: {
    title: 'Closed tuple via prefixItems + items: false',
    schema: {type: 'array', prefixItems: [{type: 'string'}, {type: 'number'}], items: false, minItems: 2},
    getSamples: () => ({
      valid: [
        ['a', 1],
        ['', 0],
      ],
      invalid: [['a'], ['a', 1, 'extra'], [1, 'a'], [], 'nope', null],
    }),
  },
  object_simple: {
    title: 'Object with required and optional properties',
    description: 'The object-level required list inverts into property-level optionality',
    schema: {
      type: 'object',
      properties: {id: {type: 'integer'}, name: {type: 'string'}, nickname: {type: 'string'}},
      required: ['id', 'name'],
    },
    getSamples: () => ({
      valid: [
        {id: 1, name: 'Ada'},
        {id: 2, name: 'Grace', nickname: 'Amazing Grace'},
      ],
      invalid: [{id: 1}, {name: 'Ada'}, {id: '1', name: 'Ada'}, {id: 1, name: 'Ada', nickname: 5}, null, 'nope'],
    }),
  },
  record_number: {
    title: 'Record via additionalProperties',
    schema: {type: 'object', additionalProperties: {type: 'number'}},
    getSamples: () => ({
      valid: [{}, {a: 1}, {a: 1, b: 2.5}],
      // NaN / Infinity in a `number` position: RunTypes rejects them
      // (Number.isFinite), ajv's `{type:'number'}` accepts them. Kept here as the
      // shared truth so the audit REPORTS that divergence (ajv drops them via a
      // per-competitor `samples` override, same as ATOMIC.number does).
      invalid: [{a: 'x'}, {a: null}, {a: NaN}, {a: Infinity}, 'nope', null, undefined],
    }),
  },
  union_anyof: {
    title: 'Union via anyOf',
    schema: {anyOf: [{type: 'string'}, {type: 'number'}, {type: 'null'}]},
    getSamples: () => ({
      valid: ['a', 42, null, 0, ''],
      // Same divergence as record_number, reached through the union's number arm.
      invalid: [true, {}, [], undefined, NaN, Infinity, -Infinity],
    }),
  },
  recursive_tree: {
    title: 'Recursive tree via $defs and $ref',
    description: 'Root $ref into a self-referencing definition',
    schema: {
      $defs: {
        node: {
          type: 'object',
          properties: {name: {type: 'string'}, children: {type: 'array', items: {$ref: '#/$defs/node'}}},
          required: ['name', 'children'],
        },
      },
      $ref: '#/$defs/node',
    },
    getSamples: () => ({
      valid: [
        {name: 'leaf', children: []},
        {name: 'root', children: [{name: 'a', children: [{name: 'b', children: []}]}]},
      ],
      invalid: [{name: 'root'}, {name: 'root', children: [{name: 5, children: []}]}, {children: []}, null],
    }),
  },
  realworld_user: {
    title: 'Realistic user DTO',
    description: 'Formats, bounds, a nested object and an array in one document',
    schema: {
      type: 'object',
      properties: {
        id: {type: 'string', format: 'uuid'},
        email: {type: 'string', format: 'email'},
        name: {type: 'string', minLength: 2, maxLength: 50},
        age: {type: 'integer', minimum: 0, maximum: 130},
        tags: {type: 'array', items: {type: 'string'}},
        address: {
          type: 'object',
          properties: {street: {type: 'string'}, city: {type: 'string'}},
          required: ['street'],
        },
      },
      required: ['id', 'email', 'name', 'age', 'tags', 'address'],
    },
    getSamples: () => ({
      valid: [
        {
          id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
          email: 'ada@example.com',
          name: 'Ada Lovelace',
          age: 36,
          tags: ['math', 'code'],
          address: {street: '1 Analytical Way', city: 'London'},
        },
        {
          id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
          email: 'grace@example.com',
          name: 'Grace',
          age: 0,
          tags: [],
          address: {street: '2 Compiler Road'},
        },
      ],
      invalid: [
        {
          id: 'not-a-uuid',
          email: 'ada@example.com',
          name: 'Ada',
          age: 36,
          tags: [],
          address: {street: 'x'},
        },
        {
          id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
          email: 'nope',
          name: 'Ada',
          age: 36,
          tags: [],
          address: {street: 'x'},
        },
        {
          id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
          email: 'ada@example.com',
          name: 'A',
          age: 36,
          tags: [],
          address: {street: 'x'},
        },
        {
          id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
          email: 'ada@example.com',
          name: 'Ada',
          age: 131,
          tags: [],
          address: {street: 'x'},
        },
        {
          id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
          email: 'ada@example.com',
          name: 'Ada',
          age: 36,
          tags: [],
          address: {city: 'London'},
        },
        null,
      ],
    }),
  },
} as const satisfies Record<string, JsonSchemaCase>;
