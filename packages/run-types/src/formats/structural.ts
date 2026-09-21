// Structural formats: the value-first + type-first spelling of the collection/object constraint
// keywords that have no plain TS shape, both converging on ONE structural id. A caller writes one
// params bag; the ENCODING splits because the resolver forces it. Keywords carrying a TYPE
// (`contains`, `patternProperties`, `propertyNames`) ride a dedicated one-property sentinel, the
// literal-valued ones ride the brand: `__rtFormatParams` is walked into a JSON literal map
// (`literalParamsFromType`, typeid/formats.go) whose fallback for a non-literal member is the PRINTED
// TYPE STRING, so a child schema stored there could collide two element types on one id, or split one
// type spelled two ways. `closed` / `closedPatterns` are DERIVED from the shape by the value-first
// `object` builder (compose.ts), never hand-authored: a list disagreeing with the shape silently rejects.

import type {RunType} from '../runtypes/types.ts';
import type {__rtFormatName, __rtFormatParams, __rtContains, __rtPatternProps, __rtPropNames} from '../runtypes/sentinelKeys.ts';

type Flatten<T> = {[K in keyof T]: T[K]};

// #region structural-slice — the type-first structural surface, RunType-free on purpose (the
// value-first halves live BELOW the region). The resolver matches a symbol-keyed property on its
// declaration NAME, so a sentinel symbol declared locally is recognised exactly like the shipped one.

/** Kept in sync with the Go emitters (internal/cachegen/typefunctions/formats/structural) and the generated catalog. */
export const FORMATTED_ARRAY_NAME = 'formattedArray';
export const FORMATTED_OBJECT_NAME = 'formattedObject';

/** Spelled raw because TypeFormat's base is primitive-constrained; the wide-brand shape every
 *  metadata walker (DataOnly's keep probes, StripRunTypeMeta's collapse) matches. **/
export type StructuralBrand<Name extends string, P extends object> = {
  readonly [__rtFormatName]?: Name;
  readonly [__rtFormatParams]?: P;
};

// ────────────────────────── Collection params ─────────────────────────

/** One bag shared by the array, Set and Map wrappers. An ENTRY is an array item, a Set member or a
 *  Map's `[key, value]` pair, so on a Map `contains` takes a TUPLE; `uniqueItems` is deep JSON
 *  equality over the entries, `contains` the entry type at least one entry must match. `Contains`
 *  re-parameterises the one type-carrying slot so value-first and type-first stay the SAME interface
 *  (the builders pass a `RunType` there, type-first the entry type itself). **/
export interface FormattedCollectionParams<Contains = unknown> {
  readonly minItems?: number;
  readonly maxItems?: number;
  readonly uniqueItems?: true;
  readonly contains?: Contains;
  readonly minContains?: number;
  readonly maxContains?: number;
}

/** @deprecated Renamed to `FormattedCollectionParams` (an Array, a Set and a Map all take it). This alias is kept for one release; migrate `FormattedArrayParams<C>` → `FormattedCollectionParams<C>`. */
export type FormattedArrayParams<Contains = unknown> = FormattedCollectionParams<Contains>;

// The literal keywords that ride `__rtFormatParams`; values pass through verbatim, so the id is
// whatever the caller wrote. The `contains` trio is absent by construction: it belongs to the sentinel below.
type CollectionLiteralKeys = 'minItems' | 'maxItems' | 'uniqueItems';
type CollectionLiteralPart<P> = {readonly [K in Extract<keyof P, CollectionLiteralKeys>]: P[K]};

type ContainsSlot<P> = P extends {contains: infer C}
  ? {
      readonly [__rtContains]?: Flatten<
        {readonly rt$child: C} & (P extends {minContains: infer N extends number} ? {readonly rt$min: N} : {readonly rt$min: 1}) &
          (P extends {maxContains: infer N extends number} ? {readonly rt$max: N} : unknown)
      >;
    }
  : unknown;

/** An array/tuple base carrying every collection keyword in `P`. **/
export type FormattedArray<Base extends readonly unknown[], P extends FormattedCollectionParams> = Base &
  ([keyof CollectionLiteralPart<P>] extends [never]
    ? unknown
    : StructuralBrand<typeof FORMATTED_ARRAY_NAME, CollectionLiteralPart<P>>) &
  ContainsSlot<P>;

