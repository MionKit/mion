import type {
  __rtFormatName,
  __rtFormatParams,
  __rtFormatBrand,
  __rtNot,
  __rtContains,
  __rtPatternProps,
  __rtPropNames,
  __rtOneOf,
  __rtUnevaluated,
} from './sentinelKeys.ts';

/* ########
 * 2024 ma-jerez
 * Author: Ma-jerez
 * License: UNLICENSED - proprietary, see LICENSE
 * The software is provided "as is", without warranty of any kind.
 * ######## */

/** `StripRunTypeMeta<T>` — the ANNOTATION-grade projection of a type: every
 *  RunTypes sentinel (format brands, negation / contains / patternProperties /
 *  propertyNames / oneOf / unevaluated slots) is removed and the plain data
 *  shape survives. `Email` collapses to `string`, a `FormattedArray<number[],…>`
 *  to `number[]`, an object drops its sentinel-symbol keys and recurses its
 *  members. Use it where a CLEAN TypeScript type is the deliverable — editor
 *  hovers, generated documentation, assignability gates over external data.
 *
 *  ⚠️ NEVER REFLECT the stripped type. The metadata IS the validation
 *  contract: `createValidateFn<StripRunTypeMeta<T>>()` builds a validator with
 *  every constraint deleted, silently. `DataOnly<T>` is the reflection-safe
 *  projection (it KEEPS the sentinels for exactly this reason); this type is
 *  its never-reflected annotation twin. The same applies to `JsonSchemaType`.
 *
 *  Documented residuals and lossy edges:
 *   - branded TUPLES are RECOVERED (`FormattedArray<[boolean?, boolean?], …>`
 *     strips to `[boolean?, boolean?]`, elements included) by the same
 *     inference-based subtraction the literals use — element inference, which
 *     the plain-array arm can rely on, would collapse the slot structure, so
 *     the tuple path subtracts the brand and then recurses normally;
 *   - branded STRING / NUMERIC literals are RECOVERED (`'yes' & Brand` strips
 *     to `'yes'`) through the inference-based subtraction in
 *     StripMetaUnbrandLit below, and widen to their base primitive only when
 *     that subtraction cannot clear the sentinels. No type OPERATOR subtracts
 *     an intersection — template construction, template inference and
 *     mapped-key normalisation were all tried and none reduces over one — but
 *     inference does, which is what the helper exploits. Branded BOOLEAN
 *     literals take the older route: two extends-tests recover them;
 *   - an index signature beside named properties widens its value to
 *     `unknown` (see StripMetaObject) so every valid value assigns;
 *   - a REQUIRED nominal brand (`__rtFormatBrand`) collapses with its format,
 *     so the stripped type is assignable FROM the branded one but not back —
 *     wide (optional-sentinel) brands stay mutually assignable;
 *   - Temporal formats (their base classes live behind the opt-in temporal
 *     subpath, which this core module cannot name), `Map`/`Set`/`RegExp` and
 *     function shapes pass through untouched.
 *
 *  The any-JSON domain — what an unconstrained schema position denotes — is
 *  canonicalised to the exported `JsonValue` alias wherever it appears, so a
 *  hover reads one name instead of the six-arm union it stands for.
 *
 *  The `#region stripmeta-extract` block is sliced VERBATIM by
 *  test/types/stripMetaHarness.ts into the per-branch budget test — keep it
 *  self-contained (lib types + its own declarations only). **/

// #region stripmeta-extract — StripRunTypeMeta machinery; sliced verbatim
// between these markers by test/types/stripMetaHarness.ts.

/** Every sentinel key the RunTypes encodings ride — the full set from
 *  sentinelKeys.ts, including the nominal brand key. **/
type StripMetaSentinelKeys =
  | typeof __rtFormatName
  | typeof __rtFormatParams
  | typeof __rtFormatBrand
  | typeof __rtNot
  | typeof __rtContains
  | typeof __rtPatternProps
  | typeof __rtPropNames
  | typeof __rtOneOf
  | typeof __rtUnevaluated;

/** Recursion-budget decrement — same discipline as `DataOnly`: bounded depth
 *  lets circular types resolve finitely, and the floor keeps the remaining
 *  sub-tree verbatim (best effort) instead of tripping TS2589. **/
type _StripMetaDepth = [never, 0, 1, 2, 3, 4, 5, 6, 7, 8];

