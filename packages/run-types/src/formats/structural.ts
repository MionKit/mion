// Structural formats — the value-first + type-first spelling of the
// array/object constraint keywords that have no plain TS shape. There are
// exactly TWO wrappers, `FormattedArray<Base, P>` and `FormattedObject<Base, P>`,
// and EVERY array/object keyword rides their params bag (`FormattedArrayParams` /
// `FormattedObjectParams`). The two authoring modes (type-first, value-first)
// converge on ONE structural id by construction.
//
// ONE BAG IN, TWO CHANNELS OUT. The params bag is the whole authoring surface:
// `contains` sits in `FormattedArrayParams` next to `minItems`, and a caller
// never picks a channel. The ENCODING splits, and only because the resolver
// forces it: `__rtFormatParams` is walked into a JSON literal map
// (`literalParamsFromType`, typeid/formats.go), whose fallback for a
// non-literal member is the PRINTED TYPE STRING. A child schema stored there
// would survive as text, so two different element types could collide on one
// id and one type spelled two ways could split. The keywords that carry a TYPE
// (`contains`, `patternProperties`, `propertyNames`) therefore ride a
// dedicated one-property sentinel instead, which the resolver walks as a real
// type. The literal-valued keywords
// (length/count bounds, uniqueItems, closedness) ride the brand.
//
// `closed` / `closedPatterns` (from `additionalProperties: false`) are part of
// `FormattedObjectParams` but are DERIVED, never hand-authored: an allowed-key
// list that disagrees with the inner shape is a silent always-reject footgun,
// so the value-first `object` builder computes them from the shape rather than
// taking a hand-written list (see compose.ts).

import type {RunType} from '../runtypes/types.ts';
import type {__rtFormatName, __rtFormatParams, __rtContains, __rtPatternProps, __rtPropNames} from '../runtypes/sentinelKeys.ts';

type Flatten<T> = {[K in keyof T]: T[K]};

// #region structural-slice — the type-first structural surface. It is
// RunType-free on purpose (the value-first halves that need RunType live BELOW
// the region); `Flatten` (above) and the sentinel KEY symbols are supplied by
// this module. The key symbols only have to be declared with the same NAMES
// (`declare const __rtFormatName: unique symbol`, …) — the resolver matches a
// symbol-keyed property on its declaration name, so a locally declared symbol
// is recognised exactly like the shipped one.

/** The literal format-name strings the structural brands carry. Kept in sync
 *  with the Go emitters (internal/cachegen/typefunctions/formats/structural)
 *  and the generated catalog. */
export const FORMATTED_ARRAY_NAME = 'formattedArray';
export const FORMATTED_OBJECT_NAME = 'formattedObject';

/** The two structural-brand sentinels, spelled raw (TypeFormat's base is
 *  primitive-constrained, so array / object brands carry the sentinels as a
 *  plain intersection member).
 *  Exported ONCE from here — this is the wide-brand shape every metadata
 *  walker (DataOnly's keep probes, StripRunTypeMeta's collapse) matches. **/
export type StructuralBrand<Name extends string, P extends object> = {
  readonly [__rtFormatName]?: Name;
  readonly [__rtFormatParams]?: P;
};

// ─────────────────────────── Array params ───────────────────────────

/** Every array constraint keyword, as one bag. `minItems`/`maxItems` are
 *  exact length bounds, `uniqueItems` is deep JSON equality;
 *  `contains` (with the optional `minContains`/`maxContains` occurrence
 *  bounds) is the element type at least one item must match.
 *
 *  `Contains` re-parameterises the one type-carrying slot so the value-first
 *  and type-first surfaces are the SAME interface: type-first passes the
 *  element type itself (the `unknown` default), while the `array` builder
 *  takes `FormattedArrayParamsValueFirst` — this bag with a `RunType` in that
 *  slot. **/
export interface FormattedArrayParams<Contains = unknown> {
  readonly minItems?: number;
  readonly maxItems?: number;
  readonly uniqueItems?: true;
  readonly contains?: Contains;
  readonly minContains?: number;
  readonly maxContains?: number;
}

// The literal keywords that ride `__rtFormatParams`. Selecting them by key is
// the whole job — the values pass through verbatim, so the id is whatever the
// caller wrote. `contains`/`minContains`/`maxContains` are absent by
// construction: they belong to the sentinel below.
type ArrayLiteralKeys = 'minItems' | 'maxItems' | 'uniqueItems';
type ArrayLiteralPart<P> = {readonly [K in Extract<keyof P, ArrayLiteralKeys>]: P[K]};

// The `contains` child slot:
// `{rt$child: C; rt$min: N|1; rt$max?: M}` under an optional `__rtContains`.
type ContainsSlot<P> = P extends {contains: infer C}
  ? {
      readonly [__rtContains]?: Flatten<
        {readonly rt$child: C} & (P extends {minContains: infer N extends number} ? {readonly rt$min: N} : {readonly rt$min: 1}) &
          (P extends {maxContains: infer N extends number} ? {readonly rt$max: N} : unknown)
      >;
    }
  : unknown;

/** An array/tuple base carrying every array keyword in `P`. The literal bounds
 *  ride the `formattedArray` brand (added only when at least one is present),
 *  `contains` rides its own child sentinel. **/
export type FormattedArray<Base extends readonly unknown[], P extends FormattedArrayParams> = Base &
  ([keyof ArrayLiteralPart<P>] extends [never] ? unknown : StructuralBrand<typeof FORMATTED_ARRAY_NAME, ArrayLiteralPart<P>>) &
  ContainsSlot<P>;

