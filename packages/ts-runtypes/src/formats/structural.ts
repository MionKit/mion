// Structural formats — the value-first + type-first spelling of the JSON
// Schema array/object keywords that have no plain TS shape. There are exactly
// TWO wrappers, `FormattedArray<Base, P>` and `FormattedObject<Base, P>`, and
// EVERY array/object keyword rides their params bag (`FormattedArrayParams` /
// `FormattedObjectParams`). The literal keywords (length/count bounds,
// uniqueItems, closedness) ride the `__rtFormatParams` brand; the
// type-carrying keywords (contains, patternProperties, propertyNames) ride
// their own sentinel slots, because format params are walked into a literal
// map — a child schema can't live there. Each wrapper reproduces the schema
// door's lowering (fromJsonSchema.ts) member-for-member, so the three
// authoring modes (type-first, value-first, JSON Schema) converge on ONE
// structural id by construction.
//
// `closed` / `closedPatterns` (from `additionalProperties: false`) are part of
// `FormattedObjectParams` but are DERIVED, never hand-authored: an allowed-key
// list that disagrees with the inner shape is a silent always-reject footgun,
// so the value-first `object` builder computes them from the shape rather than
// taking a hand-written list (see compose.ts). The schema door derives them
// from the schema's own `properties`.

import type {RunType} from '../runtypes/types.ts';

/** The literal format-name strings the structural brands carry. Kept in sync
 *  with the Go emitters (internal/cachegen/typefunctions/formats/structural)
 *  and the generated catalog. */
export const FORMATTED_ARRAY_NAME = 'formattedArray';
export const FORMATTED_OBJECT_NAME = 'formattedObject';

type Flatten<T> = {[K in keyof T]: T[K]};

/** The two structural-brand sentinels, spelled raw (TypeFormat's base is
 *  primitive-constrained, so array / object brands carry the sentinels as a
 *  plain intersection member — same encoding the schema door emits). **/
type StructuralBrand<Name extends string, P extends object> = {
  readonly __rtFormatName?: Name;
  readonly __rtFormatParams?: P;
};

// ─────────────────────────── Array params ───────────────────────────

/** Every JSON Schema array keyword, as one bag. `minItems`/`maxItems` are
 *  exact length bounds, `uniqueItems` is 2020-12 deep JSON equality;
 *  `contains` (with the optional `minContains`/`maxContains` occurrence
 *  bounds) is the element type at least one item must match. In the type-first
 *  form `contains` is the element TYPE; the value-first `array` builder takes a
 *  `RunType` and maps it to that type. **/
export interface FormattedArrayParams {
  readonly minItems?: number;
  readonly maxItems?: number;
  readonly uniqueItems?: true;
  readonly contains?: unknown;
  readonly minContains?: number;
  readonly maxContains?: number;
}

/** The value-first shape of `FormattedArrayParams` — `contains` carries a
 *  `RunType` instead of the bare element type. **/
export interface FormattedArrayParamsValueFirst {
  readonly minItems?: number;
  readonly maxItems?: number;
  readonly uniqueItems?: true;
  readonly contains?: RunType<unknown>;
  readonly minContains?: number;
  readonly maxContains?: number;
}

// The literal keywords that ride `__rtFormatParams` (contains/*Contains ride
// the sentinel below, so they're excluded here).
type ArrayLiteralPart<P> = Flatten<
  (P extends {minItems: infer N extends number} ? {readonly minItems: N} : unknown) &
    (P extends {maxItems: infer N extends number} ? {readonly maxItems: N} : unknown) &
    (P extends {uniqueItems: true} ? {readonly uniqueItems: true} : unknown)
>;

// The `contains` child slot — matches the door's ContainsPart exactly:
// `{rt$child: C; rt$min: N|1; rt$max?: M}` under an optional `__rtContains`.
type ContainsSlot<P> = P extends {contains: infer C}
  ? {
      readonly __rtContains?: Flatten<
        {readonly rt$child: C} & (P extends {minContains: infer N extends number} ? {readonly rt$min: N} : {readonly rt$min: 1}) &
          (P extends {maxContains: infer N extends number} ? {readonly rt$max: N} : unknown)
      >;
    }
  : unknown;