/** Any JSON value — the domain of a schema that constrains no type. The array
 *  and object arms are deliberately LOOSE (`unknown[]`, not `JsonValue[]`):
 *  this alias exists so the many places that recover "any JSON value" (a bare
 *  `pattern`, a lone `minimum`, an unconstrained `contains`) display one
 *  readable name instead of a six-arm anonymous union, and the loose arms are
 *  exactly the shape those recoveries produce, which is what lets the
 *  canonicalisation below recognise them. **/
export type JsonValue = string | number | boolean | unknown[] | {[key: string]: unknown} | null;

/** True when some union arm of T is an OBJECT with declared literal keys — a
 *  structured alternative (a dependent-schema case split, an anyOf branch).
 *  Such a union may be VALUE-equivalent to the any-JSON domain and still be
 *  worth displaying: the arms are the documentation. Primitives are excluded
 *  FIRST — a branded string arm is `string & {…}`, which `extends object`,
 *  and its apparent keys (`length`, …) would read as structure. Arrays are
 *  not structured either (same apparent-key reason). **/
type StripMetaHasStructuredArm<T> = true extends (
  T extends string | number | bigint | boolean | null | undefined
    ? false
    : T extends readonly unknown[]
      ? false
      : T extends object
        ? StripMetaNoNamedKeys<T> extends true
          ? false
          : true
        : false
)
  ? true
  : false;

/** The sentinel-carrying constituents of `T`, rebuilt ONE PER CONSTITUENT.
 *  TypeScript's intersection subtraction lives in INFERENCE, not in any type
 *  operator: when an inference target is an intersection, the checker matches
 *  its constituents pairwise against the SOURCE's under type IDENTITY, deletes
 *  the matched pairs from both sides, and infers what remains into the naked
 *  `infer U` (checker `inferFromMatchingTypes`; tsgo ports it verbatim in
 *  internal/checker/inference.go, so both compilers agree).
 *
 *  Identity is why the residual must be spelled the way the ENCODINGS spell
 *  it — TypeFormat's two keys as ONE object (adaptively, so a one-key
 *  hand-written brand matches too), and every slot sentinel as its own.
 *  Merging them into a single object is identical to none of them and
 *  silently subtracts nothing.
 *
 *  ⚠️ Adding a new sentinel that can ride a PRIMITIVE base means adding its
 *  part here, or its literals quietly start widening again. **/
type StripMetaFmtPart<T> = typeof __rtFormatName extends keyof T
  ? typeof __rtFormatParams extends keyof T
    ? {
        readonly [__rtFormatName]?: T[typeof __rtFormatName & keyof T];
        readonly [__rtFormatParams]?: T[typeof __rtFormatParams & keyof T];
      }
    : {readonly [__rtFormatName]?: T[typeof __rtFormatName & keyof T]}
  : unknown;
type StripMetaNotPart<T> = typeof __rtNot extends keyof T ? {readonly [__rtNot]?: T[typeof __rtNot & keyof T]} : unknown;
type StripMetaOneOfPart<T> = typeof __rtOneOf extends keyof T ? {readonly [__rtOneOf]?: T[typeof __rtOneOf & keyof T]} : unknown;
// The STRUCTURAL slots (formats/structural.ts). They ride array / object bases
// only, so the literal path never pays for them — only the branded-tuple path
// below models them.
type StripMetaContainsPart<T> = typeof __rtContains extends keyof T
  ? {readonly [__rtContains]?: T[typeof __rtContains & keyof T]}
  : unknown;
type StripMetaPatternPropsPart<T> = typeof __rtPatternProps extends keyof T
  ? {readonly [__rtPatternProps]?: T[typeof __rtPatternProps & keyof T]}
  : unknown;
type StripMetaPropNamesPart<T> = typeof __rtPropNames extends keyof T
  ? {readonly [__rtPropNames]?: T[typeof __rtPropNames & keyof T]}
  : unknown;
type StripMetaUnevaluatedPart<T> = typeof __rtUnevaluated extends keyof T
  ? {readonly [__rtUnevaluated]?: T[typeof __rtUnevaluated & keyof T]}
  : unknown;

/** A branded literal → its bare literal, or `Base` when the subtraction did
 *  not fully clear. The `keyof U` re-check is the safety net: an unmatched
 *  constituent leaves `U` as `T` verbatim, which still carries its sentinels
 *  and so widens exactly as it did before this helper existed — degradation,
 *  never a wrong answer.
 *
 *  `__rtContains` / `__rtPatternProps` / `__rtPropNames` / `__rtUnevaluated`
 *  are deliberately not modelled: they ride array / object bases only, so a
 *  literal never carries one, and anything that somehow does trips the
 *  re-check. `__rtFormatBrand` never reaches here — the required-nominal-brand
 *  arm returns `Base` before this is consulted. **/
