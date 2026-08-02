// The single-file, human-readable type-recovery review surface for the JSON
// Schema door: one `as const` schema per accepted 2020-12 feature, its
// recovered type via `FromJsonSchema<typeof s>`, and VALUE ASSIGNMENTS that
// must (or must not) type-check. Compiled by `typecheck:test` — never
// executed; every `runTypeFromJsonSchema` reference is a thunk so the input
// side (`ExactJsonSchema`) is checked too.
//
// Reading guide: hover any `T_*` alias to inspect the recovered type by hand.
// Positive rows are plain assignments; negative rows are `@ts-expect-error`
// (tsc fails when one stops erroring, so the pins are bidirectional). The
// machine-checked siblings are test/types/jsonSchema.compile.test.ts (branch
// budgets + Equal pins through the extract harness) and the
// suites/json-schema-define runtime convergence suites; this file trades
// their rigor for a surface you can read top to bottom.

import type {FromJsonSchema} from '@ts-runtypes/core/json-schema';
import {runTypeFromJsonSchema} from '@ts-runtypes/core/json-schema';

// ---------------------------------------------------------------------------
// Types — primitives, the array form, const, enum, boolean schemas
// ---------------------------------------------------------------------------

export const sString = {type: 'string'} as const;
export type TString = FromJsonSchema<typeof sString>;
export const vString: TString = 'hello';

export const sNumber = {type: 'number'} as const;
export type TNumber = FromJsonSchema<typeof sNumber>;
export const vNumber: TNumber = 3.14;

export const sInteger = {type: 'integer'} as const;
export type TInteger = FromJsonSchema<typeof sInteger>;
export const vInteger: TInteger = 42;

export const sBoolean = {type: 'boolean'} as const;
export type TBoolean = FromJsonSchema<typeof sBoolean>;
export const vBoolean: TBoolean = true;

export const sNull = {type: 'null'} as const;
export type TNull = FromJsonSchema<typeof sNull>;
export const vNull: TNull = null;

export const sTypeArray = {type: ['string', 'null']} as const;
export type TTypeArray = FromJsonSchema<typeof sTypeArray>;
export const vTypeArrayA: TTypeArray = 'text';
export const vTypeArrayB: TTypeArray = null;
// @ts-expect-error a number is neither string nor null
export const vTypeArrayBad: TTypeArray = 1;

export const sConst = {const: 'pending'} as const;
export type TConst = FromJsonSchema<typeof sConst>;
export const vConst: TConst = 'pending';
// @ts-expect-error only the exact literal is allowed
export const vConstBad: TConst = 'other';

export const sEnum = {enum: ['red', 'blue', 7]} as const;
export type TEnum = FromJsonSchema<typeof sEnum>;
export const vEnumA: TEnum = 'red';
export const vEnumB: TEnum = 7;
// @ts-expect-error not a member of the enum
export const vEnumBad: TEnum = 'green';

// The always-true schema recovers unknown.
export const sEmpty = {} as const;
export type TEmpty = FromJsonSchema<typeof sEmpty>;
export const vEmpty: TEmpty = {anything: ['goes', 1]};

// ---------------------------------------------------------------------------
// Objects — properties/required, additionalProperties, key constraints
// ---------------------------------------------------------------------------

export const sObject = {
  type: 'object',
  properties: {id: {type: 'number'}, name: {type: 'string'}, note: {type: 'string'}},
  required: ['id', 'name'],
} as const;
export type TObject = FromJsonSchema<typeof sObject>;
export const vObject: TObject = {id: 1, name: 'ada'};
export const vObjectFull: TObject = {id: 1, name: 'ada', note: 'x'};
// @ts-expect-error name is required
export const vObjectBad: TObject = {id: 1};

export const sRecord = {type: 'object', additionalProperties: {type: 'number'}} as const;
export type TRecord = FromJsonSchema<typeof sRecord>;
export const vRecord: TRecord = {a: 1, b: 2};
// @ts-expect-error record values must be numbers
export const vRecordBad: TRecord = {a: 'x'};

// Declared properties intersected with a schema-valued additionalProperties.
export const sMixedObject = {
  type: 'object',
  properties: {id: {type: 'string'}},
  required: ['id'],
  additionalProperties: {type: 'string'},
} as const;
export type TMixedObject = FromJsonSchema<typeof sMixedObject>;
export const vMixedObject: TMixedObject = {id: 'a', extra: 'b'};

