// JSON-Schema define suite — single source of truth for the behavioral
// assertions of the schema-literal authoring surface (`ts-runtypes/json-schema`),
// the THIRD authoring form. Sibling of value-first-define (same minimal
// two-file shape: this registry + jsonSchemaDefine.test.ts).
//
// Each case authors ONE draft 2020-12 schema and exercises it three ways:
//   - static  `createValidateFn<FromJsonSchema<typeof S>>()` (or the
//     hand-written type twin) — the recovered type used type-first
//   - reflect `createValidateFn(value)` where the value's declared type is the
//     recovered type (cast, discarded at runtime — marker coverage rule)
//   - builder `createValidateFn(jsonSchema(S))` — the schema-literal form
// plus a getValidationErrors contract pass and mock soundness straight from the
// schema (`createMockDataFn(jsonSchema(S))`, every draw validated).
//
// Schemas shared by several thunks live at module scope with `as const` (the
// CompTimeArgs contract accepts same-module consts — that acceptance is itself
// one of the behaviors this suite pins; the `inline_point` case keeps the
// literal-at-call-site path covered). This suite is NOT under the serialization
// CLAUDE.md self-contained-thunk rule — the validation/serialization suite
// COLUMNS are, and inline their literals per case.
//
// DELIBERATELY no `import '@ts-runtypes/core/formats'` side-effect line here:
// the json-schema subpath entry performs the format registrations itself (and
// the mock registrations ride the mock subtree) — a consumer importing only
// the subpath must be fully sound, and this suite proves it.

import {
  createValidateFn,
  createGetValidationErrorsFn,
  createMockDataFn,
  type MockTypeFn,
  type GetValidationErrorsFn,
  type TypeFormat,
} from '@ts-runtypes/core';
import type * as TF from '@ts-runtypes/core/formats';
import {jsonSchema, type FromJsonSchema} from '@ts-runtypes/core/json-schema';
import {deserializeValidate} from '../../util/deserializeRTFunctions.ts';

/** validate validator field shape, widened to the plain boolean-returning call
 *  shape (same invariance reason as `ValidateThunk` in ../validation/types.ts). **/
type AnyValidateFn = (value: unknown) => boolean;

/** One schema-authored case. Field names reuse the `ValidationCase` spelling so
 *  cases flow through the shared asserts in util/validationAsserts.ts
 *  (`AssertableCase`). All thunks are required — a case exists here BECAUSE the
 *  schema form can author it. **/
export interface JsonSchemaDefineCase {
  title: string;
  /** Static form over the recovered type (or its hand-written twin). **/
  validate: () => AnyValidateFn;
  /** Reflect form — T inferred from a value cast to the recovered type. **/
  validateReflect: () => AnyValidateFn;
  /** Deserialize companion to `validate` (factory rebuilt from the serialized
   *  code body) — proves schema-authored entries survive the wire cache. **/
  deserializeValidate: () => AnyValidateFn;
  /** Builder form — `createValidateFn(jsonSchema(S))`. **/
  validateJsonSchema: () => AnyValidateFn;
  /** Builder-form getValidationErrors (contract assert). **/
  getValidationErrors: () => GetValidationErrorsFn;
  /** Builder-form mock — every draw must pass `validate`. **/
  mockType: () => MockTypeFn<unknown>;
  /** Mock expectation, mirroring `ValidationCase.mockTypeExpect`: `'throw'` for
   *  the sample-less `pattern` policy (mock must throw a targeted error rather
   *  than generate junk); default `'value'` validates every draw. **/
  mockTypeExpect?: 'value' | 'throw' | 'skip';
  getSamples: () => {valid: unknown[]; invalid: unknown[]};
}

// ─────────────────────────────── Schemas ─────────────────────────────

// The flagship shape from the investigation prototype: required + optional
// props, an array prop, a nested object, and format brands (uuid / email /
// string length / integer bounds).
const USER_SCHEMA = {
  type: 'object',
  properties: {
    id: {type: 'string', format: 'uuid'},
    name: {type: 'string', minLength: 2, maxLength: 50},
    age: {type: 'integer', minimum: 0, maximum: 130},
    email: {type: 'string', format: 'email'},
    tags: {type: 'array', items: {type: 'string'}},
    address: {
      type: 'object',
      properties: {street: {type: 'string'}, city: {type: 'string'}},
      required: ['street'],
    },
  },
  required: ['id', 'name', 'age', 'tags', 'address'],
} as const;

