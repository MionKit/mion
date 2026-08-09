// The value-first surface's COMPOSER type channel — the type-level helpers the
// structural builders (compose.ts / utility.ts) carry. The format-builder type
// helpers (`InferType`, `LeafType`, `BrandArg`, the temporal lookups) moved to
// runtypes/builderTypes.ts so the format builders under `formats/` and the
// composers here can share them without a cross-surface dependency; they're
// re-exported below so existing `./static.ts` importers keep resolving. No `infer`
// except where unavoidable (per CLAUDE.md): every helper is an `extends`-guard +
// indexed-access read.

import type {
  __rtOneOf,
  __rtFormatName,
  __rtFormatParams,
  __rtFormatBrand,
  __rtNot,
  __rtContains,
  __rtPatternProps,
  __rtPropNames,
  __rtUnevaluated,
  __rtLabels,
} from '../runtypes/sentinelKeys.ts';
import type {RunType} from '../runtypes/types.ts';
import type {InferType} from '../runtypes/builderTypes.ts';

// Format-builder type helpers — moved to runtypes/builderTypes.ts; re-exported so
// the builders barrel and the sibling builder files keep their `./static.ts` import
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

// ───────────────────── Labeled tuples (slot form) ────────────────────
//
// `tuple([slot('x', number()), slot('y', number())])` / `func([slot('event',
// string())], ret)` author labeled tuple slots / named function parameters
// value-first. The labels ride an ARRAY of slot carriers because tuples are
// the ONE order-preserving container in the type system: an object literal's
// key order is NOT observable — the checker keeps `keyof` unions sorted by
// internal type id (tsgo addTypeToUnion inserts via CompareTypes binary
// search), so a record-shaped API would scramble slot order for any key set
// whose ids disagree with declaration order ({w, h} projected [h, w]).
//
// TypeScript cannot CONSTRUCT a labeled tuple type with a mapped type, so the
// carried type is the plain values tuple intersected with the `__rtLabels`
// sentinel — a literal string tuple holding the labels in slot order. The Go
// side lifts the sentinel exactly like the other `__rt*` sentinels (never a
// property; folds into the structural id; populates the projected member /
// parameter names), so the slot form converges with the type-first
// `[x: number, y: number]` / `(event: string) => R` on one structural id.

/** The carrier `slot(label, value)` produces — one labeled tuple slot / named
 *  function parameter. Deliberately NOT a RunType (the PropModCarrier
 *  discipline): the labeled overloads require EVERY element to be a slot, so
 *  TS's all-or-nothing tuple-labeling rule falls out of overload resolution
 *  instead of a runtime check. **/
export interface SlotCarrier<Label extends string, Value> {
  readonly __slotLabel: Label;
  readonly __slotValue: RunType<Value>;
}

/** The value types of a slots tuple — homomorphic over the array, so slot
 *  order is the written order and the result is the MUTABLE values tuple
 *  (the `MapTuple` discipline). **/
export type SlotValues<Slots extends readonly SlotCarrier<string, unknown>[]> = {
  -readonly [K in keyof Slots]: InferType<Slots[K]['__slotValue']>;
};

/** The label literals of a slots tuple, same order. **/
export type SlotLabels<Slots extends readonly SlotCarrier<string, unknown>[]> = {
  -readonly [K in keyof Slots]: Slots[K]['__slotLabel'];
};

/** The type `tuple([slot…])` / `tuple([slot…], [slot…])` carries: the values
 *  tuple (optionals folded in via `Partial`) intersected with the labels
 *  sentinel. Optional slots keep their `?` on the VALUES tuple; the labels
 *  tuple always covers every slot. **/
export type LabeledTuple<
  Slots extends readonly SlotCarrier<string, unknown>[],
  OptionalSlots extends readonly SlotCarrier<string, unknown>[] = [],
> = [...SlotValues<Slots>, ...Partial<SlotValues<OptionalSlots>>] & {
  readonly [__rtLabels]?: readonly [...SlotLabels<Slots>, ...SlotLabels<OptionalSlots>];
};

