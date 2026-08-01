// The value-first surface's COMPOSER type channel — the type-level helpers the
// structural builders (compose.ts / utility.ts) carry. The format-builder type
// helpers (`InferType`, `LeafType`, `BrandArg`, the temporal lookups) moved to
// runtypes/builderTypes.ts so the format builders under `formats/` and the
// composers here can share them without a cross-surface dependency; they're
// re-exported below so existing `./static.ts` importers keep resolving. No `infer`
// except where unavoidable (per CLAUDE.md): every helper is an `extends`-guard +
// indexed-access read.

import type {RunType} from '../runtypes/types.ts';
import type {InferType} from '../runtypes/builderTypes.ts';

// Format-builder type helpers — moved to runtypes/builderTypes.ts; re-exported so
// the schema barrel and the sibling builder files keep their `./static.ts` import
// paths through the formats split.
export type {
  InferType,
  LeafType,
  LeafTypeByFormatName,
  LeafFormatName,
  BrandArg,
  TemporalFormatByTag,
  TemporalBaseByTag,
  TemporalBuilderFn,
} from '../runtypes/builderTypes.ts';

// ───────────────────────── Property modifiers ───────────────────────

/** Property modifiers a field can carry inside `object(...)`: `optional` makes
 *  the property `key?:`, `readonly` makes it `readonly key:`. Both are
 *  property-POSITION concerns `object`'s mapped type applies (from a `propMod(...)`
 *  wrapper) — NOT part of a field's identity — so this type appears only here and
 *  in `object`'s param. **/
export interface PropModifiers {
  optional?: true;
  readonly?: true;
}

/** The carrier `propMod(...)` produces — a field paired with its modifiers.
 *  `object` reads `__propMod` to place the key and `__field` for its value type;
 *  the carrier never leaks past `object`'s mapped type. **/
export interface PropModCarrier<M extends PropModifiers, F> {
  readonly __propMod: M;
  readonly __field: F;
}

// object's per-field readers — all INDEXED ACCESS / structural guards, no `infer`.
/** The branded field type a value carries. Leaf builders return `RunType<…>`, so
 *  `InferType` unwraps either the `__field` inside a `propMod` carrier (itself a
 *  `RunType<…>`) or a bare `RunType<…>` back to the format type the property should
 *  hold. **/
export type FieldOf<V> = V extends {__propMod: PropModifiers; __field: unknown} ? InferType<V['__field']> : InferType<V>;
/** Whether a value carries the `optional` / `readonly` property modifier. **/
export type IsOptional<V> = V extends {__propMod: {optional: true}} ? true : false;
export type IsReadonly<V> = V extends {__propMod: {readonly: true}} ? true : false;

/** Collapses a split-group object type back into a SINGLE object literal — the
 *  homomorphic identity map `{[K in keyof T]: T[K]}`, which preserves each key's
 *  `?` / `readonly` exactly (readonly copied through, so DON'T write `-readonly`)
 *  while erasing the `&` boundary between the groups. TS can't apply `?` / `readonly`
 *  per-key in one map, so the mixed-modifier tiers below MUST build their result as
 *  a group intersection (`{required} & {optional}`); left as-is that intersection is
 *  what `InferType<typeof schema>` surfaces — a `{a: string} & {b?: number}` that
 *  reads as "weird" and, worse, RE-forms at every nesting level (each nested
 *  `object` is its own intersection). Wrapping each tier in `Flatten` merges the
 *  groups into the plain `{a: string; b?: number}` the type-first surface writes, at
 *  EVERY level. It is not just cosmetic: the merged literal is also CHEAPER to
 *  instantiate + consume than the raw intersection (measured ~4–9% fewer
 *  instantiations across the optional/readonly/mixed profiles), so it strengthens —
 *  not weakens — the type-cost guardrail. **/
type Flatten<T> = {[K in keyof T]: T[K]};