// additionalProperties: false closes the shape in the VALIDATOR; the recovered
// type is the declared members (closedness has no extra type-level footprint).
export const sClosed = {
  type: 'object',
  properties: {id: {type: 'string'}},
  required: ['id'],
  additionalProperties: false,
} as const;
export type TClosed = FromJsonSchema<typeof sClosed>;
export const vClosed: TClosed = {id: 'a'};

export const sPatternProps = {type: 'object', patternProperties: {'^n_': {type: 'number'}}} as const;
export type TPatternProps = FromJsonSchema<typeof sPatternProps>;
export const vPatternProps: TPatternProps = {n_count: 1, other: 'free'};

export const sPropNames = {type: 'object', additionalProperties: {type: 'number'}, propertyNames: {maxLength: 3}} as const;
export type TPropNames = FromJsonSchema<typeof sPropNames>;
export const vPropNames: TPropNames = {abc: 1};

export const sKeyCounts = {type: 'object', additionalProperties: {type: 'string'}, minProperties: 1, maxProperties: 3} as const;
export type TKeyCounts = FromJsonSchema<typeof sKeyCounts>;
export const vKeyCounts: TKeyCounts = {a: 'x'};

// dependentRequired desugars to the union of the allowed combinations.
export const sDependentRequired = {
  type: 'object',
  properties: {card: {type: 'string'}, cvv: {type: 'string'}},
  dependentRequired: {card: ['cvv']},
} as const;
export type TDependentRequired = FromJsonSchema<typeof sDependentRequired>;
export const vDependentA: TDependentRequired = {card: '4111', cvv: '123'};
export const vDependentB: TDependentRequired = {};
export const vDependentC: TDependentRequired = {cvv: '123'};
// @ts-expect-error card without cvv is the forbidden combination
export const vDependentBad: TDependentRequired = {card: '4111'};

// dependentSchemas — the presence of a key activates a sibling schema.
export const sDependentSchemas = {
  type: 'object',
  properties: {kind: {type: 'string'}},
  dependentSchemas: {kind: {properties: {tag: {type: 'string'}}, required: ['tag']}},
} as const;
export type TDependentSchemas = FromJsonSchema<typeof sDependentSchemas>;
export const vDependentSchemasA: TDependentSchemas = {kind: 'a', tag: 't'};
export const vDependentSchemasB: TDependentSchemas = {};

// ---------------------------------------------------------------------------
// Arrays and tuples — items, prefixItems, bounds, boolean slots, contains
// ---------------------------------------------------------------------------

export const sArray = {type: 'array', items: {type: 'string'}} as const;
export type TArray = FromJsonSchema<typeof sArray>;
export const vArray: TArray = ['a', 'b'];
// @ts-expect-error the items schema types every element
export const vArrayBad: TArray = [1];

export const sTuple = {
  type: 'array',
  prefixItems: [{type: 'string'}, {type: 'number'}],
  minItems: 2,
  items: false,
} as const;
export type TTuple = FromJsonSchema<typeof sTuple>;
export const vTuple: TTuple = ['id', 1];
// @ts-expect-error the tuple is closed at two slots
export const vTupleBad: TTuple = ['id', 1, 'extra'];

// A prefix longer than minItems leaves trailing optional slots.
export const sTupleOptional = {
  type: 'array',
  prefixItems: [{type: 'string'}, {type: 'number'}],
  minItems: 1,
  items: false,
} as const;
export type TTupleOptional = FromJsonSchema<typeof sTupleOptional>;
export const vTupleOptionalA: TTupleOptional = ['only'];
export const vTupleOptionalB: TTupleOptional = ['id', 2];

// An open tail: items types the rest.
export const sTupleRest = {type: 'array', prefixItems: [{type: 'string'}], items: {type: 'number'}} as const;
export type TTupleRest = FromJsonSchema<typeof sTupleRest>;
export const vTupleRest: TTupleRest = ['head', 1, 2, 3];

// minItems beyond the prefix keeps REQUIRING members of the rest type.
export const sMinItems = {type: 'array', items: {type: 'number'}, minItems: 2} as const;
export type TMinItems = FromJsonSchema<typeof sMinItems>;
export const vMinItems: TMinItems = [1, 2];
export const vMinItemsMore: TMinItems = [1, 2, 3];
// @ts-expect-error two members are required
export const vMinItemsBad: TMinItems = [1];