/** An array/tuple base carrying every array keyword in `P`. The literal bounds
 *  ride the `formattedArray` brand (added only when at least one is present,
 *  matching the door), `contains` rides its own child sentinel. **/
export type FormattedArray<Base extends readonly unknown[], P extends FormattedArrayParams> = Base &
  ([keyof ArrayLiteralPart<P>] extends [never] ? unknown : StructuralBrand<typeof FORMATTED_ARRAY_NAME, ArrayLiteralPart<P>>) &
  ContainsSlot<P>;

// Map a value-first array params bag to its type-first form (unwrap the
// `contains` RunType to its carried element type).
type ArrayParamsType<P> = Flatten<
  Pick<P, Extract<keyof P, 'minItems' | 'maxItems' | 'uniqueItems' | 'minContains' | 'maxContains'>> &
    (P extends {contains: RunType<infer C>} ? {readonly contains: C} : unknown)
>;

/** The type-first `FormattedArray` a value-first `array(item, params)` call
 *  produces — used for the builder's `InjectRunTypeId` / return type. **/
export type FormattedArrayFrom<T extends readonly unknown[], P> = FormattedArray<T, ArrayParamsType<P> & FormattedArrayParams>;

// ─────────────────────────── Object params ──────────────────────────

/** Every JSON Schema object keyword, as one bag. `minProperties`/
 *  `maxProperties` are key-count bounds; `patternProperties` maps a
 *  pattern-source to the value TYPE its matching keys carry; `propertyNames`
 *  is the string constraint every key must satisfy; `closed`/`closedPatterns`
 *  are the derived allowed-key lists behind `additionalProperties: false`. **/
export interface FormattedObjectParams {
  readonly minProperties?: number;
  readonly maxProperties?: number;
  readonly patternProperties?: Record<string, unknown>;
  readonly propertyNames?: string;
  readonly closed?: readonly string[];
  readonly closedPatterns?: readonly string[];
}

/** The value-first shape of `FormattedObjectParams` — `patternProperties`
 *  maps to `RunType`s and `propertyNames` is a `RunType`. **/
export interface FormattedObjectParamsValueFirst {
  readonly minProperties?: number;
  readonly maxProperties?: number;
  readonly patternProperties?: Record<string, RunType<unknown>>;
  readonly propertyNames?: RunType<string>;
  readonly closed?: readonly string[];
  readonly closedPatterns?: readonly string[];
}

type ObjectLiteralPart<P> = Flatten<
  (P extends {minProperties: infer N extends number} ? {readonly minProperties: N} : unknown) &
    (P extends {maxProperties: infer N extends number} ? {readonly maxProperties: N} : unknown) &
    (P extends {closed: infer K extends readonly string[]} ? {readonly closed: K} : unknown) &
    (P extends {closedPatterns: infer K extends readonly string[]} ? {readonly closedPatterns: K} : unknown)
>;

// The `patternProperties` slot — matches the door's PatternPropsPart: each
// key's `rt$key` is a stringFormat pattern brand over the source, `rt$value`
// is the pattern's value type.
type PatternPropsSlot<P> = P extends {patternProperties: infer M}
  ? {
      readonly __rtPatternProps?: {
        readonly [K in keyof M]: {
          readonly rt$key: string & StructuralBrand<'stringFormat', {readonly pattern: {readonly source: K; readonly flags: ''}}>;
          readonly rt$value: M[K];
        };
      };
    }
  : unknown;

// The `propertyNames` slot — matches the door's PropNamesPart (`never` is the
// `propertyNames: false` case: no key may be present).
type PropNamesSlot<P> = P extends {propertyNames: infer N} ? {readonly __rtPropNames?: N} : unknown;