/** The rest form's carried type — the rest slot is a labeled slot too (TS
 *  tuples label all slots or none), so any rest label is expressible:
 *  `tuple([slot('x', number())], [], slot('items', string()))` ≡
 *  `[x: number, ...items: string[]]`. **/
export type LabeledRestTuple<
  Slots extends readonly SlotCarrier<string, unknown>[],
  OptionalSlots extends readonly SlotCarrier<string, unknown>[],
  RestLabel extends string,
  Rest,
> = [...SlotValues<Slots>, ...Partial<SlotValues<OptionalSlots>>, ...Rest[]] & {
  readonly [__rtLabels]?: readonly [...SlotLabels<Slots>, ...SlotLabels<OptionalSlots>, RestLabel];
};

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

/** The exactly-one union combinator: the value space is the union of the
 *  branches, and the generated validator additionally asserts the value
 *  matches EXACTLY ONE branch (JSON Schema `oneOf` semantics) — a value
 *  matching two overlapping branches fails where the plain union accepts it.
 *  Encoding: every non-nullish member carries an OPTIONAL sentinel prop
 *  holding the branch TUPLE (`A & {__rtOneOf?: Bs} | B & {__rtOneOf?: Bs}`),
 *  built arm-by-arm so tsgo's subtype reduction cannot swallow a carrier.
 *  The optional prop keeps every member mutually assignable with its plain
 *  form, so consumption is exactly plain-union DX: `switch (u.kind)`
 *  narrows, the value widens back to `A | B`, and `typeof` narrowing leaves
 *  no phantom arm. `null` / `undefined` branches stay plain (an
 *  intersection would reduce them to never — any one surviving carrier
 *  provides the tuple). The tuple preserves the grouping union flattening
 *  erases, because exclusivity counts BRANCHES: in `OneOf<[A, B | C]>` a
 *  value matching both B and C matched one branch and passes. Requires two
 *  or more branches — exactly-one over a single branch is that branch. **/
// #region oneof-slice — OneOf + its arm/nullish-dedup helpers, sliced verbatim
// into the FromJsonSchema fuzz module (jsonSchemaFuzz.integration.test.ts) so
// the door's `OneOf<Branches>` lowering resolves against the REAL combinator
// there, not a copy. RunType-free + dep-free by construction.
export type OneOf<Branches extends readonly [unknown, unknown, ...unknown[]]> = {
  [K in keyof Branches]: OneOfArm<Branches[K], Branches>;
}[number];
// One shallow mapped type + one indexed access — O(1) instantiation depth,
// no recursion wall at any width. tsgo's indexed-access subtype reduction
// may drop a REDUNDANT type arm (a branch that subtypes a sibling), which
// costs only the hover: the branch tuple inside every carrier is what the
// validator counts, and at least one carrier always survives reduction.
// OneOfArm's parameter is deliberately NAKED so the conditional
// distributes: a branch that is itself `A | null` keeps its null plain
// (`(A & carrier) | null`) instead of dying in an intersection.
// A DUPLICATED nullish branch resolves never: a null value matches every
// branch spelling it, so it can never win exactly-one — without this the
// all-nullish degenerate (`OneOf<[null, null]>`) carries no sentinel at all
// and silently accepted what the spec rejects. The branch TUPLE keeps the
// duplicates, so runtime counting stays branch-accurate in the mixed case
// (`OneOf<[null, null, A]>` rejects null by count, accepts a lone A match).
// The nullish-dup walk recurses over the tuple, but only a nullish arm ever
// instantiates it — non-nullish arms keep the O(1) path.
type OneOfArm<Arm, All extends readonly unknown[]> = Arm extends null | undefined
  ? OneOfNullishDup<Arm, All> extends true
    ? never
    : Arm
  : Arm & {readonly [__rtOneOf]?: All};
// Mutual-extends equality keeps the match exact for the pure null /
// undefined branches this guards; a nullish value hiding inside a
// union-valued branch is counted by the runtime (its other arms carry the
// tuple) and stays out of this static walk.
type OneOfNullishDup<V, All extends readonly unknown[]> = All extends readonly [infer Head, ...infer Tail]
  ? [V] extends [Head]
    ? [Head] extends [V]
      ? OneOfNullishAgain<V, Tail>
      : OneOfNullishDup<V, Tail>
    : OneOfNullishDup<V, Tail>
  : false;