// Boolean slots: true leaves a position unconstrained, false forbids it.
export const sBoolSlots = {type: 'array', prefixItems: [{type: 'string'}, true, false], items: false} as const;
export type TBoolSlots = FromJsonSchema<typeof sBoolSlots>;
export const vBoolSlotsA: TBoolSlots = ['a'];
export const vBoolSlotsB: TBoolSlots = ['a', {any: 'thing'}];
// @ts-expect-error the false slot forbids a third member
export const vBoolSlotsBad: TBoolSlots = ['a', 1, 2];

// uniqueItems / maxItems ride an arrayFormat brand; the base stays assignable.
export const sArrayBounds = {type: 'array', items: {type: 'number'}, uniqueItems: true, maxItems: 5} as const;
export type TArrayBounds = FromJsonSchema<typeof sArrayBounds>;
export const vArrayBounds: TArrayBounds = [1, 2, 3];

// contains (+ counts) rides the __rtContains sentinel; base stays assignable.
export const sContains = {type: 'array', contains: {type: 'number'}, minContains: 2, maxContains: 4} as const;
export type TContains = FromJsonSchema<typeof sContains>;
export const vContains: TContains = ['pad', 1, 2];

// ---------------------------------------------------------------------------
// Combinators and negation — anyOf, oneOf, allOf, not
// ---------------------------------------------------------------------------

export const sAnyOf = {anyOf: [{type: 'string'}, {type: 'number'}]} as const;
export type TAnyOf = FromJsonSchema<typeof sAnyOf>;
export const vAnyOfA: TAnyOf = 'x';
export const vAnyOfB: TAnyOf = 1;
// @ts-expect-error neither branch admits a boolean
export const vAnyOfBad: TAnyOf = true;

export const sOneOf = {oneOf: [{type: 'string'}, {type: 'number'}]} as const;
export type TOneOf = FromJsonSchema<typeof sOneOf>;
export const vOneOfA: TOneOf = 'x';
export const vOneOfB: TOneOf = 2;

// The degenerate duplicated-nullish oneOf can never match exactly one branch,
// so it recovers never.
export const sOneOfNever = {oneOf: [{type: 'null'}, {type: 'null'}]} as const;
export type TOneOfNever = FromJsonSchema<typeof sOneOfNever>;
// @ts-expect-error the recovered type is never
export const vOneOfNeverBad: TOneOfNever = null;

export const sAllOf = {
  allOf: [
    {type: 'object', properties: {a: {type: 'string'}}, required: ['a']},
    {type: 'object', properties: {b: {type: 'number'}}, required: ['b']},
  ],
} as const;
export type TAllOf = FromJsonSchema<typeof sAllOf>;
export const vAllOf: TAllOf = {a: 'x', b: 1};
// @ts-expect-error both branches apply
export const vAllOfBad: TAllOf = {a: 'x'};

// allOf over tuple prefixes merges slot by slot.
export const sAllOfTuples = {
  allOf: [
    {type: 'array', prefixItems: [{type: 'string'}], items: {}},
    {type: 'array', prefixItems: [true, {type: 'number'}], items: {}},
  ],
} as const;
export type TAllOfTuples = FromJsonSchema<typeof sAllOfTuples>;
export const vAllOfTuples: TAllOfTuples = ['id', 3];

// Format-scoped not: still a string type-side; the negation is enforced by
// the generated validator.
export const sNotPattern = {type: 'string', not: {pattern: '^tmp_'}} as const;
export type TNotPattern = FromJsonSchema<typeof sNotPattern>;
export const vNotPattern: TNotPattern = 'durable_name';

// not over const/enum lowers to disallowedValues on the string format.
export const sNotEnum = {type: 'string', not: {enum: ['reserved', 'admin']}} as const;
export type TNotEnum = FromJsonSchema<typeof sNotEnum>;
export const vNotEnum: TNotEnum = 'ada';

// ---------------------------------------------------------------------------
// Conditionals — if / then / else
// ---------------------------------------------------------------------------

export const sIfThenElse = {
  type: 'object',
  properties: {kind: {type: 'string'}},
  required: ['kind'],
  if: {properties: {kind: {const: 'circle'}}},
  then: {properties: {radius: {type: 'number'}}, required: ['radius']},
  else: {properties: {side: {type: 'number'}}, required: ['side']},
} as const;
export type TIfThenElse = FromJsonSchema<typeof sIfThenElse>;
export const vIfThen: TIfThenElse = {kind: 'circle', radius: 2};
export const vIfElse: TIfThenElse = {kind: 'square', side: 2};

// ---------------------------------------------------------------------------
// References — $defs / $ref, root recursion, $anchor
// ---------------------------------------------------------------------------

