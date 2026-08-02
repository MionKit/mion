// json-schema-to-ts documents keyed by suite case key ("GROUP.case").
//
// A TYPE-LEVEL-ONLY competitor: json-schema-to-ts ships `FromSchema<S>` and
// nothing else — no validator, no runtime. So this map is not a case map like the
// others; it is just the documents, read by typecost to measure what recovering a
// TypeScript type from each one costs the checker. There is no runtime column for
// it, and it is deliberately absent from the runtime competitor list.
//
// The documents are re-authored inline, matching every other competitor here
// (each writes its own spelling of a case) and keeping the probe self-contained.
// Lane-scoped like `ts-runtypes/jsonSchemaCases.ts`: only the JSON_SCHEMA group,
// the one place a schema-document comparison means anything.

export const cases = {
  'JSON_SCHEMA.string_email': {type: 'string', format: 'email'},
  'JSON_SCHEMA.int_bounded': {type: 'integer', minimum: 0, maximum: 130},
  'JSON_SCHEMA.string_pattern': {type: 'string', pattern: '^[a-z][a-z0-9-]*$'},
  'JSON_SCHEMA.string_array': {type: 'array', items: {type: 'string'}},
  'JSON_SCHEMA.tuple_pair': {type: 'array', prefixItems: [{type: 'string'}, {type: 'number'}], items: false, minItems: 2},
  'JSON_SCHEMA.object_simple': {
    type: 'object',
    properties: {id: {type: 'integer'}, name: {type: 'string'}, nickname: {type: 'string'}},
    required: ['id', 'name'],
  },
  'JSON_SCHEMA.record_number': {type: 'object', additionalProperties: {type: 'number'}},
  'JSON_SCHEMA.union_anyof': {anyOf: [{type: 'string'}, {type: 'number'}, {type: 'null'}]},
  'JSON_SCHEMA.recursive_tree': {
    $defs: {
      node: {
        type: 'object',
        properties: {name: {type: 'string'}, children: {type: 'array', items: {$ref: '#/$defs/node'}}},
        required: ['name', 'children'],
      },
    },
    $ref: '#/$defs/node',
  },
  'JSON_SCHEMA.realworld_user': {
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
} as const;
