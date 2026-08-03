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
  'JSON_SCHEMA.multiple_of': () => createValidateFn(runTypeFromJsonSchema({type: 'number', multipleOf: 5})),
  'JSON_SCHEMA.closed_object': () =>
    createValidateFn(
      runTypeFromJsonSchema({
        type: 'object',
        properties: {id: {type: 'integer'}, name: {type: 'string'}},
        required: ['id', 'name'],
        additionalProperties: false,
      })
    ),
  'JSON_SCHEMA.pattern_properties': () =>
    createValidateFn(
      runTypeFromJsonSchema({
        type: 'object',
        patternProperties: {'^col_': {type: 'number'}},
        additionalProperties: false,
      })
    ),
  'JSON_SCHEMA.property_names': () =>
    createValidateFn(
      runTypeFromJsonSchema({
        type: 'object',
        propertyNames: {pattern: '^[a-z]+$'},
        additionalProperties: {type: 'number'},
      })
    ),
  'JSON_SCHEMA.contains_count': () =>
    createValidateFn(
      runTypeFromJsonSchema({
        type: 'array',
        items: {type: 'number'},
        contains: {type: 'number', minimum: 10},
        minContains: 2,
      })
    ),
  'JSON_SCHEMA.unique_items': () => createValidateFn(runTypeFromJsonSchema({type: 'array', items: {type: 'number'}, uniqueItems: true})),
  'JSON_SCHEMA.object_size': () =>
    createValidateFn(
      runTypeFromJsonSchema({
        type: 'object',
        additionalProperties: {type: 'number'},
        minProperties: 1,
        maxProperties: 3,
      })
    ),
  'JSON_SCHEMA.dependent_required': () =>
    createValidateFn(
      runTypeFromJsonSchema({
        type: 'object',
        properties: {credit_card: {type: 'integer'}, billing_address: {type: 'string'}},
        dependentRequired: {credit_card: ['billing_address']},
      })
    ),
};
