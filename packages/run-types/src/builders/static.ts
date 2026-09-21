// The value-first surface's COMPOSER type channel — the type-level helpers compose.ts and
// utility.ts carry. The format-builder helpers live in runtypes/builderTypes.ts so the `formats/`
// builders and the composers here can share them, and are re-exported below so existing
// `./static.ts` importers keep resolving. No `infer` except where unavoidable (per CLAUDE.md).

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

/** Property-POSITION concerns `object`'s mapped type applies, NOT part of a field's identity. **/
export interface PropModifiers {
  optional?: true;
  readonly?: true;
}

/** The carrier `propMod(...)` produces; it never leaks past `object`'s mapped type. **/
export interface PropModCarrier<M extends PropModifiers, F> {
  readonly __propMod: M;
  readonly __field: F;
}

// object's per-field readers — all INDEXED ACCESS / structural guards, no `infer`.
/** Unwraps a field, inside a `propMod` carrier or bare, to the format type the property holds. **/
export type FieldOf<V> = V extends {__propMod: PropModifiers; __field: unknown} ? InferType<V['__field']> : InferType<V>;
export type IsOptional<V> = V extends {__propMod: {optional: true}} ? true : false;
export type IsReadonly<V> = V extends {__propMod: {readonly: true}} ? true : false;

/** Collapses a split-group object type back into ONE object literal: the identity map preserves each
 *  key's `?` / `readonly` exactly, so DON'T write `-readonly` here. The tiers below must build a group
 *  intersection (TS can't apply `?` / `readonly` per-key in one map), and left as-is that intersection
 *  is what `InferType` shows and it RE-forms at every nesting level. Also measured ~4–9% cheaper to
 *  instantiate than the raw intersection. **/
type Flatten<T> = {[K in keyof T]: T[K]};

/** The object type `object(C)` produces. The general 4-group (optional × readonly) split pays all four
 *  mapped-type passes on EVERY object and compounds at every nesting level (the dominant value-first
 *  type-check cost), so two cheap key-probes dispatch on the modifier PROFILE and emit the leanest map
 *  that is still exact. Every arm recovers the IDENTICAL type to the 4-way for its profile (proven in
 *  container/benchmarks/typecost/isolated-experiment.mjs), so the id still converges with the type-first
 *  object. Shared by `object`'s return type and its `InjectRunTypeId<…>` marker param. **/
type AnyOptional<C> = true extends {[K in keyof C]: IsOptional<C[K]>}[keyof C] ? true : false;
type AnyReadonly<C> = true extends {[K in keyof C]: IsReadonly<C[K]>}[keyof C] ? true : false;
/** Optional present, no readonly. **/
type ObjectOptionalOnly<C> = Flatten<
  {
    -readonly [K in keyof C as IsOptional<C[K]> extends true ? never : K]: FieldOf<C[K]>;
  } & {
    -readonly [K in keyof C as IsOptional<C[K]> extends true ? K : never]?: FieldOf<C[K]>;
  }
>;
/** Readonly present, no optional. **/
type ObjectReadonlyOnly<C> = Flatten<
  {
    -readonly [K in keyof C as IsReadonly<C[K]> extends true ? never : K]: FieldOf<C[K]>;
  } & {
    readonly [K in keyof C as IsReadonly<C[K]> extends true ? K : never]: FieldOf<C[K]>;
  }
>;
/** Both optional AND readonly present — the full 4-way split. **/
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

/** Homomorphic, so it preserves tuple length / order with no `infer`. The `-readonly` strips what
 *  `const T` inference adds at the `tuple` / `func` call sites, so the result converges with the type-first tuple. **/
export type MapTuple<T extends readonly RunType[]> = {-readonly [K in keyof T]: InferType<T[K]>};

// ───────────────────── Labeled tuples (slot form) ────────────────────
//
// The labels ride an ARRAY of slot carriers because tuples are the ONE order-preserving container in
// the type system: an object literal's key order is NOT observable (the checker keeps `keyof` unions
// sorted by internal type id), so a record-shaped API would scramble slot order. The builders' own
// object keys name the GROUPS, a fixed set read by name, so order never rides a key set. TypeScript
// cannot CONSTRUCT a labeled tuple with a mapped type, so the carried type is the values tuple
// intersected with the `__rtLabels` sentinel; the Go side lifts that sentinel into the structural id
// and the projected parameter names, so the slot form converges with the type-first labeled tuple.