/** The hand-written type-first twin of USER_SCHEMA — exported for the
 *  convergence + marker-rule assertions in jsonSchemaDefine.test.ts. If
 *  `FromJsonSchema` computes anything else, every `.toBe` against it fails. **/
export interface ExpectedUser {
  id: TF.UUIDv4;
  name: TF.String<{minLength: 2; maxLength: 50}>;
  age: TF.Number<{integer: true; min: 0; max: 130}>;
  email?: TF.Email;
  tags: string[];
  address: {street: string; city?: string};
}

export const VALID_USER = {
  id: '7f2b6a1e-3c4d-4a5b-8c9d-0e1f2a3b4c5d',
  name: 'Ada Lovelace',
  age: 36,
  email: 'ada@example.com',
  tags: ['math', 'engines'],
  address: {street: 'Marylebone Rd 12', city: 'London'},
};

export {USER_SCHEMA};

const ROLE_SCHEMA = {enum: ['admin', 'user', 3]} as const;
const IDENT_SCHEMA = {anyOf: [{type: 'string'}, {type: 'number'}]} as const;
const MAYBE_NAME_SCHEMA = {anyOf: [{type: 'string'}, {type: 'null'}]} as const;
const SCORES_SCHEMA = {type: 'object', additionalProperties: {type: 'number'}} as const;

// ─────────────────────────────── Cases ───────────────────────────────

