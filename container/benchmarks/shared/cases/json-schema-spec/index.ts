// The JSON Schema SPEC-CONFORMANCE corpus (draft 2020-12).
//
// This is not a benchmark. The validation suites answer "can each library express
// this shape, and how fast", and their JSON_SCHEMA group proves we SUPPORT a
// keyword. Neither proves we read a keyword the way the dialect says. That is
// what this corpus is for: one case per keyword, a document plus samples the
// SPEC says must pass and must fail, walked by every library that can consume a
// document.
//
// THE ORACLE HERE IS THE SPEC, NOT RUNTYPES. Everywhere else in this harness the
// shared samples are "the ts-runtypes truth" and RunTypes is the reference column
// that reads 0 by construction. That would make this table meaningless, so here
// both libraries are measured against the labels below and ts-runtypes can show a
// non-zero cell. It is supposed to read zero; a cell that does not is a
// conformance bug in our door, which is the entire reason this file exists.
//
// Only draft 2020-12 ASSERTIONS get a case. The keywords the guide documents as
// rejected at BUILD time (an embedded `$id`, `contentSchema`, `unevaluated*`
// beside a branch-dependent combinator, `oneOf` beside a constraining sibling)
// are not runtime verdicts and are covered by the json-schema-define unit suite.
//
// Two places where a "spec conformance" label is a judgement call, both called
// out on the case:
//   - NUMBERS/TYPES `{type: 'number'}`: JSON cannot carry NaN or Infinity, so
//     they are labelled invalid. ajv accepts them (a JS-level typeof check), and
//     that divergence is expected and documented on the page.
//   - CONTENT `contentEncoding` / `contentMediaType`: the dialect defines these
//     as annotations that a validator MAY enforce. RunTypes enforces them (see
//     the guide's keyword table); ajv leaves them as annotations, so it diverges
//     here by design rather than by error.

export interface SpecCase {
  title: string;
  description?: string;
  /** The draft 2020-12 document under test. Plain data: no library types. */
  schema: unknown;
  /** Values the SPEC says this document accepts. */
  valid: unknown[];
  /** Values the SPEC says this document rejects, each failing on THIS keyword. */
  invalid: unknown[];
}