/** The carrier `slot(label, value)` produces. Deliberately NOT a RunType (the PropModCarrier discipline):
 *  the labeled overloads require EVERY element to be a slot, so TS's all-or-nothing tuple-labeling rule
 *  falls out of overload resolution instead of a runtime check. **/
export interface SlotCarrier<Label extends string, Value> {
  readonly __slotLabel: Label;
  readonly __slotValue: RunType<Value>;
}

/** Homomorphic, so slot order is the written order and the result is the MUTABLE values tuple. **/
export type SlotValues<Slots extends readonly SlotCarrier<string, unknown>[]> = {
  -readonly [K in keyof Slots]: InferType<Slots[K]['__slotValue']>;
};

/** The label literals of a slots tuple, same order. **/
export type SlotLabels<Slots extends readonly SlotCarrier<string, unknown>[]> = {
  -readonly [K in keyof Slots]: Slots[K]['__slotLabel'];
};

/** Optional slots keep their `?` on the VALUES tuple; the labels tuple always covers every slot. **/
export type LabeledTuple<
  Slots extends readonly SlotCarrier<string, unknown>[],
  OptionalSlots extends readonly SlotCarrier<string, unknown>[] = [],
> = [...SlotValues<Slots>, ...Partial<SlotValues<OptionalSlots>>] & {
  readonly [__rtLabels]?: readonly [...SlotLabels<Slots>, ...SlotLabels<OptionalSlots>];
};

/** The rest slot is a labeled slot too (TS tuples label all slots or none), so any rest label is expressible. **/
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
// One overload per FAMILY (plain RunTypes, slot carriers) rather than one per shape: an absent `rest`
// group leaves its type parameter with no inference site, so it lands on the `never` default and a
// single non-distributive `[Rest] extends [never]` picks the shape. Folding the family check into
// conditionals too was measured at ~58% more instantiations AND stops rejecting mixed / unknown keys.

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

/** An empty / absent params group brands a bare `() => Return`, NOT `(...args: []) => …`: tsgo reflects
 *  the empty-tuple rest-spread as a spurious rest parameter, diverging from the written `() => R`. **/
export type FuncFromParams<Params extends readonly RunType[], Return> = Params extends readonly []
  ? () => Return
  : (...args: MapTuple<Params>) => Return;

/** `InferType` is a conditional on a naked type parameter, so it DISTRIBUTES over `T[number]` — one arm
 *  per member, no recursion. The old `infer Head` / `infer Tail` form guarded against a subtype
 *  REDUCTION that no longer happens (the two are proven type-identical across subset+superset, disjoint,
 *  literal-widening, duplicate and `any` arms) and cost ~70 instantiations per member against 12 here.
 *  NOT `MapTuple<T>[number]`: mapping materialises the whole mapped tuple before indexing it. **/
export type UnionOf<T extends readonly RunType[]> = InferType<T[number]>;

/** JSON Schema `anyOf` name parity. Pure sugar: no sentinel, and it converges on the plain union's id. **/
export type AnyOf<Branches extends readonly [unknown, ...unknown[]]> = Branches[number];

/** Recursive, terminating at `unknown`, the identity of `&`. Only the array-form `intersection` brands
 *  this (the positional overloads can't carry a trailing injected id past a rest), so the recursive-`infer`
 *  cost `UnionOf` documents is paid only there. **/
export type IntersectionOf<T extends readonly RunType[]> = T extends readonly [
  infer Head extends RunType,
  ...infer Tail extends readonly RunType[],
]
  ? InferType<Head> & IntersectionOf<Tail>
  : unknown;

/** A template-literal part: a string-literal segment or a `RunType` placeholder. **/
export type TemplatePart = string | RunType;

/** The TS template-literal interpolation domain — what a `${…}` placeholder may hold. **/
type Interpolatable = string | number | bigint | boolean | null | undefined;

