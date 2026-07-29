// PROTOTYPE (investigation: docs/investigations/json-schema/) — JSON Schema as a
// FIRST-CLASS RunTypes input. NOT public API; lives beside the test that proves it.
//
// The whole trick is the existing value-first builder contract: a function whose
// trailing param is `InjectRunTypeId<T>` is a marker site, and the Go scanner
// reflects WHATEVER `T` resolves to at the call site. So `jsonSchema(s)` brands
// `FromJsonSchema<S>` — a type-level translation of the schema literal into the
// equivalent TS type + RunTypes format brands — and the entire factory surface
// (createValidateFn / createGetValidationErrorsFn / createMockDataFn / encoders)
// works with ZERO Go-side changes, converging on the same structural id as the
// hand-written type-first equivalent.
//
// Draft 2020-12 subset covered (per docs/investigations/json-schema/01-phase1-mapping.md):
//   type: string/number/integer/boolean/null · const · enum · anyOf ·
//   object (properties / required / additionalProperties-record) · array (items) ·
//   format: email/uuid/date/time/date-time · minLength/maxLength ·
//   minimum/maximum/exclusiveMinimum/exclusiveMaximum/multipleOf
// Deliberately out of prototype scope (see the phase-2 doc): $ref/$defs, allOf,
// oneOf, prefixItems, pattern (the mockSamples policy), type arrays, patternProperties.

import {builderResult} from '../../src/runtypes/builderCore.ts';
import type {CompTimeArgs, InjectRunTypeId, RunType} from '@ts-runtypes/core';
import type * as TF from '@ts-runtypes/core/formats';

// ─────────────────────────── Input constraint ───────────────────────
//
// Permissive on purpose: it guides authoring without fighting `const` literal
// inference. Recursive so nested schemas keep their literal shapes.

export interface JsonSchemaInput {
  readonly type?: 'string' | 'number' | 'integer' | 'boolean' | 'null' | 'object' | 'array';
  readonly properties?: {readonly [key: string]: JsonSchemaInput};
  readonly required?: readonly string[];
  readonly additionalProperties?: JsonSchemaInput | boolean;
  readonly items?: JsonSchemaInput;
  readonly enum?: readonly (string | number | boolean | null)[];
  readonly const?: string | number | boolean | null;
  readonly anyOf?: readonly JsonSchemaInput[];
  readonly format?: 'email' | 'uuid' | 'date' | 'time' | 'date-time' | 'hostname' | 'ipv4' | 'ipv6' | 'uri';
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly exclusiveMinimum?: number;
  readonly exclusiveMaximum?: number;
  readonly multipleOf?: number;
  // Annotations accepted and ignored by inference (schema authors always have them).
  readonly $schema?: string;
  readonly title?: string;
  readonly description?: string;
  readonly examples?: readonly unknown[];
  readonly default?: unknown;
}

// ───────────────────────────── Inference ────────────────────────────
//
// Follows the repo's type-level discipline (schema/static.ts): extends-guards +
// indexed access + homomorphic maps; recursive `infer` only where a union must be
// built arm-by-arm (`FromAnyOf`, same caveat as `UnionOf`). `Flatten` merges the
// required/optional group intersection back into one object literal so the result
// converges with the hand-written type-first shape (proven pattern: ObjectType<C>).

type Flatten<T> = {[K in keyof T]: T[K]};

// String constraint keywords → StringParams (same names both sides).
type StringParamsFrom<S> = {
  [K in keyof S as K extends 'minLength' | 'maxLength' ? K : never]: S[K];
};

// format keyword → the concrete RunTypes format alias (the same brands the
// type-first surface writes, so ids converge). Non-format strings fall through to
// the keyword params; a bare `{type: 'string'}` stays plain `string`.
type StringFrom<S> = S extends {format: 'email'}
  ? TF.Email
  : S extends {format: 'uuid'}
    ? TF.UUIDv4
    : S extends {format: 'date'}
      ? TF.StringDate
      : S extends {format: 'time'}
        ? TF.StringTime
        : S extends {format: 'date-time'}
          ? TF.StringDateTime
          : S extends {format: 'hostname'}
            ? TF.Domain
            : S extends {format: 'ipv4'}
              ? TF.IPv4
              : S extends {format: 'ipv6'}
                ? TF.IPv6
                : S extends {format: 'uri'}
                  ? TF.Url
                  : keyof StringParamsFrom<S> extends never
                    ? string
                    : TF.String<Flatten<StringParamsFrom<S>>>;