type OneOfNullishAgain<V, Rest> = Rest extends readonly [infer Head, ...infer Tail]
  ? [V] extends [Head]
    ? [Head] extends [V]
      ? true
      : OneOfNullishAgain<V, Tail>
    : OneOfNullishAgain<V, Tail>
  : false;
// #endregion oneof-slice

/** The at-least-one union combinator — spelled for JSON Schema `anyOf` name
 *  parity. Pure sugar: a union already IS at-least-one, so this carries no
 *  sentinel, adds no runtime behavior, and converges on the plain union's id. **/
export type AnyOf<Branches extends readonly [unknown, ...unknown[]]> = Branches[number];

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
type Unbrand<X> = typeof __rtFormatName extends keyof X
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

/** Every sentinel key a CONTAINER can carry, as one closed union. A carrier is
 *  always `Base & {readonly [key]?: payload}`, and the substitution below has
 *  to take that intersection apart and put it back together — rebuilding the
 *  base alone drops the payload, while mapping over the whole intersection
 *  folds the sentinel INTO the base (both move the structural id away from the
 *  type-first spelling). The vocabulary is closed by construction: these are
 *  the resolver's wire contract (runtypes/sentinelKeys.ts), and
 *  `CarriedKeyExhaustive` in test/types/sentinelCarry.test-d.ts fails the build
 *  if a new sentinel ships without being listed here. **/
export type CarriedKey =
  | typeof __rtFormatName
  | typeof __rtFormatParams
  | typeof __rtFormatBrand
  | typeof __rtNot
  | typeof __rtContains
  | typeof __rtPatternProps
  | typeof __rtPropNames
  | typeof __rtOneOf
  | typeof __rtUnevaluated
  | typeof __rtLabels;

/** True when `T` carries at least one sentinel — the gate each container arm
 *  gets, so a sentinel-free node keeps its ORIGINAL rebuild verbatim (no shape
 *  and no id may move for the shapes that already work).
 *
 *  Distribution runs over the TEN sentinel keys, not over `keyof T`:
 *  `Extract<keyof T, CarriedKey>` instantiates once per member of `keyof T`,
 *  which for an array is a ~40-member union and cost more than the whole
 *  substitution (the budget suite's tree branch went 8x). An assignability
 *  probe (`T extends {…?: never}`) is cheaper still but FORCES the deferred
 *  recursive type and blows the depth limit — this stays purely structural. **/
/** True when `T` carries at least one sentinel.
 *
 *  Deliberately a `keyof` LOOKUP. The two cheaper probes both fail here: an
 *  assignability check against `never`-typed slots, and reading each slot by
 *  `infer`, each FORCE the deferred `Recursive<Body>` while TypeScript is
 *  relating two instances of the recursive type, and the unrolling trips the
 *  instantiation-depth limit (TS2589) on every recursive schema. A `keyof`
 *  lookup stays structural and lazy. It costs: `keyof` an array instantiates
 *  the whole `Array<T>` interface, which is why the budget suite's tree branch
 *  moved most. Only a node the cycle actually runs THROUGH ever gets here —
 *  everything else short-circuits above — so that cost is bounded by the
 *  handful of containers on the cycle, not by the schema's size. **/
type HasCarried<T> = [Extract<keyof T, CarriedKey>] extends [never] ? false : true;

/** The sentinel slots of `T`, re-emitted in carrier shape with the
 *  substitution run INSIDE each payload — `contains` / `not` / `patternProps`
 *  / `unevaluated` payloads can themselves reference `Self`. **/
type CarrySlots<T, P extends [unknown]> = {
  readonly [K in Extract<keyof T, CarriedKey>]?: SubstituteSelf<NonNullable<T[K]>, P>;
};

/** Does `T` reference `Self` anywhere? A carrier that does NOT is returned
 *  VERBATIM — no rebuild can preserve a shape better than not rebuilding it,
 *  and this is what keeps a labeled tuple or a params-branded record inside a
 *  recursive body identical to its type-first twin. Walks the same structure
 *  as the substitution (Map/Set gated before the object arm), reading each
 *  composite's members as one union: the conditional is naked, so it
 *  distributes and `AnyTrue` folds the result. Bodies are finite trees — the
 *  knot is only tied by `Recursive`, never inside a body — so this terminates. **/