type StripMetaUnbrandLit<T, Base> = T extends (infer U) & StripMetaFmtPart<T> & StripMetaNotPart<T> & StripMetaOneOfPart<T>
  ? [Extract<keyof U, StripMetaSentinelKeys>] extends [never]
    ? U
    : Base
  : Base;

/** A branded TUPLE → the bare tuple, elements stripped; `T` verbatim when the
 *  subtraction did not fully clear. Same mechanism as StripMetaUnbrandLit, with
 *  the four STRUCTURAL slots modelled too: an array brand is
 *  `Base & StructuralBrand<'formattedArray', …> & ContainsSlot & UnevaluatedSlot`
 *  (formats/structural.ts), so leaving any of them out would match nothing and
 *  subtract nothing.
 *
 *  This is why a tuple gets its own path instead of the element-inference the
 *  plain-array arm uses: `T extends readonly (infer E)[]` collapses the slots to
 *  a single element type and destroys the very structure the hover exists to
 *  show. Once the brand is off, the ordinary homomorphic map recurses the
 *  elements, so a tuple OF branded elements strips all the way down. **/
type StripMetaUnbrandTuple<T, Depth extends number> = T extends (infer U) &
  StripMetaFmtPart<T> &
  StripMetaNotPart<T> &
  StripMetaOneOfPart<T> &
  StripMetaContainsPart<T> &
  StripMetaPatternPropsPart<T> &
  StripMetaPropNamesPart<T> &
  StripMetaUnevaluatedPart<T>
  ? [Extract<keyof U, StripMetaSentinelKeys>] extends [never]
    ? U extends readonly unknown[]
      ? {[K in keyof U]: StripRunTypeMeta<U[K], _StripMetaDepth[Depth]>}
      : T
    : T
  : T;

export type StripRunTypeMeta<T, Depth extends number = 8> = Depth extends 0
  ? unknown // budget exhausted — widen: an annotation admits everything rather than leak metadata
  : unknown extends T
    ? T // any / unknown — keep the broad kinds
    : [JsonValue] extends [T]
      ? [T] extends [JsonValue]
        ? StripMetaHasStructuredArm<T> extends true
          ? StripMetaNode<T, Depth> // equivalent to any-JSON, but the arms carry structure — keep them
          : JsonValue // the any-JSON domain, in any arm order / brand dressing — one name
        : StripMetaNode<T, Depth>
      : StripMetaNode<T, Depth>;

type StripMetaNode<T, Depth extends number> = T extends string
  ? string extends T
    ? string // wide brand (Email, StringFormat<…>) — collapse to the base
    : T extends {readonly [__rtFormatBrand]: string}
      ? string // required nominal brand — collapse one-way to the base
      : Extract<keyof T, StripMetaSentinelKeys> extends never
        ? T // plain literal — keep verbatim
        : StripMetaUnbrandLit<T, string> // branded literal — subtract the brand, else widen to the base
  : T extends number
    ? number extends T
      ? number
      : T extends {readonly [__rtFormatBrand]: string}
        ? number
        : Extract<keyof T, StripMetaSentinelKeys> extends never
          ? T
          : StripMetaUnbrandLit<T, number> // branded numeric (impossible-arm junk included)
    : T extends bigint
      ? bigint extends T
        ? bigint
        : T extends {readonly [__rtFormatBrand]: string}
          ? bigint
          : Extract<keyof T, StripMetaSentinelKeys> extends never
            ? T
            : StripMetaUnbrandLit<T, bigint>
      : T extends boolean
        ? Extract<keyof T, StripMetaSentinelKeys> extends never
          ? T
          : T extends true
            ? true // a boolean literal survives its brand — extends-testing recovers it
            : T extends false
              ? false
              : boolean
        : T extends null | undefined
          ? T
          : T extends Date
            ? Date // FormatDate<…> — collapse to the bare class
            : T extends (...args: never[]) => unknown
              ? T // functions stay functions — this is not DataOnly
              : T extends readonly unknown[]
                ? StripMetaArray<T, Depth>
                : T extends object
                  ? StripMetaObject<T, Depth>
                  : T;

/** Arrays + tuples. An UNBRANDED array-like recurses homomorphically (tuple
 *  slots, rest tails and modifiers all survive the mapped type). A BRANDED
 *  plain array recovers its element by inference — `FormattedArray<number[],…>
 *  extends readonly (infer E)[]` infers `number`, dropping every slot the
 *  brand rode. A branded TUPLE cannot use that inference (it would collapse the
 *  slots), so it subtracts the brand instead and then recurses normally. **/