export const JSON_SCHEMA_DEFINE_SUITE: Record<string, JsonSchemaDefineCase> = {
  user_object: {
    title: 'user object — required/optional/array/nested/format brands',
    validate: () => createValidateFn<FromJsonSchema<typeof USER_SCHEMA>>(),
    validateReflect: () => {
      const v = VALID_USER as unknown as FromJsonSchema<typeof USER_SCHEMA>;
      return createValidateFn(v);
    },
    deserializeValidate: () => deserializeValidate<FromJsonSchema<typeof USER_SCHEMA>>(),
    validateJsonSchema: () => createValidateFn(jsonSchema(USER_SCHEMA)),
    getValidationErrors: () => createGetValidationErrorsFn(jsonSchema(USER_SCHEMA)),
    mockType: () => createMockDataFn(jsonSchema(USER_SCHEMA)),
    getSamples: () => ({
      valid: [
        VALID_USER,
        {...VALID_USER, email: undefined}, // optional prop absent
        {...VALID_USER, address: {street: 'x'}}, // nested optional absent
      ],
      invalid: [
        {...VALID_USER, id: 'not-a-uuid'}, // uuid format
        {...VALID_USER, email: 'nope'}, // email format
        {...VALID_USER, name: 'A'}, // minLength 2
        {...VALID_USER, age: 150}, // maximum 130
        {...VALID_USER, age: 30.5}, // integer
        {...VALID_USER, tags: ['ok', 7]}, // array item type
        {...VALID_USER, address: {city: 'London'}}, // nested required
        {id: VALID_USER.id, name: 'Ada', age: 1, tags: []}, // top-level required (address)
        null,
      ],
    }),
  },

  const_literal: {
    title: "const 'active' — literal type",
    validate: () => createValidateFn<'active'>(),
    validateReflect: () => {
      const v = 'active' as const;
      return createValidateFn(v);
    },
    deserializeValidate: () => deserializeValidate<'active'>(),
    validateJsonSchema: () => createValidateFn(jsonSchema({const: 'active'})),
    getValidationErrors: () => createGetValidationErrorsFn(jsonSchema({const: 'active'})),
    mockType: () => createMockDataFn(jsonSchema({const: 'active'})),
    getSamples: () => ({valid: ['active'], invalid: ['inactive', 7, null]}),
  },

  enum_union: {
    title: "enum ['admin', 'user', 3] — literal union (mixed member kinds)",
    validate: () => createValidateFn<'admin' | 'user' | 3>(),
    validateReflect: () => {
      const v = 'admin' as 'admin' | 'user' | 3;
      return createValidateFn(v);
    },
    deserializeValidate: () => deserializeValidate<'admin' | 'user' | 3>(),
    validateJsonSchema: () => createValidateFn(jsonSchema(ROLE_SCHEMA)),
    getValidationErrors: () => createGetValidationErrorsFn(jsonSchema(ROLE_SCHEMA)),
    mockType: () => createMockDataFn(jsonSchema(ROLE_SCHEMA)),
    getSamples: () => ({valid: ['admin', 'user', 3], invalid: ['root', 4, null]}),
  },

  any_of: {
    title: 'anyOf [string, number] — union',
    validate: () => createValidateFn<string | number>(),
    validateReflect: () => {
      const v = 'abc' as string | number;
      return createValidateFn(v);
    },
    deserializeValidate: () => deserializeValidate<string | number>(),
    validateJsonSchema: () => createValidateFn(jsonSchema(IDENT_SCHEMA)),
    getValidationErrors: () => createGetValidationErrorsFn(jsonSchema(IDENT_SCHEMA)),
    mockType: () => createMockDataFn(jsonSchema(IDENT_SCHEMA)),
    getSamples: () => ({valid: ['abc', 42], invalid: [true, null, {}]}),
  },

  nullable_any_of: {
    title: 'anyOf [string, null] — the 2020-12 nullable idiom',
    validate: () => createValidateFn<string | null>(),
    validateReflect: () => {
      const v = 'x' as string | null;
      return createValidateFn(v);
    },
    deserializeValidate: () => deserializeValidate<string | null>(),
    validateJsonSchema: () => createValidateFn(jsonSchema(MAYBE_NAME_SCHEMA)),
    getValidationErrors: () => createGetValidationErrorsFn(jsonSchema(MAYBE_NAME_SCHEMA)),
    mockType: () => createMockDataFn(jsonSchema(MAYBE_NAME_SCHEMA)),
    getSamples: () => ({valid: ['x', null], invalid: [undefined, 7]}),
  },

  record_scores: {
    title: 'additionalProperties-only object — Record<string, number>',
    validate: () => createValidateFn<Record<string, number>>(),
    validateReflect: () => {
      const v = {a: 1} as Record<string, number>;
      return createValidateFn(v);
    },
    deserializeValidate: () => deserializeValidate<Record<string, number>>(),
    validateJsonSchema: () => createValidateFn(jsonSchema(SCORES_SCHEMA)),
    getValidationErrors: () => createGetValidationErrorsFn(jsonSchema(SCORES_SCHEMA)),
    mockType: () => createMockDataFn(jsonSchema(SCORES_SCHEMA)),
    getSamples: () => ({valid: [{a: 1, b: 2}, {}], invalid: [{a: 'x'}, 7, null]}),
  },

  pattern_slug: {
    title: "pattern '^[a-z-]+$' — validation in full, mock throws the targeted register-samples error",
    // The hand-written twin writes the RAW TypeFormat brand: the TF.String
    // alias constrains its params to the value-first StringParams (whose
    // pattern REQUIRES mockSamples), while a schema pattern is sample-less by
    // policy. TypeFormat<string, 'stringFormat', P> is what TF.String<P>
    // resolves to, so the sample-less pattern type is spellable type-first and
    // the two forms converge (04-migration-plan §1).
    validate: () => createValidateFn<TypeFormat<string, 'stringFormat', {pattern: {source: '^[a-z-]+$'; flags: ''}}>>(),
    validateReflect: () => {
      const v = 'my-slug' as TypeFormat<string, 'stringFormat', {pattern: {source: '^[a-z-]+$'; flags: ''}}>;
      return createValidateFn(v);
    },
    deserializeValidate: () =>
      deserializeValidate<TypeFormat<string, 'stringFormat', {pattern: {source: '^[a-z-]+$'; flags: ''}}>>(),
    validateJsonSchema: () => createValidateFn(jsonSchema({type: 'string', pattern: '^[a-z-]+$'})),
    getValidationErrors: () => createGetValidationErrorsFn(jsonSchema({type: 'string', pattern: '^[a-z-]+$'})),
    mockType: () => createMockDataFn(jsonSchema({type: 'string', pattern: '^[a-z-]+$'})),
    mockTypeExpect: 'throw',
    getSamples: () => ({valid: ['my-slug', 'a-b-c'], invalid: ['NOT A SLUG', 'Xx9', 7, null]}),
  },

  inline_point: {
    title: 'inline literal at every call site — {x: number, y: number}',
    validate: () => createValidateFn<{x: number; y: number}>(),
    validateReflect: () => {
      const v = {x: 1, y: 2} as {x: number; y: number};
      return createValidateFn(v);
    },
    deserializeValidate: () => deserializeValidate<{x: number; y: number}>(),
    validateJsonSchema: () =>
      createValidateFn(
        jsonSchema({type: 'object', properties: {x: {type: 'number'}, y: {type: 'number'}}, required: ['x', 'y']})
      ),
    getValidationErrors: () =>
      createGetValidationErrorsFn(
        jsonSchema({type: 'object', properties: {x: {type: 'number'}, y: {type: 'number'}}, required: ['x', 'y']})
      ),
    mockType: () =>
      createMockDataFn(
        jsonSchema({type: 'object', properties: {x: {type: 'number'}, y: {type: 'number'}}, required: ['x', 'y']})
      ),
    getSamples: () => ({valid: [{x: 1, y: 2}], invalid: [{x: 1}, {x: 1, y: 'nope'}, null]}),
  },

  mixed_index_object: {
    title: 'properties + additionalProperties — the mixed intersection form (M3)',
    // The checker normalizes an inline-index object, the {props} & Record<…>
    // intersection, and the schema-recovered mixed form onto ONE structural id
    // (verified by probe; the id-integrity suite pins it at scale).
    validate: () => createValidateFn<{a: string; b: number} & Record<string, string | number>>(),
    validateReflect: () => {
      const v = {a: 'x', b: 1} as {a: string; b: number} & Record<string, string | number>;
      return createValidateFn(v);
    },
    deserializeValidate: () => deserializeValidate<{a: string; b: number} & Record<string, string | number>>(),
    validateJsonSchema: () =>
      createValidateFn(
        jsonSchema({
          type: 'object',
          properties: {a: {type: 'string'}, b: {type: 'number'}},
          required: ['a', 'b'],
          additionalProperties: {anyOf: [{type: 'string'}, {type: 'number'}]},
        })
      ),
    getValidationErrors: () =>
      createGetValidationErrorsFn(
        jsonSchema({
          type: 'object',
          properties: {a: {type: 'string'}, b: {type: 'number'}},
          required: ['a', 'b'],
          additionalProperties: {anyOf: [{type: 'string'}, {type: 'number'}]},
        })
      ),
    mockType: () =>
      createMockDataFn(
        jsonSchema({
          type: 'object',
          properties: {a: {type: 'string'}, b: {type: 'number'}},
          required: ['a', 'b'],
          additionalProperties: {anyOf: [{type: 'string'}, {type: 'number'}]},
        })
      ),
    getSamples: () => ({
      valid: [
        {a: 'x', b: 1},
        {a: 'x', b: 1, extra: 'ok', more: 2},
      ],
      invalid: [{a: 'x'}, {a: 1, b: 1}, {a: 'x', b: 1, bad: true}, null],
    }),
  },

  tuple_closed: {
    title: 'closed tuple — prefixItems + items: false + minItems (M2)',
    validate: () => createValidateFn<[string, number]>(),
    validateReflect: () => {
      const v = ['x', 1] as [string, number];
      return createValidateFn(v);
    },
    deserializeValidate: () => deserializeValidate<[string, number]>(),
    validateJsonSchema: () =>
      createValidateFn(jsonSchema({type: 'array', prefixItems: [{type: 'string'}, {type: 'number'}], items: false, minItems: 2})),
    getValidationErrors: () =>
      createGetValidationErrorsFn(
        jsonSchema({type: 'array', prefixItems: [{type: 'string'}, {type: 'number'}], items: false, minItems: 2})
      ),
    mockType: () =>
      createMockDataFn(jsonSchema({type: 'array', prefixItems: [{type: 'string'}, {type: 'number'}], items: false, minItems: 2})),
    getSamples: () => ({
      valid: [
        ['x', 1],
        ['hello', -2],
      ],
      invalid: [['x'], [1, 'x'], ['x', 1, true], 'x', null],
    }),
  },

  tuple_rest: {
    title: 'rest tuple — trailing items schema after the prefix (M2)',
    validate: () => createValidateFn<[string, ...number[]]>(),
    validateReflect: () => {
      const v = ['x', 1, 2] as [string, ...number[]];
      return createValidateFn(v);
    },
    deserializeValidate: () => deserializeValidate<[string, ...number[]]>(),
    validateJsonSchema: () =>
      createValidateFn(jsonSchema({type: 'array', prefixItems: [{type: 'string'}], items: {type: 'number'}, minItems: 1})),
    getValidationErrors: () =>
      createGetValidationErrorsFn(
        jsonSchema({type: 'array', prefixItems: [{type: 'string'}], items: {type: 'number'}, minItems: 1})
      ),
    mockType: () =>
      createMockDataFn(jsonSchema({type: 'array', prefixItems: [{type: 'string'}], items: {type: 'number'}, minItems: 1})),
    getSamples: () => ({
      valid: [['x'], ['x', 1], ['x', 1, 2, 3]],
      invalid: [[], [1], ['x', 'y'], null],
    }),
  },

  tuple_optional_member: {
    title: 'optional trailing member — minItems below the prefix length (M2)',
    validate: () => createValidateFn<[string, number?]>(),
    validateReflect: () => {
      const v = ['x'] as [string, number?];
      return createValidateFn(v);
    },
    deserializeValidate: () => deserializeValidate<[string, number?]>(),
    validateJsonSchema: () =>
      createValidateFn(jsonSchema({type: 'array', prefixItems: [{type: 'string'}, {type: 'number'}], items: false, minItems: 1})),
    getValidationErrors: () =>
      createGetValidationErrorsFn(
        jsonSchema({type: 'array', prefixItems: [{type: 'string'}, {type: 'number'}], items: false, minItems: 1})
      ),
    mockType: () =>
      createMockDataFn(jsonSchema({type: 'array', prefixItems: [{type: 'string'}, {type: 'number'}], items: false, minItems: 1})),
    getSamples: () => ({
      valid: [['x'], ['x', 2]],
      invalid: [[], ['x', 'y'], ['x', 1, 2], null],
    }),
  },

  one_of_union: {
    title: 'oneOf — accepted as a union, exclusivity weakened by design (M4)',
    validate: () => createValidateFn<string | number>(),
    validateReflect: () => {
      const v = 'x' as string | number;
      return createValidateFn(v);
    },
    deserializeValidate: () => deserializeValidate<string | number>(),
    validateJsonSchema: () => createValidateFn(jsonSchema({oneOf: [{type: 'string'}, {type: 'number'}]})),
    getValidationErrors: () => createGetValidationErrorsFn(jsonSchema({oneOf: [{type: 'string'}, {type: 'number'}]})),
    mockType: () => createMockDataFn(jsonSchema({oneOf: [{type: 'string'}, {type: 'number'}]})),
    getSamples: () => ({valid: ['x', 7], invalid: [true, null, {}]}),
  },

  all_of_intersection: {
    title: 'allOf — intersection of object schemas (M4)',
    validate: () => createValidateFn<{a: string} & {b: number}>(),
    validateReflect: () => {
      const v = {a: 'x', b: 1} as {a: string} & {b: number};
      return createValidateFn(v);
    },
    deserializeValidate: () => deserializeValidate<{a: string} & {b: number}>(),
    validateJsonSchema: () =>
      createValidateFn(
        jsonSchema({
          allOf: [
            {type: 'object', properties: {a: {type: 'string'}}, required: ['a']},
            {type: 'object', properties: {b: {type: 'number'}}, required: ['b']},
          ],
        })
      ),
    getValidationErrors: () =>
      createGetValidationErrorsFn(
        jsonSchema({
          allOf: [
            {type: 'object', properties: {a: {type: 'string'}}, required: ['a']},
            {type: 'object', properties: {b: {type: 'number'}}, required: ['b']},
          ],
        })
      ),
    mockType: () =>
      createMockDataFn(
        jsonSchema({
          allOf: [
            {type: 'object', properties: {a: {type: 'string'}}, required: ['a']},
            {type: 'object', properties: {b: {type: 'number'}}, required: ['b']},
          ],
        })
      ),
    getSamples: () => ({
      valid: [
        {a: 'x', b: 1},
        {a: 'x', b: 1, extra: true},
      ],
      invalid: [{a: 'x'}, {b: 1}, {a: 1, b: 1}, null],
    }),
  },

  type_array_union: {
    title: 'type array — union of named types with per-arm keywords (M4)',
    validate: () => createValidateFn<TypeFormat<string, 'stringFormat', {readonly minLength: 3}> | null>(),
    validateReflect: () => {
      const v = 'abc' as TypeFormat<string, 'stringFormat', {readonly minLength: 3}> | null;
      return createValidateFn(v);
    },
    deserializeValidate: () => deserializeValidate<TypeFormat<string, 'stringFormat', {readonly minLength: 3}> | null>(),
    validateJsonSchema: () => createValidateFn(jsonSchema({type: ['string', 'null'], minLength: 3})),
    getValidationErrors: () => createGetValidationErrorsFn(jsonSchema({type: ['string', 'null'], minLength: 3})),
    mockType: () => createMockDataFn(jsonSchema({type: ['string', 'null'], minLength: 3})),
    getSamples: () => ({valid: ['abc', 'abcd', null], invalid: ['ab', 7, undefined, true]}),
  },
};
