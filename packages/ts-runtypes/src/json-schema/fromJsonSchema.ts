// Type-level core of the `ts-runtypes/json-schema` subpath: the accepted draft
// 2020-12 input subset (`JsonSchemaInput`), the deep excess-keyword guard
// (`ExactJsonSchema`) and the inference type (`FromJsonSchema`) that translates
// a schema literal into the equivalent TS type + RunTypes format brands.
// Promoted from the investigation prototype
// (docs/investigations/json-schema/02-phase2-first-class-input.md); the accepted
// keyword set grows milestone-by-milestone with the suite coverage
// (docs/done/json-schema-first-class-implementation.md).
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
// `runTypeFromJsonSchema` overload/implementation compatibility check does through the
// `RunType` / `InjectRunTypeId` phantom slots. `F[0]` is an indexed access
// over a lazy tuple, so the constraint walk stops at the tuple boundary while
// a concrete instantiation still ties the same genuinely CYCLIC type — the
// shape a hand-written `type T = {next?: T}` produces — which the id computer
// walks with its back-ref token (maxWalkDepth guarded).

import type {NotSlot} from '../formats/not.ts';

import type {
  EmailAddress,
  IdnEmail,
  UUID,
  StringDate,
  StringTime,
  StringDateTime,
  Hostname,
  IdnHostname,
  IPv4,
  IPv6,
  Uri,
  UriReference,
  UriTemplate,
  Iri,
  IriReference,
  StringDuration,
  RegexString,
  JsonPointer,
  RelativeJsonPointer,
  Base64,
  Base32,
  Base16,
  JsonContent,
  JsonContentBase64,
  String as StringFormat,
  Number as NumberFormat,
  FormattedArray,
  FormattedObject,
} from '../formats/index.ts';
import type {OneOf} from '../schema/static.ts';
import type {FormatName} from '../go-generated/typeFormats.generated.ts';

// #region jsonschema-extract — sliced verbatim by test/types/jsonSchemaHarness.ts
// into an in-memory program to measure tsc instantiation cost + assert the
// mapping's correctness. Keep self-contained: only `lib` types plus the brand
// names imported above (the harness preamble declares structural stand-ins for
// those).

// StringFormat / NumberFormat are the imported TF.String / TF.Number aliases
// (see the import block above) — the door references the single formats-surface
// definition rather than re-declaring the brand. The extract harness declares
// structural stand-ins for both.

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
  // Boolean SCHEMAS are legal wherever a schema is (2020-12 core §4.3.2):
  // `items: true` keeps the tail open (same as absent), `items: false`
  // closes it; a `true` prefixItems slot is the spec's "no constraint at
  // this position" padding (`[true, {type: 'number'}]` constrains only the
  // second item), `false` forbids the position outright.
  readonly items?: JsonSchemaInput | boolean;
  readonly prefixItems?: readonly (JsonSchemaInput | boolean)[];
  readonly minItems?: number;
  readonly maxItems?: number;
  // uniqueItems / key-count bounds ride the structural format brands
  // (formattedArray / formattedObject) — exact validators over the base shape.
  readonly uniqueItems?: boolean;
  readonly minProperties?: number;
  readonly maxProperties?: number;
  // contains: at least minContains (default 1) and at most maxContains
  // items validate against the subschema — carried by the `__rtContains`
  // sentinel (a child slot, like `not`); min/maxContains WITHOUT contains
  // are annotations per 2020-12.
  readonly contains?: JsonSchemaInput | boolean;
  readonly minContains?: number;
  readonly maxContains?: number;
  // Content keywords: encodings are enforced as anchored patterns and
  // application/json as a parse check (on the DECODED content when a base64
  // encoding is declared). Other encodings / media types are type errors at
  // the key — a constraint accepted is a constraint enforced.
  readonly contentEncoding?: 'base64' | 'base32' | 'base16';
  readonly contentMediaType?: 'application/json';
  // Keys matching each pattern must have values valid against its schema;
  // propertyNames validates every KEY (as a string) against a subschema.
  readonly patternProperties?: {readonly [pattern: string]: JsonSchemaInput};
  readonly propertyNames?: JsonSchemaInput | boolean;
  // Same-document anchors: `$anchor` (and `$dynamicAnchor`, which also
  // registers as a plain anchor) declare `#name` targets; `$ref: '#name'`
  // and `$dynamicRef: '#name'` resolve them. In a single schema resource
  // the dynamic scope has one candidate, so $dynamicRef resolves statically.
  readonly $anchor?: string;
  readonly $dynamicAnchor?: string;
  readonly $dynamicRef?: string;
  // unevaluated*: `false` lowers to closedness over the STATICALLY
  // determinable applicator set (own + allOf keywords, $defs-resolved);
  // instance-dependent evaluation (if/then/else, anyOf/oneOf, dependent
  // schemas, refs in scope) resolves `never` — loud over lossy.
  readonly unevaluatedProperties?: JsonSchemaInput | boolean;
  readonly unevaluatedItems?: JsonSchemaInput | boolean;
  readonly enum?: readonly (string | number | boolean | null)[];
  readonly const?: string | number | boolean | null;
  readonly anyOf?: readonly JsonSchemaInput[];
  readonly oneOf?: readonly JsonSchemaInput[];
  readonly allOf?: readonly JsonSchemaInput[];
  readonly $defs?: {readonly [name: string]: JsonSchemaInput};
  readonly $ref?: string;
  // format: the 9 enforced keywords stay autocompleted; any OTHER value is
  // accepted as the annotation 2020-12 defaults it to (the type falls back to
  // the base string and nothing is enforced — never a rejection, so schemas
  // from other people's APIs keep working).
  readonly format?: SchemaFormatKeyword | (string & {});
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly pattern?: string;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly exclusiveMinimum?: number;
  readonly exclusiveMaximum?: number;
  readonly multipleOf?: number;
  // Negation: the value must NOT match this subschema. Statically it narrows
  // via the kind-complement algebra (KindComplement below); the exact check
  // rides the `__rtNot` sentinel into the generated validator. Boolean forms
  // per 2020-12: `not: true` accepts nothing, `not: false` accepts everything.
  readonly not?: JsonSchemaInput | boolean;
  // Conditional applicators: valid(if) ? valid(then) : valid(else). Desugared
  // through the same negation machinery ((If ∧ Then) ∨ (¬If ∧ Else)); `then`/
  // `else` without `if` are annotations per 2020-12 and are ignored.
  readonly if?: JsonSchemaInput | boolean;
  readonly then?: JsonSchemaInput | boolean;
  readonly else?: JsonSchemaInput | boolean;
  // Property dependencies: when the named key is present, the listed keys
  // must also be present (dependentRequired) / the schema must also hold
  // (dependentSchemas). Desugared to (has-key ∧ extra) ∨ ¬has-key per entry.
  readonly dependentRequired?: {readonly [key: string]: readonly string[]};
  readonly dependentSchemas?: {readonly [key: string]: JsonSchemaInput | boolean};
  // Annotations accepted and ignored by inference (schema authors always have them).
  readonly $schema?: 'https://json-schema.org/draft/2020-12/schema';
  readonly title?: string;
  readonly description?: string;
  readonly examples?: readonly unknown[];
  readonly default?: unknown;
  readonly $comment?: string;
  readonly deprecated?: boolean;
  readonly readOnly?: boolean;
  readonly writeOnly?: boolean;
}

/** Root-position schema: real-world documents carry `$id` (identity
 *  metadata) and meta-schemas carry `$vocabulary`. Both are accepted AT THE
 *  ROOT ONLY and ignored by inference. An EMBEDDED `$id` re-scopes `$ref`
 *  resolution, so it stays rejected at the key while refs remain
 *  same-document. **/