type ContainsSelf<T> = AnyTrue<ContainsSelfIn<T>>;

/** Folds a distributed boolean union: `never` (no members) and an all-`false`
 *  union mean "no Self", anything else means at least one member had it. **/
type AnyTrue<B> = [B] extends [never] ? false : [B] extends [false] ? false : true;

type ContainsSelfIn<T> = T extends Self
  ? true
  : T extends string | number | boolean | bigint | symbol | null | undefined
    ? false
    : T extends Date | RegExp
      ? false
      : T extends Map<any, any>
        ? T extends Map<infer K, infer V>
          ? AnyTrue<ContainsSelfIn<K> | ContainsSelfIn<V>>
          : false
        : T extends Set<any>
          ? T extends Set<infer E>
            ? ContainsSelf<E>
            : false
          : T extends Promise<infer E>
            ? ContainsSelf<E>
            : T extends (...args: infer A extends readonly unknown[]) => infer R
              ? AnyTrue<ContainsSelfIn<A[number]> | ContainsSelfIn<R>>
              : T extends readonly unknown[]
                ? number extends T['length']
                  ? ContainsSelf<T[number]>
                  : // A TUPLE is read per slot: `T[number]` unions the slots, and an
                    // `unknown` slot beside a `Self` one absorbs the union whole
                    // (`Self | unknown` IS `unknown`), which hid the recursion and
                    // returned the tuple unsubstituted.
                    AnyTrue<{[K in keyof T]: ContainsSelf<T[K]>}[number]>
                : T extends object
                  ? // Per-member, NOT `ContainsSelf<T[keyof T]>`: an `unknown`-valued
                    // member (`record(RT.unknown(), …)`) absorbs the whole union, which
                    // hid a `Self` sitting in a sentinel payload beside it. Mapping
                    // first keeps every member's answer separate.
                    AnyTrue<{[K in keyof T]: ContainsSelf<T[K]>}[keyof T]>
                  : false;

/** Traverse any node type, replacing every `Self` with the recursion fixpoint
 *  `P[0]`. `P` is a 1-tuple holding the recursion; threading it (not a bare type)
 *  lets `Recursive` defer the self-reference. Leaves (primitives — incl. branded
 *  primitives like `String` = `string & brand` — `Date`, `RegExp`) pass
 *  through; containers recurse. `T extends Self` distributes, so union members
 *  substitute individually.
 *
 *  A node that does NOT reference `Self` is returned VERBATIM: no rebuild can
 *  preserve a shape better than not rebuilding it. That is what keeps the
 *  sentinel carriers (`FormattedArray` / `FormattedObject` params, `contains` /
 *  `patternProperties` / `propertyNames` / `unevaluated` / `not` slots, labeled
 *  tuples) intact inside a recursive body — every container rebuild below
 *  either drops such an intersection (Map/Set/array rebuild from inferred
 *  pieces) or folds it into the base (the homomorphic maps), which moved the
 *  structural id away from the type-first spelling. It also makes the common
 *  case CHEAPER, since whole subtrees now short-circuit instead of being
 *  reconstructed node by node. **/
type SubstituteSelf<T, P extends [unknown]> = T extends Self
  ? P[0]
  : T extends string | number | boolean | bigint | symbol | null | undefined
    ? T
    : T extends Date | RegExp
      ? T
      : // Leaves are settled above, so only composites pay for the walk.
        ContainsSelf<T> extends false
        ? T
        : SubstituteInto<T, P>;

