// Structural formats and child-schema slots — the value-first spellings of
// the JSON Schema array/object keywords that have no plain TS shape:
// arrayFormat (length bounds, uniqueItems), objectFormat (key-count
// bounds), and the contains / patternProperties / propertyNames sentinel
// slots. Each TYPE here is the exact twin of the schema door's lowering
// (fromJsonSchema.ts), so the three authoring modes converge on ONE
// structural id by construction — the OneOf/Not precedent.
//
// Closedness (`additionalProperties: false`) is deliberately ABSENT from
// the value-first surface: its `closed` param carries the allowed-key list
// derived from the schema's own `properties` (the emitter documents it as
// never hand-authored), and a hand-written list that disagrees with the
// inner shape would be a silent footgun. Spell closedness through the
// schema door, or use the native unknown-keys tooling
// (createHasUnknownKeysFn / cloneExactShape).

import {builderResult, lastInjectedId} from '../runtypes/builderCore.ts';
import type {RunType} from '../runtypes/types.ts';
import type {InjectRunTypeId, CompTimeArgs} from '../markers.ts';
import type {ExactParams} from '../runtypes/builderTypes.ts';

type Flatten<T> = {[K in keyof T]: T[K]};

/** The two structural-brand sentinels, spelled raw (TypeFormat's base is
 *  primitive-constrained, so array / object brands carry the sentinels as a
 *  plain intersection member — same encoding the schema door emits). **/
type StructuralBrand<Name extends string, P extends object> = {
  readonly __rtFormatName?: Name;
  readonly __rtFormatParams?: P;
};

/** arrayFormat params — the engine's emitter surface (formats/structural).
 *  minItems/maxItems are exact length bounds; uniqueItems is 2020-12 deep
 *  JSON equality (numbers by value, objects by unordered keys). **/
export interface ArrayFormatParams {
  readonly minItems?: number;
  readonly maxItems?: number;
  readonly uniqueItems?: true;
}

/** objectFormat params — key-count bounds (`Object.keys(v).length`). **/
export interface ObjectFormatParams {
  readonly minProperties?: number;
  readonly maxProperties?: number;
}

/** An array/tuple base carrying the arrayFormat brand: the generated
 *  validator gains the exact length / uniqueness checks while the type
 *  stays assignable with its base. **/
export type ArrayFormat<Base extends readonly unknown[], P extends ArrayFormatParams> = Base & StructuralBrand<'arrayFormat', P>;

/** An object/record base carrying the objectFormat brand (key-count
 *  bounds). **/
export type ObjectFormat<Base extends object, P extends ObjectFormatParams> = Base & StructuralBrand<'objectFormat', P>;

/** JSON Schema `contains` as a type: at least Min (default 1) and at most
 *  Max (unbounded when never) items of Base validate against C. The
 *  sentinel value shape is the door's exact Flatten twin. **/
export type Contains<Base extends readonly unknown[], C, Min extends number = 1, Max extends number = never> = Base & {
  readonly __rtContains?: Flatten<
    {readonly rt$child: C; readonly rt$min: Min} & ([Max] extends [never] ? unknown : {readonly rt$max: Max})
  >;
};

/** JSON Schema `patternProperties` as a type: values under keys matching
 *  each pattern validate against that pattern's value type. Map is
 *  pattern-source → value type. The rt$key brand feeds the build-time
 *  pattern sample pools (key mocking); ids fold source + value only. **/
export type PatternProperties<Base extends object, Map extends Record<string, unknown>> = Base & {
  readonly __rtPatternProps?: {
    readonly [K in keyof Map]: {
      readonly rt$key: string & StructuralBrand<'stringFormat', {readonly pattern: {readonly source: K; readonly flags: ''}}>;
      readonly rt$value: Map[K];
    };
  };
};

/** JSON Schema `propertyNames` as a type: every KEY of Base (as a string)
 *  validates against K — typically a string format. **/