/** Strips a leaf's FORMAT tag back to its base primitive, so a placeholder converges with the type-first
 *  plain `${number}` / `${string}`; otherwise the tag leaks in and the scanner reflects a permissive shape.
 *  Detection is by KEY PRESENCE, not a required-property `extends` check: the sentinels are optional on
 *  `TypeFormat`, and an optional prop does not satisfy a required-prop constraint. **/
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

/** Folds a parts tuple into the template-literal type it denotes. The `infer` head/tail split is
 *  unavoidable here: a mapped type can't JOIN into a template string, and the parts tuple is bounded by
 *  the call site so there is no deep-instantiation tax. **/
export type AssembleTemplate<P extends readonly TemplatePart[]> = P extends readonly [
  infer Head extends TemplatePart,
  ...infer Tail extends readonly TemplatePart[],
]
  ? `${PartText<Head>}${AssembleTemplate<Tail>}`
  : '';

// ─────────────────────── Recursive schemas (self / circular) ─────────
//
// `Recursive<Body>` ties the knot, substituting every `Self` the body carries with the recursive type
// itself. The reference is a compile-time marker, so no enclosing callback is needed to capture it.
// `circular` brands the FULLY-RESOLVED `Recursive<Body>`, so the Go scanner reflects an ordinary
// recursive type and (with the structural cycle-token anchor in typeid.go) converges with type-first.

// #region substituteself-extract — Self / SubstituteSelf / Recursive machinery;
// sliced verbatim between these markers by test/types/substituteSelfHarness.ts to
// build the recursive-schema budget test. Keep self-contained (only `lib` types).

/** The self-reference placeholder `self()` carries — a unique brand so nothing
 *  structural can collide with it. **/
declare const SelfBrand: unique symbol;
export type Self = {readonly [SelfBrand]: true};

/** Every sentinel key a CONTAINER can carry. A carrier is always `Base & {readonly [key]?: payload}`, and
 *  the substitution below must take that apart and put it back: rebuilding the base alone drops the
 *  payload, mapping over the whole intersection folds the sentinel INTO the base, and both move the
 *  structural id away from the type-first spelling. `CarriedKeyExhaustive` in
 *  test/types/sentinelCarry.test-d.ts fails the build if a new sentinel ships without a row here. **/
export type CarriedKey =
  | typeof __rtFormatName
  | typeof __rtFormatParams
  | typeof __rtFormatBrand
  | typeof __rtContains
  | typeof __rtPatternProps
  | typeof __rtPropNames
  | typeof __rtLabels;

/** True when `T` carries at least one sentinel: the gate each container arm gets, so a sentinel-free
 *  node keeps its ORIGINAL rebuild verbatim (no shape and no id may move for shapes that already work).
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

/** `Date` and `RegExp` are a FAST PATH, not a correctness mechanism: they are the builtins a schema
 *  carries most often. Nothing may be ADDED here that a real `Map` / `Set` is structurally assignable to,
 *  since this arm is tested BEFORE the Map / Set arms: such an entry would swallow `map(string(), self())`
 *  and leak the `Self`. That rules out the weak collections, so this list is not a place to fix a walk problem. **/

/** Does `T` reference `Self` anywhere? Walks the same structure as the substitution (Map/Set gated before
 *  the object arm), reading each composite's members as one union: the conditional is naked, so it
 *  distributes and `AnyTrue` folds the result. Bodies are finite trees (the knot is tied by `Recursive`,
 *  never inside a body), so this terminates. **/
type ContainsSelf<T, Depth extends unknown[] = []> = AnyTrue<ContainsSelfIn<T, Depth>>;

/** Folds a distributed boolean union: `never` (no members) and all-`false` mean "no Self". **/
type AnyTrue<B> = [B] extends [never] ? false : [B] extends [false] ? false : true;

type ContainsSelfIn<T, Depth extends unknown[]> = Depth['length'] extends 24
  ? // Still going at 24 levels means a class, a builtin or a resolved `Recursive<…>`: none can hold a `Self`.
    // `true` was measured: every such node reaches the rebuild, the resolver grows past 10 GB and is killed.
    // Price: a `Self` nested 24 or more levels under a probed node stays un-substituted.
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

