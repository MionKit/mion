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
  'JSON_SCHEMA.closed_object': {
    type: 'object',
    properties: {id: {type: 'integer'}, name: {type: 'string'}},
    required: ['id', 'name'],
    additionalProperties: false,
  },
  'JSON_SCHEMA.pattern_properties': {
    type: 'object',
    patternProperties: {'^col_': {type: 'number'}},
    additionalProperties: false,
  },
  'JSON_SCHEMA.property_names': {
    type: 'object',
    propertyNames: {pattern: '^[a-z]+$'},
    additionalProperties: {type: 'number'},
  },
  'JSON_SCHEMA.contains_count': {
    type: 'array',
    items: {type: 'number'},
    contains: {type: 'number', minimum: 10},
    minContains: 2,
  },
  'JSON_SCHEMA.unique_items': {type: 'array', items: {type: 'number'}, uniqueItems: true},
  'JSON_SCHEMA.object_size': {
    type: 'object',
    additionalProperties: {type: 'number'},
    minProperties: 1,
    maxProperties: 3,
  },
  'JSON_SCHEMA.dependent_required': {
    type: 'object',
    properties: {credit_card: {type: 'integer'}, billing_address: {type: 'string'}},
    dependentRequired: {credit_card: ['billing_address']},
  },
  'JSON_SCHEMA.string_email': {type: 'string', format: 'email'},
  'JSON_SCHEMA.int_bounded': {type: 'integer', minimum: 0, maximum: 130},
  'JSON_SCHEMA.string_pattern': {type: 'string', pattern: '^[a-z][a-z0-9-]*$'},
  'JSON_SCHEMA.multiple_of': {type: 'number', multipleOf: 5},
} as const;