// ─────────────────────────── Set / Map brands ───────────────────────────
// A Set is an array on the wire and a Map an array of `[key, value]` pairs, so both take the
// collection bag WHOLE and one Go helper serves the three families. The resolver lifts the brand
// onto the Map / Set class node the way it lifts a format brand onto `Date`.

/** Kept in sync with the Go emitters (structural/collectionformat.go) and the generated catalog. */
export const FORMATTED_SET_NAME = 'formattedSet';
export const FORMATTED_MAP_NAME = 'formattedMap';

/** A Set base carrying every collection keyword in `P`: the bounds count the members (read off
 *  `.size`), `uniqueItems` is deep JSON equality over them (a `Set<{id: number}>` may hold two
 *  structurally equal objects), `contains` is the member type at least one member must match. **/
export type FormattedSet<Base extends ReadonlySet<unknown>, P extends FormattedCollectionParams> = Base &
  ([keyof CollectionLiteralPart<P>] extends [never]
    ? unknown
    : StructuralBrand<typeof FORMATTED_SET_NAME, CollectionLiteralPart<P>>) &
  ContainsSlot<P>;

// A Map's ENTRY, hence the shape of its `contains` child: unconstrained, `{contains: number}` would
// compile into a validator that ALWAYS rejects, which nothing downstream can tell from a deliberate
// constraint. Exactly two slots, so a wrong-arity or optional/rest tuple is rejected at the call site too.
type MapEntry = readonly [unknown, unknown];

/** The collection bag as a MAP takes it: the one type-carrying slot narrowed to a `[key, value]` pair. **/
export type FormattedMapParams = FormattedCollectionParams<MapEntry>;

/** A Map base carrying every collection keyword in `P`, all reading over its `[key, value]` pairs
 *  (its wire form): the bounds count them off `.size`, `uniqueItems` is deep JSON equality over the
 *  PAIRS (two structurally equal keys duplicate only when the values match too), and `contains` is a
 *  two-slot TUPLE at least one pair must match, `unknown` in a slot skipping that slot. **/
export type FormattedMap<Base extends ReadonlyMap<unknown, unknown>, P extends FormattedMapParams> = Base &
  ([keyof CollectionLiteralPart<P>] extends [never]
    ? unknown
    : StructuralBrand<typeof FORMATTED_MAP_NAME, CollectionLiteralPart<P>>) &
  ContainsSlot<P>;

// ─────────────────────────── Object params ──────────────────────────

/** Every object constraint keyword, as one bag: `patternProperties` maps a pattern SOURCE to the
 *  value TYPE its matching keys carry, `propertyNames` is the string constraint every key must
 *  satisfy, `closed` / `closedPatterns` are the derived allowed-key lists behind
 *  `additionalProperties: false`. `Value` / `Key` re-parameterise the two type-carrying slots, as
 *  `Contains` does above, and the builders pass `RunType`s there. **/
export interface FormattedObjectParams<Value = unknown, Key = string> {
  readonly minProperties?: number;
  readonly maxProperties?: number;
  readonly patternProperties?: Record<string, Value>;
  readonly propertyNames?: Key;
  readonly closed?: readonly string[];
  readonly closedPatterns?: readonly string[];
  /** The keys a SCHEMA-valued `additionalProperties` exempts: the schema's OWN `properties`, nothing
   *  else. Without it the emitted index-signature sweep also exempts keys an intersection member
   *  contributed, which then wrongly escape the check. **/
  readonly additionalOwn?: readonly string[];
}

type ObjectLiteralKeys = 'minProperties' | 'maxProperties' | 'closed' | 'closedPatterns' | 'additionalOwn';
type ObjectLiteralPart<P> = {readonly [K in Extract<keyof P, ObjectLiteralKeys>]: P[K]};

// The `patternProperties` slot; `flags: ''` is DELIBERATE and matches the runtime: the emitted key
// sweeps compile `new RegExp(source)` with no flags, so the brand (which only powers the mock sample
// pools) says the same.
type PatternPropsSlot<P> = P extends {patternProperties: infer M}
  ? {
      readonly [__rtPatternProps]?: {
        readonly [K in keyof M]: {
          readonly rt$key: string & StructuralBrand<'stringFormat', {readonly pattern: {readonly source: K; readonly flags: ''}}>;
          readonly rt$value: M[K];
        };
      };
    }
  : unknown;

