// The value-first surface's COMPOSER type channel — the type-level helpers the
// structural builders (compose.ts / utility.ts) carry. The format-builder type
// helpers (`InferType`, `LeafType`, `BrandArg`, the temporal lookups) moved to
// runtypes/builderTypes.ts so the format builders under `formats/` and the
// composers here can share them without a cross-surface dependency; they're
// re-exported below so existing `./static.ts` importers keep resolving. No `infer`
// except where unavoidable (per CLAUDE.md): every helper is an `extends`-guard +
// indexed-access read.

import type {
  __rtFormatName,
  __rtFormatParams,
  __rtFormatBrand,
  __rtContains,
  __rtPatternProps,
  __rtPropNames,
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
// `tuple({required: [slot('x', number()), slot('y', number())]})` /
// `func({params: [slot('event', string())], ret})` author labeled tuple slots /
// named function parameters value-first. The labels ride an ARRAY of slot
// carriers because tuples are the ONE order-preserving container in the type
// system: an object literal's key order is NOT observable — the checker keeps
// `keyof` unions sorted by internal type id (tsgo addTypeToUnion inserts via
// CompareTypes binary search), so a record-shaped API would scramble slot order
// for any key set whose ids disagree with declaration order ({w, h} projected
// [h, w]). The builders' own object keys name the GROUPS (`required` /
// `optional` / `rest`, a fixed set read by name), never the slots, so order
// never rides a key set.
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

/** The type `tuple({required: [slot…]})` / `tuple({required: [slot…], optional: [slot…]})` carries: the values
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
 *  `tuple({required: [slot('x', number())], rest: slot('items', string())})` ≡
 *  `[x: number, ...items: string[]]`. **/
export type LabeledRestTuple<
  Slots extends readonly SlotCarrier<string, unknown>[],
  OptionalSlots extends readonly SlotCarrier<string, unknown>[],
  RestLabel extends string,
  Rest,
> = [...SlotValues<Slots>, ...Partial<SlotValues<OptionalSlots>>, ...Rest[]] & {
  readonly [__rtLabels]?: readonly [...SlotLabels<Slots>, ...SlotLabels<OptionalSlots>, RestLabel];
};

// ─────────────────── Group form (the tuple/func options bag) ──────────────────
//
// One overload per FAMILY (plain RunTypes, slot carriers) rather than one per
// shape: an absent `rest` group leaves its type parameter with no inference
// site, so it lands on the `never` default and a single non-distributive
// `[Rest] extends [never]` picks the shape. No `infer` anywhere — a measured
// choice, as folding the family check into conditionals too costs ~58% more
// instantiations AND stops rejecting mixed / unknown keys (the bag becomes its
// own inferred type, so nothing is ever "excess").

/** The type the unlabeled group form carries. `Rest` is `never` when the group
 *  is absent, which is the presence check. **/
export type TupleFromGroups<Items extends readonly RunType[], OptionalItems extends readonly RunType[], Rest> = [Rest] extends [
  never,
]
  ? [...MapTuple<Items>, ...Partial<MapTuple<OptionalItems>>]
  : [...MapTuple<Items>, ...Partial<MapTuple<OptionalItems>>, ...Rest[]];

/** The labeled twin, keyed off the rest LABEL's presence — a rest slot always
 *  carries one, so the label is the reliable sentinel. **/
export type LabeledTupleFromGroups<
  Slots extends readonly SlotCarrier<string, unknown>[],
  OptionalSlots extends readonly SlotCarrier<string, unknown>[],
  RestLabel extends string,
  Rest,
> = [RestLabel] extends [never] ? LabeledTuple<Slots, OptionalSlots> : LabeledRestTuple<Slots, OptionalSlots, RestLabel, Rest>;

/** The type the `func` group form carries. An empty / absent params group
 *  brands a bare `() => Return`, NOT `(...args: []) => …` — tsgo reflects the
 *  empty-tuple rest-spread as a spurious rest parameter, diverging from the
 *  written `() => R` and from method shorthand. **/
export type FuncFromParams<Params extends readonly RunType[], Return> = Params extends readonly []
  ? () => Return
  : (...args: MapTuple<Params>) => Return;

/** The union of the `InferType` types of a RunType tuple. `T[number]` is the
 *  union of the tuple's members, and `InferType` is a conditional on a naked
 *  type parameter, so it DISTRIBUTES over that union — one arm per member, no
 *  recursion.
 *
 *  This used to recurse with `infer Head` / `infer Tail`, guarding against a
 *  subtype REDUCTION where a subset arm swallowed its superset (`{a} | {a; b}`
 *  → `{a}`), which would have diverged from the written union. That reduction no
 *  longer happens: the distributive form is proven type-identical to the
 *  recursive one across subset+superset, disjoint, literal-widening, duplicate
 *  and `any` arms, and the union id-integrity suites (which cover 8 heterogeneous
 *  arms including a subset/superset pair) still converge with the type-first
 *  union. The recursion cost about 70 instantiations per member against 12 for
 *  this, so a wide union was paying roughly 6x for a guard that no longer fires.
 *
 *  Note this is NOT `MapTuple<T>[number]`: mapping first materialises the whole
 *  mapped tuple before indexing it, where distributing skips it entirely. **/
export type UnionOf<T extends readonly RunType[]> = InferType<T[number]>;

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
  | typeof __rtContains
  | typeof __rtPatternProps
  | typeof __rtPropNames
  | typeof __rtLabels;

/** True when `T` carries at least one sentinel — the gate each container arm
 *  gets, so a sentinel-free node keeps its ORIGINAL rebuild verbatim (no shape
 *  and no id may move for the shapes that already work).
 *
 *  Distribution runs over the SEVEN sentinel keys, not over `keyof T`:
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
 *  substitution run INSIDE each payload — `contains` / `patternProps` /
 *  `propertyNames` payloads can themselves reference `Self`. **/
type CarrySlots<T, P extends [unknown]> = {
  readonly [K in Extract<keyof T, CarriedKey>]?: SubstituteSelf<NonNullable<T[K]>, P>;
};

/** `Date` and `RegExp` are named here as a FAST PATH, not as a correctness
 *  mechanism: they are the two builtins a schema carries most often, and
 *  matching them in one cheap arm beats walking their members every time. No
 *  other builtin needs naming — see the terminates-or-opaque rule on
 *  `ContainsSelfIn` below, which is what actually keeps a class instance
 *  intact.
 *
 *  Nothing may be added here that a real `Map` / `Set` is structurally
 *  assignable to, since this arm is tested BEFORE the Map / Set arms: such an
 *  entry would swallow `map(string(), self())` and leak the `Self`. That rules
 *  out the weak collections, which `DataOnlyStripped` (runtypes/dataOnly.ts)
 *  leaves out for the same reason — and is why this list is deliberately not a
 *  place to fix a walk problem. **/

/** Does `T` reference `Self` anywhere? A carrier that does NOT is returned
 *  VERBATIM — no rebuild can preserve a shape better than not rebuilding it,
 *  and this is what keeps a labeled tuple or a params-branded record inside a
 *  recursive body identical to its type-first twin. Walks the same structure
 *  as the substitution (Map/Set gated before the object arm), reading each
 *  composite's members as one union: the conditional is naked, so it
 *  distributes and `AnyTrue` folds the result. Bodies are finite trees — the
 *  knot is only tied by `Recursive`, never inside a body — so this terminates. **/
type ContainsSelf<T, Depth extends unknown[] = []> = AnyTrue<ContainsSelfIn<T, Depth>>;

/** Folds a distributed boolean union: `never` (no members) and an all-`false`
 *  union mean "no Self", anything else means at least one member had it. **/
type AnyTrue<B> = [B] extends [never] ? false : [B] extends [false] ? false : true;

type ContainsSelfIn<T, Depth extends unknown[]> = Depth['length'] extends 24
  ? // Budget spent. A node can be genuinely recursive — a `circular(…)` schema
    // nested inside another one resolves to a type that contains itself — and
    // walking one never ends. Answer "assume it recurses", which routes the
    // node to the rebuild: exactly what every node did before this walk
    // existed, so the worst case is the OLD behaviour for a carrier buried
    // deeper than the budget, never a leaked `Self`.
    false
  : 0 extends 1 & T
    ? false
    : T extends Self
      ? true
      : T extends string | number | boolean | bigint | symbol | null | undefined
        ? false
        : T extends Date | RegExp
          ? false
          : T extends Map<any, any>
            ? T extends Map<infer K, infer V>
              ? AnyTrue<ContainsSelfIn<K, Next<Depth>> | ContainsSelfIn<V, Next<Depth>>>
              : false
            : T extends Set<any>
              ? T extends Set<infer E>
                ? ContainsSelf<E, Next<Depth>>
                : false
              : T extends Promise<infer E>
                ? ContainsSelf<E, Next<Depth>>
                : T extends (...args: infer A extends readonly unknown[]) => infer R
                  ? AnyTrue<ContainsSelfIn<A[number], Next<Depth>> | ContainsSelfIn<R, Next<Depth>>>
                  : T extends readonly unknown[]
                    ? number extends T['length']
                      ? ContainsSelf<T[number], Next<Depth>>
                      : AnyTrue<MembersContainSelf<MemberBoxes<T>[number], Depth>>
                    : T extends object
                      ? AnyTrue<MembersContainSelf<MemberBoxes<T>[keyof T], Depth>>
                      : false;

type Next<Depth extends unknown[]> = [...Depth, unknown];

/** Each member wrapped in a 1-tuple. Reading members as ONE bare union
 *  (`T[keyof T]`) lets an `unknown`-valued member (`record(RT.unknown(), …)`)
 *  absorb the whole union and hide a `Self` beside it — `Self | unknown` IS
 *  `unknown`. Boxing keeps every member's answer separate. The box map itself
 *  never calls `ContainsSelf`, which is what keeps it usable on a genuinely
 *  recursive type: a mapped type whose VALUES recurse circularly references
 *  itself (TS2615), while this one only defers into a conditional, exactly as
 *  the bare indexed access used to. **/
type MemberBoxes<T> = {[K in keyof T]: [T[K]]};

type MembersContainSelf<Boxed, Depth extends unknown[]> = Boxed extends [infer Member]
  ? ContainsSelf<Member, Next<Depth>>
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
 *  `patternProperties` / `propertyNames` slots, labeled
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

/** Tuples the cycle runs through. The homomorphic map preserves slots and
 *  optionality but folds a sentinel INTO the tuple, and TypeScript cannot
 *  decompose `tuple & object` back into its tuple half — a variadic `infer`
 *  yields `unknown[]`, a spread widens to an array, a head/tail `infer`
 *  scrambles the slots, and a rest-parameter `infer` hands back the whole
 *  intersection (all four measured). A carrier is therefore rebuilt from its
 *  INDEXES, which the intersection exposes unchanged: every slot up to the
 *  required arity, then the rest of them under `Partial` so their `?` comes
 *  back, with the labels re-attached. **/
type SubstituteTuple<T extends readonly unknown[], P extends [unknown]> =
  HasCarried<T> extends true
    ? IsFixedArity<T> extends true
      ? TupleFromIndexes<T, P, RequiredArity<T>> & CarrySlots<T, P>
      : [
          ...TupleFromIndexes<T, P, RequiredArity<T>>,
          ...Partial<OptionalSlots<T, P> extends infer Slots extends unknown[] ? Slots : []>,
        ] &
          CarrySlots<T, P>
    : {-readonly [K in keyof T]: SubstituteSelf<T[K], P>};

/** A tuple whose length is ONE numeric literal: no optional slot, which makes
 *  `length` a union of the legal arities. (A REST element makes `length` plain
 *  `number`, and that is the array arm — this is only ever reached with a
 *  literal or a union of literals.) **/
type IsFixedArity<T extends readonly unknown[]> = IsUnion<T['length']> extends true ? false : true;

type IsUnion<X, All = X> = X extends unknown ? ([All] extends [X] ? false : true) : never;

/** The accumulator whose length is the tuple's REQUIRED arity — the smallest
 *  member of the `length` union, found by counting up to the first member. **/
type RequiredArity<T extends readonly unknown[], Acc extends unknown[] = []> = Acc['length'] extends T['length']
  ? Acc
  : RequiredArity<T, [...Acc, unknown]>;

/** The accumulator whose length is the tuple's TOTAL arity. A tuple's legal
 *  arities are contiguous, so counting stops at the first length the union no
 *  longer admits. **/
type TotalArity<T extends readonly unknown[], Acc extends unknown[] = RequiredArity<T>> = [
  ...Acc,
  unknown,
]['length'] extends T['length']
  ? TotalArity<T, [...Acc, unknown]>
  : Acc;

/** Rebuild a tuple slot by slot up to `Stop`, substituting each element — the
 *  intersection's element slots ARE the tuple's, so indexing reaches them
 *  without needing the base type back. **/
type TupleFromIndexes<
  T,
  P extends [unknown],
  Stop extends unknown[],
  Acc extends unknown[] = [],
> = Acc['length'] extends Stop['length']
  ? Acc
  : TupleFromIndexes<T, P, Stop, [...Acc, SubstituteSelf<T[Acc['length'] & keyof T], P>]>;

/** The slots PAST the required arity, stripped of the `undefined` their
 *  optionality adds (`Partial` puts it back when they are spliced on). **/
type OptionalSlots<T extends readonly unknown[], P extends [unknown]> = DropRequired<
  OptionalCandidates<T, P, TotalArity<T>>,
  RequiredArity<T>
>;

type OptionalCandidates<
  T,
  P extends [unknown],
  Stop extends unknown[],
  Acc extends unknown[] = [],
> = Acc['length'] extends Stop['length']
  ? Acc
  : OptionalCandidates<T, P, Stop, [...Acc, SubstituteSelf<NonNullable<T[Acc['length'] & keyof T]>, P>]>;

type DropRequired<All extends unknown[], Skip extends unknown[]> = Skip['length'] extends 0
  ? All
  : All extends [unknown, ...infer Rest]
    ? Skip extends [unknown, ...infer SkipRest]
      ? DropRequired<Rest, SkipRest extends unknown[] ? SkipRest : []>
      : All
    : [];

/** Ties a recursive body (containing `Self`) into the self-referential type it
 *  denotes — `Recursive<{next?: Self}>` ≡ `type Node = {next?: Node}`. The
 *  tuple-wrapped `[Recursive<Body>]` + `P[0]` read defers the self-reference so
 *  the alias is legal (a direct substitution errors TS2456). Root-level recursive
 *  TUPLES are the one shape TS can't build this way (TS2589) — author those
 *  type-first. **/
export type Recursive<Body> = SubstituteSelf<Body, [Recursive<Body>]>;
// #endregion substituteself-extract