// ─────────────────────────── Object params ──────────────────────────

/** Every object constraint keyword, as one bag. `minProperties`/
 *  `maxProperties` are key-count bounds; `patternProperties` maps a
 *  pattern-source to the value TYPE its matching keys carry; `propertyNames`
 *  is the string constraint every key must satisfy; `closed`/`closedPatterns`
 *  are the derived allowed-key lists behind `additionalProperties: false`.
 *
 *  `Value` / `Key` re-parameterise the two type-carrying slots, exactly as
 *  `FormattedArrayParams` does with `Contains` — the value-first `object` /
 *  `record` builders take `FormattedObjectParamsValueFirst`, this same bag
 *  holding `RunType`s in those two slots. **/
export interface FormattedObjectParams<Value = unknown, Key = string> {
  readonly minProperties?: number;
  readonly maxProperties?: number;
  readonly patternProperties?: Record<string, Value>;
  readonly propertyNames?: Key;
  readonly closed?: readonly string[];
  readonly closedPatterns?: readonly string[];
  /** The keys a SCHEMA-valued `additionalProperties` exempts: the schema's OWN
   *  `properties`, and nothing else. Without it the emitted index-signature
   *  sweep exempts every key the merged object happens to declare, so a
   *  property contributed by an intersection member wrongly escapes the
   *  check. **/
  readonly additionalOwn?: readonly string[];
}

type ObjectLiteralKeys = 'minProperties' | 'maxProperties' | 'closed' | 'closedPatterns' | 'additionalOwn';
type ObjectLiteralPart<P> = {readonly [K in Extract<keyof P, ObjectLiteralKeys>]: P[K]};

// The `patternProperties` slot: each key's `rt$key` is a stringFormat pattern
// brand over the source, `rt$value` is the pattern's value type.
//
// `flags: ''` here is DELIBERATE and matches the runtime: the emitted key
// sweeps compile `new RegExp(source)` with no flags, so the brand (which only
// powers the mock sample pools) says the same.
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

// The `propertyNames` slot (`never` is the
// `propertyNames: false` case: no key may be present).
type PropNamesSlot<P> = P extends {propertyNames: infer N} ? {readonly [__rtPropNames]?: N} : unknown;

/** An object/record base carrying every object keyword in `P`. The literal
 *  bounds + closedness ride the `formattedObject` brand (added only when at
 *  least one is present), `patternProperties` and `propertyNames` ride their
 *  own sentinels. **/
export type FormattedObject<Base extends object, P extends FormattedObjectParams> = Base &
  ([keyof ObjectLiteralPart<P>] extends [never] ? unknown : StructuralBrand<typeof FORMATTED_OBJECT_NAME, ObjectLiteralPart<P>>) &
  PatternPropsSlot<P> &
  PropNamesSlot<P>;

// #endregion structural-slice

// ───────────── Value-first param shapes + reflected `…From` types ─────────────
// A builder's params bag is the SAME bag as above holding `RunType`s in its
// type-carrying slots, so these are ALIASES, never twins — a keyword added to
// one surface cannot go missing from the other. They sit outside the shared
// region only because they name `RunType`, which the region must not.

/** The `array` builder's params — `FormattedArrayParams` with a `RunType` in
 *  the `contains` slot. **/
export type FormattedArrayParamsValueFirst = FormattedArrayParams<RunType<unknown>>;

// Map a value-first array params bag to its type-first form (unwrap the
// `contains` RunType to its carried element type).
type ArrayParamsType<P> = Flatten<
  Pick<P, Extract<keyof P, 'minItems' | 'maxItems' | 'uniqueItems' | 'minContains' | 'maxContains'>> &
    (P extends {contains: RunType<infer C>} ? {readonly contains: C} : unknown)
>;

/** The type-first `FormattedArray` a value-first `array(item, params)` call
 *  produces — used for the builder's `InjectRunTypeId` / return type. **/
export type FormattedArrayFrom<T extends readonly unknown[], P> = FormattedArray<
  T,
  Extract<ArrayParamsType<P>, FormattedArrayParams>
>;

/** The `object` / `record` builders' params — `FormattedObjectParams` with
 *  `RunType`s in the `patternProperties` / `propertyNames` slots. **/
export type FormattedObjectParamsValueFirst = FormattedObjectParams<RunType<unknown>, RunType<string>>;

type ObjectParamsType<P> = Flatten<
  Pick<P, Extract<keyof P, 'minProperties' | 'maxProperties' | 'closed' | 'closedPatterns'>> &
    (P extends {patternProperties: infer M}
      ? {readonly patternProperties: {[K in keyof M]: M[K] extends RunType<infer V> ? V : never}}
      : unknown) &
    (P extends {propertyNames: RunType<infer K extends string>} ? {readonly propertyNames: K} : unknown)
>;

/** The type-first `FormattedObject` a value-first `object(config, params)` /
 *  `record(…, params)` call produces. **/
export type FormattedObjectFrom<T extends object, P> = FormattedObject<T, Extract<ObjectParamsType<P>, FormattedObjectParams>>;

// NO runtime counterpart to any of the above, deliberately. A builder's
// keywords reach the engine through the REFLECTED TYPE, never through a
// runtime value: `builderResult` resolves the injected id against the cache and
// discards the carrier it was handed (`presetBuilder` proves the point — it
// passes an empty `formatParams` stub for formats with real params). The
// carrier survives only on the un-injected fallback path, where the sole thing
// read of it is `isRunTypeLike`'s `'type' in arg` sniff. Composing the params
// into it a second time would be metadata no reader ever consults.