export const SPEC_SUITE = {
  TYPES: {
    type_string: {
      title: "type: 'string'",
      schema: {type: 'string'},
      valid: ['', 'a', 'hello world'],
      invalid: [1, null, true, [], {}],
    },
    type_integer: {
      title: "type: 'integer'",
      description: 'A number with a zero fractional part, not a separate JSON type',
      schema: {type: 'integer'},
      valid: [0, 1, -5, 1000],
      invalid: [1.5, -0.5, '1', null, true],
    },
    type_number: {
      title: "type: 'number'",
      description: 'NaN and Infinity are labelled invalid: JSON cannot carry either',
      schema: {type: 'number'},
      valid: [0, 1.5, -2, 1e3],
      invalid: ['1', null, true, [], NaN, Infinity, -Infinity],
    },
    type_boolean: {
      title: "type: 'boolean'",
      schema: {type: 'boolean'},
      valid: [true, false],
      invalid: [0, 1, 'true', null, []],
    },
    type_null: {
      title: "type: 'null'",
      schema: {type: 'null'},
      valid: [null],
      invalid: [0, '', false, {}, []],
    },
    type_array: {
      title: "type: 'array'",
      schema: {type: 'array'},
      valid: [[], [1], ['a', null]],
      invalid: [{}, 'a', 1, null],
    },
    type_object: {
      title: "type: 'object'",
      description: 'An array is not an object in JSON Schema',
      schema: {type: 'object'},
      valid: [{}, {a: 1}],
      invalid: [[], 'a', 1, null],
    },
    type_union: {
      title: "type: ['string', 'null'] — the array form",
      schema: {type: ['string', 'null']},
      valid: ['a', '', null],
      invalid: [1, true, [], {}],
    },
    const_keyword: {
      title: 'const',
      schema: {const: 'ok'},
      valid: ['ok'],
      invalid: ['OK', 'ok ', 1, null, ['ok']],
    },
    enum_keyword: {
      title: 'enum — a mixed-type member list',
      schema: {enum: [1, 'a', null]},
      valid: [1, 'a', null],
      invalid: [2, 'b', true, [], '1'],
    },
  },

  OBJECTS: {
    properties_required: {
      title: 'properties + required',
      description: 'An unlisted key is allowed; a missing required key is not',
      schema: {
        type: 'object',
        properties: {id: {type: 'integer'}, name: {type: 'string'}},
        required: ['id'],
      },
      valid: [{id: 1}, {id: 1, name: 'Ada'}, {id: 1, extra: true}],
      invalid: [{}, {name: 'Ada'}, {id: '1'}, {id: 1, name: 5}],
    },
    additional_properties_false: {
      title: 'additionalProperties: false closes the shape',
      schema: {
        type: 'object',
        properties: {a: {type: 'string'}},
        required: ['a'],
        additionalProperties: false,
      },
      valid: [{a: 'x'}],
      invalid: [{a: 'x', b: 1}, {}, {b: 1}],
    },
    additional_properties_schema: {
      title: 'additionalProperties as a schema types the rest',
      schema: {
        type: 'object',
        properties: {a: {type: 'string'}},
        additionalProperties: {type: 'number'},
      },
      valid: [{}, {a: 'x'}, {a: 'x', b: 1}],
      invalid: [{a: 'x', b: 'y'}, {b: null}],
    },
    min_max_properties: {
      title: 'minProperties + maxProperties',
      schema: {type: 'object', minProperties: 1, maxProperties: 2},
      valid: [{a: 1}, {a: 1, b: 2}],
      invalid: [{}, {a: 1, b: 2, c: 3}],
    },
    pattern_properties: {
      title: 'patternProperties types keys matching a regex',
      schema: {
        type: 'object',
        patternProperties: {'^col_': {type: 'number'}},
        additionalProperties: false,
      },
      valid: [{}, {col_a: 1}, {col_a: 1, col_b: 2}],
      invalid: [{col_a: 'x'}, {other: 1}],
    },
    property_names: {
      title: 'propertyNames constrains the keys themselves',
      schema: {type: 'object', propertyNames: {pattern: '^[a-z]+$'}},
      valid: [{}, {abc: 1}, {a: 1, bc: 2}],
      invalid: [{Abc: 1}, {'a-b': 1}, {a1: 1}],
    },
    dependent_required: {
      title: 'dependentRequired — one key makes another mandatory',
      schema: {
        type: 'object',
        properties: {credit_card: {type: 'integer'}, billing_address: {type: 'string'}},
        dependentRequired: {credit_card: ['billing_address']},
      },
      valid: [{}, {billing_address: 'x'}, {credit_card: 1, billing_address: 'x'}],
      invalid: [{credit_card: 1}],
    },
    dependent_schemas: {
      title: 'dependentSchemas — one key applies a whole subschema',
      schema: {
        type: 'object',
        properties: {kind: {type: 'string'}},
        dependentSchemas: {kind: {required: ['size'], properties: {size: {type: 'integer'}}}},
      },
      valid: [{}, {other: 1}, {kind: 'a', size: 2}],
      invalid: [{kind: 'a'}, {kind: 'a', size: 'big'}],
    },
    nested_object: {
      title: 'A nested object applies its own subschema',
      schema: {
        type: 'object',
        properties: {inner: {type: 'object', properties: {n: {type: 'integer'}}, required: ['n']}},
        required: ['inner'],
      },
      valid: [{inner: {n: 1}}],
      invalid: [{}, {inner: {}}, {inner: {n: 'x'}}, {inner: null}],
    },
  },

  ARRAYS: {
    items_typed: {
      title: 'items types every element',
      schema: {type: 'array', items: {type: 'string'}},
      valid: [[], ['a'], ['a', 'b']],
      invalid: [['a', 1], [null], [{}]],
    },
    prefix_items_open: {
      title: 'prefixItems without items leaves the tail unconstrained',
      schema: {type: 'array', prefixItems: [{type: 'string'}, {type: 'number'}]},
      valid: [
        ['a', 1],
        ['a', 1, true, {}],
        ['a'],
      ],
      invalid: [
        [1, 1],
        ['a', 'b'],
      ],
    },
    prefix_items_closed: {
      title: 'prefixItems + items: false is a closed tuple',
      schema: {
        type: 'array',
        prefixItems: [{type: 'string'}, {type: 'number'}],
        items: false,
        minItems: 2,
      },
      valid: [['a', 1]],
      invalid: [['a'], ['a', 1, 'extra'], [1, 'a']],
    },
    prefix_items_true_slot: {
      title: 'prefixItems with a `true` slot leaves that position unconstrained',
      schema: {
        type: 'array',
        prefixItems: [true, {type: 'number'}],
        items: false,
        minItems: 2,
      },
      valid: [
        ['anything', 1],
        [null, 2],
      ],
      invalid: [['a', 'b'], [1], ['a', 1, 2]],
    },
    min_max_items: {
      title: 'minItems + maxItems',
      schema: {type: 'array', minItems: 1, maxItems: 2},
      valid: [[1], [1, 2]],
      invalid: [[], [1, 2, 3]],
    },
    unique_items: {
      title: 'uniqueItems compares by deep equality',
      schema: {type: 'array', uniqueItems: true},
      valid: [[], [1, 2], [{a: 1}, {a: 2}]],
      invalid: [
        [1, 1],
        [{a: 1}, {a: 1}],
        [
          [1, 2],
          [1, 2],
        ],
      ],
    },
    contains: {
      title: 'contains — at least one element matches',
      schema: {type: 'array', contains: {type: 'number'}},
      valid: [[1], ['a', 1], [1, 2]],
      invalid: [[], ['a'], [null, 'b']],
    },
    min_contains: {
      title: 'minContains raises the required match count',
      schema: {type: 'array', contains: {type: 'number'}, minContains: 2},
      valid: [
        [1, 2],
        ['a', 1, 2],
      ],
      invalid: [[], [1], ['a', 1]],
    },
    max_contains: {
      title: 'maxContains caps the allowed match count',
      schema: {type: 'array', contains: {type: 'number'}, maxContains: 2},
      valid: [
        [1],
        [1, 2],
        ['a', 1],
      ],
      invalid: [[], [1, 2, 3]],
    },
  },

  COMBINATORS: {
    any_of: {
      title: 'anyOf — at least one branch matches',
      schema: {anyOf: [{type: 'string'}, {type: 'integer'}]},
      valid: ['a', 1],
      invalid: [1.5, true, null, []],
    },
    one_of_exclusive: {
      title: 'oneOf — EXACTLY one branch matches',
      description: 'A value matching two branches is rejected, unlike anyOf',
      // Each branch carries its own `type` gate. Bare `{multipleOf: 3}` would be
      // vacuously true for every non-number, which tests vacuous truth rather
      // than exclusivity. It also currently trips MKR009 in our door (a bare
      // constraint denotes `unknown`, whose reflection hits a self-instantiating
      // built-in) — tracked in docs/todos/json-schema-bare-constraint-unknown-root.md.
      schema: {oneOf: [{type: 'integer', multipleOf: 3}, {type: 'integer', multipleOf: 5}]},
      valid: [3, 5, 9, 10],
      invalid: [15, 30, 1],
    },
    one_of_nested: {
      title: 'oneOf counts branches as written',
      description: 'Matching both arms of an inner anyOf is still one branch, so 15 passes',
      // Each arm carries its own `type` gate on purpose. A bare `{multipleOf: 3}`
      // is vacuously TRUE for a non-number, so without the gate the second branch
      // would match strings and booleans too and every value would hit two
      // branches. This is also the spelling the guide recommends: push the shared
      // constraint into each branch rather than beside the combinator.
      schema: {
        oneOf: [{type: 'string'}, {anyOf: [{type: 'integer', multipleOf: 3}, {type: 'integer', multipleOf: 5}]}],
      },
      valid: ['a', 3, 5, 15],
      invalid: [1, true, null],
    },
    all_of: {
      title: 'allOf — every branch matches',
      schema: {allOf: [{type: 'integer'}, {minimum: 10}]},
      valid: [10, 11],
      invalid: [9, 10.5, 'a'],
    },
    not_keyword: {
      title: 'not — the negation of a subschema',
      schema: {not: {type: 'string'}},
      valid: [1, true, null, [], {}],
      invalid: ['a', ''],
    },
  },

  CONDITIONALS: {
    if_then: {
      title: 'if + then',
      description: 'A failing `if` leaves the value unconstrained when there is no `else`',
      schema: {
        if: {properties: {kind: {const: 'sized'}}, required: ['kind']},
        then: {required: ['size']},
      },
      valid: [{}, {kind: 'other'}, {kind: 'sized', size: 1}],
      invalid: [{kind: 'sized'}],
    },
    if_else: {
      title: 'if + else',
      schema: {
        if: {properties: {kind: {const: 'sized'}}, required: ['kind']},
        else: {required: ['name']},
      },
      valid: [{kind: 'sized'}, {name: 'x'}, {kind: 'other', name: 'x'}],
      invalid: [{}, {kind: 'other'}],
    },
    if_then_else: {
      title: 'if + then + else — both arms constrain',
      schema: {
        if: {properties: {kind: {const: 'sized'}}, required: ['kind']},
        then: {required: ['size']},
        else: {required: ['name']},
      },
      valid: [{kind: 'sized', size: 1}, {name: 'x'}],
      invalid: [{}, {kind: 'sized'}, {kind: 'other'}],
    },
  },

  REFERENCES: {
    defs_ref_root: {
      title: '$defs + a root $ref',
      schema: {
        $defs: {label: {type: 'string', minLength: 2}},
        $ref: '#/$defs/label',
      },
      valid: ['ab', 'abc'],
      invalid: ['a', '', 1, null],
    },
    ref_in_property: {
      title: '$ref from inside a property',
      schema: {
        $defs: {positive: {type: 'integer', minimum: 1}},
        type: 'object',
        properties: {count: {$ref: '#/$defs/positive'}},
        required: ['count'],
      },
      valid: [{count: 1}, {count: 99}],
      invalid: [{count: 0}, {count: 1.5}, {count: 'x'}, {}],
    },
    ref_with_sibling: {
      title: '$ref beside a sibling keyword',
      description: '2020-12 allows siblings next to $ref; both apply',
      schema: {
        $defs: {str: {type: 'string'}},
        $ref: '#/$defs/str',
        minLength: 3,
      },
      valid: ['abc', 'abcd'],
      invalid: ['ab', '', 1],
    },
    anchor_ref: {
      title: '$anchor as a reference target',
      schema: {
        $defs: {flag: {$anchor: 'flag', type: 'boolean'}},
        $ref: '#flag',
      },
      valid: [true, false],
      invalid: ['true', 1, null],
    },
    recursive_ref: {
      title: 'A self-referencing $ref builds a recursive shape',
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
      valid: [
        {name: 'leaf', children: []},
        {name: 'root', children: [{name: 'a', children: []}]},
      ],
      invalid: [{name: 'root'}, {children: []}, {name: 'root', children: [{name: 1, children: []}]}],
    },
  },

  STRINGS: {
    min_length: {
      title: 'minLength counts characters',
      schema: {type: 'string', minLength: 2},
      valid: ['ab', 'abc'],
      invalid: ['', 'a'],
    },
    max_length: {
      title: 'maxLength counts characters',
      schema: {type: 'string', maxLength: 3},
      valid: ['', 'abc'],
      invalid: ['abcd'],
    },
    pattern_keyword: {
      title: 'pattern is an unanchored regex unless anchored',
      schema: {type: 'string', pattern: '^[a-z][a-z0-9-]*$'},
      valid: ['a', 'my-slug-42'],
      invalid: ['9lives', 'Upper', 'has space', ''],
    },
    format_email: {
      title: "format: 'email'",
      schema: {type: 'string', format: 'email'},
      valid: ['ada@example.com', 'a.b+c@sub.example.co.uk'],
      invalid: ['not-an-email', '@example.com', 'no-at-sign.example.com'],
    },
    format_uuid: {
      title: "format: 'uuid' — any version, as the spec intends",
      schema: {type: 'string', format: 'uuid'},
      valid: ['3f2504e0-4f89-41d3-9a0c-0305e82c3301', 'f47ac10b-58cc-4372-a567-0e02b2c3d479'],
      invalid: ['not-a-uuid', '3f2504e0-4f89-41d3-9a0c', ''],
    },
    format_date: {
      title: "format: 'date' — a real calendar date",
      schema: {type: 'string', format: 'date'},
      valid: ['2026-08-03', '2024-02-29'],
      invalid: ['2026-13-01', '2026-02-30', '03-08-2026', ''],
    },
    format_time: {
      title: "format: 'time'",
      schema: {type: 'string', format: 'time'},
      valid: ['12:30:00Z', '23:59:59+01:00'],
      invalid: ['25:00:00Z', 'noon', ''],
    },
    format_date_time: {
      title: "format: 'date-time'",
      schema: {type: 'string', format: 'date-time'},
      valid: ['2026-08-03T12:30:00Z', '2026-08-03T12:30:00+01:00'],
      invalid: ['2026-08-03', '2026-13-01T00:00:00Z', ''],
    },
    format_hostname: {
      title: "format: 'hostname'",
      schema: {type: 'string', format: 'hostname'},
      valid: ['example.com', 'sub.example.co.uk'],
      invalid: ['-bad.example.com', 'not a host', ''],
    },
    format_ipv4: {
      title: "format: 'ipv4'",
      schema: {type: 'string', format: 'ipv4'},
      valid: ['192.168.0.1', '0.0.0.0'],
      invalid: ['256.0.0.1', '1.2.3', 'localhost'],
    },
    format_ipv6: {
      title: "format: 'ipv6'",
      schema: {type: 'string', format: 'ipv6'},
      valid: ['::1', '2001:db8::8a2e:370:7334'],
      invalid: ['192.168.0.1', 'gggg::1', ''],
    },
    format_uri: {
      title: "format: 'uri' — an absolute URI",
      schema: {type: 'string', format: 'uri'},
      valid: ['https://example.com', 'mailto:ada@example.com'],
      invalid: ['/relative/path', 'not a uri'],
    },
    unknown_format_is_annotation: {
      title: 'An unknown format is an annotation, not a half-check',
      description: 'The dialect defaults an unrecognised format to no assertion at all',
      schema: {type: 'string', format: 'not-a-real-format'},
      valid: ['anything', ''],
      invalid: [1, null, []],
    },
  },

  NUMBERS: {
    minimum: {
      title: 'minimum is inclusive',
      schema: {type: 'number', minimum: 0},
      valid: [0, 1, 1e6],
      invalid: [-1, -0.5],
    },
    maximum: {
      title: 'maximum is inclusive',
      schema: {type: 'number', maximum: 100},
      valid: [100, 0, -5],
      invalid: [101, 100.5],
    },
    exclusive_minimum: {
      title: 'exclusiveMinimum is a number in 2020-12, not a boolean',
      schema: {type: 'number', exclusiveMinimum: 0},
      valid: [0.1, 1],
      invalid: [0, -1],
    },
    exclusive_maximum: {
      title: 'exclusiveMaximum is a number in 2020-12, not a boolean',
      schema: {type: 'number', exclusiveMaximum: 10},
      valid: [9.9, 0],
      invalid: [10, 11],
    },
    multiple_of: {
      title: 'multipleOf',
      schema: {type: 'number', multipleOf: 5},
      valid: [0, 5, -5, 100],
      invalid: [7, 2.5, -3],
    },
  },

  UNEVALUATED: {
    unevaluated_properties_false: {
      title: 'unevaluatedProperties: false closes what the document evaluated',
      description: 'Keys covered by `properties` count as evaluated; anything else does not',
      schema: {
        type: 'object',
        properties: {a: {type: 'string'}},
        required: ['a'],
        unevaluatedProperties: false,
      },
      valid: [{a: 'x'}],
      invalid: [{a: 'x', b: 1}, {}],
    },
    unevaluated_items_false: {
      title: 'unevaluatedItems: false closes the tail a document evaluated',
      schema: {
        type: 'array',
        prefixItems: [{type: 'string'}],
        unevaluatedItems: false,
      },
      valid: [['a'], []],
      invalid: [
        ['a', 1],
        ['a', 'b'],
      ],
    },
  },

  ANNOTATIONS: {
    annotations_ignored: {
      title: 'Annotations describe the schema and never constrain the data',
      schema: {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        title: 'A label',
        description: 'Some prose',
        default: 'fallback',
        examples: ['one', 'two'],
        $comment: 'not a constraint',
        deprecated: true,
        writeOnly: true,
        type: 'string',
      },
      valid: ['anything', ''],
      invalid: [1, null, []],
    },
    read_only_property: {
      title: 'readOnly is an annotation on the value side',
      description: 'It gains the readonly modifier on the recovered type and asserts nothing at run time',
      schema: {
        type: 'object',
        properties: {id: {type: 'integer', readOnly: true}},
        required: ['id'],
      },
      valid: [{id: 1}, {id: 2}],
      invalid: [{}, {id: 'x'}],
    },
  },

  CONTENT: {
    content_encoding_base64: {
      title: "contentEncoding: 'base64'",
      description: 'The dialect makes this an annotation a validator MAY enforce; RunTypes enforces it',
      schema: {type: 'string', contentEncoding: 'base64'},
      valid: ['aGVsbG8=', ''],
      invalid: ['not base64!!', '@@@@'],
    },
    content_media_type_json: {
      title: "contentMediaType: 'application/json'",
      description: 'Also an annotation the dialect leaves optional; RunTypes enforces it',
      schema: {type: 'string', contentMediaType: 'application/json'},
      valid: ['{"a":1}', '[]'],
      invalid: ['{not json', 'plain text'],
    },
  },
} as const satisfies Record<string, Record<string, SpecCase>>;

export interface IteratedSpecCase {
  key: string;
  group: string;
  name: string;
  case: SpecCase;
}

const ALL: IteratedSpecCase[] = [];
for (const [group, cases] of Object.entries(SPEC_SUITE)) {
  for (const [name, specCase] of Object.entries(cases as Record<string, SpecCase>)) {
    ALL.push({key: `${group}.${name}`, group, name, case: specCase});
  }
}

export function iterateSpecCases(): readonly IteratedSpecCase[] {
  return ALL;
}