type StripMetaArray<T extends readonly unknown[], Depth extends number> =
  Extract<keyof T, StripMetaSentinelKeys> extends never
    ? {[K in keyof T]: StripRunTypeMeta<T[K], _StripMetaDepth[Depth]>}
    : number extends T['length']
      ? T extends readonly (infer E)[]
        ? T extends unknown[]
          ? StripRunTypeMeta<E, _StripMetaDepth[Depth]>[]
          : readonly StripRunTypeMeta<E, _StripMetaDepth[Depth]>[]
        : T
      : StripMetaUnbrandTuple<T, Depth>;

/** The declared literal-key surface of an object — index-signature slots
 *  filtered out, `-?` so an all-optional surface still registers. `{} extends
 *  this` says "no named properties", which is what decides whether an index
 *  signature's value may stay exact (below). The homomorphic shape matters: a
 *  bare `keyof` NORMALIZES `'foo' | string` down to `string` and loses the
 *  named keys, while a `[K in keyof T as …]` map sees them per-constituent
 *  even through the `Props & Record<…>` intersections the schema door
 *  produces. **/
type StripMetaLiteralKeys<T> = {
  [K in keyof T as string extends K ? never : number extends K ? never : K extends symbol ? never : K]-?: 0;
};

/** "T declares no named properties" — the empty-object probe over the literal
 *  key surface (`Record<never, never>` spelling, which is the same test the
 *  bare `{}` would run without reading as "anything non-nullish"). **/
type StripMetaNoNamedKeys<T> = Record<never, never> extends StripMetaLiteralKeys<T> ? true : false;

/** Objects: drop every symbol key (the sentinels are symbol-keyed; symbol
 *  members are never data anyway) and recurse the values, preserving the
 *  `readonly` / `?` modifiers via the homomorphic `as` filter. `Map` / `Set` /
 *  `RegExp` and the truly broad `object` (no keys at all) pass through
 *  verbatim — probed via `keyof`, NOT `object extends T`, because the latter
 *  is also true of every all-optional object and silently kept weak types
 *  (and the metadata inside them) verbatim.
 *
 *  Sentinel presence is probed FIRST: a bare carrier (`unknown & {__rtOneOf?:
 *  …}`, a bare `{__rtNot?: …}`) is an all-optional object, and once every key
 *  is a sentinel, the honest clean type is the `unknown` the base was.
 *
 *  Index signatures beside NAMED properties widen their value to `unknown`:
 *  TypeScript cannot spell "this value type for every key except the named
 *  ones", so an exact index would reject valid data that mixes named-key and
 *  additional-key value types — and the clean type's contract is that every
 *  valid value assigns. An index signature standing ALONE keeps its exact
 *  value type (nothing is excepted from it, so nothing valid is rejected). **/
type StripMetaObject<T extends object, Depth extends number> =
  Extract<keyof T, StripMetaSentinelKeys> extends never
    ? keyof T extends never
      ? T // the broad `object` — nothing to map
      : T extends ReadonlyMap<any, any> | ReadonlySet<any> | RegExp
        ? T
        : {
            // Inline on purpose: an ANONYMOUS mapped type is displayed expanded,
            // while a named helper defers behind its own name in hovers.
            [K in keyof T as K extends symbol ? never : K]: string extends K
              ? StripMetaNoNamedKeys<T> extends true
                ? StripRunTypeMeta<T[K], _StripMetaDepth[Depth]>
                : unknown // index beside named properties — widen so mixed valid data assigns
              : number extends K
                ? StripMetaNoNamedKeys<T> extends true
                  ? StripRunTypeMeta<T[K], _StripMetaDepth[Depth]>
                  : unknown
                : StripRunTypeMeta<T[K], _StripMetaDepth[Depth]>;
          }
    : Exclude<keyof T, StripMetaSentinelKeys | symbol> extends never
      ? unknown // every key was metadata — the base was the broad kind
      : {
          [K in keyof T as K extends symbol ? never : K]: string extends K
            ? StripMetaNoNamedKeys<T> extends true
              ? StripRunTypeMeta<T[K], _StripMetaDepth[Depth]>
              : unknown
            : number extends K
              ? StripMetaNoNamedKeys<T> extends true
                ? StripRunTypeMeta<T[K], _StripMetaDepth[Depth]>
                : unknown
              : StripRunTypeMeta<T[K], _StripMetaDepth[Depth]>;
        };
// #endregion stripmeta-extract