export interface RootJsonSchemaInput extends JsonSchemaInput {
  readonly $id?: string;
  readonly $vocabulary?: {readonly [uri: string]: boolean};
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
export type ExactJsonSchema<S, Vocab = JsonSchemaInput> = S & {
  readonly [K in Exclude<keyof S, keyof Vocab>]: never;
} & (S extends {
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
  (S extends {not: infer N} ? (N extends boolean ? unknown : {readonly not: ExactJsonSchema<N>}) : unknown) &
  (S extends {contains: infer N} ? (N extends boolean ? unknown : {readonly contains: ExactJsonSchema<N>}) : unknown) &
  (S extends {patternProperties: infer P} ? {readonly patternProperties: ExactJsonSchemaMap<P>} : unknown) &
  (S extends {propertyNames: infer N} ? (N extends boolean ? unknown : {readonly propertyNames: ExactJsonSchema<N>}) : unknown) &
  (S extends {if: infer N} ? (N extends boolean ? unknown : {readonly if: ExactJsonSchema<N>}) : unknown) &
  (S extends {then: infer N} ? (N extends boolean ? unknown : {readonly then: ExactJsonSchema<N>}) : unknown) &
  (S extends {else: infer N} ? (N extends boolean ? unknown : {readonly else: ExactJsonSchema<N>}) : unknown) &
  (S extends {dependentSchemas: infer D} ? {readonly dependentSchemas: ExactJsonSchemaBoolMap<D>} : unknown) &
  (S extends {$defs: infer D} ? {readonly $defs: ExactJsonSchemaMap<D>} : unknown);

/** `properties` / `$defs` map recursion for {@link ExactJsonSchema}
 *  (homomorphic, so the literal's readonly/optional modifiers flow through
 *  unchanged). **/
type ExactJsonSchemaMap<P> = {[K in keyof P]: ExactJsonSchema<P[K]>};

/** `dependentSchemas` map recursion — values may be boolean schemas. **/
type ExactJsonSchemaBoolMap<P> = {[K in keyof P]: P[K] extends boolean ? P[K] : ExactJsonSchema<P[K]>};

/** `anyOf` / `prefixItems` member recursion for {@link ExactJsonSchema}
 *  (homomorphic over the `const`-inferred readonly tuple, preserving its
 *  shape). Boolean members pass through unwrapped — `ExactJsonSchema<true>`
 *  would fold boolean's own method keys into the excess-key guard. **/
type ExactJsonSchemaList<M> = {[I in keyof M]: M[I] extends boolean ? M[I] : ExactJsonSchema<M[I]>};

type Flatten<T> = {[K in keyof T]: T[K]};

// String constraint keywords → StringParams. minLength/maxLength keep their
// names; the `pattern` keyword (a bare 2020-12 regex string) is rebuilt into
// the object form the stringFormat brand carries, compiled with the `u` flag.
// Unicode mode is what makes `\p{Letter}` and friends mean what the schema
// author wrote — without it `\p{…}` degrades to a literal `p{…}` match — and it
// is the same default other 2020-12 validators compile patterns under. A
// type-first `String<{pattern: …}>` still chooses its own flags.
// A schema pattern declares NO mockSamples — validation works in
// full, and the build auto-generates a deterministic sample pool from the
// regex so `createMockDataFn` works too (the sidecar-generated pools that
// superseded the original throw-only policy of
// docs/investigations/json-schema/04-migration-plan.md §1).
type StringParamsFrom<S> = Flatten<
  {[K in keyof S as K extends 'minLength' | 'maxLength' ? K : never]: S[K]} & (S extends {pattern: infer P extends string}
    ? {readonly pattern: {readonly source: P; readonly flags: 'u'}}
    : unknown)
>;

/** JSON Schema `format` keyword → the RunTypes brand it recovers — the same
 *  aliases the type-first surface writes, so the two authoring forms converge on
 *  one structural id. ONE lookup row per accepted keyword; `StringFrom` reads it
 *  by indexed access instead of a per-format conditional ladder. **/
interface BrandBySchemaFormat {
  // EmailAddress, not Email: the keyword means the full RFC 5321 grammar, where
  // TF.Email is the everyday shape most fields actually want.
  readonly email: EmailAddress;
  readonly 'idn-email': IdnEmail;
  // Version-agnostic per 2020-12 — `format: 'uuid'` never pins a version.
  readonly uuid: UUID;
  readonly date: StringDate;
  readonly time: StringTime;
  readonly 'date-time': StringDateTime;
  // Hostname, not Domain: a host name may be a single label (`localhost`),
  // where `TF.Domain` wants a dotted name with a TLD.
  readonly hostname: Hostname;
  readonly 'idn-hostname': IdnHostname;
  readonly ipv4: IPv4;
  readonly ipv6: IPv6;
  // Uri, not Url: RFC 3986 accepts any scheme (`mailto:`, `urn:`), where
  // `TF.Url` is deliberately the narrow web-address form.
  readonly uri: Uri;
  readonly 'uri-reference': UriReference;
  readonly 'uri-template': UriTemplate;
  readonly iri: Iri;
  readonly 'iri-reference': IriReference;
  readonly duration: StringDuration;
  readonly regex: RegexString;
  readonly 'json-pointer': JsonPointer;
  readonly 'relative-json-pointer': RelativeJsonPointer;
}

/** The `format` keyword values the string arm accepts. **/
type SchemaFormatKeyword = keyof BrandBySchemaFormat;

// format keyword → brand via the lookup row; non-format strings fall through to
// the keyword params; a bare `{type: 'string'}` stays plain `string`. Content
// keywords route to the formats surface: the three registered encodings are the
// Base64/Base32/Base16 brands (anchored pattern baked in), and application/json
// is the JsonContent parse-check brand (base64-then-JSON behind an encoding).
// Unlowerable combinations are never, loud over lossy: a user pattern or named
// format beside an encoding (one pattern slot), a named format beside a media
// type, and encoded JSON in an encoding the emitted check cannot decode (only
// base64 has a runtime decoder).
// contentEncoding is tested FIRST (as one plain guard), so the far more common
// no-content path pays a single check and then flows straight through the
// format / plain lowering — the encoding logic lives entirely in
// `StringWithEncodingFrom`, off the hot path.
type StringFrom<S> = S extends {contentEncoding: string}
  ? StringWithEncodingFrom<S>
  : S extends {contentMediaType: string; format: string}
    ? never
    : S extends {contentMediaType: 'application/json'}
      ? // contentMediaType: application/json (no encoding) → the JsonContent
        // parse-check brand, whose baked json flag + sample pool live in the
        // formats surface; the door only routes to it.
        JsonContent<Flatten<StringParamsFrom<S>>>
      : S extends {format: infer F extends SchemaFormatKeyword}
        ? FormatWithSiblings<F, S>
        : keyof StringParamsFrom<S> extends never
          ? string
          : StringFormat<Flatten<StringParamsFrom<S>>>;
// contentEncoding present: a `pattern` or named `format` sibling would stack a
// second pattern slot (one slot only) → never, loud over lossy. Behind
// contentMediaType: application/json it is the base64-then-JSON parse family
// (only base64 has a runtime decoder; other encodings → never). A bare RFC 4648
// encoding is the matching Base64/Base32/Base16 brand — all defined in the
// formats surface, the door only routes the keyword and folds length siblings
// through P.
type StringWithEncodingFrom<S> = S extends {pattern: string} | {format: string}
  ? never
  : S extends {contentMediaType: 'application/json'}
    ? S extends {contentEncoding: 'base64'}
      ? JsonContentBase64<Flatten<StringParamsFrom<S>>>
      : never
    : S extends {contentEncoding: 'base64'}
      ? Base64<Flatten<StringParamsFrom<S>>>
      : S extends {contentEncoding: 'base32'}
        ? Base32<Flatten<StringParamsFrom<S>>>
        : Base16<Flatten<StringParamsFrom<S>>>;
// Sibling constraint keywords beside a named format apply conjunctively per
// 2020-12. minLength / maxLength REPLACE the brand's default bounds for the
// variable-width pattern families (email / hostname / uri): each rides its
// imported generic (Email/Domain/Url), which merges the length override over
// its built-in defaults, so the door manufactures no brand of its own. On the
// fixed-width families (uuid / date / time / date-time / ipv4 / ipv6) a length
// sibling is redundant or contradictory, and a sibling `pattern` or
// `contentEncoding` beside any named format would stack a second pattern slot —
// all of those resolve never, loud over lossy.
type FormatSiblingKeys = 'minLength' | 'maxLength';
type FormatWithSiblings<F extends SchemaFormatKeyword, S> = S extends {pattern: unknown} | {contentEncoding: unknown}
  ? never
  : F extends 'email'
    ? EmailAddress<LengthParamsFrom<S>>
    : F extends 'hostname'
      ? Hostname<LengthParamsFrom<S>>
      : F extends 'uri'
        ? Uri<LengthParamsFrom<S>>
        : Extract<keyof S, FormatSiblingKeys> extends never
          ? BrandBySchemaFormat[F]
          : never;
type LengthParamsFrom<S> = Flatten<
  (S extends {minLength: infer N extends number} ? {readonly minLength: N} : unknown) &
    (S extends {maxLength: infer N extends number} ? {readonly maxLength: N} : unknown)
>;

// Numeric keywords ride the `Number` params bag in their JSON Schema spelling
// (minimum / maximum / exclusiveMinimum / exclusiveMaximum / multipleOf); the
// Go scanner canonicalises them to min/max/gt/lt, so no remap table lives here.
type NumberParamsFrom<S> = {
  readonly [K in keyof S as K extends 'minimum' | 'maximum' | 'exclusiveMinimum' | 'exclusiveMaximum' | 'multipleOf'
    ? K
    : never]: S[K];
};
type NumberFrom<S> = keyof NumberParamsFrom<S> extends never ? number : NumberFormat<Flatten<NumberParamsFrom<S>>>;
type IntegerFrom<S> = NumberFormat<Flatten<NumberParamsFrom<S> & {integer: true}>>;

// object: `required` membership decides `?` — the object-level → property-level
// optionality inversion (quirk §5.1 of the phase-1 mapping). Two homomorphic
// groups (required / optional), flattened into one literal.
//
// `readOnly: true` on a PROPERTY schema lifts to the `readonly` modifier —
// the one annotation with a faithful TS spelling. A readonly member is part
// of the type's identity (as in TypeScript itself), so the lifted type
// converges with the hand-written READONLY-membered twin; the generated
// function bodies are unchanged (the modifier never alters emitted checks).
// Gated on
// ReadonlyPropKeys so the common no-readOnly object keeps the two-group cost;
// a readOnly-bearing object splits each group by modifier (four groups, one
// Flatten — Flatten is homomorphic, so the modifiers survive it). At every
// NON-property position (root, items, combinator members) readOnly stays the
// read-and-ignored annotation the spec defaults it to.
type ReadonlyPropKeys<P> = {[K in keyof P]: P[K] extends {readOnly: true} ? K : never}[keyof P];
type ObjectFromProps<P, Req extends PropertyKey, Root, F extends [unknown]> = [ReadonlyPropKeys<P>] extends [never]
  ? Flatten<
      {
        -readonly [K in keyof P as K extends Req ? K : never]: FromJsonSchemaIn<P[K], Root, F>;
      } & {
        -readonly [K in keyof P as K extends Req ? never : K]?: FromJsonSchemaIn<P[K], Root, F>;
      }
    >
  : ObjectFromPropsSplit<P, Req, ReadonlyPropKeys<P>, Root, F>;
type ObjectFromPropsSplit<P, Req extends PropertyKey, RO extends PropertyKey, Root, F extends [unknown]> = Flatten<
  {
    -readonly [K in keyof P as K extends Req ? (K extends RO ? never : K) : never]: FromJsonSchemaIn<P[K], Root, F>;
  } & {
    readonly [K in keyof P as K extends Req ? (K extends RO ? K : never) : never]: FromJsonSchemaIn<P[K], Root, F>;
  } & {
    -readonly [K in keyof P as K extends Req ? never : K extends RO ? never : K]?: FromJsonSchemaIn<P[K], Root, F>;
  } & {
    readonly [K in keyof P as K extends Req ? never : K extends RO ? K : never]?: FromJsonSchemaIn<P[K], Root, F>;
  }
>;
// The object-family keywords with no TS spelling ride the formattedObject
// brand: key-count bounds and `additionalProperties: false` closedness (the
// allowed-key list comes from the schema's own `properties`; without
// `properties` EVERY key is additional, so the list is empty and only `{}`
// validates — including under `required`, which then contradicts to an
// always-false validator, exactly per 2020-12).
type ObjectKeywordParams<S, Root> = Flatten<
  (S extends {minProperties: infer N extends number} ? {readonly minProperties: N} : unknown) &
    (S extends {maxProperties: infer N extends number} ? {readonly maxProperties: N} : unknown) &
    // additionalProperties: false closes over the declared keys PLUS any
    // patternProperties sources — per 2020-12 a key matching a pattern is
    // not "additional".
    (S extends {additionalProperties: false}
      ? {readonly closed: AllowedKeysOf<S>} & (S extends {patternProperties: infer P}
          ? {readonly closedPatterns: KeysToTuple<P>}
          : unknown)
      : // unevaluatedProperties: false closes over the MERGED applicator set
        // (own + allOf, recursively) — a key evaluated by any allOf member
        // is not "unevaluated". additionalProperties: false is stricter
        // (it never sees allOf keywords) and wins when both are present.
        S extends {unevaluatedProperties: unknown}
        ? UnevalPropsMode<S, Root> extends 'closed'
          ? {readonly closed: MergedClosedKeys<S, Root>} & ([MergedPatternSources<S, Root>] extends [readonly []]
              ? unknown
              : {readonly closedPatterns: MergedPatternSources<S, Root>})
          : unknown
        : unknown)
>;
// ── unevaluated* — document-consulted lowering ────────────────────────────
// `false` lowers exactly when the evaluated set is statically determinable:
// own keywords plus allOf members (recursively). Conditional or selective
// applicators (if / dependentSchemas / anyOf / oneOf) and in-scope refs make
// the set instance-dependent — those schemas resolve NEVER, loud over lossy,
// exactly like an undecidable negation verdict. Schema-valued unevaluated*
// has no honest static story either and poisons the same way; `true` is a
// no-op per 2020-12.
// A `$ref` is NOT indeterminate: its target has to pass for the schema to pass,
// so whatever it evaluates is evaluated unconditionally and MergedClosedKeys
// follows it. `$dynamicRef` stays out — it resolves by dynamic scope.
type UnevalIndeterminateKeys = 'if' | 'dependentSchemas' | 'anyOf' | 'oneOf' | '$dynamicRef';
// What the keyword lowers to, decided from the document:
//   'noop'     — something in scope already evaluates EVERY member, so the
//                keyword asserts nothing. Two ways that happens: an
//                `additionalProperties` / `items` in an always-passing scope
//                (they apply to everything their siblings did not), or an
//                `unevaluated*: true` in one.
//   'closed'   — `false` over an evaluated set the document pins down.
//   'leftover' — a SCHEMA value with nothing else evaluating members, which is
//                exactly what `additionalProperties` / `items` already mean.
//   'poison'   — the evaluated set depends on which branch matched at run time,
//                so no static answer is honest: resolve never, loud over lossy.
type UnevalPropsMode<S, Root> = S extends {unevaluatedProperties: infer U}
  ? [U] extends [true]
    ? 'noop'
    : ScopeEvaluatesAllProps<S> extends true
      ? 'noop'
      : [U] extends [false]
        ? UnevalScopeIndeterminate<S> extends true
          ? 'poison'
          : 'closed'
        : PropsEvaluatedSoFar<S, Root> extends true
          ? 'poison'
          : UnevalScopeIndeterminate<S> extends true
            ? 'poison'
            : 'leftover'
  : 'noop';
type UnevalItemsMode<S, Root> = S extends {unevaluatedItems: infer U}
  ? [U] extends [true]
    ? 'noop'
    : ScopeEvaluatesAllItems<S, Root> extends true
      ? 'noop'
      : [U] extends [false]
        ? UnevalItemsIndeterminate<S> extends true
          ? 'poison'
          : 'closed'
        : [LongestPrefixOf<S, Root>] extends [readonly []]
          ? UnevalItemsIndeterminate<S> extends true
            ? 'poison'
            : 'leftover'
          : 'poison'
  : 'noop';
// `leftover` needs the evaluated set to be EMPTY, since the lowering is an index
// signature / element type that covers every member. Anything already evaluated
// (own or allOf-member properties, a pattern source) would be wrongly re-checked
// against it, so those stay poison until the run-time set lands.
type PropsEvaluatedSoFar<S, Root> = [MergedClosedKeys<S, Root>] extends [readonly []]
  ? [MergedPatternSources<S, Root>] extends [readonly []]
    ? false
    : true
  : true;
// Every mode consumer probes for the KEYWORD before asking for the mode, so a
// schema that never mentions `unevaluated*` (all but a handful) pays a single
// `extends` and no scope walk at all.
type UnevalPropsPoison<S, Root> = S extends {unevaluatedProperties: unknown}
  ? UnevalPropsMode<S, Root> extends 'poison'
    ? true
    : false
  : false;
type UnevalItemsPoison<S, Root> = S extends {unevaluatedItems: unknown}
  ? UnevalItemsMode<S, Root> extends 'poison'
    ? true
    : false
  : false;
// An `additionalProperties` / `items` anywhere in an always-passing scope
// evaluates every member its siblings did not, and an `unevaluated*: true` says
// the same thing outright. Either way the outer keyword has nothing left to
// assert. Both walks follow `allOf` recursively, exactly as the closed-key
// merge does — an allOf member has to pass for the schema to pass, so whatever
// it evaluates is evaluated unconditionally.
type ScopeEvaluatesAllProps<S> =
  ScopeCarries<S, 'additionalProperties'> extends true ? true : ScopeCarriesTrue<S, 'unevaluatedProperties'>;
type ScopeEvaluatesAllItems<S, Root> = HasAnyItems<S, Root> extends true ? true : ScopeCarriesTrue<S, 'unevaluatedItems'>;
type ScopeCarries<S, K extends string> = S extends {[P in K]: unknown} ? true : MembersCarry<AllOfMembersOf<S>, K>;
type MembersCarry<M, K extends string> = M extends readonly [infer H, ...infer R]
  ? H extends {[P in K]: unknown}
    ? true
    : MembersCarry<AllOfMembersOf<H>, K> extends true
      ? true
      : MembersCarry<R, K>
  : false;
type ScopeCarriesTrue<S, K extends string> = S extends {[P in K]: true} ? true : MembersCarryTrue<AllOfMembersOf<S>, K>;
type MembersCarryTrue<M, K extends string> = M extends readonly [infer H, ...infer R]
  ? H extends {[P in K]: true}
    ? true
    : MembersCarryTrue<AllOfMembersOf<H>, K> extends true
      ? true
      : MembersCarryTrue<R, K>
  : false;
type UnevalScopeIndeterminate<S> =
  Extract<keyof S, UnevalIndeterminateKeys> extends never ? AllOfAnyIndeterminate<AllOfMembersOf<S>> : true;
type AllOfMembersOf<S> = S extends {allOf: infer M extends readonly unknown[]} ? M : readonly [];
type AllOfAnyIndeterminate<M> = M extends readonly [infer H, ...infer R]
  ? Extract<keyof H, UnevalIndeterminateKeys> extends never
    ? AllOfAnyIndeterminate<AllOfMembersOf<H>> extends true
      ? true
      : AllOfAnyIndeterminate<R>
    : true
  : false;
// contains-evaluated indexes are instance-dependent, so unevaluatedItems
// beside (own or member) contains stays indeterminate.
type UnevalItemsIndeterminate<S> =
  UnevalScopeIndeterminate<S> extends true
    ? true
    : Extract<keyof S, 'contains'> extends never
      ? AllOfAnyContains<AllOfMembersOf<S>>
      : true;
type AllOfAnyContains<M> = M extends readonly [infer H, ...infer R]
  ? Extract<keyof H, 'contains'> extends never
    ? AllOfAnyContains<AllOfMembersOf<H>> extends true
      ? true
      : AllOfAnyContains<R>
    : true
  : false;
// The UNCONDITIONALLY evaluated key set: a schema's own `properties`, every
// `allOf` member's, and every `$ref` target's. All three must pass for the
// schema to pass, so whatever they evaluate is evaluated for every value that
// reaches the keyword — no run-time condition needed. Reference following is
// FUEL-bounded, since `$ref: '#'` is a legal cycle.
type RefFuel = readonly [0, 0, 0, 0];
type MergedClosedKeys<S, Root, Fuel extends readonly unknown[] = RefFuel> = readonly [
  ...AllowedKeysOf<S>,
  ...AllOfClosedKeys<AllOfMembersOf<S>, Root, Fuel>,
  ...RefEvaluated<S, Root, Fuel, 'keys'>,
];
type AllOfClosedKeys<M, Root, Fuel extends readonly unknown[]> = M extends readonly [infer H, ...infer R]
  ? readonly [
      ...AllowedKeysOf<H>,
      ...AllOfClosedKeys<AllOfMembersOf<H>, Root, Fuel>,
      ...RefEvaluated<H, Root, Fuel, 'keys'>,
      ...AllOfClosedKeys<R, Root, Fuel>,
    ]
  : readonly [];
// One step through a `$ref`, spending a unit of fuel. Out of fuel (or no ref)
// contributes nothing, which only ever UNDER-counts the evaluated set — and
// under-counting closes the object too tightly, never too loosely.
type RefEvaluated<S, Root, Fuel extends readonly unknown[], Want extends 'keys' | 'patterns'> = Fuel extends readonly [
  unknown,
  ...infer Rest,
]
  ? S extends {$ref: unknown}
    ? RefNodeOf<S, Root> extends infer Target
      ? [Target] extends [never]
        ? readonly []
        : Want extends 'keys'
          ? MergedClosedKeys<Target, Root, Rest>
          : MergedPatternSources<Target, Root, Rest>
      : readonly []
    : readonly []
  : readonly [];
// The RAW target node a `$ref` names (the schema, not its translation) — the
// same resolution RefPart runs, stopping one step short of lowering.
type RefNodeOf<S, Root> = S extends {$ref: '#'}
  ? Root
  : S extends {$ref: `#/$defs/${infer Name}`}
    ? Root extends {$defs: infer Defs}
      ? Name extends keyof Defs
        ? Defs[Name]
        : never
      : never
    : S extends {$ref: `#/${infer Pointer}`}
      ? PointerNode<Pointer, Root>
      : never;
type PatternSourcesOf<S> = S extends {patternProperties: infer P} ? KeysToTuple<P> : readonly [];
type MergedPatternSources<S, Root, Fuel extends readonly unknown[] = RefFuel> = readonly [
  ...PatternSourcesOf<S>,
  ...AllOfPatternSources<AllOfMembersOf<S>, Root, Fuel>,
  ...RefEvaluated<S, Root, Fuel, 'patterns'>,
];
type AllOfPatternSources<M, Root, Fuel extends readonly unknown[]> = M extends readonly [infer H, ...infer R]
  ? readonly [
      ...PatternSourcesOf<H>,
      ...AllOfPatternSources<AllOfMembersOf<H>, Root, Fuel>,
      ...RefEvaluated<H, Root, Fuel, 'patterns'>,
      ...AllOfPatternSources<R, Root, Fuel>,
    ]
  : readonly [];
// unevaluatedItems: false over prefix-only shapes closes the array at the
// LONGEST merged prefix (evaluated indexes are the union of the prefixes);
// any `items` in scope evaluates every index, making it a no-op. An
// explicit sibling maxItems keeps its own bound (skip the contribution).
type UnevalItemsParams<S, Root> = S extends {unevaluatedItems: unknown}
  ? UnevalItemsMode<S, Root> extends 'closed'
    ? S extends {maxItems: number}
      ? unknown
      : {readonly maxItems: LongestPrefixOf<S, Root>['length'] & number}
    : unknown
  : unknown;
// `items` behind a `$ref` evaluates every index just the same, so the walk
// follows references on the same fuel the key merge does.
type HasAnyItems<S, Root, Fuel extends readonly unknown[] = RefFuel> = S extends {items: unknown}
  ? true
  : AllOfAnyItems<AllOfMembersOf<S>, Root, Fuel> extends true
    ? true
    : RefHasItems<S, Root, Fuel>;
type RefHasItems<S, Root, Fuel extends readonly unknown[]> = Fuel extends readonly [unknown, ...infer Rest]
  ? S extends {$ref: unknown}
    ? RefNodeOf<S, Root> extends infer Target
      ? [Target] extends [never]
        ? false
        : HasAnyItems<Target, Root, Rest>
      : false
    : false
  : false;
type AllOfAnyItems<M, Root, Fuel extends readonly unknown[]> = M extends readonly [infer H, ...infer R]
  ? H extends {items: unknown}
    ? true
    : AllOfAnyItems<AllOfMembersOf<H>, Root, Fuel> extends true
      ? true
      : RefHasItems<H, Root, Fuel> extends true
        ? true
        : AllOfAnyItems<R, Root, Fuel>
  : false;
type PrefixTupleOf<S> = S extends {prefixItems: infer P extends readonly unknown[]} ? P : readonly [];
type LongestPrefixOf<S, Root, Fuel extends readonly unknown[] = RefFuel> = Longest2<
  LongestFold<AllOfMembersOf<S>, PrefixTupleOf<S>, Root, Fuel>,
  RefPrefixOf<S, Root, Fuel>
>;
type LongestFold<M, Acc extends readonly unknown[], Root, Fuel extends readonly unknown[]> = M extends readonly [
  infer H,
  ...infer R,
]
  ? LongestFold<
      R,
      Longest2<Longest2<LongestFold<AllOfMembersOf<H>, PrefixTupleOf<H>, Root, Fuel>, RefPrefixOf<H, Root, Fuel>>, Acc>,
      Root,
      Fuel
    >
  : Acc;
type RefPrefixOf<S, Root, Fuel extends readonly unknown[]> = Fuel extends readonly [unknown, ...infer Rest]
  ? S extends {$ref: unknown}
    ? RefNodeOf<S, Root> extends infer Target
      ? [Target] extends [never]
        ? readonly []
        : LongestPrefixOf<Target, Root, Rest>
      : readonly []
    : readonly []
  : readonly [];
type Longest2<A extends readonly unknown[], B extends readonly unknown[]> = A extends readonly [unknown, ...infer TailA]
  ? B extends readonly [unknown, ...infer TailB]
    ? readonly [unknown, ...Longest2<TailA, TailB>]
    : A
  : B;
type AllowedKeysOf<S> = S extends {properties: infer P} ? KeysToTuple<P> : readonly [];
// patternProperties / propertyNames ride their own sentinels: pattern-keyed
// {rt$key, rt$value} pairs (the key brand exists so the build-time pattern
// sample pools reach the runtime for key mocking) and a bare key-validating
// child. propertyNames booleans: true is a no-op, false admits only {}
// (every key fails the never child).
//
// Why a SENTINEL and not an index signature (a Record, or a Record carrying
// the key rule as a settings brand): TypeScript allows several index
// signatures on one type only when their KEY TYPES differ. 2020-12 lets
// patternProperties declare N patterns with N different value types, and
// every arbitrary-regex pattern is keyed plain `string`, so two of them
// collide and cannot be spelled as intersected Records. Template-literal keys
// dodge that (the index-signature emitter already turns one into a hoisted
// key regex), but they only reach prefix / suffix / infix shapes, never an
// arbitrary regex like `^[a-z]{2}_`. The sentinel is TOTAL over the keyword
// where a Record would be partial, so it stays.
//
// The cost is that the emitted check is a separate per-key sweep rather than
// riding the index-signature loop. Everything reusable in it is hoisted into
// the factory prologue (see emitPatternPropCheck), so the remaining cost is
// the extra walk, not per-key allocation.
// The object keyword bag handed to the imported `FormattedObject`: the literal
// bounds + closedness (ObjectKeywordParams), the patternProperties value map
// (pattern source → already-lowered value type), and the propertyNames key type.
// `FormattedObject` splits this into the formattedObject brand + the
// `__rtPatternProps` / `__rtPropNames` sentinels — the three members the door
// used to spell by hand.
type PatternPropsParam<S, Root, F extends [unknown]> = S extends {patternProperties: infer P}
  ? {readonly patternProperties: {readonly [K in keyof P]: FromJsonSchemaIn<P[K], Root, F>}}
  : unknown;
// propertyNames → the key type `FormattedObject` carries: absent for `true` (no
// slot), `never` for `false` (no key may be present), else the lowered key schema.
type PropNamesParam<S, Root, F extends [unknown]> = S extends {propertyNames: infer N}
  ? [N] extends [true]
    ? unknown
    : {readonly propertyNames: [N] extends [false] ? never : FromJsonSchemaIn<N, Root, F>}
  : unknown;
type ObjectAllParams<S, Root, F extends [unknown]> = Flatten<
  ObjectKeywordParams<S, Root> & PatternPropsParam<S, Root, F> & PropNamesParam<S, Root, F>
>;
// Fast path: an object with none of the structural keywords is just its shape
// (no brand, no sentinels), so it never pays the FormattedObject wrapper. Only
// `additionalProperties: false` (closedness) is keyword-bearing — a schema-valued
// `additionalProperties` (the common Record form) rides ObjectShapeFrom, so it
// is value-checked here rather than lumped in by key presence.
type ObjectKeywordKeys = 'minProperties' | 'maxProperties' | 'unevaluatedProperties' | 'patternProperties' | 'propertyNames';
type ObjectHasKeywords<S> = [Extract<keyof S, ObjectKeywordKeys>] extends [never]
  ? S extends {additionalProperties: false}
    ? true
    : false
  : true;
type ObjectFrom<S, Root, F extends [unknown]> =
  UnevalPropsPoison<S, Root> extends true
    ? never
    : ObjectHasKeywords<S> extends true
      ? FormattedObject<Extract<ObjectShapeFrom<S, Root, F>, object>, ObjectAllParams<S, Root, F>>
      : ObjectShapeFrom<S, Root, F>;
type ObjectShapeFrom<S, Root, F extends [unknown]> = S extends {properties: infer P}
  ? WithAdditional<
      S,
      S extends {required: infer R extends readonly string[]}
        ? ObjectFromProps<P, R[number], Root, F>
        : ObjectFromProps<P, never, Root, F>,
      Root,
      F
    >
  : S extends {required: infer R extends readonly string[]}
    ? // `required` WITHOUT `properties` is legal 2020-12 (the shape
      // if/then/else consequences usually take): the listed keys must be
      // PRESENT, each otherwise unconstrained. The presence marker is the
      // six-kind JSON domain (see PresentValue) — every JSON value, with
      // undefined excluded so presence stays enforced.
      WithAdditional<S, {-readonly [K in R[number]]: PresentValue}, Root, F>
    : S extends {additionalProperties: infer A extends JsonSchemaInput}
      ? Record<string, FromJsonSchemaIn<A, Root, F>>
      : S extends {unevaluatedProperties: infer U extends JsonSchemaInput}
        ? // Nothing else evaluates a key here, so `unevaluatedProperties` covers
          // every one of them — which is what `additionalProperties` spells.
          UnevalPropsMode<S, Root> extends 'leftover'
          ? Record<string, FromJsonSchemaIn<U, Root, F>>
          : Record<string, unknown>
        : // Keyword-less object gate: Record<string, unknown>, NOT the TS
          // `object` keyword — `object` admits arrays (and its emitted check
          // accepts them), while JSON Schema's object kind excludes them; the
          // record check is the exact spelling. Also what every negation object
          // arm uses via GateArmFrom, where array leakage would corrupt ¬.
          Record<string, unknown>;

/** "The key exists" as a type: any JSON value, undefined excluded. Spelled as
 *  the six-kind JSON domain — NOT `unknown` (admits undefined, which stops
 *  enforcing presence) and NOT `{} | null` (the engine compiles the empty
 *  object type as an object check, so a standalone marker member would
 *  reject primitive values). Intersecting it still upgrades an optional
 *  declared property to required without changing its type
 *  (`{a?: string} & {a: PresentValue}` → required `a: string` — the kind
 *  intersection collapses in the engine's member merge). **/
type PresentValue = null | boolean | number | string | unknown[] | Record<string, unknown>;

/** An object arm inside a UNION must stay OPEN. Two rules meet here: a 2020-12
 *  object admits undeclared keys unless a closedness keyword says otherwise,
 *  and a union arm only wins when the value's keys are covered by it — so a
 *  members-only arm quietly rejects every object carrying anything else
 *  (`{properties: {foo: …}}` rejecting `{quux: 1}`). The open spelling is the
 *  same `Record<string, unknown>` a property-less object arm already lowers to,
 *  with the declared members keeping their own checks on top. A schema that DOES
 *  own its key set (`additionalProperties` in either form,
 *  `unevaluatedProperties`) is left alone — the record would erase exactly the
 *  closedness those keywords express. **/
type ObjectArmFrom<S, Root, F extends [unknown]> =
  Extract<keyof S, 'additionalProperties' | 'unevaluatedProperties'> extends never
    ? Extract<keyof S, 'properties' | 'required'> extends never
      ? ObjectFrom<S, Root, F>
      : Record<string, unknown> & ObjectFrom<S, Root, F>
    : ObjectFrom<S, Root, F>;

// `additionalProperties: <schema>` ALONGSIDE `properties` intersects the
// declared props with the index-signature record (01-phase1-mapping §3.2 — the
// mixed form). The boolean forms contribute nothing HERE: `true`/omitted stay
// open, and `false` is enforced by the formattedObject closedness brand that
// ObjectFrom layers on top (the type level cannot subtract keys).
type WithAdditional<S, Props, Root, F extends [unknown]> = S extends {additionalProperties: infer A}
  ? A extends boolean
    ? Props
    : Props & Record<string, FromJsonSchemaIn<A, Root, F>>
  : Props;

// array/tuple: `prefixItems` builds a tuple. Members at positions below
// `minItems` are required, the rest optional (`?`) — absent minItems means 0,
// i.e. all optional, matching JSON Schema truth (short arrays validate).
// Boolean SLOT schemas translate through the core ladder: `true` → unknown
// (the spec's "no constraint here" padding), `false` → never (the position
// must be absent — an optional never slot enforces exactly that). The
// tail comes from `items`: absent or `true` → OPEN tuple (`...unknown[]` —
// extra items are allowed by 2020-12), `false` → closed, a schema → typed
// trailing rest. A
// `minItems` beyond the prefix length keeps REQUIRING: the tuple is padded
// with members drawn from the `items` type (unknown when open, never when
// `items: false` — a closed prefix shorter than minItems is a provably empty
// schema) until the required count is met, so a minItems without prefixItems
// expands to `[T, T, ...T[]]` instead of silently dropping the bound.
// uniqueItems and maxItems have no tuple spelling (uniqueItems is a value
// relation; a maxItems tuple truncation cannot compose with the required
// pad), so they ride the formattedArray brand — the shape stays the tightest
// tuple the OTHER keywords produce and the validator gains the exact length
// / deep-equality checks.
// The array keyword bag handed to the imported `FormattedArray`: the literal
// bounds (uniqueItems / maxItems, incl. the unevaluatedItems-derived maxItems)
// plus the `contains` element type (already lowered) and its occurrence bounds.
// `minItems` stays in the tuple shape, never the brand. `FormattedArray` splits
// this bag into the formattedArray brand + the `__rtContains` child sentinel,
// exactly the two members the door used to spell by hand.
type ArrayAllParams<S, Root, F extends [unknown]> = Flatten<
  (S extends {uniqueItems: true} ? {readonly uniqueItems: true} : unknown) &
    (S extends {maxItems: infer N extends number} ? {readonly maxItems: N} : unknown) &
    UnevalItemsParams<S, Root> &
    (S extends {contains: infer C} ? {readonly contains: FromJsonSchemaIn<C, Root, F>} : unknown) &
    (S extends {minContains: infer N extends number} ? {readonly minContains: N} : unknown) &
    (S extends {maxContains: infer N extends number} ? {readonly maxContains: N} : unknown)
>;
// Fast path: an array with none of the structural keywords is just its tuple/
// array shape (no brand, no contains slot) — so it never pays the FormattedArray
// wrapper, keeping the common `{type: 'array', items: …}` case cheap.
type ArrayKeywordKeys = 'uniqueItems' | 'maxItems' | 'contains' | 'minContains' | 'maxContains' | 'unevaluatedItems';
type ArrayFrom<S, Root, F extends [unknown]> =
  UnevalItemsPoison<S, Root> extends true
    ? never
    : [Extract<keyof S, ArrayKeywordKeys>] extends [never]
      ? ArrayShapeFrom<S, Root, F>
      : FormattedArray<Extract<ArrayShapeFrom<S, Root, F>, readonly unknown[]>, ArrayAllParams<S, Root, F>>;
type ArrayShapeFrom<S, Root, F extends [unknown]> = S extends {
  prefixItems: infer P extends readonly (JsonSchemaInput | boolean)[];
}
  ? BuildTupleRequired<P, MinItemsOf<S>, RestOf<S>, [], Root, F>
  : MinItemsOf<S> extends 0
    ? S extends {items: infer I}
      ? I extends false
        ? []
        : FromJsonSchemaIn<I, Root, F>[]
      : S extends {unevaluatedItems: infer U extends JsonSchemaInput}
        ? // Same reading as the properties side: with no prefix evaluating an
          // index, `unevaluatedItems` covers every one, which is `items`.
          UnevalItemsMode<S, Root> extends 'leftover'
          ? FromJsonSchemaIn<U, Root, F>[]
          : unknown[]
        : unknown[]
    : BuildTupleRequired<[], MinItemsOf<S>, RestOf<S>, [], Root, F>;
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
    : PadRequired<MinItems, Rest, Acc, Root, F>;
// Prefix exhausted below minItems: keep requiring members of the rest type.
// The open-tail member is PresentValue, not `unknown` — an unknown member
// check passes for a MISSING member, so the tuple arity would silently stop
// being enforced; PresentValue (any JSON value, undefined excluded) is the
// exact "a member exists here" check.
type PadRequired<MinItems extends number, Rest, Acc extends unknown[], Root, F extends [unknown]> = Acc['length'] extends MinItems
  ? FinishTuple<Acc, Rest, Root, F>
  : PadRequired<MinItems, Rest, [...Acc, RestMemberOf<Rest, Root, F>], Root, F>;
type RestMemberOf<Rest, Root, F extends [unknown]> = Rest extends false
  ? never
  : Rest extends 'rt$open' | true
    ? PresentValue // `items: true` pads like the open tail — arity stays enforced
    : FromJsonSchemaIn<Rest, Root, F>;
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
  : Rest extends 'rt$open' | true
    ? [...Acc, ...unknown[]] // `items: true` = the always-true tail, same as absent
    : [...Acc, ...FromJsonSchemaIn<Rest, Root, F>[]];

// anyOf: recursive arm-by-arm union build (the UnionOf precedent — an
// indexed `M[number]` would let tsgo subtype-reduce sibling object arms).
// A union already IS at-least-one, so anyOf maps faithfully with no extra
// machinery. oneOf is the EXACTLY-ONE combinator and translates separately
// (OneOfPart): the branch tuple rides the `__rtOneOf` sentinel so the
// generated validator counts branch matches — see the OneOf<[…]> type.
type FromAnyOf<M, Root, F extends [unknown]> = M extends readonly [infer Head, ...infer Tail]
  ? FromJsonSchemaIn<Head, Root, F> | FromAnyOf<Tail, Root, F>
  : never;

// allOf: arm-by-arm intersection (unknown is the & identity). A oneOf-bearing
// arm cannot ride a multi-arm conjunction — its sentinel'd union only
// classifies standalone, and intersecting it with a second constraining arm
// would silently drop the exclusivity — so that shape resolves never (loud);
// a single-arm allOf wrap stays fine.
type FromAllOf<M, Root, F extends [unknown]> = M extends readonly [unknown, unknown, ...unknown[]]
  ? HasOneOfArm<M> extends true
    ? never
    : FromAllOfRec<M, Root, F>
  : FromAllOfRec<M, Root, F>;
type HasOneOfArm<M> = M extends readonly [infer Head, ...infer Tail]
  ? Head extends {oneOf: unknown}
    ? true
    : HasOneOfArm<Tail>
  : false;
// Arms combine through Conj, not a bare `&`: a type-LESS arm lowers to the
// six-kind union, and `(string | Number<max> | …) & (string | Number<min> | …)`
// stays unreduced — a shape the collapse cannot classify, so both bounds are
// lost and `allOf: [{maximum: 30}, {minimum: 20}]` accepts 35. Conj distributes
// over the arms and prunes the cross-kind pairs, leaving one union whose number
// arm carries BOTH bounds. A `$ref`-bearing arm keeps the bare `&`: Conj's
// `[unknown] extends [A]` probe would force a lazily-tied fixpoint (TS2589).
type FromAllOfRec<M, Root, F extends [unknown]> =
  HasLazyArm<M> extends true ? FromAllOfRaw<M, Root, F> : FromAllOfConj<M, Root, F>;
type FromAllOfRaw<M, Root, F extends [unknown]> = M extends readonly [infer Head, ...infer Tail]
  ? FromJsonSchemaIn<Head, Root, F> & FromAllOfRaw<Tail, Root, F>
  : unknown;
type FromAllOfConj<M, Root, F extends [unknown]> = M extends readonly [infer Head, ...infer Tail]
  ? Conj<FromJsonSchemaIn<Head, Root, F>, FromAllOfConj<Tail, Root, F>>
  : unknown;
type HasLazyArm<M> = M extends readonly [infer Head, ...infer Tail]
  ? Extract<keyof Head, '$ref' | '$dynamicRef'> extends never
    ? HasLazyArm<Tail>
    : true
  : false;

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
              ? ObjectArmFrom<S, Root, F>
              : never;

// ── `not` — the negation entry ─────────────────────────────────────────────
// Statically, `not` narrows by the KIND-COMPLEMENT algebra: the JSON domain
// is closed over six kinds, so the complement of a kind-level subschema is a
// finite, expressible union (`{not: {type: 'string'}}` really is `null |
// boolean | number | unknown[] | Record<string, unknown>`), while a sub-kind
// constraint (pattern, properties, enum…) keeps its kind whole and
// contributes `unknown` — the EXACT check rides the `__rtNot` sentinel into
// the generated validator instead. Composition is plain intersection, so a
// sibling `type` tightens automatically, and a contradiction
// (`{type:'string', not:{type:'string'}}`) self-collapses to `never` — the
// only place `never` belongs (a provably empty schema, not an
// "inexpressible" shrug).
type NonKindKeys =
  | '$schema'
  | 'title'
  | 'description'
  | 'examples'
  | 'default'
  | '$comment'
  | 'deprecated'
  | 'readOnly'
  | 'writeOnly'
  // then/else without if are annotations per 2020-12, exactly like
  // minContains/maxContains without contains (when contains IS present the
  // ContainsPart reads them directly); $id/$vocabulary are root-document
  // metadata (accepted at the root only, see the builder).
  | 'then'
  | 'else'
  | 'minContains'
  | 'maxContains'
  // anchors are declaration sites, not instance constraints.
  | '$anchor'
  | '$dynamicAnchor'
  | '$id'
  | '$vocabulary';
// ¬ is applied by NAME-SET algebra over the six JSON kinds, never as an
// intersection with a union (tsgo keeps `T & (A | B)` unreduced, which the
// collapse cannot classify). For each kind K in the OUTER schema's gate the
// arm follows from whether a K-valued instance can FAIL the subschema NS:
//   - NS has a `type` gate excluding K   → plain arm (every K-value fails NS,
//     so ¬NS accepts the whole kind);
//   - NS matches K at kind level only    → arm excluded (complement is exact);
//   - NS constrains K below the kind     → arm ∧ the `__rtNot` sentinel (the
//     runtime ¬), with the sentinel child PROJECTED to K's own constraint
//     family when NS carries no value-scoped keywords (per 2020-12 kind
//     relevance a K-value can only fail K-family constraints, so the
//     projection is exact and the id converges with the Not<F> spelling);
//   - NS is TYPE-LESS and does not constrain K's family → arm excluded
//     (2020-12 kind relevance: the instance satisfies NS vacuously, so ¬NS
//     rejects it) — the dual of the typed case, NOT a plain arm.
// null and boolean cannot carry the sentinel (TS reduces their object
// intersections away), and they need none: no sub-kind keyword discriminates
// them, so only VALUE-SCOPED subschemas (const/enum/$ref/combinators/if) can
// tell null / true / false apart — and those verdicts are decided statically
// by AcceptsLit below (a fuel-bounded shape walk; an undecidable `$ref`
// cycle poisons the whole negation to `never`, loud over lossy).
type StringFamilyKeys = 'minLength' | 'maxLength' | 'pattern' | 'format' | 'contentEncoding' | 'contentMediaType';
type NumberFamilyKeys = 'minimum' | 'maximum' | 'exclusiveMinimum' | 'exclusiveMaximum' | 'multipleOf';
type ArrayFamilyKeys = 'items' | 'prefixItems' | 'minItems' | 'maxItems' | 'uniqueItems' | 'contains' | 'unevaluatedItems';
type ObjectFamilyKeys =
  | 'properties'
  | 'required'
  | 'additionalProperties'
  | 'minProperties'
  | 'maxProperties'
  | 'patternProperties'
  | 'propertyNames'
  | 'unevaluatedProperties';
// Value-scoped keywords (enum/const/combinators/$ref/nested not) assert
// across EVERY kind, so their negation gate spans all kinds.
type ValueScopedKeys =
  | 'enum'
  | 'const'
  | 'anyOf'
  | 'oneOf'
  | 'allOf'
  | '$ref'
  | '$dynamicRef'
  | 'not'
  | 'if'
  | 'dependentRequired'
  | 'dependentSchemas';
type GateNames = 'string' | 'number' | 'boolean' | 'null' | 'array' | 'object';
// `integer` gates the number kind but is itself a sub-kind constraint, so it
// maps to 'number' here and forces the runtime-¬ path (never kind-only).
type ToGateName<T> = T extends 'integer' ? 'number' : T & GateNames;
type GateNamesOf<S> = S extends {type: infer T} ? ToGateName<T extends readonly SchemaTypeName[] ? T[number] : T> : GateNames;
// The kinds a TYPED subschema's gate names (typed-child arm split)…
type NSTypeGateOf<NS> = NS extends {type: infer T} ? ToGateName<T extends readonly SchemaTypeName[] ? T[number] : T> : never;
// …and the kinds whose constraint FAMILY a type-less subschema touches.
type NSFamilyNamesOf<NS> =
  | (Extract<keyof NS, StringFamilyKeys> extends never ? never : 'string')
  | (Extract<keyof NS, NumberFamilyKeys> extends never ? never : 'number')
  | (Extract<keyof NS, ArrayFamilyKeys> extends never ? never : 'array')
  | (Extract<keyof NS, ObjectFamilyKeys> extends never ? never : 'object');
// Kind-only gate: `not: {type: X}` with nothing below the kind — the name
// exclusion alone is exact and no runtime ¬ is needed. `integer` in the gate
// disqualifies (it constrains below the number kind).
type NSKindOnly<NS> = NS extends {type: infer T}
  ? Exclude<keyof NS, 'type' | NonKindKeys> extends never
    ? 'integer' extends (T extends readonly SchemaTypeName[] ? T[number] : T)
      ? false
      : true
    : false
  : false;
// S's own translation for one gate kind (sibling keywords apply by kind
// relevance, reusing the per-type helpers — `integer` outer gates keep their
// integer brand on the number arm).
type GateArmFrom<K extends GateNames, S, Root, F extends [unknown]> = K extends 'string'
  ? StringFrom<S>
  : K extends 'number'
    ? HasIntegerGate<S> extends true
      ? IntegerFrom<S>
      : NumberFrom<S>
    : K extends 'boolean'
      ? boolean
      : K extends 'null'
        ? null
        : K extends 'array'
          ? ArrayFrom<S, Root, F>
          : ObjectFrom<S, Root, F>;
type HasIntegerGate<S> = S extends {type: infer T}
  ? 'integer' extends (T extends readonly SchemaTypeName[] ? T[number] : T)
    ? true
    : false
  : false;
// The four sentinel-capable kinds; boolean / null arms are decided by the
// AcceptsLit verdicts in NotAppliedV instead (they cannot carry a sentinel).
type NotArm<K extends 'string' | 'number' | 'array' | 'object', S, NS, Root, F extends [unknown]> =
  K extends GateNamesOf<S>
    ? NS extends {type: unknown}
      ? K extends NSTypeGateOf<NS>
        ? NSKindOnly<NS> extends true
          ? never
          : GateArmFrom<K, S, Root, F> & NotSlot<NotChildFor<K, NS, Root, F>>
        : GateArmFrom<K, S, Root, F>
      : Extract<keyof NS, ValueScopedKeys> extends never
        ? K extends NSFamilyNamesOf<NS>
          ? GateArmFrom<K, S, Root, F> & NotSlot<NotChildFor<K, NS, Root, F>>
          : never
        : GateArmFrom<K, S, Root, F> & NotSlot<FromJsonSchemaIn<NS, Root, F>>
    : never;
// Sentinel child: family-projected when NS carries no value-scoped keywords
// (exact per kind relevance, single-kind for the Go negation compile, and id-
// convergent with Not<F>); the full translation when value-scoped keywords
// mean any kind can fail below the kind level.
type NotChildFor<K extends 'string' | 'number' | 'array' | 'object', NS, Root, F extends [unknown]> =
  Extract<keyof NS, ValueScopedKeys> extends never ? GateArmFrom<K, NS, Root, F> : FromJsonSchemaIn<NS, Root, F>;
type NotApplied<S, NS, Root, F extends [unknown]> = NotAppliedV<
  S,
  NS,
  Root,
  F,
  'null' extends GateNamesOf<S> ? AcceptsLit<null, NS, Root, StartFuel> : 'n',
  'boolean' extends GateNamesOf<S> ? AcceptsLit<true, NS, Root, StartFuel> : 'n',
  'boolean' extends GateNamesOf<S> ? AcceptsLit<false, NS, Root, StartFuel> : 'n'
>;
// A literal survives ¬NS exactly when NS rejects it ('n'); an undecidable
// verdict ('u', fuel-exhausted $ref recursion) poisons the whole negation.
type NotAppliedV<S, NS, Root, F extends [unknown], NV extends Verdict, TV extends Verdict, FV extends Verdict> = 'u' extends
  | NV
  | TV
  | FV
  ? never
  :
      | NotArm<'string', S, NS, Root, F>
      | NotArm<'number', S, NS, Root, F>
      | ('boolean' extends GateNamesOf<S> ? BoolNotArm<TV, FV> : never)
      | ('null' extends GateNamesOf<S> ? (NV extends 'n' ? null : never) : never)
      | NotArm<'array', S, NS, Root, F>
      | NotArm<'object', S, NS, Root, F>;
// Both literals survive → plain boolean (id-stable with the kind-set arms).
type BoolNotArm<TV extends Verdict, FV extends Verdict> = TV extends 'n'
  ? FV extends 'n'
    ? boolean
    : true
  : FV extends 'n'
    ? false
    : never;

// ── AcceptsLit — static verdict: does subschema NS accept null / true / false?
// A three-valued shape walk ('y' accepts / 'n' rejects / 'u' undecidable):
// family constraint keywords are vacuous on these literals per 2020-12 kind
// relevance, so only the type gate and the value-scoped keywords are
// consulted. `$ref` hops burn fuel; running dry yields 'u' (only reachable
// through degenerate definition cycles with no deciding gate — the liar
// schema `{not: {$ref: '#'}}` and friends). Fuel is 4: real definitions
// decide within a hop or two, and each hop re-instantiates the whole
// conjunct chain, so a deeper budget would cross tsc's instantiation-depth
// wall (TS2589) on exactly the cycles the fuel exists to cut off.
type Verdict = 'y' | 'n' | 'u';
type StartFuel = readonly [0, 0, 0, 0];
type AcceptsLit<V extends null | boolean, NS, Root, Fl extends readonly unknown[]> = [NS] extends [true]
  ? 'y'
  : [NS] extends [false]
    ? 'n'
    : NS extends {type: infer T}
      ? (V extends null ? 'null' : 'boolean') extends ToGateName<T extends readonly SchemaTypeName[] ? T[number] : T>
        ? LitParts<V, NS, Root, Fl>
        : 'n'
      : LitParts<V, NS, Root, Fl>;
// Conjunction of every value-scoped part present (absent part → 'y', the ∧
// identity — mirrors FromJsonSchemaCore's part structure). dependent* are
// object-scoped, hence vacuously 'y' on these literals and never consulted.
type LitParts<V extends null | boolean, NS, Root, Fl extends readonly unknown[]> = And3<
  LitConst<V, NS>,
  And3<
    LitEnum<V, NS>,
    And3<
      LitAnyOf<V, NS, Root, Fl>,
      And3<
        LitOneOf<V, NS, Root, Fl>,
        And3<LitAllOf<V, NS, Root, Fl>, And3<LitNot<V, NS, Root, Fl>, And3<LitIte<V, NS, Root, Fl>, LitRef<V, NS, Root, Fl>>>>
      >
    >
  >
>;
type LitConst<V extends null | boolean, NS> = NS extends {const: infer C}
  ? [C] extends [V]
    ? [V] extends [C]
      ? 'y'
      : 'n'
    : 'n'
  : 'y';
type LitEnum<V extends null | boolean, NS> = NS extends {enum: infer E extends readonly unknown[]}
  ? [V] extends [E[number]]
    ? 'y'
    : 'n'
  : 'y';
type LitAnyOf<V extends null | boolean, NS, Root, Fl extends readonly unknown[]> = NS extends {
  anyOf: infer M extends readonly unknown[];
}
  ? LitSome<V, M, Root, Fl>
  : 'y';
type LitSome<V extends null | boolean, M, Root, Fl extends readonly unknown[]> = M extends readonly [infer H, ...infer R]
  ? Or3<AcceptsLit<V, H, Root, Fl>, LitSome<V, R, Root, Fl>>
  : 'n';
// oneOf: EXACTLY one member accepts — a second hit decides 'n' outright.
type LitOneOf<V extends null | boolean, NS, Root, Fl extends readonly unknown[]> = NS extends {
  oneOf: infer M extends readonly unknown[];
}
  ? LitOne<V, M, Root, Fl, 'n'>
  : 'y';
type LitOne<V extends null | boolean, M, Root, Fl extends readonly unknown[], Seen extends 'y' | 'n'> = M extends readonly [
  infer H,
  ...infer R,
]
  ? AcceptsLit<V, H, Root, Fl> extends infer A extends Verdict
    ? A extends 'u'
      ? 'u'
      : A extends 'y'
        ? Seen extends 'y'
          ? 'n'
          : LitOne<V, R, Root, Fl, 'y'>
        : LitOne<V, R, Root, Fl, Seen>
    : never
  : Seen;
type LitAllOf<V extends null | boolean, NS, Root, Fl extends readonly unknown[]> = NS extends {
  allOf: infer M extends readonly unknown[];
}
  ? LitEvery<V, M, Root, Fl>
  : 'y';
type LitEvery<V extends null | boolean, M, Root, Fl extends readonly unknown[]> = M extends readonly [infer H, ...infer R]
  ? And3<AcceptsLit<V, H, Root, Fl>, LitEvery<V, R, Root, Fl>>
  : 'y';
type LitNot<V extends null | boolean, NS, Root, Fl extends readonly unknown[]> = NS extends {not: infer C}
  ? Not3<AcceptsLit<V, C, Root, Fl>>
  : 'y';
type LitIte<V extends null | boolean, NS, Root, Fl extends readonly unknown[]> = NS extends {if: infer I}
  ? LitIteV<AcceptsLit<V, I, Root, Fl>, V, NS, Root, Fl>
  : 'y';
type LitIteV<IV extends Verdict, V extends null | boolean, NS, Root, Fl extends readonly unknown[]> = IV extends 'y'
  ? LitThen<V, NS, Root, Fl>
  : IV extends 'n'
    ? LitElse<V, NS, Root, Fl>
    : LitIteU<LitThen<V, NS, Root, Fl>, LitElse<V, NS, Root, Fl>>;
type LitThen<V extends null | boolean, NS, Root, Fl extends readonly unknown[]> = NS extends {then: infer B}
  ? AcceptsLit<V, B, Root, Fl>
  : 'y';
type LitElse<V extends null | boolean, NS, Root, Fl extends readonly unknown[]> = NS extends {else: infer B}
  ? AcceptsLit<V, B, Root, Fl>
  : 'y';
// Undecidable `if`: the ite still decides when both branches agree.
type LitIteU<T3 extends Verdict, E3 extends Verdict> = T3 extends E3 ? (E3 extends T3 ? T3 : 'u') : 'u';
// Mirrors RefPart: '#' re-enters the root, '#/$defs/<name>' a definition (an
// unknown name is the never schema → rejects), other spellings resolve
// `unknown` in RefPart and so accept here.
type LitRef<V extends null | boolean, NS, Root, Fl extends readonly unknown[]> = And3<
  NS extends {$ref: infer R extends string} ? LitRefTarget<V, R, Root, Fl> : 'y',
  NS extends {$dynamicRef: infer R extends string} ? LitRefTarget<V, R, Root, Fl> : 'y'
>;
type LitRefTarget<V extends null | boolean, R extends string, Root, Fl extends readonly unknown[]> = R extends '#'
  ? Fl extends readonly [unknown, ...infer Rest]
    ? AcceptsLit<V, Root, Root, Rest>
    : 'u'
  : R extends `#/$defs/${infer Name}`
    ? Root extends {$defs: infer D}
      ? Name extends keyof D
        ? Fl extends readonly [unknown, ...infer Rest]
          ? AcceptsLit<V, D[Name], Root, Rest>
          : 'u'
        : 'n'
      : 'n'
    : R extends `#${infer Name}`
      ? LitAnchor<V, Name, Root, Fl>
      : 'y';
// Anchor targets mirror AnchorFrom over the SHAPES: the root's own anchor
// re-enters the root, $defs entries scan by ($anchor | $dynamicAnchor).
type LitAnchor<V extends null | boolean, Name extends string, Root, Fl extends readonly unknown[]> = Root extends {
  $anchor: Name;
}
  ? Fl extends readonly [unknown, ...infer Rest]
    ? AcceptsLit<V, Root, Root, Rest>
    : 'u'
  : Root extends {$dynamicAnchor: Name}
    ? Fl extends readonly [unknown, ...infer Rest]
      ? AcceptsLit<V, Root, Root, Rest>
      : 'u'
    : Root extends {$defs: infer D}
      ? LitAnchorScan<V, Name, D, KeysToTuple<D>, Root, Fl>
      : 'n';
type LitAnchorScan<
  V extends null | boolean,
  Name extends string,
  D,
  Ks,
  Root,
  Fl extends readonly unknown[],
> = Ks extends readonly [infer K extends PropertyKey, ...infer Rest]
  ? K extends keyof D
    ? D[K] extends {$anchor: Name}
      ? Fl extends readonly [unknown, ...infer FuelRest]
        ? AcceptsLit<V, D[K], Root, FuelRest>
        : 'u'
      : D[K] extends {$dynamicAnchor: Name}
        ? Fl extends readonly [unknown, ...infer FuelRest]
          ? AcceptsLit<V, D[K], Root, FuelRest>
          : 'u'
        : LitAnchorScan<V, Name, D, Rest, Root, Fl>
    : LitAnchorScan<V, Name, D, Rest, Root, Fl>
  : 'n';
type And3<A, B> = A extends 'n' ? 'n' : B extends 'n' ? 'n' : A extends 'u' ? 'u' : B extends 'u' ? 'u' : 'y';
type Or3<A, B> = A extends 'y' ? 'y' : B extends 'y' ? 'y' : A extends 'u' ? 'u' : B extends 'u' ? 'u' : 'n';
type Not3<A> = A extends 'y' ? 'n' : A extends 'n' ? 'y' : 'u';

// Distributive conjunction. tsgo keeps `T & (A | B)` unreduced and the
// collapse cannot classify an intersection-with-union, so every conjunctive
// keyword layer (if/then/else, dependent*) combines through this instead:
// union arms multiply pairwise, contradictions prune to never, and the
// result is always a plain union of collapse-friendly intersections.
// `unknown` short-circuits keep the single-keyword fast path allocation-free.
// The A-side shortcut runs FIRST and returns B VERBATIM, unprobed: in every
// chain below A is the cheap keyword part and B carries the rest of the
// translation, which may be a lazily-tied recursive type — any `extends`
// probe of it (even `[unknown] extends [B]`) forces the fixpoint and blows
// the instantiation depth (TS2589).
type Conj<A, B> = [unknown] extends [A]
  ? B
  : [unknown] extends [B]
    ? A
    : A extends unknown
      ? B extends unknown
        ? ConjPair<A, B>
        : never
      : never;
// Pairwise pruning: TS deliberately KEEPS primitive ∩ object intersections
// (brands ride on them), so a contradictory pair like `string & Record<…>`
// would survive as a TypeMeta-decorated primitive that validates as the bare
// primitive — silently widening the conjunction. Prune the cross-domain
// pairs here; same-domain pairs intersect normally (object ∩ object merges,
// primitive ∩ same-base-brand narrows, different primitive bases reduce to
// never on their own).
type ConjPair<A, B> = A extends JsonPrimitiveDomain
  ? B extends JsonPrimitiveDomain
    ? A & B // primitive ∩ primitive (brands included) — cross-base pairs reduce to never on their own
    : B extends object
      ? never // primitive ∩ pure-structural — contradictory
      : A & B
  : B extends JsonPrimitiveDomain
    ? A extends object
      ? never
      : A & B
    : // JSON's `object` kind excludes arrays, but TS happily merges an object
      // literal with Array.prototype — prune array-vs-non-array pairs too.
      A extends readonly unknown[]
      ? B extends readonly unknown[]
        ? A & B
        : B extends object
          ? never
          : A & B
      : B extends readonly unknown[]
        ? A extends object
          ? never
          : A & B
        : A & B;
type JsonPrimitiveDomain = string | number | bigint | boolean | null;

// ¬(subschema) reused outside `not` (the else-branch of if/then/else): the
// same six-arm algebra over an ungated outer. An always-true subschema
// (boolean true / {} / annotations-only) negates to never; false to unknown.
type NegationOf<NS, Root, F extends [unknown]> = NS extends boolean
  ? NS extends true
    ? never
    : unknown
  : Exclude<keyof NS, NonKindKeys> extends never
    ? never
    : NotApplied<unknown, NS, Root, F>;

// if/then/else: valid(if) ? valid(then) : valid(else) — desugared as
// (If ∧ Then) ∨ (¬If ∧ Else); a missing branch is `unknown` (2020-12: no
// assertion for that side). Boolean `if` collapses to the taken branch.
type ThenOf<S, Root, F extends [unknown]> = S extends {then: infer B} ? FromJsonSchemaIn<B, Root, F> : unknown;
type ElseOf<S, Root, F extends [unknown]> = S extends {else: infer B} ? FromJsonSchemaIn<B, Root, F> : unknown;
type IteFrom<If, S, Root, F extends [unknown]> = If extends boolean
  ? If extends true
    ? ThenOf<S, Root, F>
    : ElseOf<S, Root, F>
  : Exclude<keyof If, NonKindKeys> extends never
    ? ThenOf<S, Root, F> // always-true `if`: only the then branch asserts
    : Conj<FromJsonSchemaIn<If, Root, F>, ThenOf<S, Root, F>> | Conj<NegationOf<If, Root, F>, ElseOf<S, Root, F>>;

// dependent*: per entry key K, (K present ∧ consequence) ∨ (K absent).
// "K present" is `{[K]: unknown}` — intersecting it with the base object
// translation upgrades an optional declared property to required without
// changing its type; "K absent" is `{[K]?: never}`. Entries fold through
// Conj one key at a time (keys of a literal map, recursed via the accumulator
// tuple to stay off the union-to-tuple machinery).
// Both keywords are OBJECT-scoped: 2020-12 kind relevance leaves every
// non-object instance unconstrained by them, so each arm set spans the other
// five kinds too (without them `{dependentRequired: {…}}` rejects `12`). The
// object arms carry the open record for the same reason ObjectArmFrom does —
// they are union arms, and the trigger-absent arm in particular must not
// reject an object merely for holding unrelated keys.
type NonObjectDomain = null | boolean | number | string | unknown[];
type DepRequiredArm<K extends PropertyKey, Reqs> =
  | NonObjectDomain
  | (Record<string, unknown> & {[P in K]: PresentValue} & {
      [R in Extract<Reqs extends readonly unknown[] ? Reqs[number] : never, PropertyKey>]: PresentValue;
    })
  | (Record<string, unknown> & {[P in K]?: never});
type DepSchemaArm<K extends PropertyKey, B, Root, F extends [unknown]> =
  | NonObjectDomain
  | Conj<Record<string, unknown> & {[P in K]: PresentValue}, FromJsonSchemaIn<B, Root, F>>
  | (Record<string, unknown> & {[P in K]?: never});
type DepRequiredFold<D, Ks, Root, F extends [unknown]> = Ks extends readonly [infer K extends PropertyKey, ...infer Rest]
  ? Conj<K extends keyof D ? DepRequiredArm<K, D[K]> : unknown, DepRequiredFold<D, Rest, Root, F>>
  : unknown;
type DepSchemasFold<D, Ks, Root, F extends [unknown]> = Ks extends readonly [infer K extends PropertyKey, ...infer Rest]
  ? Conj<K extends keyof D ? DepSchemaArm<K, D[K], Root, F> : unknown, DepSchemasFold<D, Rest, Root, F>>
  : unknown;
// Literal map keys as a tuple, via the same arm-by-arm recursion style the
// engine already uses (bounded by the map's size, deterministic order not
// required — Conj is commutative).
type KeysToTuple<D, Acc extends readonly PropertyKey[] = []> = [keyof D] extends [never] ? Acc : KeysToTupleStep<D, Acc>;
type KeysToTupleStep<D, Acc extends readonly PropertyKey[]> =
  PickOneKey<D> extends infer K extends PropertyKey ? KeysToTuple<Omit<D, K>, readonly [...Acc, K]> : Acc;
type PickOneKey<D> = LastOfUnion<keyof D>;
type UnionToIntersectionFn<U> = (U extends unknown ? (x: () => U) => void : never) extends (x: infer I) => void ? I : never;
type LastOfUnion<U> = UnionToIntersectionFn<U> extends () => infer Last ? Last : never;

// The Root-threaded engine, layered: conditional applicators and property
// dependencies conjoin (via Conj) onto the negation layer, which peels a
// `not` keyword into the six-arm NAME-SET union above; the CORE is the
// keyword ladder proper. `not: true` accepts nothing (`never`); `not: false`
// is a no-op; `not: {}`/annotations-only accepts nothing. Nested `not`s
// recurse through the same entry. An outer schema carrying value-scoped
// keywords keeps its CORE translation and takes the sentinel directly (its
// arms are literal / combinator shapes, not kind gates).
type FromJsonSchemaIn<S, Root, F extends [unknown]> = S extends {if: infer If}
  ? Conj<DepLayer<S, Root, F>, IteFrom<If, S, Root, F>>
  : DepLayer<S, Root, F>;
type DepLayer<S, Root, F extends [unknown]> = S extends {dependentRequired: infer D}
  ? Conj<DepSchemasLayer<S, Root, F>, DepRequiredFold<D, KeysToTuple<D>, Root, F>>
  : DepSchemasLayer<S, Root, F>;
type DepSchemasLayer<S, Root, F extends [unknown]> = S extends {dependentSchemas: infer D}
  ? Conj<NotLayer<S, Root, F>, DepSchemasFold<D, KeysToTuple<D>, Root, F>>
  : NotLayer<S, Root, F>;
type NotLayer<S, Root, F extends [unknown]> = S extends {not: infer NS}
  ? NS extends boolean
    ? NS extends true
      ? never
      : FromJsonSchemaCore<S, Root, F>
    : Exclude<keyof NS, NonKindKeys> extends never
      ? never // `not: {}` (or annotations-only): the subschema accepts everything, so its negation accepts nothing
      : Extract<keyof S, CoreValueKeys> extends never
        ? NotApplied<S, NS, Root, F>
        : Extract<keyof S, LazyCoreKeys> extends never
          ? DistributeNot<FromJsonSchemaCore<S, Root, F>, NS, Root, F>
          : // A $ref / combinator sits beside `not`: the core may hold a lazily
            // tied fixpoint, and ANY probe of it (distribution included) blows
            // the instantiation depth — attach the sentinel verbatim instead.
            FromJsonSchemaCore<S, Root, F> & NotSlot<FromJsonSchemaIn<NS, Root, F>>
  : FromJsonSchemaCore<S, Root, F>;
// The keywords whose CORE translation asserts across kinds (if/dependent* are
// owned by the layers above, so their presence must not reroute the `not`).
type CoreValueKeys = 'enum' | 'const' | 'anyOf' | 'oneOf' | 'allOf' | '$ref' | '$dynamicRef';
type LazyCoreKeys = 'anyOf' | 'oneOf' | 'allOf' | '$ref' | '$dynamicRef';
// const / enum beside `not`: the core is a finite literal union — distribute
// the sentinel over its arms; null and boolean literals cannot carry it and
// take their AcceptsLit verdict instead (exactly the NotApplied rule).
type DistributeNot<T, NS, Root, F extends [unknown]> = DistributeNotV<
  T,
  NS,
  Root,
  F,
  [null] extends [T] ? AcceptsLit<null, NS, Root, StartFuel> : 'n',
  [true] extends [T] ? AcceptsLit<true, NS, Root, StartFuel> : 'n',
  [false] extends [T] ? AcceptsLit<false, NS, Root, StartFuel> : 'n'
>;
type DistributeNotV<T, NS, Root, F extends [unknown], NV extends Verdict, TV extends Verdict, FV extends Verdict> = 'u' extends
  | NV
  | TV
  | FV
  ? never
  : T extends null
    ? NV extends 'n'
      ? T
      : never
    : T extends true
      ? TV extends 'n'
        ? T
        : never
      : T extends false
        ? FV extends 'n'
          ? T
          : never
        : T extends unknown
          ? T & NotSlot<FromJsonSchemaIn<NS, Root, F>>
          : never;

// The CORE is a CONJUNCTION of independent keyword parts — 2020-12 evaluates
// every keyword present, so sibling keywords beside `$ref` / combinators /
// `const` / `enum` apply too (they used to be silently unconsulted). A part
// whose keyword is absent contributes `unknown`, and Conj's shortcuts return
// the other side VERBATIM — a pure single-keyword schema keeps the exact
// type (and structural id) it always had. `$ref: '#'` re-enters the root
// through the fixpoint tuple (`F[0]` — see the RECURSION note at the top of
// the file); `#/$defs/<name>` resolves a root-level definition (either may
// be recursive); an unknown definition name resolves `never`, surfacing as
// an impossible type at the call site rather than silently widening.
type FromJsonSchemaCore<S, Root, F extends [unknown]> = S extends true
  ? unknown
  : S extends false
    ? never
    : S extends {$ref: string}
      ? HasRefSiblings<S> extends true
        ? ConjWithRef<RefPart<S, Root, F>, RefSiblingParts<S, Root, F>>
        : RefPart<S, Root, F> // pure $ref: returned VERBATIM — any comparison of F[0] would force the lazy fixpoint (TS2589)
      : S extends {$dynamicRef: string}
        ? HasDynRefSiblings<S> extends true
          ? ConjWithRef<DynRefPart<S, Root, F>, RefSiblingParts<S, Root, F>>
          : DynRefPart<S, Root, F> // same verbatim laziness as $ref
        : NonRefParts<S, Root, F>;
type HasRefSiblings<S> = Exclude<keyof S, '$ref' | '$defs' | NonKindKeys> extends never ? false : true;
type HasDynRefSiblings<S> = Exclude<keyof S, '$dynamicRef' | '$defs' | NonKindKeys> extends never ? false : true;
// Sibling'd $ref: distribute the (concrete) sibling side only — the ref side
// joins each arm as a plain intersection member, never probed by an
// `extends`, so recursion through `#` stays lazy. No pair-pruning against
// the ref target (that would force it); the Go collapse merges same-family
// brands and the schemas that combine a ref with siblings are precise in
// practice.
type ConjWithRef<RefT, Other> = [unknown] extends [Other] ? RefT : Other extends unknown ? RefT & Other : never;
// The sibling translation BESIDE a $ref uses the constrained families only —
// a plain-kind arm (boolean / null / bare array / bare record) would
// intersect with the unprobeable ref target as an unreducible junk member
// that validates as the bare base. The ref target carries the kind; the
// siblings only narrow it. (A ref-object with, say, numeric siblings is a
// provably-empty schema per spec; that authoring contradiction is the one
// corner this trades away.)
type ConstrainedFamiliesFrom<S, Root, F extends [unknown]> =
  | (Extract<keyof S, StringFamilyKeys> extends never ? never : StringFrom<S>)
  | (Extract<keyof S, NumberFamilyKeys> extends never ? never : NumberFrom<S>)
  | (Extract<keyof S, ArrayFamilyKeys> extends never ? never : ArrayFrom<S, Root, F>)
  | (Extract<keyof S, ObjectFamilyKeys> extends never ? never : ObjectFrom<S, Root, F>);
type RefKindPart<S, Root, F extends [unknown]> = S extends {type: unknown}
  ? KindPart<S, Root, F>
  : [ConstrainedFamiliesFrom<S, Root, F>] extends [never]
    ? unknown
    : ConstrainedFamiliesFrom<S, Root, F>;
type RefSiblingParts<S, Root, F extends [unknown]> = Conj<
  AnyOfPart<S, Root, F>,
  Conj<OneOfPart<S, Root, F>, Conj<AllOfPart<S, Root, F>, Conj<ConstPart<S>, Conj<EnumPart<S>, RefKindPart<S, Root, F>>>>>
>;
// A oneOf-bearing schema routes through OneOfPart ALONE — it has already
// conjoined every other Core part into each branch, and conjoining them a
// second time out here would wrap the sentinel'd union in exactly the
// intersection the pushing exists to avoid.
type NonRefParts<S, Root, F extends [unknown]> = S extends {oneOf: unknown}
  ? OneOfPart<S, Root, F>
  : Conj<AnyOfPart<S, Root, F>, CombinatorTail<S, Root, F>>;
type CombinatorTail<S, Root, F extends [unknown]> = Conj<AllOfPart<S, Root, F>, LiteralTail<S, Root, F>>;
type LiteralTail<S, Root, F extends [unknown]> = Conj<ConstPart<S>, Conj<EnumPart<S>, KindPart<S, Root, F>>>;
// A `$ref` is a URI-reference, resolved in three steps:
//   1. BASE — a ref that repeats the root's own `$id` names the SAME document
//      (`urn:uuid:…` and `urn:uuid:…#/$defs/bar` both land back here), so the
//      base is stripped and whatever follows `#` is an ordinary fragment;
//   2. FRAGMENT — empty (the root itself), `#name` (an anchor), or `#/…` (a
//      JSON Pointer);
//   3. POINTER — split on `/` FIRST, then decode each token (RFC 3986
//      percent-decoding, then RFC 6901's `~1`/`~0`), then walk the document.
//      Splitting before decoding is what makes a `%2F` inside a member name a
//      literal slash instead of a separator.
// The walk is over the document, so `#/properties/foo` and `#/prefixItems/0`
// reach exactly as `#/$defs/<name>` does; an unresolvable same-document target
// lands on `never` (an impossible type at the call site, never a silent
// widening). A ref naming ANOTHER document stays `unknown` — cross-document
// resolution is out of scope by design, since the fetch would sit inside
// type-checking.
// The two shapes that carry real-world traffic (`#` and a plain
// `#/$defs/<name>`) resolve on the same two probes they always did; only a ref
// those miss pays for the general walk (an escaped or empty token, a pointer
// outside `$defs`, an absolute base).
type RefPart<S, Root, F extends [unknown]> = S extends {$ref: '#'}
  ? F[0]
  : S extends {$ref: `#/$defs/${infer Name}`}
    ? Root extends {$defs: infer Defs}
      ? Name extends keyof Defs
        ? FromJsonSchemaIn<Defs[Name], Root, F>
        : // Not a key as written: only an ESCAPE or an extra separator can still
          // make it one, and a plain missing name stays `never` for the price of
          // one probe.
          Name extends `${string}${'~' | '%' | '/'}${string}`
          ? PointerTargetFrom<`$defs/${Name}`, Root, F>
          : never
      : never
    : S extends {$ref: `#/${infer Pointer}`}
      ? PointerTargetFrom<Pointer, Root, F>
      : S extends {$ref: `#${infer Anchor}`}
        ? AnchorFrom<Anchor, Root, F>
        : RebasedRefFrom<S, Root, F>;
// An absolute base (`urn:uuid:…`, or any other `$id` spelling) naming the
// document we are already in: strip it and treat the rest as an ordinary
// fragment. Anything else names ANOTHER document and stays `unknown` —
// cross-document resolution is out of scope by design, since the fetch would
// sit inside type-checking.
type RebasedRefFrom<S, Root, F extends [unknown]> = S extends {$ref: infer Ref extends string}
  ? Root extends {$id: infer Id extends string}
    ? // Both sides must be LITERAL before the base can be compared. tsc forces
      // this alias with deferred parameters (the builder's overload
      // compatibility check), and there `Ref extends Id` is `string extends
      // string` — true, which would reach for the root fixpoint and blow the
      // instantiation depth (TS2589, the hazard the RECURSION note opens with).
      string extends Id
      ? unknown
      : string extends Ref
        ? unknown
        : Ref extends Id
          ? F[0]
          : Ref extends `${Id}#${infer Fragment}`
            ? FragmentTargetFrom<Fragment, Root, F>
            : unknown
    : unknown
  : unknown;
type FragmentTargetFrom<Fragment extends string, Root, F extends [unknown]> = Fragment extends ''
  ? F[0]
  : Fragment extends `/${infer Pointer}`
    ? PointerTargetFrom<Pointer, Root, F>
    : AnchorFrom<Fragment, Root, F>;
// The pointer target keeps the ORIGINAL Root for its own translation — a `$ref`
// inside the target still resolves against the whole document, not against the
// node the walk stopped on. An unresolved step yields `never`, which
// FromJsonSchemaIn distributes straight through, so no probe is needed.
type PointerTargetFrom<Pointer extends string, Root, F extends [unknown]> = FromJsonSchemaIn<PointerNode<Pointer, Root>, Root, F>;
// One probe decides whether ANY token can need decoding, so the ordinary
// `#/$defs/<name>` pointer walks raw and never pays the decoder.
// The LITERAL guard is load-bearing, not defensive. tsc forces this ladder with
// DEFERRED parameters while checking the builder's overload against its
// implementation, and there every `extends` on a string keeps BOTH branches, so
// the token walk would recurse on fresh `infer` variables until the
// instantiation wall (TS2589 — the hazard the RECURSION note at the top of this
// file opens with). A non-literal pointer resolves nothing, so `never` is also
// the honest answer.
type PointerNode<Pointer extends string, Cursor> = string extends Pointer
  ? never
  : Pointer extends `${string}${'~' | '%'}${string}`
    ? DecodedPointerNode<Pointer, Cursor>
    : RawPointerNode<Pointer, Cursor>;
type RawPointerNode<Pointer extends string, Cursor> = Pointer extends `${infer Token}/${infer Rest}`
  ? RawPointerNode<Rest, StepInto<Token, Cursor>>
  : StepInto<Pointer, Cursor>;
type DecodedPointerNode<Pointer extends string, Cursor> = Pointer extends `${infer Token}/${infer Rest}`
  ? DecodedPointerNode<Rest, StepInto<DecodePointerToken<Token>, Cursor>>
  : StepInto<DecodePointerToken<Pointer>, Cursor>;
type StepInto<Token extends string, Cursor> = [Cursor] extends [never]
  ? never
  : Token extends keyof Cursor
    ? Cursor[Token]
    : never;
// `~1` before `~0`, or `~01` would decode to `/` instead of the `~1` RFC 6901
// says it must become.
type DecodePointerToken<Token extends string> = ReplaceAll<ReplaceAll<PercentDecode<Token>, '~1', '/'>, '~0', '~'>;
type ReplaceAll<S extends string, From extends string, To extends string> = S extends `${infer Head}${From}${infer Tail}`
  ? `${Head}${To}${ReplaceAll<Tail, From, To>}`
  : S;
// A token with no `%` exits on the first conditional, so an ordinary ref pays
// two probes and no walk. An escape outside the table (a multi-byte UTF-8
// sequence, which no type-level decoder can reassemble) is left verbatim, so
// the ref simply fails to resolve rather than resolving to the wrong node.
type PercentDecode<S extends string> = S extends `${infer Head}%${infer Rest}`
  ? Rest extends `${infer High}${infer Low}${infer Tail}`
    ? Uppercase<`${High}${Low}`> extends infer Hex extends keyof PercentEscapes
      ? `${Head}${PercentEscapes[Hex]}${PercentDecode<Tail>}`
      : `${Head}%${PercentDecode<Rest>}`
    : S
  : S;
// The ASCII characters a fragment has to percent-encode, plus the reserved ones
// a member name may legitimately carry.
interface PercentEscapes {
  '20': ' ';
  '21': '!';
  '22': '"';
  '23': '#';
  '24': '$';
  '25': '%';
  '26': '&';
  '27': "'";
  '28': '(';
  '29': ')';
  '2A': '*';
  '2B': '+';
  '2C': ',';
  '2D': '-';
  '2E': '.';
  '2F': '/';
  '3A': ':';
  '3B': ';';
  '3C': '<';
  '3D': '=';
  '3E': '>';
  '3F': '?';
  '40': '@';
  '5B': '[';
  '5C': '\\';
  '5D': ']';
  '5E': '^';
  '5F': '_';
  '60': '`';
  '7B': '{';
  '7C': '|';
  '7D': '}';
  '7E': '~';
}
// `$ref: '#name'` resolves a same-document `$anchor` (a `$dynamicAnchor`
// also registers as a plain anchor per 2020-12). `$dynamicRef` resolves the
// same table statically — in a single schema resource the dynamic scope has
// exactly one candidate, so the late-bound semantics collapse to a plain
// lookup. An unknown anchor name resolves `never`, like an unknown $defs
// name. The ROOT carrying the anchor re-enters through the fixpoint tuple.
type AnchorFrom<Name extends string, Root, F extends [unknown]> = Root extends {$anchor: Name}
  ? F[0]
  : Root extends {$dynamicAnchor: Name}
    ? F[0]
    : Root extends {$defs: infer D}
      ? AnchorScan<Name, D, KeysToTuple<D>, Root, F>
      : never;
type AnchorScan<Name extends string, D, Ks, Root, F extends [unknown]> = Ks extends readonly [
  infer K extends PropertyKey,
  ...infer Rest,
]
  ? K extends keyof D
    ? D[K] extends {$anchor: Name}
      ? FromJsonSchemaIn<D[K], Root, F>
      : D[K] extends {$dynamicAnchor: Name}
        ? FromJsonSchemaIn<D[K], Root, F>
        : AnchorScan<Name, D, Rest, Root, F>
    : AnchorScan<Name, D, Rest, Root, F>
  : never;
// $dynamicRef rides the same lazy discipline as $ref (never probed).
type DynRefPart<S, Root, F extends [unknown]> = S extends {$dynamicRef: '#'}
  ? F[0]
  : S extends {$dynamicRef: `#${infer Name}`}
    ? AnchorFrom<Name, Root, F>
    : unknown;
type AnyOfPart<S, Root, F extends [unknown]> = S extends {anyOf: infer M extends readonly JsonSchemaInput[]}
  ? FromAnyOf<M, Root, F>
  : unknown;
// oneOf — EXACTLY-ONE. The branch tuple rides the `__rtOneOf` sentinel so
// exclusivity counts BRANCHES (a branch may itself be a union — flattening
// must not merge it into its siblings); a single branch normalizes to that
// branch (exactly-one of one is the branch itself, a common real-world
// spelling); an empty list accepts nothing.
//
// Constraining siblings split in two. The KIND / LITERAL ones are PUSHED INTO
// every branch: `base ∧ exactly-one-of(B…)` and `exactly-one-of(base ∧ B…)`
// accept the same values, because the base holds for every branch or for none
// and so never changes the match COUNT — and the pushed spelling is the one the
// collapse can classify. The rest stay `never` (loud over silently dropping the
// exclusivity): a second combinator, a reference or a conditional would need a
// conjunction over the sentinel'd union itself, which the collapse cannot read.
// The hard set is what the OUTER layers own (`not` / `if` / `dependent*`
// conjoin onto the whole Core, so they would wrap the sentinel'd union rather
// than ride inside it) plus the references, whose lazily-tied fixpoint Conj
// must never probe. Everything the Core itself asserts — the kind gate, the
// literals, and the other two combinators — is pushable.
type OneOfHardKeys = 'not' | 'if' | 'then' | 'else' | 'dependentSchemas' | 'dependentRequired' | '$ref' | '$dynamicRef';
type OneOfPart<S, Root, F extends [unknown]> = S extends {oneOf: infer M extends readonly JsonSchemaInput[]}
  ? Extract<keyof S, OneOfHardKeys> extends never
    ? OneOfLowered<M, OneOfBase<S, Root, F>, Root, F>
    : never
  : unknown;
// A sibling-LESS oneOf is the overwhelmingly common spelling, so it exits on a
// single key probe: with nothing to push, the base is `unknown` and Conj hands
// each branch back verbatim (keeping that shape's type, and id, unchanged).
type OneOfSiblingKeys =
  | 'type'
  | 'const'
  | 'enum'
  | 'anyOf'
  | 'allOf'
  | StringFamilyKeys
  | NumberFamilyKeys
  | ArrayFamilyKeys
  | ObjectFamilyKeys;
type OneOfBase<S, Root, F extends [unknown]> =
  Extract<keyof S, OneOfSiblingKeys> extends never ? unknown : Conj<AnyOfPart<S, Root, F>, CombinatorTail<S, Root, F>>;
// A sibling-less oneOf has `unknown` for its base (every own keyword is either
// oneOf itself or excluded by TypelessFrom), and Conj returns the branch
// VERBATIM against `unknown` — so that shape keeps the exact type, and id, it
// has always had.
type OneOfLowered<M, Base, Root, F extends [unknown]> = M extends readonly []
  ? never
  : M extends readonly [infer Only extends JsonSchemaInput]
    ? Conj<Base, FromJsonSchemaIn<Only, Root, F>>
    : FromOneOfBranches<M, Base, Root, F> extends infer Branches extends readonly [unknown, unknown, ...unknown[]]
      ? OneOf<Branches>
      : never;
// -readonly: the lowered branch tuple must be TYPE-IDENTICAL to the public
// `OneOf<[…]>` spelling (whose tuple parameter is mutable), so the door hands
// the tuple straight to the imported combinator instead of re-implementing the
// carrier / nullish-dedup walk.
type FromOneOfBranches<M, Base, Root, F extends [unknown]> = {
  -readonly [K in keyof M]: Conj<Base, FromJsonSchemaIn<M[K], Root, F>>;
};
type AllOfPart<S, Root, F extends [unknown]> = S extends {allOf: infer M extends readonly JsonSchemaInput[]}
  ? FromAllOf<M, Root, F>
  : unknown;
type ConstPart<S> = S extends {const: infer C} ? C : unknown;
type EnumPart<S> = S extends {enum: infer E extends readonly unknown[]} ? E[number] : unknown;
type KindPart<S, Root, F extends [unknown]> = S extends {type: infer L extends readonly SchemaTypeName[]}
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
                : TypelessFrom<S, Root, F>;

// 2020-12 evaluates constraint keywords by KIND RELEVANCE: a schema with
// constraints but NO `type` accepts every value whose kind-relevant
// constraints hold — `{pattern: '^a'}` accepts every '^a' string AND every
// non-string. The honest translation is the six-kind union with each arm
// narrowed by its own keywords (this is also what makes a type-less `not`
// subschema negate correctly: ¬((string ∧ P) ∨ non-strings) = string ∧ ¬P).
// A truly bare `{}` — no constraint keywords at all — stays `unknown`, the
// always-true schema, keeping its shipped structural id.
type TypelessFrom<S, Root, F extends [unknown]> =
  Exclude<
    keyof S,
    | NonKindKeys
    // Keywords owned by other layers/parts — their presence alone must not
    // trigger the six-kind union (a pure `$ref` / combinator / conditional
    // schema keeps `unknown` here so Conj's shortcut preserves its type).
    | 'not'
    | 'if'
    | 'dependentRequired'
    | 'dependentSchemas'
    | '$ref'
    | '$defs'
    | 'const'
    | 'enum'
    | 'anyOf'
    | 'oneOf'
    | 'allOf'
  > extends never
    ? unknown
    : StringFrom<S> | NumberFrom<S> | boolean | null | ArrayFrom<S, Root, F> | ObjectArmFrom<S, Root, F>;

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
  formattedArray: 'constraint keywords (uniqueItems/maxItems; minItems spells as a padded tuple)';
  formattedObject: 'constraint keywords (minProperties/maxProperties/additionalProperties: false)';
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

// ───────────────────── keyword lowering contract ─────────────────────────
//
// The other direction of the same anti-drift idea: every keyword this module
// ACCEPTS (`keyof RootJsonSchemaInput`, i.e. the nested vocabulary plus the two
// root-only ones) must say where it lands. There are exactly seven channels,
// and this file is a router between them — it owns no format type of its own,
// so a row naming `format:` or `params:` is naming something imported from
// ../formats. Adding a keyword without a row here breaks the build, which is
// the point: an accepted keyword with no lowering is a constraint silently
// dropped.

type LoweringChannel =
  /** Changes the recovered TypeScript type itself (members, slots, unions, literals). **/
  | 'shape'
  /** Selects a named format brand from ../formats. **/
  | 'format'
  /** Rides a params entry on its kind's params bag. **/
  | 'params'
  /** Rides a sentinel slot the intersection collapse lifts off the base. **/
  | 'slot'
  /** Rewritten into other keywords before lowering. **/
  | 'desugar'
  /** Reference / anchor resolution — the target's own lowering applies. **/
  | 'ref'
  /** Accepted and ignored: it does not constrain the instance. **/
  | 'ignored';

/** One row per accepted keyword: `<channel>: <where it lands>`. Dual-channel
 *  keywords (a value shape that routes two ways) name both, `+`-joined. **/
export type SchemaLoweringByKeyword = {
  type: 'shape: the kind union every other keyword narrows';
  properties: 'shape: object members';
  required: 'shape: member optionality';
  additionalProperties: 'shape+params: index signature (schema form) / FormattedObjectParams.closed (false)';
  items: 'shape: array element or tuple rest';
  prefixItems: 'shape: tuple slots (boolean slots pad or forbid a position)';
  minItems: 'shape: required tuple slots — the padded tuple, never the brand';
  maxItems: 'params: FormattedArrayParams.maxItems';
  uniqueItems: 'params: FormattedArrayParams.uniqueItems';
  minProperties: 'params: FormattedObjectParams.minProperties';
  maxProperties: 'params: FormattedObjectParams.maxProperties';
  contains: 'slot: __rtContains child, via FormattedArrayParams.contains';
  minContains: 'slot: __rtContains rt$min (default 1), via FormattedArrayParams.minContains';
  maxContains: 'slot: __rtContains rt$max, via FormattedArrayParams.maxContains';
  contentEncoding: 'format: Base64 / Base32 / Base16 (the RFC 4648 anchored patterns)';
  contentMediaType: 'params: StringParams.contentMediaType — the parse check on the decoded content';
  patternProperties: 'slot: __rtPatternProps, via FormattedObjectParams.patternProperties';
  propertyNames: 'slot: __rtPropNames, via FormattedObjectParams.propertyNames (false → never key)';
  $anchor: 'ref: declares a #name target';
  $dynamicAnchor: 'ref: declares a #name target (also registers as a plain anchor)';
  $dynamicRef: 'ref: resolves #name statically — one candidate per document';
  unevaluatedProperties: 'params: FormattedObjectParams.closed over the merged applicator set (false); indeterminate scopes resolve never';
  unevaluatedItems: 'params: FormattedArrayParams.maxItems at the longest prefix (false); indeterminate scopes resolve never';
  enum: 'shape: literal union';
  const: 'shape: single literal';
  anyOf: 'shape: plain union (at least one branch)';
  oneOf: 'shape: OneOf<Branches> — the exactly-one combinator';
  allOf: 'shape: intersection, merged by the collapse';
  $defs: 'ref: named targets for #/$defs/<name>';
  $ref: 'ref: resolves # (root fixpoint), #/$defs/<name> and #name';
  format: 'format: the BrandBySchemaFormat row — unrecognised values stay annotations';
  minLength: 'params: StringParams.minLength';
  maxLength: 'params: StringParams.maxLength';
  pattern: 'params: StringParams.pattern — {source, flags: ""}';
  minimum: 'params: NumberParams.minimum, canonicalised to min by the scanner';
  maximum: 'params: NumberParams.maximum, canonicalised to max by the scanner';
  exclusiveMinimum: 'params: NumberParams.exclusiveMinimum, canonicalised to gt by the scanner';
  exclusiveMaximum: 'params: NumberParams.exclusiveMaximum, canonicalised to lt by the scanner';
  multipleOf: 'params: NumberParams.multipleOf';
  not: 'slot: __rtNot — the type also narrows through the kind complement';
  if: 'desugar: (If ∧ Then) ∨ (¬If ∧ Else)';
  then: 'desugar: the if-branch; an annotation without if';
  else: 'desugar: the if-branch; an annotation without if';
  dependentRequired: 'desugar: (has-key ∧ required extras) ∨ ¬has-key, per entry';
  dependentSchemas: 'desugar: (has-key ∧ schema) ∨ ¬has-key, per entry';
  $schema: 'ignored: dialect declaration — 2020-12 is the one accepted value';
  title: 'ignored: annotation';
  description: 'ignored: annotation';
  examples: 'ignored: annotation';
  default: 'ignored: annotation';
  $comment: 'ignored: annotation';
  deprecated: 'ignored: annotation';
  readOnly: 'shape: lifts the member to `readonly` at a property position; a bare annotation anywhere else';
  writeOnly: 'ignored: annotation';
  $id: 'ignored: root-only identity metadata — an EMBEDDED $id is rejected at the key';
  $vocabulary: 'ignored: root-only meta-schema declaration';
};

/** Compiles only while every accepted keyword has a row, every row names an
 *  accepted keyword, and every row opens with a real channel. Exported
 *  (internal, not re-exported from the subpath entry) so declaration emit keeps
 *  the check alive. **/
export type AssertSchemaLoweringTotality = [
  MustBeNever<Exclude<keyof RootJsonSchemaInput, keyof SchemaLoweringByKeyword>>,
  MustBeNever<Exclude<keyof SchemaLoweringByKeyword, keyof RootJsonSchemaInput>>,
  MustBeNever<Exclude<SchemaLoweringByKeyword[keyof SchemaLoweringByKeyword], ChannelPrefixed>>,
];
type ChannelPrefixed = `${LoweringChannel}: ${string}` | `${LoweringChannel}+${LoweringChannel}: ${string}`;
