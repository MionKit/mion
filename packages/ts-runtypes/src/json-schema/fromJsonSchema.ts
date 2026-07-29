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
//
// RECURSION (M6): the whole pipeline threads the ROOT schema as a second type
// parameter so `$ref` can resolve against it — `$ref: '#'` re-enters the root
// and `$ref: '#/$defs/<name>'` looks the definition up under the root's $defs.
// The root re-entry rides a 1-tuple fixpoint parameter `F` read as `F[0]`
// (the `Recursive<Body>` deferral trick, schema/static.ts): a DIRECT
// `FromJsonSchemaIn<Root, Root>` branch blows tsc's instantiation-depth wall
// (TS2589) whenever the alias is forced with a still-deferred S — which the
// `jsonSchema` overload/implementation compatibility check does through the
// `RunType` / `InjectRunTypeId` phantom slots. `F[0]` is an indexed access
// over a lazy tuple, so the constraint walk stops at the tuple boundary while
// a concrete instantiation still ties the same genuinely CYCLIC type — the
// shape a hand-written `type T = {next?: T}` produces — which the id computer
// walks with its back-ref token (maxWalkDepth guarded).

import type {Email, UUIDv4, StringDate, StringTime, StringDateTime, Domain, IPv4, IPv6, Url} from '../formats/index.ts';
import type {TypeFormat} from '../runtypes/typeFormat.ts';
import type {FormatName} from '../go-generated/typeFormats.generated.ts';

// #region jsonschema-extract — sliced verbatim by test/types/jsonSchemaHarness.ts
// into an in-memory program to measure tsc instantiation cost + assert the
// mapping's correctness. Keep self-contained: only `lib` types plus the brand
// names imported above (the harness preamble declares structural stand-ins for
// those).

// Local spellings of the two constraint-keyword leaf brands, built on the RAW
// TypeFormat sentinel shape rather than the TF.String / TF.Number aliases: the
// aliases constrain params to the value-first StringParams/NumberParams (whose
// `pattern` REQUIRES mockSamples), while a schema-recovered pattern is
// sample-less by policy. Structurally identical to the aliases for every
// param set (TF.String<P> IS TypeFormat<string, 'stringFormat', P>), so ids
// converge unchanged.
type StringFormat<P extends object> = TypeFormat<string, 'stringFormat', P>;
type NumberFormat<P extends object> = TypeFormat<number, 'numberFormat', P>;

/** The seven 2020-12 type names; `type` also accepts an ARRAY of them (a union
 *  of the named types, each arm re-reading the schema's own constraint
 *  keywords by relevance). **/
export type SchemaTypeName = 'string' | 'number' | 'integer' | 'boolean' | 'null' | 'object' | 'array';

/** The accepted draft 2020-12 JSON Schema subset — the versioned input type.
 *  Deliberately permissive on VALUE shapes (it guides authoring without fighting
 *  `const` literal inference; recursive so nested schemas keep their literal
 *  shapes); unknown KEYWORDS are rejected by `ExactJsonSchema` at the call site
 *  instead. A `$schema` other than the 2020-12 URI is a type error — draft
 *  2020-12 is the one accepted dialect. `$ref` accepts the root (`#`) and
 *  root-level definitions (`#/$defs/<name>`); cross-document refs are out of
 *  scope. **/