/** The object type `object(C)` produces. A bare field is required + mutable; a
 *  `propMod(...)` field places its key per its modifiers (`?` / `readonly`). TS
 *  can't apply `?` / `readonly` per-key in ONE homomorphic map, so the general
 *  case (`ObjectMixed`) splits the keys into the four (optional × readonly) groups
 *  and intersects them, then `Flatten`s the intersection back into a single object
 *  literal (so `InferType` reads `{a: string; b?: number}`, never `{a} & {b?}`).
 *  But that pays all four mapped-type passes on EVERY object — even an all-required
 *  one, where three groups are empty — and the cost compounds at every nesting
 *  level (the dominant value-first type-check cost).
 *  So dispatch on the modifier PROFILE first
 *  (two cheap key-probes) and emit the leanest map that's still exact: a single
 *  homomorphic map when no field is modified (the common case — already one literal,
 *  no `Flatten` needed), a `Flatten`ed 2-group split when only one modifier kind is
 *  present, the `Flatten`ed 4-way only when one field is optional AND another
 *  readonly. Every arm recovers the IDENTICAL type to the 4-way for its profile
 *  (proven across modifier profiles in
 *  container/benchmarks/typecost/isolated-experiment.mjs), so the structural id still
 *  converges with the type-first object. `FieldOf` unwraps each field's `RunType<…>`
 *  to its format type. Shared by `object`'s return type and its `InjectRunTypeId<…>`
 *  marker param. **/
type AnyOptional<C> = true extends {[K in keyof C]: IsOptional<C[K]>}[keyof C] ? true : false;
type AnyReadonly<C> = true extends {[K in keyof C]: IsReadonly<C[K]>}[keyof C] ? true : false;
/** Optional present, no readonly — a required group + an optional group, both
 *  mutable, `Flatten`ed into one literal. **/
type ObjectOptionalOnly<C> = Flatten<
  {
    -readonly [K in keyof C as IsOptional<C[K]> extends true ? never : K]: FieldOf<C[K]>;
  } & {
    -readonly [K in keyof C as IsOptional<C[K]> extends true ? K : never]?: FieldOf<C[K]>;
  }
>;
/** Readonly present, no optional — a mutable group + a readonly group, both
 *  required, `Flatten`ed into one literal. **/
type ObjectReadonlyOnly<C> = Flatten<
  {
    -readonly [K in keyof C as IsReadonly<C[K]> extends true ? never : K]: FieldOf<C[K]>;
  } & {
    readonly [K in keyof C as IsReadonly<C[K]> extends true ? K : never]: FieldOf<C[K]>;
  }
>;
/** Both optional AND readonly present — the full 4-way (optional × readonly) split,
 *  `Flatten`ed into one literal. **/
type ObjectMixed<C> = Flatten<
  {
    -readonly [K in keyof C as IsOptional<C[K]> extends true ? never : IsReadonly<C[K]> extends true ? never : K]: FieldOf<C[K]>;
  } & {
    readonly [K in keyof C as IsOptional<C[K]> extends true ? never : IsReadonly<C[K]> extends true ? K : never]: FieldOf<C[K]>;
  } & {
    -readonly [K in keyof C as IsOptional<C[K]> extends true ? (IsReadonly<C[K]> extends true ? never : K) : never]?: FieldOf<
      C[K]
    >;
  } & {
    readonly [K in keyof C as IsOptional<C[K]> extends true ? (IsReadonly<C[K]> extends true ? K : never) : never]?: FieldOf<
      C[K]
    >;
  }
>;
export type ObjectType<C> =
  AnyOptional<C> extends false
    ? AnyReadonly<C> extends false
      ? {-readonly [K in keyof C]: FieldOf<C[K]>}
      : ObjectReadonlyOnly<C>
    : AnyReadonly<C> extends false
      ? ObjectOptionalOnly<C>
      : ObjectMixed<C>;

// ─────────────────────────── Composer types ─────────────────────────

/** Maps a tuple of `RunType` schemas to the tuple of the types they carry —
 *  homomorphic over `keyof T`, so it preserves tuple length/order with no
 *  `infer`: `[RunType<A>, RunType<B>]` → `[A, B]`. The `-readonly` strips the
 *  `readonly` that `const T` inference adds at the variadic composer call sites
 *  (`tuple` / `func`), so a fixed-tuple return is mutable `[A, B]` and converges
 *  with the type-first tuple. **/
