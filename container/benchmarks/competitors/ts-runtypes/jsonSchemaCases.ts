// ts-runtypes validators keyed by suite case key ("GROUP.case"), JSON SCHEMA form.
// Each entry is `() => createValidateFn(runTypeFromJsonSchema(<the document>))`, the schema
// literal written inline because `runTypeFromJsonSchema(…)` reads it at BUILD time off the
// call site. Consumed by typecost ONLY (it is NOT imported by main.ts): it feeds
// the `ts-go(runTypeFromJsonSchema)` form, which measures what `FromJsonSchema` costs the
// type checker to resolve a document into a type.
//
// Deliberately LANE-SCOPED, not total. The other two maps are total over every
// shared key because they drive the runtime bench; this one exists to answer one
// question — "what does recovering a type from a schema document cost, versus
// json-schema-to-ts doing the same job?" — so it covers the JSON_SCHEMA group,
// where that comparison is meaningful and where a competitor column exists to
// compare against. A key absent here simply renders n/a in its row.

import {createValidateFn} from '@ts-runtypes/core';
import {runTypeFromJsonSchema} from '@ts-runtypes/core/json-schema';
import type {CaseKey} from '../../shared/cases/index.ts';

export const jsonSchemaCases: Partial<Record<CaseKey, () => (value: unknown) => boolean>> = {
  // ── JSON_SCHEMA ──
  'JSON_SCHEMA.string_email': () => createValidateFn(runTypeFromJsonSchema({type: 'string', format: 'email'})),
  'JSON_SCHEMA.int_bounded': () => createValidateFn(runTypeFromJsonSchema({type: 'integer', minimum: 0, maximum: 130})),
  'JSON_SCHEMA.string_pattern': () => createValidateFn(runTypeFromJsonSchema({type: 'string', pattern: '^[a-z][a-z0-9-]*$'})),
  'JSON_SCHEMA.string_array': () => createValidateFn(runTypeFromJsonSchema({type: 'array', items: {type: 'string'}})),
  'JSON_SCHEMA.tuple_pair': () =>
    createValidateFn(runTypeFromJsonSchema({type: 'array', prefixItems: [{type: 'string'}, {type: 'number'}], items: false, minItems: 2})),
  'JSON_SCHEMA.object_simple': () =>
    createValidateFn(
      runTypeFromJsonSchema({
        type: 'object',
        properties: {id: {type: 'integer'}, name: {type: 'string'}, nickname: {type: 'string'}},
        required: ['id', 'name'],
      })
    ),
  'JSON_SCHEMA.record_number': () => createValidateFn(runTypeFromJsonSchema({type: 'object', additionalProperties: {type: 'number'}})),
  'JSON_SCHEMA.union_anyof': () =>
    createValidateFn(runTypeFromJsonSchema({anyOf: [{type: 'string'}, {type: 'number'}, {type: 'null'}]})),
  'JSON_SCHEMA.recursive_tree': () =>
    createValidateFn(
      runTypeFromJsonSchema({
        $defs: {
          node: {
            type: 'object',
            properties: {name: {type: 'string'}, children: {type: 'array', items: {$ref: '#/$defs/node'}}},
            required: ['name', 'children'],
          },
        },
        $ref: '#/$defs/node',
      })
    ),
  'JSON_SCHEMA.realworld_user': () =>
    createValidateFn(
      runTypeFromJsonSchema({
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
      })
    ),
};