export const sRefs = {
  $defs: {point: {type: 'object', properties: {x: {type: 'number'}, y: {type: 'number'}}, required: ['x', 'y']}},
  type: 'object',
  properties: {from: {$ref: '#/$defs/point'}, to: {$ref: '#/$defs/point'}},
  required: ['from', 'to'],
} as const;
export type TRefs = FromJsonSchema<typeof sRefs>;
export const vRefs: TRefs = {from: {x: 0, y: 0}, to: {x: 1, y: 1}};

// A $ref back to the root recovers a recursive type.
export const sRecursive = {
  type: 'object',
  properties: {value: {type: 'number'}, next: {$ref: '#'}},
  required: ['value'],
} as const;
export type TRecursive = FromJsonSchema<typeof sRecursive>;
export const vRecursive: TRecursive = {value: 1, next: {value: 2, next: {value: 3}}};

export const sAnchor = {
  $defs: {leaf: {$anchor: 'leaf', type: 'string'}},
  type: 'array',
  items: {$ref: '#leaf'},
} as const;
export type TAnchor = FromJsonSchema<typeof sAnchor>;
export const vAnchor: TAnchor = ['a', 'b'];

// ---------------------------------------------------------------------------
// Strings — formats, length/pattern params, content keywords
// ---------------------------------------------------------------------------

export const sEmail = {type: 'string', format: 'email'} as const;
export type TEmail = FromJsonSchema<typeof sEmail>;
export const vEmail: TEmail = 'ada@example.com';

export const sUuid = {type: 'string', format: 'uuid'} as const;
export type TUuid = FromJsonSchema<typeof sUuid>;
export const vUuid: TUuid = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

export const sDate = {type: 'string', format: 'date'} as const;
export type TDate = FromJsonSchema<typeof sDate>;
export const vDate: TDate = '2026-08-02';

export const sTime = {type: 'string', format: 'time'} as const;
export type TTime = FromJsonSchema<typeof sTime>;
export const vTime: TTime = '12:30:45Z';

export const sDateTime = {type: 'string', format: 'date-time'} as const;
export type TDateTime = FromJsonSchema<typeof sDateTime>;
export const vDateTime: TDateTime = '2026-08-02T12:30:45Z';

export const sHostname = {type: 'string', format: 'hostname'} as const;
export type THostname = FromJsonSchema<typeof sHostname>;
export const vHostname: THostname = 'example.com';

export const sIpv4 = {type: 'string', format: 'ipv4'} as const;
export type TIpv4 = FromJsonSchema<typeof sIpv4>;
export const vIpv4: TIpv4 = '127.0.0.1';

export const sIpv6 = {type: 'string', format: 'ipv6'} as const;
export type TIpv6 = FromJsonSchema<typeof sIpv6>;
export const vIpv6: TIpv6 = '::1';

export const sUri = {type: 'string', format: 'uri'} as const;
export type TUri = FromJsonSchema<typeof sUri>;
export const vUri: TUri = 'https://example.com/x';

export const sStringParams = {type: 'string', minLength: 2, maxLength: 60, pattern: '^[a-z]+$'} as const;
export type TStringParams = FromJsonSchema<typeof sStringParams>;
export const vStringParams: TStringParams = 'lowercase';

export const sBase64 = {type: 'string', contentEncoding: 'base64'} as const;
export type TBase64 = FromJsonSchema<typeof sBase64>;
export const vBase64: TBase64 = 'aGVsbG8=';

export const sJsonContent = {type: 'string', contentMediaType: 'application/json'} as const;
export type TJsonContent = FromJsonSchema<typeof sJsonContent>;
export const vJsonContent: TJsonContent = '{"ok":true}';

// ---------------------------------------------------------------------------
// Numbers — bounds and multiples
// ---------------------------------------------------------------------------

export const sNumberBounds = {type: 'number', minimum: 0, maximum: 120, multipleOf: 0.5} as const;
export type TNumberBounds = FromJsonSchema<typeof sNumberBounds>;
export const vNumberBounds: TNumberBounds = 36.5;

export const sExclusive = {type: 'number', exclusiveMinimum: 0, exclusiveMaximum: 1} as const;
export type TExclusive = FromJsonSchema<typeof sExclusive>;
export const vExclusive: TExclusive = 0.5;

// ---------------------------------------------------------------------------
// Unevaluated (the accepted false form) and annotations
// ---------------------------------------------------------------------------