export type MapTuple<T extends readonly RunType[]> = {-readonly [K in keyof T]: InferType<T[K]>};

/** The union of the `InferType` types of a RunType tuple, built RECURSIVELY so EACH
 *  member survives as a distinct arm. The obvious non-recursive form
 *  `MapTuple<T>[number]` is subtype-REDUCED by tsgo — a subset arm swallows its
 *  superset (`{a} | {a; b}` → `{a}`) — so it diverges from the written
 *  `{a} | {a; b}`. The recursive build preserves every arm, converging on the
 *  same structural id as the type-first union.
 *
 *  ⚠️ Recursive `infer` is the TS-checker-perf hazard this value-first surface
 *  otherwise avoids. It is used ONLY here, and
 *  the `union` builder reaches it ONLY as the variable-arity fallback: unions up
 *  to the fixed-arity overload count are branded directly (`A | B | …`) via plain
 *  generic inference, with NO `infer`. So the perf cost is confined to unusually
 *  wide unions. **/
export type UnionOf<T extends readonly RunType[]> = T extends readonly [
  infer Head extends RunType,
  ...infer Tail extends readonly RunType[],
]
  ? InferType<Head> | UnionOf<Tail>
  : never;

/** The intersection of the `InferType` types of a RunType tuple, built recursively
 *  (`InferType<Head> & IntersectionOf<Tail>`), terminating at `unknown` — the identity
 *  of `&` (`X & unknown = X`). The array-form `intersection` fallback brands this for
 *  9+ members (the positional overloads can't carry a trailing injected id past a
 *  rest). Same recursive-`infer` perf caveat as `UnionOf`, reached only past the
 *  positional overloads. **/
export type IntersectionOf<T extends readonly RunType[]> = T extends readonly [
  infer Head extends RunType,
  ...infer Tail extends readonly RunType[],
]
  ? InferType<Head> & IntersectionOf<Tail>
  : unknown;

/** A template-literal part: a string-literal segment or a `RunType` placeholder. **/
export type TemplatePart = string | RunType;

/** The TS template-literal interpolation domain — what a `${…}` placeholder may
 *  hold. A `RunType` part contributes its carried `T` narrowed to this set; a
 *  string part contributes its own literal text. **/
type Interpolatable = string | number | bigint | boolean | null | undefined;

/** Strips a value-first leaf's FORMAT tag (`{__rtFormatName, __rtFormatParams}`
 *  carried by `number()`/`string()`/`bigint()`) back to its base primitive, so a
 *  placeholder converges with the type-first PLAIN `${number}` / `${string}` —
 *  otherwise the tag leaks into the template-literal type and the scanner
 *  reflects a different (permissive) shape. Literals and unions carry no tag and
 *  pass through unchanged, so `literal('a')` stays `'a'`.
 *
 *  Detection is by KEY PRESENCE (`'__rtFormatName' extends keyof X`), not a
 *  required-property `extends` check: the sentinels are optional on `TypeFormat`
 *  (so a format stays assignable from its base), and an optional prop does not
 *  satisfy a required-prop constraint — but the key is still present in `keyof`. **/
type Unbrand<X> = '__rtFormatName' extends keyof X
  ? X extends string
    ? string
    : X extends number
      ? number
      : X extends bigint
        ? bigint
        : X & Interpolatable
  : X & Interpolatable;
type PartText<Part extends TemplatePart> = Part extends RunType ? Unbrand<InferType<Part>> : Part & Interpolatable;

/** Folds a parts tuple into the template-literal type it denotes:
 *  `['api/user/', RunType<number>]` → `` `api/user/${number}` ``. Recursion over
 *  the FIXED parts tuple is what assembles the literal — the one spot a `infer`
 *  head/tail split is unavoidable (a mapped type can't JOIN into a template
 *  string). The parts tuple is bounded by the call site, so there's no
 *  deep-instantiation tax; a nested template-literal placeholder flattens
 *  transparently, and a union placeholder distributes — both matching how the
 *  type-first `` `…` `` form normalises, so the two converge on one structural id. **/