export type PropertyNames<Base extends object, K extends string> = Base & {readonly __rtPropNames?: K};

/** Length / uniqueness constraints on an array or tuple schema:
 *  `RT.arrayFormat(RT.array(TF.number()), {uniqueItems: true})` ≡
 *  `{type: 'array', items: {type: 'number'}, uniqueItems: true}`. **/
export function arrayFormat<T extends readonly unknown[], const P extends ArrayFormatParams>(
  inner: RunType<T>,
  params: CompTimeArgs<ExactParams<P, ArrayFormatParams>>,
  id?: InjectRunTypeId<ArrayFormat<T, P>>
): RunType<ArrayFormat<T, P>> {
  return builderResult(lastInjectedId(inner, id), {type: 'arrayFormat', child: inner, params});
}

/** Key-count bounds on an object or record schema:
 *  `RT.objectFormat(RT.record(TF.string()), {minProperties: 1})` ≡
 *  `{type: 'object', minProperties: 1}`. **/
export function objectFormat<T extends object, const P extends ObjectFormatParams>(
  inner: RunType<T>,
  params: CompTimeArgs<ExactParams<P, ObjectFormatParams>>,
  id?: InjectRunTypeId<ObjectFormat<T, P>>
): RunType<ObjectFormat<T, P>> {
  return builderResult(lastInjectedId(inner, id), {type: 'objectFormat', child: inner, params});
}

/** Occurrence bounds for `contains`: how many items must match. **/
export interface ContainsBounds {
  readonly minContains?: number;
  readonly maxContains?: number;
}

/** JSON Schema `contains`: at least min (default 1) / at most max items of
 *  the array match the child schema:
 *  `RT.contains(RT.array(TF.string()), TF.uuid())` ≡
 *  `{type: 'array', items: {type: 'string'}, contains: {format: 'uuid'}}`. **/
export function contains<T extends readonly unknown[], C, const B extends ContainsBounds = Record<never, never>>(
  inner: RunType<T>,
  child: RunType<C>,
  bounds?: CompTimeArgs<ExactParams<B, ContainsBounds>>,
  id?: InjectRunTypeId<
    Contains<
      T,
      C,
      B extends {minContains: infer N extends number} ? N : 1,
      B extends {maxContains: infer N extends number} ? N : never
    >
  >
): RunType<
  Contains<
    T,
    C,
    B extends {minContains: infer N extends number} ? N : 1,
    B extends {maxContains: infer N extends number} ? N : never
  >
> {
  return builderResult(lastInjectedId(child, id), {type: 'contains', child: inner, contains: child, bounds});
}

/** JSON Schema `patternProperties`: keys matching each pattern must map to
 *  values of that pattern's schema:
 *  `RT.patternProperties(RT.record(TF.number()), {'^a': TF.number()})`. **/
export function patternProperties<T extends object, const M extends Record<string, RunType<unknown>>>(
  inner: RunType<T>,
  map: CompTimeArgs<M>,
  id?: InjectRunTypeId<PatternProperties<T, {[K in keyof M]: M[K] extends RunType<infer V> ? V : never}>>
): RunType<PatternProperties<T, {[K in keyof M]: M[K] extends RunType<infer V> ? V : never}>> {
  return builderResult(lastInjectedId(inner, id), {type: 'patternProperties', child: inner, patterns: map});
}

/** JSON Schema `propertyNames`: every key validates (as a string) against
 *  the key schema: `RT.propertyNames(RT.record(TF.number()), TF.string({maxLength: 3}))`. **/
export function propertyNames<T extends object, K extends string>(
  inner: RunType<T>,
  keys: RunType<K>,
  id?: InjectRunTypeId<PropertyNames<T, K>>
): RunType<PropertyNames<T, K>> {
  return builderResult(lastInjectedId(keys, id), {type: 'propertyNames', child: inner, keys});
}