export interface JsonSchemaInput {
  readonly type?: SchemaTypeName | readonly SchemaTypeName[];
  readonly properties?: {readonly [key: string]: JsonSchemaInput};
  readonly required?: readonly string[];
  readonly additionalProperties?: JsonSchemaInput | boolean;
  readonly items?: JsonSchemaInput | false;
  readonly prefixItems?: readonly JsonSchemaInput[];
  readonly minItems?: number;
  readonly enum?: readonly (string | number | boolean | null)[];
  readonly const?: string | number | boolean | null;
  readonly anyOf?: readonly JsonSchemaInput[];
  readonly oneOf?: readonly JsonSchemaInput[];
  readonly allOf?: readonly JsonSchemaInput[];
  readonly $defs?: {readonly [name: string]: JsonSchemaInput};
  readonly $ref?: string;
  readonly format?: 'email' | 'uuid' | 'date' | 'time' | 'date-time' | 'hostname' | 'ipv4' | 'ipv6' | 'uri';
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly pattern?: string;
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
  (S extends {items: infer I} ? (I extends boolean ? unknown : {readonly items: ExactJsonSchema<I>}) : unknown) &
  (S extends {prefixItems: infer P} ? {readonly prefixItems: ExactJsonSchemaList<P>} : unknown) &
  (S extends {additionalProperties: infer A}
    ? A extends boolean
      ? unknown
      : {readonly additionalProperties: ExactJsonSchema<A>}
    : unknown) &
  (S extends {anyOf: infer M} ? {readonly anyOf: ExactJsonSchemaList<M>} : unknown) &
  (S extends {oneOf: infer M} ? {readonly oneOf: ExactJsonSchemaList<M>} : unknown) &
  (S extends {allOf: infer M} ? {readonly allOf: ExactJsonSchemaList<M>} : unknown) &
  (S extends {$defs: infer D} ? {readonly $defs: ExactJsonSchemaMap<D>} : unknown);

/** `properties` / `$defs` map recursion for {@link ExactJsonSchema}
 *  (homomorphic, so the literal's readonly/optional modifiers flow through
 *  unchanged). **/
type ExactJsonSchemaMap<P> = {[K in keyof P]: ExactJsonSchema<P[K]>};

/** `anyOf` member recursion for {@link ExactJsonSchema} (homomorphic over the
 *  `const`-inferred readonly tuple, preserving its shape). **/
type ExactJsonSchemaList<M> = {[I in keyof M]: ExactJsonSchema<M[I]>};

type Flatten<T> = {[K in keyof T]: T[K]};

// String constraint keywords → StringParams. minLength/maxLength keep their
// names; the `pattern` keyword (a bare 2020-12 regex string, always anchored to
// the empty flag set) is rebuilt into the object form the stringFormat brand
// carries. A schema pattern has NO mockSamples — validation works in full;
// `createMockDataFn` for such a type throws a targeted register-samples error
// instead of generating junk (the policy resolved in
// docs/investigations/json-schema/04-migration-plan.md §1).
type StringParamsFrom<S> = Flatten<
  {[K in keyof S as K extends 'minLength' | 'maxLength' ? K : never]: S[K]} & (S extends {pattern: infer P extends string}
    ? {readonly pattern: {readonly source: P; readonly flags: ''}}
    : unknown)
>;

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
type ObjectFromProps<P, Req extends PropertyKey, Root, F extends [unknown]> = Flatten<
  {
    -readonly [K in keyof P as K extends Req ? K : never]: FromJsonSchemaIn<P[K], Root, F>;
  } & {
    -readonly [K in keyof P as K extends Req ? never : K]?: FromJsonSchemaIn<P[K], Root, F>;
  }
>;
type ObjectFrom<S, Root, F extends [unknown]> = S extends {properties: infer P}
  ? WithAdditional<
      S,
      S extends {required: infer R extends readonly string[]}
        ? ObjectFromProps<P, R[number], Root, F>
        : ObjectFromProps<P, never, Root, F>,
      Root,
      F
    >
  : S extends {additionalProperties: infer A extends JsonSchemaInput}
    ? Record<string, FromJsonSchemaIn<A, Root, F>>
    : object;

// `additionalProperties: <schema>` ALONGSIDE `properties` intersects the
// declared props with the index-signature record (01-phase1-mapping §3.2 — the
// mixed form). The boolean forms stay annotation-only at the type level
// (`false` pairs with the unknown-keys validation family, a later phase).
type WithAdditional<S, Props, Root, F extends [unknown]> = S extends {additionalProperties: infer A}
  ? A extends boolean
    ? Props
    : Props & Record<string, FromJsonSchemaIn<A, Root, F>>
  : Props;

// array/tuple: `prefixItems` builds a tuple. Members at positions below
// `minItems` are required, the rest optional (`?`) — absent minItems means 0,
// i.e. all optional, matching JSON Schema truth (short arrays validate). The
// tail comes from `items`: absent → OPEN tuple (`...unknown[]` — extra items
// are allowed by 2020-12), `false` → closed, a schema → typed trailing rest. A
// `minItems` beyond the prefix length behaves as the prefix length (the
// required phase simply consumes every member).
type ArrayFrom<S, Root, F extends [unknown]> = S extends {prefixItems: infer P extends readonly JsonSchemaInput[]}
  ? BuildTupleRequired<P, MinItemsOf<S>, RestOf<S>, [], Root, F>
  : S extends {items: infer I}
    ? I extends false
      ? []
      : FromJsonSchemaIn<I, Root, F>[]
    : unknown[];
type MinItemsOf<S> = S extends {minItems: infer N extends number} ? N : 0;
type RestOf<S> = S extends {items: infer I} ? I : 'rt$open';
type BuildTupleRequired<
  P extends readonly unknown[],
  MinItems extends number,
  Rest,
  Acc extends unknown[],
  Root,
  F extends [unknown],
> = Acc['length'] extends MinItems
  ? BuildTupleOptional<P, Rest, Acc, Root, F>
  : P extends readonly [infer Head, ...infer Tail]
    ? BuildTupleRequired<Tail, MinItems, Rest, [...Acc, FromJsonSchemaIn<Head, Root, F>], Root, F>
    : FinishTuple<Acc, Rest, Root, F>;
type BuildTupleOptional<
  P extends readonly unknown[],
  Rest,
  Acc extends unknown[],
  Root,
  F extends [unknown],
> = P extends readonly [infer Head, ...infer Tail]
  ? BuildTupleOptional<Tail, Rest, [...Acc, FromJsonSchemaIn<Head, Root, F>?], Root, F>
  : FinishTuple<Acc, Rest, Root, F>;
type FinishTuple<Acc extends unknown[], Rest, Root, F extends [unknown]> = Rest extends false
  ? Acc
  : Rest extends 'rt$open'
    ? [...Acc, ...unknown[]]
    : [...Acc, ...FromJsonSchemaIn<Rest, Root, F>[]];

// anyOf/oneOf: recursive arm-by-arm union build (the UnionOf precedent — an
// indexed `M[number]` would let tsgo subtype-reduce sibling object arms).
// oneOf is deliberately accepted AS a union: its exactly-one exclusivity
// weakens to at-least-one (the 04-migration-plan decision; the build
// diagnostic belongs to the later docs/diagnostics phase).
type FromAnyOf<M, Root, F extends [unknown]> = M extends readonly [infer Head, ...infer Tail]
  ? FromJsonSchemaIn<Head, Root, F> | FromAnyOf<Tail, Root, F>
  : never;

// allOf: arm-by-arm intersection (unknown is the & identity).
type FromAllOf<M, Root, F extends [unknown]> = M extends readonly [infer Head, ...infer Tail]
  ? FromJsonSchemaIn<Head, Root, F> & FromAllOf<Tail, Root, F>
  : unknown;

// The `type: [...]` array form is a union of the named types; each arm
// re-reads the schema's OWN constraint keywords through the per-type helpers,
// so {type: ['string', 'null'], minLength: 3} recovers String<{minLength: 3}>
// | null — keywords apply by type relevance, exactly as 2020-12 evaluates
// them. Built arm-by-arm for the same subtype-reduction reason as FromAnyOf.
type TypeArmsFrom<L, S, Root, F extends [unknown]> = L extends readonly [infer Head extends SchemaTypeName, ...infer Tail]
  ? TypeArmFrom<Head, S, Root, F> | TypeArmsFrom<Tail, S, Root, F>
  : never;
type TypeArmFrom<Name extends SchemaTypeName, S, Root, F extends [unknown]> = Name extends 'string'
  ? StringFrom<S>
  : Name extends 'integer'
    ? IntegerFrom<S>
    : Name extends 'number'
      ? NumberFrom<S>
      : Name extends 'boolean'
        ? boolean
        : Name extends 'null'
          ? null
          : Name extends 'array'
            ? ArrayFrom<S, Root, F>
            : Name extends 'object'
              ? ObjectFrom<S, Root, F>
              : never;

// The Root-threaded engine. `$ref` arms come first: `#` re-enters the root
// through the fixpoint tuple (`F[0]` — see the RECURSION note at the top of
// the file) and `#/$defs/<name>` resolves a root-level definition (either may
// be recursive — the lazy re-instantiation builds a cyclic type). An unknown
// definition name resolves `never`, surfacing as an impossible type at the
// call site rather than silently widening.
type FromJsonSchemaIn<S, Root, F extends [unknown]> = S extends true
  ? unknown
  : S extends false
    ? never
    : S extends {$ref: '#'}
      ? F[0]
      : S extends {$ref: `#/$defs/${infer Name}`}
        ? Root extends {$defs: infer D}
          ? Name extends keyof D
            ? FromJsonSchemaIn<D[Name], Root, F>
            : never
          : never
        : S extends {const: infer C}
          ? C
          : S extends {enum: infer E extends readonly unknown[]}
            ? E[number]
            : S extends {anyOf: infer M extends readonly JsonSchemaInput[]}
              ? FromAnyOf<M, Root, F>
              : S extends {oneOf: infer M extends readonly JsonSchemaInput[]}
                ? FromAnyOf<M, Root, F>
                : S extends {allOf: infer M extends readonly JsonSchemaInput[]}
                  ? FromAllOf<M, Root, F>
                  : S extends {type: infer L extends readonly SchemaTypeName[]}
                    ? TypeArmsFrom<L, S, Root, F>
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
                                ? ArrayFrom<S, Root, F>
                                : S extends {type: 'object'}
                                  ? ObjectFrom<S, Root, F>
                                  : unknown; // `{}` — the always-true schema

/** The static type a draft 2020-12 schema literal denotes — RunTypes' analogue of
 *  json-schema-to-ts's `FromSchema` / TypeBox's `Static`. Constraint keywords do
 *  NOT vanish into annotations: they land in RunTypes format brands, so the
 *  generated validators enforce them. Combinator schemas (`anyOf` / `oneOf` /
 *  `allOf`) and `$ref` schemas carry that keyword alone — sibling keywords
 *  beside them are not consulted. The 1-tuple ties the `$ref: '#'` fixpoint
 *  (the `Recursive<Body>` deferral pattern — see the RECURSION note above).
 *  The `0 extends 1 & S` arm short-circuits `any` to `unknown` BEFORE the
 *  engine: with `any` every conditional arm expands both branches at once,
 *  and the helpers' fresh `infer` params defeat tsc's instantiation cache
 *  (TS2589). `any` never comes from a real call site (`CompTimeArgs` forces a
 *  literal) — only from tsc's own erased/deferred probes, where `unknown` is
 *  the honest answer. **/
export type FromJsonSchema<S> = 0 extends 1 & S ? unknown : FromJsonSchemaIn<S, S, [FromJsonSchema<S>]>;

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