export type AssembleTemplate<P extends readonly TemplatePart[]> = P extends readonly [
  infer Head extends TemplatePart,
  ...infer Tail extends readonly TemplatePart[],
]
  ? `${PartText<Head>}${AssembleTemplate<Tail>}`
  : '';

// ─────────────────────── Recursive schemas (self / circular) ─────────
//
// `circular(body)` authors a self-referential schema with NO hand-written type.
// The body points back to itself with the `self()` marker — a `RunType<Self>`
// placeholder baked wherever the type recurses (`{next?: Self}`); `Recursive<Body>`
// ties the knot, substituting every `Self` with the recursive type itself. Because
// the reference is a compile-time marker, no enclosing callback is needed to capture
// it (unlike runtime schema libraries). `circular` brands the
// FULLY-RESOLVED `Recursive<Body>`, so the Go scanner reflects an ordinary
// recursive type and (with the structural cycle-token anchor in typeid.go)
// value-first converges with the type-first form.

// #region substituteself-extract — Self / SubstituteSelf / Recursive machinery;
// sliced verbatim between these markers by test/types/substituteSelfHarness.ts to
// build the recursive-schema budget test. Keep self-contained (only `lib` types).

/** The self-reference placeholder `self()` carries — a unique brand so nothing
 *  structural can collide with it. **/
declare const SelfBrand: unique symbol;
export type Self = {readonly [SelfBrand]: true};

/** Traverse any node type, replacing every `Self` with the recursion fixpoint
 *  `P[0]`. `P` is a 1-tuple holding the recursion; threading it (not a bare type)
 *  lets `Recursive` defer the self-reference. Leaves (primitives — incl. branded
 *  primitives like `String` = `string & brand` — `Date`, `RegExp`) pass
 *  through; containers recurse. `T extends Self` distributes, so union members
 *  substitute individually. Arrays use `infer E → E[]` (defers the recursive
 *  element); tuples use the homomorphic mapped type (preserves slots/optional). **/
type SubstituteSelf<T, P extends [unknown]> = T extends Self
  ? P[0]
  : T extends string | number | boolean | bigint | symbol | null | undefined
    ? T
    : T extends Date | RegExp
      ? T
      : // Gate Map/Set behind cheap non-`infer` checks so non-collection nodes
        // skip the inference machinery (same optimisation as `DataOnly`).
        T extends Map<any, any>
        ? T extends Map<infer K, infer V>
          ? Map<SubstituteSelf<K, P>, SubstituteSelf<V, P>>
          : never // unreachable — gate guarantees a Map
        : T extends Set<any>
          ? T extends Set<infer E>
            ? Set<SubstituteSelf<E, P>>
            : never // unreachable — gate guarantees a Set
          : T extends Promise<infer E>
            ? Promise<SubstituteSelf<E, P>>
            : T extends (...args: infer A extends readonly unknown[]) => infer R
              ? (...args: {-readonly [K in keyof A]: SubstituteSelf<A[K], P>}) => SubstituteSelf<R, P>
              : T extends readonly unknown[]
                ? number extends T['length']
                  ? T extends readonly (infer E)[]
                    ? SubstituteSelf<E, P>[]
                    : never
                  : {-readonly [K in keyof T]: SubstituteSelf<T[K], P>}
                : T extends object
                  ? {[K in keyof T]: SubstituteSelf<T[K], P>}
                  : T;

/** Ties a recursive body (containing `Self`) into the self-referential type it
 *  denotes — `Recursive<{next?: Self}>` ≡ `type Node = {next?: Node}`. The
 *  tuple-wrapped `[Recursive<Body>]` + `P[0]` read defers the self-reference so
 *  the alias is legal (a direct substitution errors TS2456). Root-level recursive
 *  TUPLES are the one shape TS can't build this way (TS2589) — author those
 *  type-first. **/
export type Recursive<Body> = SubstituteSelf<Body, [Recursive<Body>]>;
// #endregion substituteself-extract
