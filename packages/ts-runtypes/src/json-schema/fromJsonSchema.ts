// Type-level core of the `ts-runtypes/json-schema` subpath: the accepted draft
// 2020-12 input subset (`JsonSchemaInput`), the deep excess-keyword guard
// (`ExactJsonSchema`) and the inference type (`FromJsonSchema`) that translates
// a schema literal into the equivalent TS type + RunTypes format brands.
// Promoted from the investigation prototype
// (docs/investigations/json-schema/02-phase2-first-class-input.md); the accepted
// keyword set grows milestone-by-milestone with the suite coverage
// (docs/todos/json-schema-first-class-implementation.md).
//
// Follows the repo's type-level discipline (schema/static.ts): extends-guards +
// indexed access + homomorphic maps; recursive `infer` only where a union must be
// built arm-by-arm (`FromAnyOf`, same caveat as `UnionOf`). `Flatten` merges the
// required/optional group intersection back into one object literal so the result
// converges with the hand-written type-first shape (proven pattern: ObjectType<C>).

import type {
  Email,
  UUIDv4,
  StringDate,
  StringTime,
  StringDateTime,
  Domain,
  IPv4,
  IPv6,
  Url,
  String as StringFormat,
  Number as NumberFormat,
} from '../formats/index.ts';
import type {FormatName} from '../go-generated/typeFormats.generated.ts';

// #region jsonschema-extract — sliced verbatim by test/types/jsonSchemaHarness.ts
// into an in-memory program to measure tsc instantiation cost + assert the
// mapping's correctness. Keep self-contained: only `lib` types plus the brand
// names imported above (the harness preamble declares structural stand-ins for
// those).

/** The accepted draft 2020-12 JSON Schema subset — the versioned input type.
 *  Deliberately permissive on VALUE shapes (it guides authoring without fighting
 *  `const` literal inference; recursive so nested schemas keep their literal
 *  shapes); unknown KEYWORDS are rejected by `ExactJsonSchema` at the call site
 *  instead. A `$schema` other than the 2020-12 URI is a type error — draft
 *  2020-12 is the one accepted dialect. **/
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
  readonly $schema?: 'https://json-schema.org/draft/2020-12/schema';
  readonly title?: string;
  readonly description?: string;
  readonly examples?: readonly unknown[];
  readonly default?: unknown;
}

/** Deep excess-keyword guard — the recursive `ExactParams` (builderTypes.ts). A
 *  generic `<const S extends JsonSchemaInput>` alone does NOT reject unknown
 *  keywords (excess-property checking doesn't fire on constraint satisfaction),
 *  so `{type: 'string', minLen: 3}` — a `minLength` typo — would compile and
 *  silently drop the constraint. Folding a `Record<excess, never>` in at every
 *  nesting level forces each unknown keyword to `never`, so the literal errors
 *  AT THE OFFENDING KEY. Transparent for a valid schema (`S & {} & unknown` is
 *  `S`), so the inferred `S` — and the reflected type read off it — is
 *  unchanged. Wrapped INSIDE the builder's `CompTimeArgs<…>` type argument, same
 *  as `ExactParams`, so the annotation stays a single `CompTimeArgs<…>`
 *  reference the Go scanner detects syntactically. **/
export type ExactJsonSchema<S> = S & {readonly [K in Exclude<keyof S, keyof JsonSchemaInput>]: never} & (S extends {
    properties: infer P;
  }
    ? {readonly properties: ExactJsonSchemaMap<P>}
    : unknown) &
  (S extends {items: infer I} ? {readonly items: ExactJsonSchema<I>} : unknown) &
  (S extends {additionalProperties: infer A}
    ? A extends boolean
      ? unknown
      : {readonly additionalProperties: ExactJsonSchema<A>}
    : unknown) &
  (S extends {anyOf: infer M} ? {readonly anyOf: ExactJsonSchemaList<M>} : unknown);

/** `properties` map recursion for {@link ExactJsonSchema} (homomorphic, so the
 *  literal's readonly/optional modifiers flow through unchanged). **/
type ExactJsonSchemaMap<P> = {[K in keyof P]: ExactJsonSchema<P[K]>};