// The `propertyNames` slot; `never` is the `propertyNames: false` case: no key may be present.
type PropNamesSlot<P> = P extends {propertyNames: infer N} ? {readonly [__rtPropNames]?: N} : unknown;

/** An object/record base carrying every object keyword in `P`. **/
export type FormattedObject<Base extends object, P extends FormattedObjectParams> = Base &
  ([keyof ObjectLiteralPart<P>] extends [never] ? unknown : StructuralBrand<typeof FORMATTED_OBJECT_NAME, ObjectLiteralPart<P>>) &
  PatternPropsSlot<P> &
  PropNamesSlot<P>;

// #endregion structural-slice

// ───────────── Value-first param shapes + reflected `…From` types ─────────────
// A builder's params bag is the SAME bag as above holding `RunType`s in its type-carrying slots, so
// these are ALIASES, never twins: a keyword added to one surface cannot go missing from the other.
// They sit outside the shared region only because they name `RunType`, which the region must not.

/** The params bag every COLLECTION builder takes (`array` / `set` / `map`). **/
export type FormattedCollectionParamsValueFirst = FormattedCollectionParams<RunType<unknown>>;

/** @deprecated Renamed to `FormattedCollectionParamsValueFirst`. This alias is kept for one release. */
export type FormattedArrayParamsValueFirst = FormattedCollectionParamsValueFirst;

/** The `map` builder's params, the value-first twin of `FormattedMapParams`: `RT.tuple({required:
 *  [k, v]})` satisfies its `contains` slot; a single-value schema does not, which is the point. **/
export type FormattedMapParamsValueFirst = FormattedCollectionParams<RunType<readonly [unknown, unknown]>>;

// To the type-first form: the `contains` RunType unwraps to its carried entry type.
type CollectionParamsType<P> = Flatten<
  Pick<P, Extract<keyof P, 'minItems' | 'maxItems' | 'uniqueItems' | 'minContains' | 'maxContains'>> &
    (P extends {contains: RunType<infer C>} ? {readonly contains: C} : unknown)
>;

/** The type-first `FormattedArray` a value-first `array(item, params)` call produces. **/
export type FormattedArrayFrom<T extends readonly unknown[], P> = FormattedArray<
  T,
  Extract<CollectionParamsType<P>, FormattedCollectionParams>
>;

/** The type-first `FormattedSet` a value-first `set(item, params)` call produces. **/
export type FormattedSetFrom<T extends ReadonlySet<unknown>, P> = FormattedSet<
  T,
  Extract<CollectionParamsType<P>, FormattedCollectionParams>
>;

/** The type-first `FormattedMap` a value-first `map(key, value, params)` call produces; a Map's
 *  `contains` RunType is the TUPLE of its key and value schemas, and unwraps to the tuple type. **/
export type FormattedMapFrom<T extends ReadonlyMap<unknown, unknown>, P> = FormattedMap<
  T,
  Extract<CollectionParamsType<P>, FormattedMapParams>
>;

/** The `object` / `record` builders' params. **/
export type FormattedObjectParamsValueFirst = FormattedObjectParams<RunType<unknown>, RunType<string>>;

type ObjectParamsType<P> = Flatten<
  Pick<P, Extract<keyof P, 'minProperties' | 'maxProperties' | 'closed' | 'closedPatterns'>> &
    (P extends {patternProperties: infer M}
      ? {readonly patternProperties: {[K in keyof M]: M[K] extends RunType<infer V> ? V : never}}
      : unknown) &
    (P extends {propertyNames: RunType<infer K extends string>} ? {readonly propertyNames: K} : unknown)
>;

/** The type-first `FormattedObject` a value-first `object(config, params)` / `record(…, params)` call produces. **/
export type FormattedObjectFrom<T extends object, P> = FormattedObject<T, Extract<ObjectParamsType<P>, FormattedObjectParams>>;

// NO runtime counterpart, deliberately: a builder's keywords reach the engine through the REFLECTED
// TYPE, and `builderResult` discards the carrier it was handed. The carrier survives only on the
// un-injected fallback path, where the sole thing read of it is `isRunTypeLike`'s `'type' in arg`
// sniff, so composing the params into it would be metadata no reader ever consults.