/** The rebuild proper — reached only for a composite that really does recurse. **/
type SubstituteInto<T, P extends [unknown]> =
  // Gate Map/Set behind cheap non-`infer` checks so non-collection nodes
  // skip the inference machinery (same optimisation as `DataOnly`).
  T extends Map<any, any>
    ? T extends Map<infer K, infer V>
      ? CarryOnto<Map<SubstituteSelf<K, P>, SubstituteSelf<V, P>>, T, P>
      : never // unreachable — gate guarantees a Map
    : T extends Set<any>
      ? T extends Set<infer E>
        ? CarryOnto<Set<SubstituteSelf<E, P>>, T, P>
        : never // unreachable — gate guarantees a Set
      : T extends Promise<infer E>
        ? Promise<SubstituteSelf<E, P>>
        : T extends (...args: infer A extends readonly unknown[]) => infer R
          ? // Parameter lists are tuples, and the slot form of `RT.func` rides its
            // labels on the same `__rtLabels` carrier a labeled tuple uses.
            (...args: SubstituteTuple<A, P>) => SubstituteSelf<R, P>
          : T extends readonly unknown[]
            ? number extends T['length']
              ? T extends readonly (infer E)[]
                ? CarryOnto<SubstituteSelf<E, P>[], T, P>
                : never
              : SubstituteTuple<T, P>
            : T extends object
              ? HasCarried<T> extends true
                ? {[K in keyof T as K extends CarriedKey ? never : K]: SubstituteSelf<T[K], P>} & CarrySlots<T, P>
                : {[K in keyof T]: SubstituteSelf<T[K], P>}
              : T;

/** Re-attach `Source`'s sentinel slots onto a freshly rebuilt `Base` — the
 *  Map / Set / array rebuilds infer their pieces and would otherwise drop the
 *  intersection. Only ever reached for a node the cycle runs THROUGH (a
 *  carrier that does not recurse never gets here), so `keyof` on an array —
 *  which instantiates the whole `Array<T>` interface — is paid only where the
 *  payload genuinely has to be carried across the knot. **/
type CarryOnto<Base, Source, P extends [unknown]> = HasCarried<Source> extends true ? Base & CarrySlots<Source, P> : Base;

/** Tuples the cycle runs through. The homomorphic map preserves slots,
 *  optionality and rest elements but folds a sentinel INTO the tuple, and
 *  TypeScript cannot decompose `tuple & object` back into its tuple half (both
 *  `[...infer B]` and a rest-parameter inference hand back the whole
 *  intersection or a widened array). A FIXED-arity carrier is therefore rebuilt
 *  slot by slot from its indexes, which is exact; a carrier with optional or
 *  rest slots has no such spelling and keeps the historical fold — the one
 *  remaining lossy shape, and the only one the convert CLI still refuses. **/
type SubstituteTuple<T extends readonly unknown[], P extends [unknown]> =
  HasCarried<T> extends true
    ? IsFixedArity<T> extends true
      ? TupleFromIndexes<T, P> & CarrySlots<T, P>
      : {-readonly [K in keyof T]: SubstituteSelf<T[K], P>}
    : {-readonly [K in keyof T]: SubstituteSelf<T[K], P>};

/** A tuple whose length is ONE numeric literal: no rest element (`number`) and
 *  no optional slot (which makes `length` a union of the legal arities). **/
type IsFixedArity<T extends readonly unknown[]> = number extends T['length']
  ? false
  : IsUnion<T['length']> extends true
    ? false
    : true;

type IsUnion<X, All = X> = X extends unknown ? ([All] extends [X] ? false : true) : never;

/** Rebuild a fixed-arity tuple slot by slot, substituting each element — the
 *  intersection's element slots ARE the tuple's, so indexing reaches them
 *  without needing the base type back. **/
type TupleFromIndexes<T, P extends [unknown], Acc extends unknown[] = []> = Acc['length'] extends T['length' & keyof T]
  ? Acc
  : TupleFromIndexes<T, P, [...Acc, SubstituteSelf<T[Acc['length'] & keyof T], P>]>;

/** Ties a recursive body (containing `Self`) into the self-referential type it
 *  denotes — `Recursive<{next?: Self}>` ≡ `type Node = {next?: Node}`. The
 *  tuple-wrapped `[Recursive<Body>]` + `P[0]` read defers the self-reference so
 *  the alias is legal (a direct substitution errors TS2456). Root-level recursive
 *  TUPLES are the one shape TS can't build this way (TS2589) — author those
 *  type-first. **/
export type Recursive<Body> = SubstituteSelf<Body, [Recursive<Body>]>;
// #endregion substituteself-extract