/** Each member wrapped in a 1-tuple: read as ONE bare union, an `unknown`-valued member would absorb the
 *  union and hide a `Self` beside it (`Self | unknown` IS `unknown`). The box map never calls
 *  `ContainsSelf` itself, since a mapped type whose VALUES recurse references itself (TS2615). **/
type MemberBoxes<T> = {[K in keyof T]: [T[K]]};

type MembersContainSelf<Boxed, Depth extends unknown[]> = Boxed extends [infer Member]
  ? ContainsSelf<Member, Next<Depth>>
  : false;

/** Replaces every `Self` with the recursion fixpoint `P[0]`. `P` is a 1-tuple, and threading it rather
 *  than a bare type is what lets `Recursive` defer the self-reference. `T extends Self` distributes, so
 *  union members substitute individually. A node that does NOT reference `Self` is returned VERBATIM:
 *  every container rebuild below either drops a sentinel intersection (Map/Set/array rebuild from
 *  inferred pieces) or folds it into the base (the homomorphic maps), which moves the structural id away
 *  from the type-first spelling. It is also cheaper, since whole subtrees short-circuit. **/
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
  // Gate Map/Set behind cheap non-`infer` checks so non-collection nodes skip the inference machinery.
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

/** Re-attaches `Source`'s sentinel slots onto a rebuilt `Base`: the Map / Set / array rebuilds infer
 *  their pieces and would otherwise drop the intersection. Only reached for a node the cycle runs
 *  THROUGH, so `keyof` on an array (which instantiates the whole `Array<T>` interface) is paid only there. **/
type CarryOnto<Base, Source, P extends [unknown]> = HasCarried<Source> extends true ? Base & CarrySlots<Source, P> : Base;

/** Tuples the cycle runs through. The homomorphic map folds a sentinel INTO the tuple, and TypeScript
 *  cannot decompose `tuple & object` back into its tuple half (a variadic `infer` yields `unknown[]`, a
 *  spread widens to an array, a head/tail `infer` scrambles the slots, a rest-parameter `infer` hands back
 *  the whole intersection — all four measured). So a carrier is rebuilt from its INDEXES, which the
 *  intersection exposes unchanged, with the labels re-attached. **/
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

/** A tuple whose `length` is ONE numeric literal: an optional slot makes `length` a union of the legal
 *  arities, and a REST element makes it plain `number`, which is the array arm. **/
type IsFixedArity<T extends readonly unknown[]> = IsUnion<T['length']> extends true ? false : true;

type IsUnion<X, All = X> = X extends unknown ? ([All] extends [X] ? false : true) : never;

/** The accumulator whose length is the tuple's REQUIRED arity, the smallest member of the `length` union. **/
type RequiredArity<T extends readonly unknown[], Acc extends unknown[] = []> = Acc['length'] extends T['length']
  ? Acc
  : RequiredArity<T, [...Acc, unknown]>;

/** The accumulator whose length is the tuple's TOTAL arity: legal arities are contiguous, so counting
 *  stops at the first length the union no longer admits. **/
type TotalArity<T extends readonly unknown[], Acc extends unknown[] = RequiredArity<T>> = [
  ...Acc,
  unknown,
]['length'] extends T['length']
  ? TotalArity<T, [...Acc, unknown]>
  : Acc;

/** Rebuilds a tuple slot by slot up to `Stop`: the intersection's element slots ARE the tuple's, so
 *  indexing reaches them without needing the base type back. **/
type TupleFromIndexes<
  T,
  P extends [unknown],
  Stop extends unknown[],
  Acc extends unknown[] = [],
> = Acc['length'] extends Stop['length']
  ? Acc
  : TupleFromIndexes<T, P, Stop, [...Acc, SubstituteSelf<T[Acc['length'] & keyof T], P>]>;

/** The slots PAST the required arity, stripped of the `undefined` their optionality adds. **/
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

/** Ties a recursive body into the type it denotes: `Recursive<{next?: Self}>` ≡ `type Node = {next?: Node}`.
 *  The tuple-wrapped `[Recursive<Body>]` + `P[0]` read defers the self-reference so the alias is legal (a
 *  direct substitution errors TS2456). Root-level recursive TUPLES can't be built this way (TS2589). **/
export type Recursive<Body> = SubstituteSelf<Body, [Recursive<Body>]>;
// #endregion substituteself-extract
