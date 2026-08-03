// json-schema-to-ts documents keyed by suite case key ("GROUP.case").
//
// A TYPE-LEVEL-ONLY competitor: json-schema-to-ts ships `FromSchema<S>` and
// nothing else — no validator, no runtime. So this map is not a case map like the
// others; it is just the documents, read by typecost to measure what recovering a
// TypeScript type from each one costs the checker. There is no runtime column for
// it, and it is deliberately absent from the runtime competitor list.
//
// TOTAL over every shared key, mirroring the ajv competitor map's supported set
// exactly (see ../ts-runtypes/jsonSchemaCases.ts for why ajv is the reference).
// `as const` is load-bearing: FromSchema reads the literal types. GENERATED from
// that map, then committed as source; the mirror is pinned by
// packages/ts-runtypes-devtools/test/bench-json-schema-cases.test.ts.
//
// One deliberate difference from ajv's spelling: ajv writes tuples the draft-07
// way (`items: [...]` plus `additionalItems`), because its non-JSON_SCHEMA lane
// runs on the draft-07 default export. FromSchema reads 2020-12, where the
// same tuple is `prefixItems` plus `items`, so the nine tuple documents are
// translated to that spelling. Same constraint, current dialect.

import {NOT_SUPPORTED} from '../../shared/harness/types.ts';