/** An object/record base carrying every object keyword in `P`. The literal
 *  bounds + closedness ride the `formattedObject` brand (added only when at
 *  least one is present), `patternProperties` and `propertyNames` ride their
 *  own sentinels. **/
export type FormattedObject<Base extends object, P extends FormattedObjectParams> = Base &
  ([keyof ObjectLiteralPart<P>] extends [never] ? unknown : StructuralBrand<typeof FORMATTED_OBJECT_NAME, ObjectLiteralPart<P>>) &
  PatternPropsSlot<P> &
  PropNamesSlot<P>;

type ObjectParamsType<P> = Flatten<
  Pick<P, Extract<keyof P, 'minProperties' | 'maxProperties' | 'closed' | 'closedPatterns'>> &
    (P extends {patternProperties: infer M}
      ? {readonly patternProperties: {[K in keyof M]: M[K] extends RunType<infer V> ? V : never}}
      : unknown) &
    (P extends {propertyNames: RunType<infer K extends string>} ? {readonly propertyNames: K} : unknown)
>;

/** The type-first `FormattedObject` a value-first `object(config, params)` /
 *  `record(…, params)` call produces. **/
export type FormattedObjectFrom<T extends object, P> = FormattedObject<T, ObjectParamsType<P> & FormattedObjectParams>;

// ───────────────────── Runtime carrier composition ──────────────────

// The runtime builder carrier is an opaque plain object (`builderResult` takes
// it as `unknown` — the reflected node comes from the injected type, so the
// carrier is only the nested runtime value). Typed `object`, never `RunType`,
// exactly like the composer carriers in compose.ts.

/** Wraps a base array/tuple carrier with whatever array keywords `params`
 *  declares, composing the same carrier nodes the engine already understands
 *  (a `formattedArray` brand for the literal bounds, a `contains` child slot).
 *  Returns the base unchanged when `params` is undefined/empty. **/
export function applyArrayParams(base: object, params: FormattedArrayParamsValueFirst | undefined): object {
  if (!params) return base;
  let node: object = base;
  const literal: Record<string, unknown> = {};
  if (params.minItems !== undefined) literal.minItems = params.minItems;
  if (params.maxItems !== undefined) literal.maxItems = params.maxItems;
  if (params.uniqueItems !== undefined) literal.uniqueItems = params.uniqueItems;
  if (Object.keys(literal).length > 0) {
    node = {type: FORMATTED_ARRAY_NAME, child: node, params: literal};
  }
  if (params.contains !== undefined) {
    const bounds: Record<string, unknown> = {};
    if (params.minContains !== undefined) bounds.minContains = params.minContains;
    if (params.maxContains !== undefined) bounds.maxContains = params.maxContains;
    node = {type: 'contains', child: node, contains: params.contains, bounds};
  }
  return node;
}

/** Wraps a base object/record carrier with whatever object keywords `params`
 *  declares (a `formattedObject` brand for the literal bounds + closedness,
 *  the `patternProperties` / `propertyNames` child slots). **/
export function applyObjectParams(base: object, params: FormattedObjectParamsValueFirst | undefined): object {
  if (!params) return base;
  let node: object = base;
  const literal: Record<string, unknown> = {};
  if (params.minProperties !== undefined) literal.minProperties = params.minProperties;
  if (params.maxProperties !== undefined) literal.maxProperties = params.maxProperties;
  if (params.closed !== undefined) literal.closed = params.closed;
  if (params.closedPatterns !== undefined) literal.closedPatterns = params.closedPatterns;
  if (Object.keys(literal).length > 0) {
    node = {type: FORMATTED_OBJECT_NAME, child: node, params: literal};
  }
  if (params.patternProperties !== undefined) {
    node = {type: 'patternProperties', child: node, patterns: params.patternProperties};
  }
  if (params.propertyNames !== undefined) {
    node = {type: 'propertyNames', child: node, keys: params.propertyNames};
  }
  return node;
}
