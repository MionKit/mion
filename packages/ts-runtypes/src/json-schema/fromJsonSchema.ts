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

import type {
  Email,
  UUID,
  StringDate,
  StringTime,
  StringDateTime,
  Domain,
  IPv4,
  IPv6,
  Url,
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
// names; the `pattern` keyword (a bare 2020-12 regex string, always anchored to
// the empty flag set) is rebuilt into the object form the stringFormat brand
// carries. A schema pattern declares NO mockSamples — validation works in
// full, and the build auto-generates a deterministic sample pool from the
// regex so `createMockDataFn` works too (the sidecar-generated pools that
// superseded the original throw-only policy of
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
  // Version-agnostic per 2020-12 — `format: 'uuid'` never pins a version.
  readonly uuid: UUID;
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
    ? Email<LengthParamsFrom<S>>
    : F extends 'hostname'
      ? Domain<LengthParamsFrom<S>>
      : F extends 'uri'
        ? Url<LengthParamsFrom<S>>
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
type ObjectKeywordParams<S> = Flatten<
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
        S extends {unevaluatedProperties: false}
        ? {readonly closed: MergedClosedKeys<S>} & ([MergedPatternSources<S>] extends [readonly []]
            ? unknown
            : {readonly closedPatterns: MergedPatternSources<S>})
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
type UnevalIndeterminateKeys = 'if' | 'dependentSchemas' | 'anyOf' | 'oneOf' | '$ref' | '$dynamicRef';
type UnevalPropsPoison<S> = S extends {unevaluatedProperties: infer U}
  ? [U] extends [true]
    ? false
    : [U] extends [false]
      ? UnevalScopeIndeterminate<S>
      : true
  : false;
type UnevalItemsPoison<S> = S extends {unevaluatedItems: infer U}
  ? [U] extends [true]
    ? false
    : [U] extends [false]
      ? UnevalItemsIndeterminate<S>
      : true
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
type MergedClosedKeys<S> = readonly [...AllowedKeysOf<S>, ...AllOfClosedKeys<AllOfMembersOf<S>>];
type AllOfClosedKeys<M> = M extends readonly [infer H, ...infer R]
  ? readonly [...AllowedKeysOf<H>, ...AllOfClosedKeys<AllOfMembersOf<H>>, ...AllOfClosedKeys<R>]
  : readonly [];
type PatternSourcesOf<S> = S extends {patternProperties: infer P} ? KeysToTuple<P> : readonly [];
type MergedPatternSources<S> = readonly [...PatternSourcesOf<S>, ...AllOfPatternSources<AllOfMembersOf<S>>];
type AllOfPatternSources<M> = M extends readonly [infer H, ...infer R]
  ? readonly [...PatternSourcesOf<H>, ...AllOfPatternSources<AllOfMembersOf<H>>, ...AllOfPatternSources<R>]
  : readonly [];
// unevaluatedItems: false over prefix-only shapes closes the array at the
// LONGEST merged prefix (evaluated indexes are the union of the prefixes);
// any `items` in scope evaluates every index, making it a no-op. An
// explicit sibling maxItems keeps its own bound (skip the contribution).
type UnevalItemsParams<S> = S extends {unevaluatedItems: false}
  ? HasAnyItems<S> extends true
    ? unknown
    : S extends {maxItems: number}
      ? unknown
      : {readonly maxItems: LongestPrefixOf<S>['length'] & number}
  : unknown;
type HasAnyItems<S> = S extends {items: unknown} ? true : AllOfAnyItems<AllOfMembersOf<S>>;
type AllOfAnyItems<M> = M extends readonly [infer H, ...infer R]
  ? H extends {items: unknown}
    ? true
    : AllOfAnyItems<AllOfMembersOf<H>> extends true
      ? true
      : AllOfAnyItems<R>
  : false;
type PrefixTupleOf<S> = S extends {prefixItems: infer P extends readonly unknown[]} ? P : readonly [];
type LongestPrefixOf<S> = LongestFold<AllOfMembersOf<S>, PrefixTupleOf<S>>;
type LongestFold<M, Acc extends readonly unknown[]> = M extends readonly [infer H, ...infer R]
  ? LongestFold<R, Longest2<LongestFold<AllOfMembersOf<H>, PrefixTupleOf<H>>, Acc>>
  : Acc;
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
  ObjectKeywordParams<S> & PatternPropsParam<S, Root, F> & PropNamesParam<S, Root, F>
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
  UnevalPropsPoison<S> extends true
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
    UnevalItemsParams<S> &
    (S extends {contains: infer C} ? {readonly contains: FromJsonSchemaIn<C, Root, F>} : unknown) &
    (S extends {minContains: infer N extends number} ? {readonly minContains: N} : unknown) &
    (S extends {maxContains: infer N extends number} ? {readonly maxContains: N} : unknown)
>;
// Fast path: an array with none of the structural keywords is just its tuple/
// array shape (no brand, no contains slot) — so it never pays the FormattedArray
// wrapper, keeping the common `{type: 'array', items: …}` case cheap.
type ArrayKeywordKeys = 'uniqueItems' | 'maxItems' | 'contains' | 'minContains' | 'maxContains' | 'unevaluatedItems';
type ArrayFrom<S, Root, F extends [unknown]> =
  UnevalItemsPoison<S> extends true
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
type FromAllOfRec<M, Root, F extends [unknown]> = M extends readonly [infer Head, ...infer Tail]
  ? FromJsonSchemaIn<Head, Root, F> & FromAllOfRec<Tail, Root, F>
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
          : GateArmFrom<K, S, Root, F> & {readonly __rtNot?: NotChildFor<K, NS, Root, F>}
        : GateArmFrom<K, S, Root, F>
      : Extract<keyof NS, ValueScopedKeys> extends never
        ? K extends NSFamilyNamesOf<NS>
          ? GateArmFrom<K, S, Root, F> & {readonly __rtNot?: NotChildFor<K, NS, Root, F>}
          : never
        : GateArmFrom<K, S, Root, F> & {readonly __rtNot?: FromJsonSchemaIn<NS, Root, F>}
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
type DepRequiredArm<K extends PropertyKey, Reqs> =
  | ({[P in K]: PresentValue} & {
      [R in Extract<Reqs extends readonly unknown[] ? Reqs[number] : never, PropertyKey>]: PresentValue;
    })
  | {[P in K]?: never};
type DepSchemaArm<K extends PropertyKey, B, Root, F extends [unknown]> =
  | Conj<{[P in K]: PresentValue}, FromJsonSchemaIn<B, Root, F>>
  | {[P in K]?: never};
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
            FromJsonSchemaCore<S, Root, F> & {readonly __rtNot?: FromJsonSchemaIn<NS, Root, F>}
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
          ? T & {readonly __rtNot?: FromJsonSchemaIn<NS, Root, F>}
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
type NonRefParts<S, Root, F extends [unknown]> = Conj<AnyOfPart<S, Root, F>, CombinatorTail<S, Root, F>>;
type CombinatorTail<S, Root, F extends [unknown]> = Conj<
  OneOfPart<S, Root, F>,
  Conj<AllOfPart<S, Root, F>, LiteralTail<S, Root, F>>
>;
type LiteralTail<S, Root, F extends [unknown]> = Conj<ConstPart<S>, Conj<EnumPart<S>, KindPart<S, Root, F>>>;
type RefPart<S, Root, F extends [unknown]> = S extends {$ref: '#'}
  ? F[0]
  : S extends {$ref: `#/$defs/${infer Name}`}
    ? Root extends {$defs: infer D}
      ? Name extends keyof D
        ? FromJsonSchemaIn<D[Name], Root, F>
        : never
      : never
    : S extends {$ref: `#${infer Name}`}
      ? AnchorFrom<Name, Root, F>
      : unknown;
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
// spelling); an empty list accepts nothing. Constraining siblings (a type
// gate, a second combinator, family keywords, a reference) would need a
// conjunction over a union that the collapse cannot classify, so they
// resolve `never` — loud over silently dropping the exclusivity; push the
// shared constraint into every branch instead.
type OneOfConflictKeys =
  | 'type'
  | 'const'
  | 'enum'
  | 'anyOf'
  | 'allOf'
  | 'not'
  | 'if'
  | 'then'
  | 'else'
  | 'dependentSchemas'
  | 'dependentRequired'
  | '$ref'
  | '$dynamicRef'
  | StringFamilyKeys
  | NumberFamilyKeys
  | ArrayFamilyKeys
  | ObjectFamilyKeys;
type OneOfPart<S, Root, F extends [unknown]> = S extends {oneOf: infer M extends readonly JsonSchemaInput[]}
  ? Extract<keyof S, OneOfConflictKeys> extends never
    ? M extends readonly []
      ? never
      : M extends readonly [infer Only extends JsonSchemaInput]
        ? FromJsonSchemaIn<Only, Root, F>
        : FromOneOfBranches<M, Root, F> extends infer Branches extends readonly [unknown, unknown, ...unknown[]]
          ? {[K in keyof Branches]: OneOfArmFrom<Branches[K], Branches>}[number]
          : never
    : never
  : unknown;
// -readonly: the branch tuple must be TYPE-IDENTICAL to the OneOf<[…]>
// spelling (whose tuple parameter is mutable), not merely id-convergent.
type FromOneOfBranches<M, Root, F extends [unknown]> = {-readonly [K in keyof M]: FromJsonSchemaIn<M[K], Root, F>};
// The OneOf carrier spelling (the schema-door twin of the public
// OneOf<[…]> — keep the two in lockstep): one shallow mapped type + one
// indexed access, O(1) instantiation depth at any width. Every non-nullish
// member carries the branch tuple on an OPTIONAL sentinel prop, so
// consumption keeps plain-union DX. The NAKED parameter makes the nullish
// check distributive: a branch that is itself `A | null` keeps its null
// plain instead of dying in an intersection. A DUPLICATED nullish branch
// resolves never (a null matches every branch spelling it, so it can never
// win exactly-one) — without this the all-nullish degenerate
// (`oneOf: [{type: 'null'}, {type: 'null'}]`) carried no sentinel and
// silently accepted null. The branch tuple keeps the duplicates, so
// runtime counting stays branch-accurate in the mixed case.
type OneOfArmFrom<Arm, All extends readonly unknown[]> = Arm extends null | undefined
  ? OneOfNullishDupFrom<Arm, All> extends true
    ? never
    : Arm
  : Arm & {readonly __rtOneOf?: All};
// Twin of static.ts's OneOfNullishDup (the extract region stays
// self-contained). Mutual-extends equality is exact for the pure null /
// undefined branches this guards; only a nullish arm instantiates the walk.
type OneOfNullishDupFrom<V, All extends readonly unknown[]> = All extends readonly [infer Head, ...infer Tail]
  ? [V] extends [Head]
    ? [Head] extends [V]
      ? OneOfNullishAgainFrom<V, Tail>
      : OneOfNullishDupFrom<V, Tail>
    : OneOfNullishDupFrom<V, Tail>
  : false;
type OneOfNullishAgainFrom<V, Rest> = Rest extends readonly [infer Head, ...infer Tail]
  ? [V] extends [Head]
    ? [Head] extends [V]
      ? true
      : OneOfNullishAgainFrom<V, Tail>
    : OneOfNullishAgainFrom<V, Tail>
  : false;
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
    : StringFrom<S> | NumberFrom<S> | boolean | null | ArrayFrom<S, Root, F> | ObjectFrom<S, Root, F>;

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
  jsonContent: 'contentMediaType: application/json (optionally behind contentEncoding: base64)';
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
