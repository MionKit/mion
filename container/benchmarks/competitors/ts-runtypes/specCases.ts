// ts-runtypes validators for the JSON Schema SPEC-CONFORMANCE corpus
// (../../shared/cases/json-schema-spec). One entry per case, each running the
// case's document through the real schema door.
//
// The documents are re-authored INLINE because `runTypeFromJsonSchema(…)` reads
// its literal at BUILD time off this call site, so a cross-module reference has
// nothing to read. That makes this file a second copy of the corpus, kept honest
// two ways: the conformance run itself (a drifted copy stops matching the spec
// labels) and a contract test that deep-equals every document here against the
// shared corpus.
//
// GENERATED from the corpus, then committed as source.

import {createValidateFn} from '@ts-runtypes/core';
import {runTypeFromJsonSchema} from '@ts-runtypes/core/json-schema';

export const specCases: Record<string, () => (value: unknown) => boolean> = {

  // ── TYPES ──
  'TYPES.type_string': () => createValidateFn(runTypeFromJsonSchema({type: 'string'})),
  'TYPES.type_integer': () => createValidateFn(runTypeFromJsonSchema({type: 'integer'})),
  'TYPES.type_number': () => createValidateFn(runTypeFromJsonSchema({type: 'number'})),
  'TYPES.type_boolean': () => createValidateFn(runTypeFromJsonSchema({type: 'boolean'})),
  'TYPES.type_null': () => createValidateFn(runTypeFromJsonSchema({type: 'null'})),
  'TYPES.type_array': () => createValidateFn(runTypeFromJsonSchema({type: 'array'})),
  'TYPES.type_object': () => createValidateFn(runTypeFromJsonSchema({type: 'object'})),
  'TYPES.type_union': () => createValidateFn(runTypeFromJsonSchema({type: ['string', 'null']})),
  'TYPES.const_keyword': () => createValidateFn(runTypeFromJsonSchema({const: 'ok'})),
  'TYPES.enum_keyword': () => createValidateFn(runTypeFromJsonSchema({enum: [1, 'a', null]})),

  // ── OBJECTS ──
  'OBJECTS.properties_required': () =>
    createValidateFn(
      runTypeFromJsonSchema({
        type: 'object',
        properties: {id: {type: 'integer'}, name: {type: 'string'}},
        required: ['id'],
      })
    ),
  'OBJECTS.additional_properties_false': () =>
    createValidateFn(
      runTypeFromJsonSchema({
        type: 'object',
        properties: {a: {type: 'string'}},
        required: ['a'],
        additionalProperties: false,
      })
    ),
  'OBJECTS.additional_properties_schema': () =>
    createValidateFn(
      runTypeFromJsonSchema({
        type: 'object',
        properties: {a: {type: 'string'}},
        additionalProperties: {type: 'number'},
      })
    ),
  'OBJECTS.min_max_properties': () =>
    createValidateFn(
      runTypeFromJsonSchema({type: 'object', minProperties: 1, maxProperties: 2})
    ),
  'OBJECTS.pattern_properties': () =>
    createValidateFn(
      runTypeFromJsonSchema({
        type: 'object',
        patternProperties: {'^col_': {type: 'number'}},
        additionalProperties: false,
      })
    ),
  'OBJECTS.property_names': () => createValidateFn(runTypeFromJsonSchema({type: 'object', propertyNames: {pattern: '^[a-z]+$'}})),
  'OBJECTS.dependent_required': () =>
    createValidateFn(
      runTypeFromJsonSchema({
        type: 'object',
        properties: {credit_card: {type: 'integer'}, billing_address: {type: 'string'}},
        dependentRequired: {credit_card: ['billing_address']},
      })
    ),
  'OBJECTS.dependent_schemas': () =>
    createValidateFn(
      runTypeFromJsonSchema({
        type: 'object',
        properties: {kind: {type: 'string'}},
        dependentSchemas: {kind: {required: ['size'], properties: {size: {type: 'integer'}}}},
      })
    ),
  'OBJECTS.nested_object': () =>
    createValidateFn(
      runTypeFromJsonSchema({
        type: 'object',
        properties: {inner: {type: 'object', properties: {n: {type: 'integer'}}, required: ['n']}},
        required: ['inner'],
      })
    ),

  // ── ARRAYS ──
  'ARRAYS.items_typed': () => createValidateFn(runTypeFromJsonSchema({type: 'array', items: {type: 'string'}})),
  'ARRAYS.prefix_items_open': () =>
    createValidateFn(
      runTypeFromJsonSchema({type: 'array', prefixItems: [{type: 'string'}, {type: 'number'}]})
    ),
  'ARRAYS.prefix_items_closed': () =>
    createValidateFn(
      runTypeFromJsonSchema({
        type: 'array',
        prefixItems: [{type: 'string'}, {type: 'number'}],
        items: false,
        minItems: 2,
      })
    ),
  'ARRAYS.prefix_items_true_slot': () =>
    createValidateFn(
      runTypeFromJsonSchema({type: 'array', prefixItems: [true, {type: 'number'}], items: false, minItems: 2})
    ),
  'ARRAYS.min_max_items': () => createValidateFn(runTypeFromJsonSchema({type: 'array', minItems: 1, maxItems: 2})),
  'ARRAYS.unique_items': () => createValidateFn(runTypeFromJsonSchema({type: 'array', uniqueItems: true})),
  'ARRAYS.contains': () => createValidateFn(runTypeFromJsonSchema({type: 'array', contains: {type: 'number'}})),
  'ARRAYS.min_contains': () =>
    createValidateFn(
      runTypeFromJsonSchema({type: 'array', contains: {type: 'number'}, minContains: 2})
    ),
  'ARRAYS.max_contains': () =>
    createValidateFn(
      runTypeFromJsonSchema({type: 'array', contains: {type: 'number'}, maxContains: 2})
    ),

  // ── COMBINATORS ──
  'COMBINATORS.any_of': () => createValidateFn(runTypeFromJsonSchema({anyOf: [{type: 'string'}, {type: 'integer'}]})),
  'COMBINATORS.one_of_exclusive': () =>
    createValidateFn(runTypeFromJsonSchema({oneOf: [{type: 'integer', multipleOf: 3}, {type: 'integer', multipleOf: 5}]})),
  'COMBINATORS.one_of_nested': () =>
    createValidateFn(
      runTypeFromJsonSchema({
        oneOf: [
          {type: 'string'},
          {anyOf: [{type: 'integer', multipleOf: 3}, {type: 'integer', multipleOf: 5}]},
        ],
      })
    ),
  'COMBINATORS.all_of': () => createValidateFn(runTypeFromJsonSchema({allOf: [{type: 'integer'}, {minimum: 10}]})),
  'COMBINATORS.not_keyword': () => createValidateFn(runTypeFromJsonSchema({not: {type: 'string'}})),

  // ── CONDITIONALS ──
  'CONDITIONALS.if_then': () =>
    createValidateFn(
      runTypeFromJsonSchema({
        if: {properties: {kind: {const: 'sized'}}, required: ['kind']},
        then: {required: ['size']},
      })
    ),
  'CONDITIONALS.if_else': () =>
    createValidateFn(
      runTypeFromJsonSchema({
        if: {properties: {kind: {const: 'sized'}}, required: ['kind']},
        else: {required: ['name']},
      })
    ),
  'CONDITIONALS.if_then_else': () =>
    createValidateFn(
      runTypeFromJsonSchema({
        if: {properties: {kind: {const: 'sized'}}, required: ['kind']},
        then: {required: ['size']},
        else: {required: ['name']},
      })
    ),

  // ── REFERENCES ──
  'REFERENCES.defs_ref_root': () =>
    createValidateFn(
      runTypeFromJsonSchema({$defs: {label: {type: 'string', minLength: 2}}, $ref: '#/$defs/label'})
    ),
  'REFERENCES.ref_in_property': () =>
    createValidateFn(
      runTypeFromJsonSchema({
        $defs: {positive: {type: 'integer', minimum: 1}},
        type: 'object',
        properties: {count: {$ref: '#/$defs/positive'}},
        required: ['count'],
      })
    ),
  'REFERENCES.ref_with_sibling': () =>
    createValidateFn(
      runTypeFromJsonSchema({$defs: {str: {type: 'string'}}, $ref: '#/$defs/str', minLength: 3})
    ),
  'REFERENCES.anchor_ref': () =>
    createValidateFn(
      runTypeFromJsonSchema({$defs: {flag: {$anchor: 'flag', type: 'boolean'}}, $ref: '#flag'})
    ),
  'REFERENCES.recursive_ref': () =>
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

  // ── STRINGS ──
  'STRINGS.min_length': () => createValidateFn(runTypeFromJsonSchema({type: 'string', minLength: 2})),
  'STRINGS.max_length': () => createValidateFn(runTypeFromJsonSchema({type: 'string', maxLength: 3})),
  'STRINGS.pattern_keyword': () => createValidateFn(runTypeFromJsonSchema({type: 'string', pattern: '^[a-z][a-z0-9-]*$'})),
  'STRINGS.format_email': () => createValidateFn(runTypeFromJsonSchema({type: 'string', format: 'email'})),
  'STRINGS.format_uuid': () => createValidateFn(runTypeFromJsonSchema({type: 'string', format: 'uuid'})),
  'STRINGS.format_date': () => createValidateFn(runTypeFromJsonSchema({type: 'string', format: 'date'})),
  'STRINGS.format_time': () => createValidateFn(runTypeFromJsonSchema({type: 'string', format: 'time'})),
  'STRINGS.format_date_time': () => createValidateFn(runTypeFromJsonSchema({type: 'string', format: 'date-time'})),
  'STRINGS.format_hostname': () => createValidateFn(runTypeFromJsonSchema({type: 'string', format: 'hostname'})),
  'STRINGS.format_ipv4': () => createValidateFn(runTypeFromJsonSchema({type: 'string', format: 'ipv4'})),
  'STRINGS.format_ipv6': () => createValidateFn(runTypeFromJsonSchema({type: 'string', format: 'ipv6'})),
  'STRINGS.format_uri': () => createValidateFn(runTypeFromJsonSchema({type: 'string', format: 'uri'})),
  'STRINGS.unknown_format_is_annotation': () =>
    createValidateFn(
      runTypeFromJsonSchema({type: 'string', format: 'not-a-real-format'})
    ),

  // ── NUMBERS ──
  'NUMBERS.minimum': () => createValidateFn(runTypeFromJsonSchema({type: 'number', minimum: 0})),
  'NUMBERS.maximum': () => createValidateFn(runTypeFromJsonSchema({type: 'number', maximum: 100})),
  'NUMBERS.exclusive_minimum': () => createValidateFn(runTypeFromJsonSchema({type: 'number', exclusiveMinimum: 0})),
  'NUMBERS.exclusive_maximum': () => createValidateFn(runTypeFromJsonSchema({type: 'number', exclusiveMaximum: 10})),
  'NUMBERS.multiple_of': () => createValidateFn(runTypeFromJsonSchema({type: 'number', multipleOf: 5})),

  // ── UNEVALUATED ──
  'UNEVALUATED.unevaluated_properties_false': () =>
    createValidateFn(
      runTypeFromJsonSchema({
        type: 'object',
        properties: {a: {type: 'string'}},
        required: ['a'],
        unevaluatedProperties: false,
      })
    ),
  'UNEVALUATED.unevaluated_items_false': () =>
    createValidateFn(
      runTypeFromJsonSchema({type: 'array', prefixItems: [{type: 'string'}], unevaluatedItems: false})
    ),

  // ── ANNOTATIONS ──
  'ANNOTATIONS.annotations_ignored': () =>
    createValidateFn(
      runTypeFromJsonSchema({
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        title: 'A label',
        description: 'Some prose',
        default: 'fallback',
        examples: ['one', 'two'],
        $comment: 'not a constraint',
        deprecated: true,
        writeOnly: true,
        type: 'string',
      })
    ),
  'ANNOTATIONS.read_only_property': () =>
    createValidateFn(
      runTypeFromJsonSchema({type: 'object', properties: {id: {type: 'integer', readOnly: true}}, required: ['id']})
    ),

  // ── CONTENT ──
  'CONTENT.content_encoding_base64': () => createValidateFn(runTypeFromJsonSchema({type: 'string', contentEncoding: 'base64'})),
  'CONTENT.content_media_type_json': () =>
    createValidateFn(
      runTypeFromJsonSchema({type: 'string', contentMediaType: 'application/json'})
    ),
};