export const cases = {
  // ── ATOMIC ──
  'ATOMIC.any': {},
  'ATOMIC.bigint': NOT_SUPPORTED, // no bigint type in JSON Schema
  'ATOMIC.boolean': {type: 'boolean'},
  'ATOMIC.date': NOT_SUPPORTED, // no Date instance type in JSON Schema
  'ATOMIC.enum_mixed': {enum: [0, 'green', 2]},
  'ATOMIC.literal_2': {const: 2},
  'ATOMIC.literal_a': {const: 'a'},
  'ATOMIC.literal_true': {const: true},
  'ATOMIC.literal_1n': NOT_SUPPORTED, // no bigint in JSON Schema
  'ATOMIC.literal_symbol': NOT_SUPPORTED, // no symbol type in JSON Schema
  'ATOMIC.never': {not: {}},
  'ATOMIC.null': {type: 'null'},
  'ATOMIC.number': {type: 'number'},
  'ATOMIC.object': NOT_SUPPORTED, // TS object type includes arrays/Date/RegExp; ajv {type:'object'} rejects arrays
  'ATOMIC.regexp': NOT_SUPPORTED, // no RegExp instance type in JSON Schema
  'ATOMIC.string': {type: 'string'},
  'ATOMIC.symbol': NOT_SUPPORTED, // no symbol type in JSON Schema; factoryThrows
  'ATOMIC.undefined': NOT_SUPPORTED, // no undefined type in JSON Schema
  'ATOMIC.void': NOT_SUPPORTED, // no undefined/void type in JSON Schema
  'ATOMIC.literal_2_noLiterals': {type: 'number'},
  'ATOMIC.literal_a_noLiterals': {type: 'string'},
  'ATOMIC.literal_regexp_noLiterals': NOT_SUPPORTED, // degrades to RegExp; no RegExp instance type in JSON Schema
  'ATOMIC.literal_true_noLiterals': {type: 'boolean'},
  'ATOMIC.literal_1n_noLiterals': NOT_SUPPORTED, // degrades to bigint; no bigint type in JSON Schema
  'ATOMIC.literal_symbol_noLiterals': NOT_SUPPORTED, // degrades to symbol; no symbol type in JSON Schema; factoryThrows
  'ATOMIC.unknown': {},

  // ── ARRAY ──
  'ARRAY.string_array': {type: 'array', items: {type: 'string'}},
  'ARRAY.number_array': {type: 'array', items: {type: 'number'}},
  'ARRAY.boolean_array': {type: 'array', items: {type: 'boolean'}},
  'ARRAY.bigint_array': NOT_SUPPORTED, // no bigint type in JSON Schema
  'ARRAY.date_array': NOT_SUPPORTED, // no Date instance type in JSON Schema
  'ARRAY.regexp_array': NOT_SUPPORTED, // no RegExp instance type in JSON Schema
  'ARRAY.undefined_array': NOT_SUPPORTED, // no undefined type in JSON Schema
  'ARRAY.null_array': {type: 'array', items: {type: 'null'}},
  'ARRAY.array_generic': {type: 'array', items: {type: 'string'}},
  'ARRAY.string_array_2d': {type: 'array', items: {type: 'array', items: {type: 'string'}}},
  'ARRAY.string_array_3d': {
    type: 'array',
    items: {type: 'array', items: {type: 'array', items: {type: 'string'}}},
  },
  'ARRAY.string_array_noIsArrayCheck': NOT_SUPPORTED, // RunTypes-specific noIsArrayCheck option; no JSON Schema equivalent
  'ARRAY.object_array': {type: 'array', items: {type: 'object', properties: {a: {type: 'string'}}, required: ['a']}},
  'ARRAY.union_array': {type: 'array', items: {anyOf: [{type: 'string'}, {type: 'number'}]}},
  'ARRAY.tuple_array': {
    type: 'array',
    items: {type: 'array', prefixItems: [{type: 'string'}, {type: 'number'}], items: false, minItems: 2},
  },
  'ARRAY.circular_array': {
    $id: 'circular_array',
    type: 'array',
    items: {$ref: 'circular_array'},
  },
  'ARRAY.circular_object_with_array': {
    $id: 'circular_object_with_array',
    type: 'object',
    properties: {
      a: {type: 'string'},
      deep: {
        type: 'object',
        properties: {b: {type: 'string'}, c: {type: 'number'}},
        required: ['b', 'c'],
      },
      d: {type: 'array', items: {$ref: 'circular_object_with_array'}},
    },
    required: ['a'],
  },
  'ARRAY.symbol_array': NOT_SUPPORTED, // no symbol type in JSON Schema; factoryThrows
  'ARRAY.readonly_string_array': {type: 'array', items: {type: 'string'}},

  // ── OBJECT ──
  'OBJECT.simple_interface': {
    type: 'object',
    properties: {a: {type: 'string'}, b: {type: 'number'}},
    required: ['a', 'b'],
  },
  'OBJECT.object_as_const_literals': {
    type: 'object',
    properties: {name: {const: 'john'}, age: {const: 30}},
    required: ['name', 'age'],
  },
  'OBJECT.object_via_return_type_utility': {
    type: 'object',
    properties: {id: {type: 'number'}, name: {type: 'string'}},
    required: ['id', 'name'],
  },
  'OBJECT.object_via_property_access': {
    type: 'object',
    properties: {id: {type: 'number'}, name: {type: 'string'}},
    required: ['id', 'name'],
  },
  'OBJECT.object_via_array_access': {
    type: 'object',
    properties: {id: {type: 'number'}, name: {type: 'string'}},
    required: ['id', 'name'],
  },
  'OBJECT.interface_with_optional': {type: 'object', properties: {a: {type: 'string'}, b: {type: 'number'}}, required: ['a']},
  'OBJECT.interface_with_date': NOT_SUPPORTED, // no Date instance type in JSON Schema
  'OBJECT.interface_with_method': {type: 'object', properties: {name: {type: 'string'}}, required: ['name']},
  'OBJECT.nested_object': {
    type: 'object',
    properties: {
      a: {type: 'string'},
      deep: {type: 'object', properties: {b: {type: 'string'}, c: {type: 'number'}}, required: ['b', 'c']},
    },
    required: ['a', 'deep'],
  },
  'OBJECT.interface_string_array_prop': {
    type: 'object',
    properties: {tags: {type: 'array', items: {type: 'string'}}},
    required: ['tags'],
  },
  'OBJECT.circular_interface': {
    $id: 'circular_interface',
    type: 'object',
    properties: {
      name: {type: 'string'},
      child: {$ref: 'circular_interface'},
    },
    required: ['name'],
  },
  'OBJECT.circular_interface_on_array': {
    $id: 'circular_interface_on_array',
    type: 'object',
    properties: {
      name: {type: 'string'},
      children: {type: 'array', items: {$ref: 'circular_interface_on_array'}},
    },
    required: ['name'],
  },
  'OBJECT.circular_interface_on_nested_object': {
    $id: 'circular_interface_on_nested_object',
    type: 'object',
    properties: {
      name: {type: 'string'},
      embedded: {
        type: 'object',
        properties: {
          hello: {type: 'string'},
          child: {$ref: 'circular_interface_on_nested_object'},
        },
        required: ['hello'],
      },
    },
    required: ['name', 'embedded'],
  },
  'OBJECT.index_signature_string': {type: 'object', additionalProperties: {type: 'string'}},
  'OBJECT.index_signature_named_props': {
    type: 'object',
    properties: {
      a: {type: 'string'},
      b: {type: 'number'},
    },
    required: ['a', 'b'],
    additionalProperties: {type: ['string', 'number']},
  },
  'OBJECT.index_signature_nested': {
    type: 'object',
    additionalProperties: {type: 'object', additionalProperties: {type: 'number'}},
  },
  'OBJECT.index_signature_date_value': NOT_SUPPORTED, // no Date instance type in JSON Schema
  'OBJECT.index_signature_non_root': {
    type: 'object',
    properties: {
      b: {type: 'string'},
      c: {
        type: 'object',
        additionalProperties: {type: 'string'},
      },
    },
    required: ['b', 'c'],
  },
  'OBJECT.function_top_level': NOT_SUPPORTED, // no function type in JSON Schema
  'OBJECT.interface_callable': NOT_SUPPORTED, // callable interface (function with props); no function type in JSON Schema
  'OBJECT.interface_all_optional': NOT_SUPPORTED, // allOptionalCode guard rejects Date/Map/Set/RegExp; no JSON Schema equivalent for plain-object-only constraint
  'OBJECT.class_simple': NOT_SUPPORTED, // class has Date prop; no Date instance type in JSON Schema
  'OBJECT.rpc_error_class': {
    type: 'object',
    properties: {
      'mion@isΣrrθr': {const: true},
      type: {const: 'test-error'},
      publicMessage: {type: 'string'},
      id: {type: 'string'},
    },
    required: ['mion@isΣrrθr', 'type', 'publicMessage'],
  },
  'OBJECT.call_signature_params': {type: 'array', prefixItems: [{type: 'number'}, {type: 'boolean'}], items: false, minItems: 2},
  'OBJECT.call_signature_params_with_optional': {
    type: 'array',
    prefixItems: [{type: 'number'}, {type: 'boolean'}, {type: 'string'}],
    items: false,
    minItems: 2,
  },
  'OBJECT.call_signature_params_with_rest': NOT_SUPPORTED, // rest contains Date instances; no Date type in JSON Schema
  'OBJECT.record_union_keys': {
    type: 'object',
    properties: {a: {type: 'number'}, b: {type: 'number'}},
    required: ['a', 'b'],
  },
  'OBJECT.union_value_index': NOT_SUPPORTED, // union includes bigint; no bigint type in JSON Schema
  'OBJECT.object_with_union_prop': {
    type: 'object',
    properties: {kind: {enum: ['a', 'b']}, n: {type: 'number'}},
    required: ['kind', 'n'],
  },
  'OBJECT.interface_inheritance': {
    type: 'object',
    properties: {a: {type: 'string'}, b: {type: 'number'}},
    required: ['a', 'b'],
  },
  'OBJECT.class_inheritance': {
    type: 'object',
    properties: {a: {type: 'string'}, b: {type: 'number'}},
    required: ['a', 'b'],
  },
  'OBJECT.index_signature_number_key': {
    type: 'object',
    additionalProperties: {type: 'string'},
  },

  // ── TUPLE ──
  'TUPLE.string_number_pair': {type: 'array', prefixItems: [{type: 'string'}, {type: 'number'}], items: false, minItems: 2},
  'TUPLE.full_mion_tuple': NOT_SUPPORTED, // contains Date, bigint; no Date/bigint type in JSON Schema
  'TUPLE.tuple_with_optional': NOT_SUPPORTED, // optional bigint slot; no bigint type in JSON Schema
  'TUPLE.nested_tuple_in_array': {
    type: 'array',
    items: {type: 'array', prefixItems: [{type: 'string'}, {type: 'number'}], items: false, minItems: 2},
  },
  'TUPLE.tuple_rest': {type: 'array', prefixItems: [{type: 'number'}], items: {type: 'string'}, minItems: 1},
  'TUPLE.tuple_circular': NOT_SUPPORTED, // contains Date, bigint; no Date/bigint type in JSON Schema
  'TUPLE.tuple_multiple_trailing_optionals': NOT_SUPPORTED, // number and bigint slots; no bigint type in JSON Schema
  'TUPLE.tuple_named_labels': {type: 'array', prefixItems: [{type: 'string'}, {type: 'number'}], items: false, minItems: 2},
  'TUPLE.tuple_with_non_serializable': NOT_SUPPORTED, // function slot must be === undefined; no undefined type in JSON Schema
  'TUPLE.empty_tuple': {type: 'array', maxItems: 0},
  'TUPLE.single_element_tuple': {type: 'array', prefixItems: [{type: 'string'}], items: false, minItems: 1},
  'TUPLE.readonly_tuple': {
    type: 'array',
    prefixItems: [{type: 'string'}, {type: 'number'}],
    items: false,
    minItems: 2,
  },

  // ── UNION ──
  'UNION.atomic_union': NOT_SUPPORTED, // union includes Date, bigint; no Date/bigint type in JSON Schema
  'UNION.string_literal_union': {enum: ['UNO', 'DOS', 'TRES']},
  'UNION.large_union_eight_arms': NOT_SUPPORTED, // arm contains bigint; no bigint type in JSON Schema
  'UNION.string_or_number': {anyOf: [{type: 'string'}, {type: 'number'}]},
  'UNION.union_of_array_types': {
    anyOf: [
      {type: 'array', items: {type: 'string'}},
      {type: 'array', items: {type: 'number'}},
      {type: 'array', items: {type: 'boolean'}},
    ],
  },
  'UNION.array_of_union': NOT_SUPPORTED, // union includes bigint, Date; no bigint/Date type in JSON Schema
  'UNION.union_of_object_shapes': NOT_SUPPORTED, // arm c has bigint value; no bigint type in JSON Schema
  'UNION.discriminated_union': {
    anyOf: [
      {type: 'object', properties: {kind: {const: 'a'}, n: {type: 'number'}}, required: ['kind', 'n']},
      {type: 'object', properties: {kind: {const: 'b'}, s: {type: 'string'}}, required: ['kind', 's']},
    ],
  },
  'UNION.circular_union': NOT_SUPPORTED, // union includes Date; no Date instance type in JSON Schema
  'UNION.union_with_methods': {
    anyOf: [
      {type: 'object', properties: {name: {type: 'string'}}, required: ['name']},
      {type: 'object', properties: {age: {type: 'number'}}, required: ['age']},
    ],
  },
  'UNION.intersection_to_object': {
    type: 'object',
    properties: {a: {type: 'string'}, b: {type: 'number'}},
    required: ['a', 'b'],
  },
  'UNION.union_with_index_arm': NOT_SUPPORTED, // arm c has bigint values; no bigint type in JSON Schema
  'UNION.union_same_prop_different_types': {
    anyOf: [
      {type: 'object', properties: {type: {const: 'a'}, prop: {type: 'boolean'}}, required: ['type', 'prop']},
      {type: 'object', properties: {type: {const: 'b'}, prop: {type: 'number'}}, required: ['type', 'prop']},
      {type: 'object', properties: {type: {const: 'c'}, prop: {type: 'string'}}, required: ['type', 'prop']},
    ],
  },
  'UNION.union_mixed_arrays_and_objects': NOT_SUPPORTED, // arm {b: number} — ajv accepts NaN; samples allow b:123n (bigint)
  'UNION.union_merged_property': {
    anyOf: [
      {type: 'object', properties: {a: {type: 'boolean'}}, required: ['a']},
      {type: 'object', properties: {a: {type: 'number'}}, required: ['a']},
    ],
  },
  'UNION.union_mixed_with_index': NOT_SUPPORTED, // arm has bigint values; no bigint type in JSON Schema
  'UNION.union_with_any_fallback': {},
  'UNION.union_with_unknown_fallback': {},
  'UNION.union_subset_small_first': {
    anyOf: [
      {type: 'object', properties: {a: {type: 'string'}}, required: ['a']},
      {type: 'object', properties: {a: {type: 'string'}, b: {type: 'number'}}, required: ['a', 'b']},
    ],
  },
  'UNION.union_subset_nested_levels': {
    anyOf: [
      {type: 'object', properties: {x: {type: 'string'}}, required: ['x']},
      {type: 'object', properties: {x: {type: 'string'}, y: {type: 'number'}}, required: ['x', 'y']},
      {
        type: 'object',
        properties: {x: {type: 'string'}, y: {type: 'number'}, z: {type: 'boolean'}},
        required: ['x', 'y', 'z'],
      },
    ],
  },
  'UNION.union_subset_mixed_related_unrelated': {
    anyOf: [
      {type: 'object', properties: {id: {type: 'string'}}, required: ['id']},
      {type: 'object', properties: {id: {type: 'string'}, name: {type: 'string'}}, required: ['id', 'name']},
      {type: 'object', properties: {value: {type: 'number'}}, required: ['value']},
    ],
  },

  // ── TEMPLATE_LITERAL ──
  'TEMPLATE_LITERAL.url_with_number_id': {
    type: 'string',
    pattern: '^api\\/user\\/-?(?:\\d+\\.?\\d*|\\.\\d+)$',
  },
  'TEMPLATE_LITERAL.multi_segment_url': {
    type: 'string',
    pattern: '^\\/api\\/v\\d+\\/user\\/[\\s\\S]+\\/posts\\/-?(?:\\d+\\.?\\d*|\\.\\d+)$',
  },
  'TEMPLATE_LITERAL.leading_string_placeholder': {
    type: 'string',
    pattern: '^[\\s\\S]*\\/-?(?:\\d+\\.?\\d*|\\.\\d+)$',
  },
  'TEMPLATE_LITERAL.regex_special_chars': {
    type: 'string',
    pattern: '^\\(-?(?:\\d+\\.?\\d*|\\.\\d+)\\)$',
  },
  'TEMPLATE_LITERAL.template_literal_nested_in_object': {
    type: 'object',
    properties: {
      url: {type: 'string', pattern: '^api\\/user\\/-?(?:\\d+\\.?\\d*|\\.\\d+)$'},
      method: {type: 'string'},
    },
    required: ['url', 'method'],
  },
  'TEMPLATE_LITERAL.template_literal_index_key': {
    type: 'object',
    patternProperties: {'^api\\/[\\s\\S]*$': {type: 'number'}},
    additionalProperties: false,
  },
  'TEMPLATE_LITERAL.template_literal_union_placeholder': {
    type: 'string',
    pattern: '^(?:a|b)--?(?:\\d+\\.?\\d*|\\.\\d+)$',
  },

  // ── NATIVE ──
  'NATIVE.map_string_number': NOT_SUPPORTED, // no Map instance type in JSON Schema
  'NATIVE.set_string': NOT_SUPPORTED, // no Set instance type in JSON Schema
  'NATIVE.promise_string': NOT_SUPPORTED, // no thenable/Promise instance type in JSON Schema
  'NATIVE.awaited_promise': {type: 'string'},

  // ── CIRCULAR ──
  'CIRCULAR.object_full_mion_shape': NOT_SUPPORTED, // number prop — ajv accepts NaN; samples reject NaN; also optional Date prop
  'CIRCULAR.array_of_union_with_self_ref': NOT_SUPPORTED, // union includes Date; no Date instance type in JSON Schema
  'CIRCULAR.object_with_tuple_prop': NOT_SUPPORTED, // tuple contains bigint; no bigint type in JSON Schema
  'CIRCULAR.object_with_index_prop': {
    $id: 'circular_object_with_index_prop',
    type: 'object',
    properties: {
      index: {
        type: 'object',
        additionalProperties: {$ref: 'circular_object_with_index_prop'},
      },
    },
    required: ['index'],
  },
  'CIRCULAR.object_deeply_nested': {
    $id: 'object_deeply_nested',
    type: 'object',
    properties: {
      deep1: {
        type: 'object',
        properties: {
          deep2: {
            type: 'object',
            properties: {
              deep3: {
                type: 'object',
                properties: {
                  deep4: {$ref: 'object_deeply_nested'},
                },
              },
            },
            required: ['deep3'],
          },
        },
        required: ['deep2'],
      },
    },
    required: ['deep1'],
  },
  'CIRCULAR.circular_child_under_literal_root': NOT_SUPPORTED, // child contains bigint; no bigint type in JSON Schema
  'CIRCULAR.multiple_circular_types_cross_referenced': NOT_SUPPORTED, // contains bigint and Date; no bigint/Date type in JSON Schema

  // ── CIRCULAR_REFS ──
  'CIRCULAR_REFS.linked_list_cycle': NOT_SUPPORTED, // a reference cycle would stack-overflow
  'CIRCULAR_REFS.tree_cycle': NOT_SUPPORTED, // a reference cycle would stack-overflow
  'CIRCULAR_REFS.object_self_cycle': NOT_SUPPORTED, // a reference cycle would stack-overflow

  // ── UTILITY ──
  'UTILITY.partial': NOT_SUPPORTED, // Partial type includes Date prop; no Date instance type in JSON Schema
  'UTILITY.required': NOT_SUPPORTED, // Required type includes Date prop; no Date instance type in JSON Schema
  'UTILITY.pick': NOT_SUPPORTED, // Pick result includes Date prop; no Date instance type in JSON Schema
  'UTILITY.omit': NOT_SUPPORTED, // Omit result includes Date prop; no Date instance type in JSON Schema
  'UTILITY.exclude_atomic': {enum: ['name', 'createdAt']},
  'UTILITY.extract_atomic': {enum: ['name', 'createdAt']},
  'UTILITY.exclude_from_object_union': {
    anyOf: [
      {type: 'object', properties: {kind: {const: 'square'}, x: {type: 'number'}}, required: ['kind', 'x']},
      {
        type: 'object',
        properties: {kind: {const: 'triangle'}, base: {type: 'number'}, height: {type: 'number'}},
        required: ['kind', 'base', 'height'],
      },
    ],
  },
  'UTILITY.non_nullable': {anyOf: [{type: 'string'}, {type: 'number'}]},
  'UTILITY.return_type': NOT_SUPPORTED, // ReturnType resolves to Date; no Date instance type in JSON Schema
  'UTILITY.readonly': {
    type: 'object',
    properties: {name: {type: 'string'}, age: {type: 'number'}},
    required: ['name', 'age'],
  },
  'UTILITY.intersection_with_required_override': NOT_SUPPORTED, // optional Date prop; no Date instance type in JSON Schema
  'UTILITY.omit_keeping_optional': {type: 'object', properties: {b: {type: 'number'}, c: {type: 'boolean'}}, required: ['c']},
  'UTILITY.keyof_to_literal_union': {enum: ['name', 'age', 'createdAt']},
  'UTILITY.typeof_variable_query': {
    type: 'object',
    properties: {url: {type: 'string'}, port: {type: 'number'}},
    required: ['url', 'port'],
  },
  'UTILITY.indexed_access_type': {type: 'string'},
  'UTILITY.conditional_type_resolved': {type: 'boolean'},
  'UTILITY.mapped_type_custom': {
    type: 'object',
    properties: {
      a: {type: ['string', 'null']},
      b: {type: ['number', 'null']},
    },
    required: ['a', 'b'],
  },
  'UTILITY.mapped_type_with_conditional_value': {
    type: 'object',
    properties: {
      name: {
        type: 'object',
        properties: {kind: {const: 'text'}, value: {type: 'string'}},
        required: ['kind', 'value'],
      },
      age: {
        type: 'object',
        properties: {kind: {const: 'number'}, value: {type: 'number'}, min: {type: 'number'}},
        required: ['kind', 'value'],
      },
      admin: {
        type: 'object',
        properties: {kind: {const: 'checkbox'}, value: {type: 'boolean'}},
        required: ['kind', 'value'],
      },
    },
    required: ['name', 'age', 'admin'],
  },
  'UTILITY.distributive_conditional_over_union': {
    anyOf: [
      {type: 'object', properties: {w: {type: 'string'}}, required: ['w']},
      {type: 'object', properties: {w: {type: 'number'}}, required: ['w']},
    ],
  },
  'UTILITY.deep_partial_recursive_mapped': NOT_SUPPORTED, // all-optional plain-object guard rejects `new Date()` (an invalid sample), but ajv {type:'object'} accepts it; no JSON Schema knob for the plain-object-only constraint

  // ── TYPE_MAPPINGS ──
  'TYPE_MAPPINGS.key_prefix_rename': {
    type: 'object',
    properties: {user_id: {type: 'number'}, user_name: {type: 'string'}},
    required: ['user_id', 'user_name'],
  },
  'TYPE_MAPPINGS.key_conditional_rename': NOT_SUPPORTED, // resolved shape carries a `createdAt: Date` prop; no Date instance type in JSON Schema
  'TYPE_MAPPINGS.key_filter_via_never': {
    type: 'object',
    properties: {id: {type: 'number'}, name: {type: 'string'}},
    required: ['id', 'name'],
  },

  // ── DATETIME ──
  'DATETIME.date': NOT_SUPPORTED, // no Date instance type in JSON Schema
  'DATETIME.instant': NOT_SUPPORTED, // no Temporal.Instant instance type in JSON Schema
  'DATETIME.zonedDateTime': NOT_SUPPORTED, // no Temporal.ZonedDateTime instance type in JSON Schema
  'DATETIME.plainDate': NOT_SUPPORTED, // no Temporal.PlainDate instance type in JSON Schema
  'DATETIME.plainTime': NOT_SUPPORTED, // no Temporal.PlainTime instance type in JSON Schema
  'DATETIME.plainDateTime': NOT_SUPPORTED, // no Temporal.PlainDateTime instance type in JSON Schema
  'DATETIME.plainYearMonth': NOT_SUPPORTED, // no Temporal.PlainYearMonth instance type in JSON Schema
  'DATETIME.plainMonthDay': NOT_SUPPORTED, // no Temporal.PlainMonthDay instance type in JSON Schema
  'DATETIME.duration': NOT_SUPPORTED, // no Temporal.Duration instance type in JSON Schema

  // ── STRING_FORMAT ──
  'STRING_FORMAT.string_maxLength': {type: 'string', maxLength: 5},
  'STRING_FORMAT.string_minLength': {type: 'string', minLength: 3},
  'STRING_FORMAT.string_length': {type: 'string', minLength: 4, maxLength: 4},
  'STRING_FORMAT.string_range': {type: 'string', minLength: 2, maxLength: 4},
  'STRING_FORMAT.string_allowedChars': {type: 'string', pattern: '^[0-9a-f]+$'},
  'STRING_FORMAT.string_allowedChars_ignoreCase': NOT_SUPPORTED, // case-insensitive regex; JSON Schema pattern has no ignore-case flag
  'STRING_FORMAT.string_allowedChars_literal': {type: 'string', pattern: '^[.\\-]+$'},
  'STRING_FORMAT.string_disallowedChars': {type: 'string', pattern: '^[^!@#]*$'},
  'STRING_FORMAT.string_allowedValues': {type: 'string', enum: ['red', 'green', 'blue']},
  'STRING_FORMAT.string_allowedValues_ignoreCase': NOT_SUPPORTED, // case-insensitive enum match; no JSON Schema equivalent
  'STRING_FORMAT.string_allowedValues_escaped': {type: 'string', enum: ['a.b', 'c+d']},
  'STRING_FORMAT.string_disallowedValues': {type: 'string', not: {enum: ['admin', 'root']}},
  'STRING_FORMAT.string_customErrorMessage': {type: 'string', enum: ['a', 'b']},
  'STRING_FORMAT.alpha': {type: 'string', pattern: '^[A-Za-z]+$'},
  'STRING_FORMAT.alphaNumeric': {type: 'string', pattern: '^[A-Za-z0-9]+$'},
  'STRING_FORMAT.numeric': {type: 'string', pattern: '^[0-9]+$'},
  'STRING_FORMAT.alpha_withLength': {type: 'string', pattern: '^[A-Za-z]+$', maxLength: 3},
  'STRING_FORMAT.lowercase_validate': {type: 'string'},
  'STRING_FORMAT.uuidv4': {
    type: 'string',
    pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$',
  },
  'STRING_FORMAT.uuidv7': {
    type: 'string',
    pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-7[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$',
  },
  'STRING_FORMAT.date_iso': {type: 'string', format: 'date'},
  'STRING_FORMAT.date_DMY': NOT_SUPPORTED, // invalid sample '31-04-2024' is layout-valid (DD=31,MM=04) but April has 30 days; rejecting it needs per-month day-count validation a pattern cannot express
  'STRING_FORMAT.date_YM': {
    type: 'string',
    pattern: '^\\d{4}-(0[1-9]|1[0-2])$',
  },
  'STRING_FORMAT.date_MD': {
    type: 'string',
    pattern: '^(0[1-9]|1[0-2])-(0[1-9]|[12]\\d|3[01])$',
  },
  'STRING_FORMAT.date_minMax_absolute': NOT_SUPPORTED, // requires date-comparison logic; pattern alone cannot enforce date range
  'STRING_FORMAT.time_iso': {
    type: 'string',
    pattern: '^([01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z|[+-](?:[01]\\d|2[0-3]):[0-5]\\d)$',
  },
  'STRING_FORMAT.time_HHmmss': {
    type: 'string',
    pattern: '^([01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d$',
  },
  'STRING_FORMAT.time_HHmmss_ms': {
    type: 'string',
    pattern: '^([01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d{1,3})?$',
  },
  'STRING_FORMAT.time_minMax_absolute': NOT_SUPPORTED, // requires time-comparison logic; pattern alone cannot enforce time range
  'STRING_FORMAT.dateTime_default': {type: 'string', format: 'date-time', pattern: 'T'},
  'STRING_FORMAT.dateTime_custom': {
    type: 'string',
    pattern: '^(0[1-9]|[12]\\d|3[01])-(0[1-9]|1[0-2])-\\d{4} ([01]\\d|2[0-3]):[0-5]\\d$',
  },
  'STRING_FORMAT.dateTime_minMax_absolute': NOT_SUPPORTED, // requires datetime-comparison logic; pattern alone cannot enforce range
  'STRING_FORMAT.ipv4': {type: 'string', format: 'ipv4'},
  'STRING_FORMAT.ipv6': {type: 'string', format: 'ipv6'},
  'STRING_FORMAT.ip_any': {
    type: 'string',
    anyOf: [
      {pattern: '^(?:(?:25[0-5]|2[0-4]\\d|1\\d{2}|[1-9]\\d|\\d)\\.){3}(?:25[0-5]|2[0-4]\\d|1\\d{2}|[1-9]\\d|\\d)$'},
      {
        pattern:
          '^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::(?:[0-9a-fA-F]{1,4}:){0,6}[0-9a-fA-F]{1,4}$|^(?:[0-9a-fA-F]{1,4}:){1,7}:$|^(?:[0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}$|^::1$|^::$',
      },
    ],
  },
  'STRING_FORMAT.ipv4_port': {
    type: 'string',
    pattern:
      '^(?:(?:25[0-5]|2[0-4]\\d|1\\d{2}|[1-9]\\d|\\d)\\.){3}(?:25[0-5]|2[0-4]\\d|1\\d{2}|[1-9]\\d|\\d):(?:[1-9]\\d{0,3}|[1-5]\\d{4}|6[0-4]\\d{3}|65[0-4]\\d{2}|655[0-2]\\d|6553[0-5])$',
  },
  'STRING_FORMAT.ipv6_port': {
    type: 'string',
    pattern:
      '^\\[(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}\\]:(?:[1-9]\\d{0,3}|[1-5]\\d{4}|6[0-4]\\d{3}|65[0-4]\\d{2}|655[0-2]\\d|6553[0-5])$|^\\[::(?:[0-9a-fA-F]{1,4}:){0,6}[0-9a-fA-F]{1,4}\\]:(?:[1-9]\\d{0,3}|[1-5]\\d{4}|6[0-4]\\d{3}|65[0-4]\\d{2}|655[0-2]\\d|6553[0-5])$|^\\[(?:[0-9a-fA-F]{1,4}:){1,7}:\\]:(?:[1-9]\\d{0,3}|[1-5]\\d{4}|6[0-4]\\d{3}|65[0-4]\\d{2}|655[0-2]\\d|6553[0-5])$|^\\[(?:[0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}\\]:(?:[1-9]\\d{0,3}|[1-5]\\d{4}|6[0-4]\\d{3}|65[0-4]\\d{2}|655[0-2]\\d|6553[0-5])$|^\\[::1\\]:(?:[1-9]\\d{0,3}|[1-5]\\d{4}|6[0-4]\\d{3}|65[0-4]\\d{2}|655[0-2]\\d|6553[0-5])$',
  },
  'STRING_FORMAT.domain': {
    type: 'string',
    pattern: '^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\\.)+[a-zA-Z]{2,}$',
  },
  'STRING_FORMAT.domainStrict': {
    type: 'string',
    pattern: '^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\\.){1,5}[a-zA-Z]{2,}$',
  },
  'STRING_FORMAT.email': {
    type: 'string',
    // local-part 2+ chars (rejects 'a@...'); domain: optional subdomains + 2+ char label + 2+ char TLD
    pattern: '^[a-zA-Z0-9._%+\\-]{2,}@(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\\.)*[a-zA-Z0-9]{2,}\\.[a-zA-Z]{2,}$',
  },
  'STRING_FORMAT.emailPunycode': {
    type: 'string',
    pattern:
      '^[a-zA-Z0-9._%+\\-]{2,}@(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\\.)*[a-zA-Z0-9]{2,}\\.(?:[a-zA-Z]{2,}|xn--[a-zA-Z0-9]+)$',
  },
  'STRING_FORMAT.emailStrict': {
    type: 'string',
    // strict: no + in local, no _ in domain, 2+ char domain label, 2+ char TLD
    pattern: '^[a-zA-Z0-9.\\-]+@(?:[a-zA-Z0-9](?:[a-zA-Z0-9\\-]{0,61}[a-zA-Z0-9])?\\.)*[a-zA-Z0-9]{2,}\\.[a-zA-Z]{2,}$',
  },
  'STRING_FORMAT.url': {
    type: 'string',
    pattern: '^(?:https?|ftp|wss?):\\/\\/.+',
  },
  'STRING_FORMAT.urlHttp': {
    type: 'string',
    pattern: '^https?:\\/\\/.+',
  },
  'STRING_FORMAT.urlFile': {
    type: 'string',
    pattern: '^file:\\/\\/.+',
  },
  'STRING_FORMAT.pattern_slug': {type: 'string', pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$'},
  'STRING_FORMAT.pattern_hex': {type: 'string', pattern: '^[0-9a-fA-F]+$'},

  // ── NUMBER_FORMAT ──
  'NUMBER_FORMAT.number_max': {type: 'number', maximum: 100},
  'NUMBER_FORMAT.number_min': {type: 'number', minimum: 0},
  'NUMBER_FORMAT.number_lt': {type: 'number', exclusiveMaximum: 10},
  'NUMBER_FORMAT.number_gt': {type: 'number', exclusiveMinimum: 0},
  'NUMBER_FORMAT.number_integer': {type: 'integer'},
  'NUMBER_FORMAT.number_float': {type: 'number', not: {type: 'integer'}},
  'NUMBER_FORMAT.number_multipleOf': {type: 'number', multipleOf: 5},
  'NUMBER_FORMAT.number_combined': {type: 'integer', minimum: 0, maximum: 100, multipleOf: 5},
  'NUMBER_FORMAT.number_int8': {type: 'integer', minimum: -128, maximum: 127},
  'NUMBER_FORMAT.number_uint8': {type: 'integer', minimum: 0, maximum: 255},

  // ── BIGINT_FORMAT ──
  'BIGINT_FORMAT.bigint_max': NOT_SUPPORTED, // no bigint type in JSON Schema
  'BIGINT_FORMAT.bigint_min': NOT_SUPPORTED, // no bigint type in JSON Schema
  'BIGINT_FORMAT.bigint_lt': NOT_SUPPORTED, // no bigint type in JSON Schema
  'BIGINT_FORMAT.bigint_gt': NOT_SUPPORTED, // no bigint type in JSON Schema
  'BIGINT_FORMAT.bigint_multipleOf': NOT_SUPPORTED, // no bigint type in JSON Schema
  'BIGINT_FORMAT.bigint_combined': NOT_SUPPORTED, // no bigint type in JSON Schema
  'BIGINT_FORMAT.bigint_int64': NOT_SUPPORTED, // no bigint type in JSON Schema
  'BIGINT_FORMAT.bigint_uint64': NOT_SUPPORTED, // no bigint type in JSON Schema

  // ── DATETIME ──
  'DATETIME.date_minmax': NOT_SUPPORTED, // no Date instance type in JSON Schema
  'DATETIME.date_gtlt': NOT_SUPPORTED, // no Date instance type in JSON Schema
  'DATETIME.date_min_lt': NOT_SUPPORTED, // no Date instance type in JSON Schema
  'DATETIME.date_max_now': NOT_SUPPORTED, // no Date instance type in JSON Schema
  'DATETIME.date_rel_window': NOT_SUPPORTED, // no Date instance type in JSON Schema
  'DATETIME.date_rel_datetime_components': NOT_SUPPORTED, // no Date instance type in JSON Schema
  'DATETIME.instant_minmax': NOT_SUPPORTED, // no Temporal.Instant instance type in JSON Schema
  'DATETIME.instant_gtlt': NOT_SUPPORTED, // no Temporal.Instant instance type in JSON Schema
  'DATETIME.instant_rel': NOT_SUPPORTED, // no Temporal.Instant instance type in JSON Schema
  'DATETIME.plainDate_minmax': NOT_SUPPORTED, // no Temporal.PlainDate instance type in JSON Schema
  'DATETIME.plainDate_gtlt': NOT_SUPPORTED, // no Temporal.PlainDate instance type in JSON Schema
  'DATETIME.plainDate_min_lt': NOT_SUPPORTED, // no Temporal.PlainDate instance type in JSON Schema
  'DATETIME.plainDate_gt_max': NOT_SUPPORTED, // no Temporal.PlainDate instance type in JSON Schema
  'DATETIME.plainDate_min_only': NOT_SUPPORTED, // no Temporal.PlainDate instance type in JSON Schema
  'DATETIME.plainDate_max_only': NOT_SUPPORTED, // no Temporal.PlainDate instance type in JSON Schema
  'DATETIME.plainDate_gt_only': NOT_SUPPORTED, // no Temporal.PlainDate instance type in JSON Schema
  'DATETIME.plainDate_lt_only': NOT_SUPPORTED, // no Temporal.PlainDate instance type in JSON Schema
  'DATETIME.plainDate_rel_window': NOT_SUPPORTED, // no Temporal.PlainDate instance type in JSON Schema
  'DATETIME.plainDate_rel_ymd': NOT_SUPPORTED, // no Temporal.PlainDate instance type in JSON Schema
  'DATETIME.plainDate_rel_weeks': NOT_SUPPORTED, // no Temporal.PlainDate instance type in JSON Schema
  'DATETIME.plainTime_minmax': NOT_SUPPORTED, // no Temporal.PlainTime instance type in JSON Schema
  'DATETIME.plainTime_gtlt': NOT_SUPPORTED, // no Temporal.PlainTime instance type in JSON Schema
  'DATETIME.plainDateTime_minmax': NOT_SUPPORTED, // no Temporal.PlainDateTime instance type in JSON Schema
  'DATETIME.plainDateTime_gtlt': NOT_SUPPORTED, // no Temporal.PlainDateTime instance type in JSON Schema
  'DATETIME.plainDateTime_rel': NOT_SUPPORTED, // no Temporal.PlainDateTime instance type in JSON Schema
  'DATETIME.plainDateTime_rel_combo': NOT_SUPPORTED, // no Temporal.PlainDateTime instance type in JSON Schema
  'DATETIME.plainYearMonth_minmax': NOT_SUPPORTED, // no Temporal.PlainYearMonth instance type in JSON Schema
  'DATETIME.plainYearMonth_gtlt': NOT_SUPPORTED, // no Temporal.PlainYearMonth instance type in JSON Schema
  'DATETIME.plainYearMonth_rel': NOT_SUPPORTED, // no Temporal.PlainYearMonth instance type in JSON Schema
  'DATETIME.zonedDateTime_minmax': NOT_SUPPORTED, // no Temporal.ZonedDateTime instance type in JSON Schema
  'DATETIME.zonedDateTime_gtlt': NOT_SUPPORTED, // no Temporal.ZonedDateTime instance type in JSON Schema
  'DATETIME.zonedDateTime_rel': NOT_SUPPORTED, // no Temporal.ZonedDateTime instance type in JSON Schema

  // ── REALWORLD ──
  'REALWORLD.user': {
    type: 'object',
    properties: {
      id: {type: 'number'},
      email: {type: 'string'},
      name: {type: 'string'},
      age: {type: 'number'},
      roles: {type: 'array', items: {enum: ['admin', 'editor', 'user']}},
      active: {type: 'boolean'},
      createdAt: {type: 'string'},
    },
    required: ['id', 'email', 'name', 'roles', 'active', 'createdAt'],
  },
  'REALWORLD.order': {
    type: 'object',
    properties: {
      id: {type: 'string'},
      customer: {type: 'object', properties: {id: {type: 'number'}, email: {type: 'string'}}, required: ['id', 'email']},
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {sku: {type: 'string'}, name: {type: 'string'}, qty: {type: 'number'}, price: {type: 'number'}},
          required: ['sku', 'name', 'qty', 'price'],
        },
      },
      shipping: {
        type: 'object',
        properties: {
          street: {type: 'string'},
          city: {type: 'string'},
          state: {type: 'string'},
          zip: {type: 'string'},
          country: {type: 'string'},
        },
        required: ['street', 'city', 'state', 'zip', 'country'],
      },
      status: {enum: ['pending', 'paid', 'shipped', 'delivered', 'cancelled']},
      total: {type: 'number'},
      note: {type: 'string'},
    },
    required: ['id', 'customer', 'items', 'shipping', 'status', 'total'],
  },
  'REALWORLD.blogPost': {
    type: 'object',
    properties: {
      id: {type: 'number'},
      title: {type: 'string'},
      slug: {type: 'string'},
      body: {type: 'string'},
      tags: {type: 'array', items: {type: 'string'}},
      author: {type: 'object', properties: {name: {type: 'string'}, email: {type: 'string'}}, required: ['name', 'email']},
      published: {type: 'boolean'},
      publishedAt: {type: 'string'},
      meta: {type: 'object', properties: {views: {type: 'number'}, likes: {type: 'number'}}, required: ['views', 'likes']},
    },
    required: ['id', 'title', 'slug', 'body', 'tags', 'author', 'published', 'meta'],
  },
  'REALWORLD.product': {
    type: 'object',
    properties: {
      id: {type: 'string'},
      name: {type: 'string'},
      description: {type: 'string'},
      price: {type: 'number'},
      currency: {enum: ['USD', 'EUR', 'GBP']},
      inStock: {type: 'boolean'},
      categories: {type: 'array', items: {type: 'string'}},
      dimensions: {
        type: 'object',
        properties: {width: {type: 'number'}, height: {type: 'number'}, depth: {type: 'number'}},
        required: ['width', 'height', 'depth'],
      },
    },
    required: ['id', 'name', 'description', 'price', 'currency', 'inStock', 'categories'],
  },
  'REALWORLD.productPage': {
    type: 'object',
    properties: {
      data: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: {type: 'string'},
            name: {type: 'string'},
            description: {type: 'string'},
            price: {type: 'number'},
            currency: {enum: ['USD', 'EUR', 'GBP']},
            inStock: {type: 'boolean'},
            categories: {type: 'array', items: {type: 'string'}},
            dimensions: {
              type: 'object',
              properties: {width: {type: 'number'}, height: {type: 'number'}, depth: {type: 'number'}},
              required: ['width', 'height', 'depth'],
            },
          },
          required: ['id', 'name', 'description', 'price', 'currency', 'inStock', 'categories'],
        },
      },
      page: {type: 'number'},
      pageSize: {type: 'number'},
      total: {type: 'number'},
      hasMore: {type: 'boolean'},
    },
    required: ['data', 'page', 'pageSize', 'total', 'hasMore'],
  },
  'REALWORLD.registrationForm': {
    type: 'object',
    properties: {
      email: {type: 'string'},
      password: {type: 'string'},
      acceptedTerms: {const: true},
      profile: {
        type: 'object',
        properties: {firstName: {type: 'string'}, lastName: {type: 'string'}, age: {type: 'number'}},
        required: ['firstName', 'lastName'],
      },
    },
    required: ['email', 'password', 'acceptedTerms', 'profile'],
  },

  // ── JSON_SCHEMA ──
  'JSON_SCHEMA.closed_object': {
    "type": "object",
    "properties": {
      "id": {
        "type": "integer"
      },
      "name": {
        "type": "string"
      }
    },
    "required": [
      "id",
      "name"
    ],
    "additionalProperties": false
  },
  'JSON_SCHEMA.pattern_properties': {
    "type": "object",
    "patternProperties": {
      "^col_": {
        "type": "number"
      }
    },
    "additionalProperties": false
  },
  'JSON_SCHEMA.property_names': {
    "type": "object",
    "propertyNames": {
      "pattern": "^[a-z]+$"
    },
    "additionalProperties": {
      "type": "number"
    }
  },
  'JSON_SCHEMA.contains_count': {
    "type": "array",
    "items": {
      "type": "number"
    },
    "contains": {
      "type": "number",
      "minimum": 10
    },
    "minContains": 2
  },
  'JSON_SCHEMA.unique_items': {
    "type": "array",
    "items": {
      "type": "number"
    },
    "uniqueItems": true
  },
  'JSON_SCHEMA.object_size': {
    "type": "object",
    "additionalProperties": {
      "type": "number"
    },
    "minProperties": 1,
    "maxProperties": 3
  },
  'JSON_SCHEMA.dependent_required': {
    "type": "object",
    "properties": {
      "credit_card": {
        "type": "integer"
      },
      "billing_address": {
        "type": "string"
      }
    },
    "dependentRequired": {
      "credit_card": [
        "billing_address"
      ]
    }
  },
  'JSON_SCHEMA.string_email': {
    "type": "string",
    "format": "email"
  },
  'JSON_SCHEMA.int_bounded': {
    "type": "integer",
    "minimum": 0,
    "maximum": 130
  },
  'JSON_SCHEMA.string_pattern': {
    "type": "string",
    "pattern": "^[a-z][a-z0-9-]*$"
  },
  'JSON_SCHEMA.multiple_of': {
    "type": "number",
    "multipleOf": 5
  },
} as const;