export const sUnevaluated = {
  type: 'object',
  properties: {id: {type: 'string'}},
  required: ['id'],
  unevaluatedProperties: false,
} as const;
export type TUnevaluated = FromJsonSchema<typeof sUnevaluated>;
export const vUnevaluated: TUnevaluated = {id: 'a'};

// Annotations describe the schema, never the data — the recovered type is the
// bare shape (readOnly / writeOnly included: read and ignored, no modifier).
export const sAnnotated = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://example.com/user.json',
  title: 'User',
  description: 'A user record',
  $comment: 'internal note',
  deprecated: true,
  type: 'object',
  properties: {
    id: {type: 'string', readOnly: true, examples: ['u_1']},
    name: {type: 'string', default: 'anon', writeOnly: true},
  },
  required: ['id', 'name'],
} as const;
export type TAnnotated = FromJsonSchema<typeof sAnnotated>;
export const vAnnotated: TAnnotated = {id: 'u_1', name: 'ada'};

// ---------------------------------------------------------------------------
// Input-side acceptance — every schema above is a valid runTypeFromJsonSchema
// argument (thunks: type-checked, never executed) — and the loud rejections.
// ---------------------------------------------------------------------------

export const accepted = () => [
  runTypeFromJsonSchema(sString),
  runTypeFromJsonSchema(sTypeArray),
  runTypeFromJsonSchema(sConst),
  runTypeFromJsonSchema(sEnum),
  runTypeFromJsonSchema(sObject),
  runTypeFromJsonSchema(sRecord),
  runTypeFromJsonSchema(sMixedObject),
  runTypeFromJsonSchema(sClosed),
  runTypeFromJsonSchema(sPatternProps),
  runTypeFromJsonSchema(sPropNames),
  runTypeFromJsonSchema(sKeyCounts),
  runTypeFromJsonSchema(sDependentRequired),
  runTypeFromJsonSchema(sDependentSchemas),
  runTypeFromJsonSchema(sArray),
  runTypeFromJsonSchema(sTuple),
  runTypeFromJsonSchema(sTupleOptional),
  runTypeFromJsonSchema(sTupleRest),
  runTypeFromJsonSchema(sMinItems),
  runTypeFromJsonSchema(sBoolSlots),
  runTypeFromJsonSchema(sArrayBounds),
  runTypeFromJsonSchema(sContains),
  runTypeFromJsonSchema(sAnyOf),
  runTypeFromJsonSchema(sOneOf),
  runTypeFromJsonSchema(sAllOf),
  runTypeFromJsonSchema(sAllOfTuples),
  runTypeFromJsonSchema(sNotPattern),
  runTypeFromJsonSchema(sNotEnum),
  runTypeFromJsonSchema(sIfThenElse),
  runTypeFromJsonSchema(sRefs),
  runTypeFromJsonSchema(sRecursive),
  runTypeFromJsonSchema(sAnchor),
  runTypeFromJsonSchema(sEmail),
  runTypeFromJsonSchema(sUuid),
  runTypeFromJsonSchema(sStringParams),
  runTypeFromJsonSchema(sBase64),
  runTypeFromJsonSchema(sJsonContent),
  runTypeFromJsonSchema(sNumberBounds),
  runTypeFromJsonSchema(sExclusive),
  runTypeFromJsonSchema(sUnevaluated),
  runTypeFromJsonSchema(sAnnotated),
];

export const rejected = () => [
  // @ts-expect-error a misspelled keyword is rejected at the key, not dropped
  runTypeFromJsonSchema({type: 'string', minLen: 3} as const),
  // @ts-expect-error an embedded $id would re-scope references
  runTypeFromJsonSchema({type: 'object', properties: {a: {$id: 'https://x', type: 'string'}}} as const),
  // @ts-expect-error contentSchema has no honest single-pass story
  runTypeFromJsonSchema({type: 'string', contentMediaType: 'application/json', contentSchema: {type: 'object'}} as const),
  // @ts-expect-error only draft 2020-12 is accepted
  runTypeFromJsonSchema({$schema: 'http://json-schema.org/draft-07/schema#', type: 'string'} as const),
];

// An unknown format value is the annotation the spec defaults it to: accepted,
// the type stays a plain string, and nothing is silently half-checked.
export const sUnknownFormat = {type: 'string', format: 'iri'} as const;
export type TUnknownFormat = FromJsonSchema<typeof sUnknownFormat>;
export const vUnknownFormat: TUnknownFormat = 'https://example.com/x';
export const rtUnknownFormat = () => runTypeFromJsonSchema(sUnknownFormat);