// Numeric keywords → NumberParams (minimum→min, maximum→max, exclusive*→gt/lt).
type NumberKeywordRemap = {
  minimum: 'min';
  maximum: 'max';
  exclusiveMinimum: 'gt';
  exclusiveMaximum: 'lt';
  multipleOf: 'multipleOf';
};
type NumberParamsFrom<S> = {
  [K in keyof S as K extends keyof NumberKeywordRemap ? NumberKeywordRemap[K] : never]: S[K];
};
type NumberFrom<S> = keyof NumberParamsFrom<S> extends never ? number : TF.Number<Flatten<NumberParamsFrom<S>>>;
type IntegerFrom<S> = TF.Number<Flatten<NumberParamsFrom<S> & {integer: true}>>;

// object: `required` membership decides `?` — the object-level → property-level
// optionality inversion (quirk §5.1 of the phase-1 mapping). Two homomorphic
// groups (required / optional), flattened into one literal.
type ObjectFromProps<P, Req extends PropertyKey> = Flatten<
  {
    -readonly [K in keyof P as K extends Req ? K : never]: FromJsonSchema<P[K]>;
  } & {
    -readonly [K in keyof P as K extends Req ? never : K]?: FromJsonSchema<P[K]>;
  }
>;
type ObjectFrom<S> = S extends {properties: infer P}
  ? S extends {required: infer R extends readonly string[]}
    ? ObjectFromProps<P, R[number]>
    : ObjectFromProps<P, never>
  : S extends {additionalProperties: infer A extends JsonSchemaInput}
    ? Record<string, FromJsonSchema<A>>
    : object;

// anyOf: recursive arm-by-arm union build (the UnionOf precedent — an indexed
// `M[number]` would let tsgo subtype-reduce sibling object arms).
type FromAnyOf<M> = M extends readonly [infer Head, ...infer Tail] ? FromJsonSchema<Head> | FromAnyOf<Tail> : never;

/** The static type a draft 2020-12 schema literal denotes — RunTypes' analogue of
 *  json-schema-to-ts's `FromSchema` / TypeBox's `Static`. Constraint keywords do
 *  NOT vanish into annotations: they land in RunTypes format brands, so the
 *  generated validators enforce them. **/
export type FromJsonSchema<S> = S extends true
  ? unknown
  : S extends false
    ? never
    : S extends {const: infer C}
      ? C
      : S extends {enum: infer E extends readonly unknown[]}
        ? E[number]
        : S extends {anyOf: infer M extends readonly JsonSchemaInput[]}
          ? FromAnyOf<M>
          : S extends {type: 'string'}
            ? StringFrom<S>
            : S extends {type: 'integer'}
              ? IntegerFrom<S>
              : S extends {type: 'number'}
                ? NumberFrom<S>
                : S extends {type: 'boolean'}
                  ? boolean
                  : S extends {type: 'null'}
                    ? null
                    : S extends {type: 'array'}
                      ? S extends {items: infer I}
                        ? FromJsonSchema<I>[]
                        : unknown[]
                      : S extends {type: 'object'}
                        ? ObjectFrom<S>
                        : unknown; // `{}` — the always-true schema

/** A JSON Schema (draft 2020-12 subset) as a first-class RunTypes input:
 *  `jsonSchema({type: 'object', …})` → `RunType<FromJsonSchema<S>>`, usable
 *  everywhere a value-first schema is (`createValidateFn(jsonSchema(s))`, mock,
 *  encoders, `getRunTypeId`). The schema literal rides `CompTimeArgs` (it must be
 *  fully static — same rule as every builder config); the reflected type comes
 *  from the trailing brand, so the runtime value is never consulted. **/
export function jsonSchema<const S extends JsonSchemaInput>(
  schema: CompTimeArgs<S>,
  id?: InjectRunTypeId<FromJsonSchema<S>>
): RunType<FromJsonSchema<S>> {
  return builderResult(id, {type: 'jsonSchema', schema});
}