/** `anyOf` member recursion for {@link ExactJsonSchema} (homomorphic over the
 *  `const`-inferred readonly tuple, preserving its shape). **/
type ExactJsonSchemaList<M> = {[I in keyof M]: ExactJsonSchema<M[I]>};

type Flatten<T> = {[K in keyof T]: T[K]};

// String constraint keywords → StringParams (same names both sides).
type StringParamsFrom<S> = {
  [K in keyof S as K extends 'minLength' | 'maxLength' ? K : never]: S[K];
};

/** JSON Schema `format` keyword → the RunTypes brand it recovers — the same
 *  aliases the type-first surface writes, so the two authoring forms converge on
 *  one structural id. ONE lookup row per accepted keyword; `StringFrom` reads it
 *  by indexed access instead of a per-format conditional ladder. **/
interface BrandBySchemaFormat {
  readonly email: Email;
  readonly uuid: UUIDv4;
  readonly date: StringDate;
  readonly time: StringTime;
  readonly 'date-time': StringDateTime;
  readonly hostname: Domain;
  readonly ipv4: IPv4;
  readonly ipv6: IPv6;
  readonly uri: Url;
}

/** The `format` keyword values the string arm accepts. **/
type SchemaFormatKeyword = keyof BrandBySchemaFormat;

// format keyword → brand via the lookup row; non-format strings fall through to
// the keyword params; a bare `{type: 'string'}` stays plain `string`.
type StringFrom<S> = S extends {format: infer F extends SchemaFormatKeyword}
  ? BrandBySchemaFormat[F]
  : keyof StringParamsFrom<S> extends never
    ? string
    : StringFormat<Flatten<StringParamsFrom<S>>>;

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
type NumberFrom<S> = keyof NumberParamsFrom<S> extends never ? number : NumberFormat<Flatten<NumberParamsFrom<S>>>;
type IntegerFrom<S> = NumberFormat<Flatten<NumberParamsFrom<S> & {integer: true}>>;

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

// #endregion jsonschema-extract

// ───────────────────── FormatName anti-drift contract ────────────────────
//
// Every built-in format name (the Go-generated `FormatName` union) must be
// accounted for here: recovered by a `format` keyword row in
// `BrandBySchemaFormat`, reached through constraint keywords, or recorded as
// having no JSON Schema INPUT spelling. A new Go-side format emitter grows
// `FormatName` via `pnpm rtx core codegen typeformats` and breaks the totality
// aliases below until its schema story is decided — the anti-drift contract
// from docs/investigations/json-schema/04-migration-plan.md §2.2.

type SchemaStoryByFormatName = {
  email: 'format: email';
  uuid: 'format: uuid';
  domain: 'format: hostname';
  ip: 'format: ipv4 | ipv6';
  url: 'format: uri';
  date: 'format: date';
  time: 'format: time';
  dateTime: 'format: date-time';
  stringFormat: 'constraint keywords (minLength/maxLength/…)';
  numberFormat: 'constraint keywords (minimum/maximum/…/multipleOf; type: integer)';
  bigintFormat: 'no schema input form (JSON has no bigint)';
  nativeDate: 'no schema input form (instance type, not a JSON shape)';
  temporalInstant: 'no schema input form (instance type)';
  temporalZonedDateTime: 'no schema input form (instance type)';
  temporalPlainDate: 'no schema input form (instance type)';
  temporalPlainTime: 'no schema input form (instance type)';
  temporalPlainDateTime: 'no schema input form (instance type)';
  temporalPlainYearMonth: 'no schema input form (instance type)';
};

/** Compiles only while the story map covers EXACTLY the generated `FormatName`
 *  set — both directions must stay `never`. Exported (internal, not re-exported
 *  from the subpath entry) so declaration emit keeps the check alive. **/
export type AssertSchemaStoryTotality = [
  MustBeNever<Exclude<FormatName, keyof SchemaStoryByFormatName>>,
  MustBeNever<Exclude<keyof SchemaStoryByFormatName, FormatName>>,
];
type MustBeNever<T extends never> = T;
