// Composer builders — each takes child `RunType` schemas and returns the `RunType<…>` of the
// COMPOSED type: the Go scanner reflects the whole composed type off the trailing
// `InjectRunTypeId` brand, so the children ride the carrier only and are DISCARDED at runtime.
// They are branded `CompTimeArgs<…>`, so the scanner requires each child be a static builder call
// (or a `const` bound to one) and a dynamic schema (`cond ? a : b`, a `.map(...)`, a spread)
// raises a `CTA0xx` diagnostic instead of silently freezing whatever type it resolved to. The
// grouped `tuple` / `func` capture each group with `const T`, never a `readonly [...T]` spread:
// intersecting a spread target with the `CompTimeArgs` brand collapses the tuple to an array, so
// `const` + `MapTuple`'s `-readonly` is what keeps per-slot inference. Minimal `infer` per
// CLAUDE.md; the type-level helpers all live in static.ts, so this file is runtime-only.

import {builderResult} from '../runtypes/builderCore.ts';
import type {RunType} from '../runtypes/types.ts';
import type {ExactParams} from '../runtypes/builderTypes.ts';
import type {InjectRunTypeId, CompTimeArgs} from '../markers.ts';
import type {
  FormattedCollectionParamsValueFirst,
  FormattedMapParamsValueFirst,
  FormattedObjectParamsValueFirst,
  FormattedArrayFrom,
  FormattedObjectFrom,
  FormattedSetFrom,
  FormattedMapFrom,
} from '../formats/structural.ts';

// A trailing params bag is a PLAIN object: no RunType marker (`kind` / `type` / `__rtType`),
// which is what tells it apart from a child schema in a slot that also accepts one
// (`record`'s key/value), and from an injected id (a string or an entry-module Array).
function isRunTypeLike(arg: unknown): boolean {
  return typeof arg === 'object' && arg !== null && !Array.isArray(arg) && ('kind' in arg || 'type' in arg || '__rtType' in arg);
}
function isFormatParams(arg: unknown): boolean {
  return typeof arg === 'object' && arg !== null && !Array.isArray(arg) && !isRunTypeLike(arg);
}
function isSlotCarrier(arg: unknown): arg is {__slotLabel: string; __slotValue: RunType} {
  return typeof arg === 'object' && arg !== null && typeof (arg as {__slotLabel?: unknown}).__slotLabel === 'string';
}
function slotChild(arg: RunType | {__slotLabel: string; __slotValue: RunType}): RunType {
  return isSlotCarrier(arg) ? arg.__slotValue : (arg as RunType);
}
import type {
  InferType,
  UnionOf,
  IntersectionOf,
  TemplatePart,
  AssembleTemplate,
  ObjectType,
  PropModifiers,
  PropModCarrier,
  Self,
  Recursive,
  LabeledTuple,
  SlotCarrier,
  TupleFromGroups,
  LabeledTupleFromGroups,
  FuncFromParams,
} from './static.ts';

/** The trailing params bag is the value-first spelling of the JSON Schema collection keywords
 *  (`minItems` / `maxItems` / `uniqueItems` / `contains` + `minContains` / `maxContains`), the same bag `set` and `map` take. **/
export function array<T>(item: CompTimeArgs<RunType<T>>, id?: InjectRunTypeId<T[]>): RunType<T[]>;
export function array<T, const P extends FormattedCollectionParamsValueFirst>(
  item: CompTimeArgs<RunType<T>>,
  params: CompTimeArgs<ExactParams<P, FormattedCollectionParamsValueFirst>>,
  id?: InjectRunTypeId<FormattedArrayFrom<T[], P>>
): RunType<FormattedArrayFrom<T[], P>>;
export function array(
  item: RunType,
  arg2?: FormattedCollectionParamsValueFirst | InjectRunTypeId<unknown>,
  arg3?: InjectRunTypeId<unknown>
): RunType {
  const base = {type: 'array', child: item};
  if (isFormatParams(arg2)) {
    return builderResult(arg3, base);
  }
  return builderResult(arg2 as InjectRunTypeId<unknown> | undefined, base);
}

/** One labeled tuple slot / named function parameter, only meaningful inside `tuple(...)` / `func(...)`.
 *  Labels are part of a type's structural identity, and they ride a per-slot carrier because a
 *  slot-name-keyed spelling cannot work: the type system never observes object key order (see static.ts,
 *  SlotCarrier). The group keys those builders take are a fixed set read by name, so no order rides them. **/
export function slot<const Label extends string, Value>(
  label: CompTimeArgs<Label>,
  value: CompTimeArgs<RunType<Value>>
): SlotCarrier<Label, Value> {
  return {__slotLabel: label, __slotValue: value};
}

/** A tuple builder. The three slot GROUPS (`required` / `optional` / `rest`) are named and every
 *  key is optional; the trailing optional elements are their own group, not an inline `optional()`
 *  in one list, so the brand needs no recursive `infer`. Groups of PLAIN RunTypes author UNLABELED
 *  tuples, groups of `slot(label, value)` carriers author LABELED ones under the same keys (the
 *  `__rtLabels` sentinel; static.ts) — TS labels all slots or none, so slots and plain RunTypes
 *  never mix and the rest element is a slot too. The keys name the GROUPS, never the slots: a
 *  slot-name-keyed object cannot work (see `slot`), so order rides the array INSIDE each group. **/
export function tuple<const T extends readonly RunType[] = [], const O extends readonly RunType[] = [], RestValue = never>(
  parts: CompTimeArgs<{readonly required?: T; readonly optional?: O; readonly rest?: RunType<RestValue>}>,
  id?: InjectRunTypeId<TupleFromGroups<T, O, RestValue>>
): RunType<TupleFromGroups<T, O, RestValue>>;
export function tuple<
  const T extends readonly SlotCarrier<string, unknown>[] = [],
  const O extends readonly SlotCarrier<string, unknown>[] = [],
  const RestLabel extends string = never,
  RestValue = never,
>(
  parts: CompTimeArgs<{
    readonly required?: T;
    readonly optional?: O;
    readonly rest?: SlotCarrier<RestLabel, RestValue>;
  }>,
  id?: InjectRunTypeId<LabeledTupleFromGroups<T, O, RestLabel, RestValue>>
): RunType<LabeledTupleFromGroups<T, O, RestLabel, RestValue>>;
export function tuple(
  parts: {
    readonly required?: readonly (RunType | SlotCarrier<string, unknown>)[];
    readonly optional?: readonly (RunType | SlotCarrier<string, unknown>)[];
    readonly rest?: RunType | SlotCarrier<string, unknown>;
  },
  id?: InjectRunTypeId<unknown>
): RunType {
  // The groups are read by NAME, so there is no trailing-slot probing: the id always lands in
  // the one unfilled slot the overloads declare. The labels live on the brand only.
  return builderResult(id, {
    type: 'tuple',
    children: (parts.required ?? []).map(slotChild),
    optionalChildren: parts.optional?.map(slotChild),
    rest: parts.rest === undefined ? undefined : slotChild(parts.rest),
  });
}

/** A union builder. The brand must be a DIRECT union of the member types, NOT `MapTuple<T>[number]`:
 *  mapping the whole tuple before indexing it materialises a mapped type the union never needs. The
 *  cutoff for the fixed-arity overloads is 8, a measured outlier (`UNION.large_union_eight_arms`) where
 *  the direct brand still wins; overload resolution stops at the first matching arity, so narrower
 *  unions never pay for the wider overloads. **/
export function union<A, B>(
  members: CompTimeArgs<readonly [RunType<A>, RunType<B>]>,
  id?: InjectRunTypeId<A | B>
): RunType<A | B>;
export function union<A, B, C>(
  members: CompTimeArgs<readonly [RunType<A>, RunType<B>, RunType<C>]>,
  id?: InjectRunTypeId<A | B | C>
): RunType<A | B | C>;
export function union<A, B, C, D>(
  members: CompTimeArgs<readonly [RunType<A>, RunType<B>, RunType<C>, RunType<D>]>,
  id?: InjectRunTypeId<A | B | C | D>
): RunType<A | B | C | D>;
export function union<A, B, C, D, E>(
  members: CompTimeArgs<readonly [RunType<A>, RunType<B>, RunType<C>, RunType<D>, RunType<E>]>,
  id?: InjectRunTypeId<A | B | C | D | E>
): RunType<A | B | C | D | E>;
export function union<A, B, C, D, E, F>(
  members: CompTimeArgs<readonly [RunType<A>, RunType<B>, RunType<C>, RunType<D>, RunType<E>, RunType<F>]>,
  id?: InjectRunTypeId<A | B | C | D | E | F>
): RunType<A | B | C | D | E | F>;
export function union<A, B, C, D, E, F, G>(
  members: CompTimeArgs<readonly [RunType<A>, RunType<B>, RunType<C>, RunType<D>, RunType<E>, RunType<F>, RunType<G>]>,
  id?: InjectRunTypeId<A | B | C | D | E | F | G>
): RunType<A | B | C | D | E | F | G>;
export function union<A, B, C, D, E, F, G, H>(
  members: CompTimeArgs<
    readonly [RunType<A>, RunType<B>, RunType<C>, RunType<D>, RunType<E>, RunType<F>, RunType<G>, RunType<H>]
  >,
  id?: InjectRunTypeId<A | B | C | D | E | F | G | H>
): RunType<A | B | C | D | E | F | G | H>;
// Variable-arity fallback (9+ members). `const T` (not a `readonly [...T]` spread, which the
// CompTimeArgs brand collapses to an array) keeps the per-member precision UnionOf distributes over.
export function union<const T extends readonly RunType[]>(
  members: CompTimeArgs<T>,
  id?: InjectRunTypeId<UnionOf<T>>
): RunType<UnionOf<T>>;
export function union(members: readonly RunType[], id?: InjectRunTypeId<unknown>): RunType {
  return builderResult(id, {type: 'union', children: members});
}

/** JSON Schema `anyOf` name parity. A union already IS at-least-one, so this IS the union builder. **/
export const anyOf = union;

/** An intersection builder, two call shapes. Positional (1–4 members): omitted slots default to
 *  `unknown` and vanish (`X & unknown = X`), and the plugin pads them with `undefined` so the
 *  injected id lands on the trailing `InjectRunTypeId` parameter. Array (5+): a positional builder
 *  plus a TRAILING injected id can't go variadic (JS rest params must be last), so wider
 *  intersections take an array — the one place the recursive `infer` of `IntersectionOf` runs. **/
export function intersection<A, B = unknown, C = unknown, D = unknown>(
  a: CompTimeArgs<RunType<A>>,
  b?: CompTimeArgs<RunType<B>>,
  c?: CompTimeArgs<RunType<C>>,
  d?: CompTimeArgs<RunType<D>>,
  id?: InjectRunTypeId<A & B & C & D>
): RunType<A & B & C & D>;
export function intersection<const T extends readonly RunType[]>(
  members: CompTimeArgs<T>,
  id?: InjectRunTypeId<IntersectionOf<T>>
): RunType<IntersectionOf<T>>;
export function intersection(
  arg1: RunType | readonly RunType[],
  arg2?: RunType | InjectRunTypeId<unknown>,
  arg3?: RunType,
  arg4?: RunType,
  arg5?: InjectRunTypeId<unknown>
): RunType {
  // Array form: members in arg1, the injected id in arg2.
  if (Array.isArray(arg1)) {
    return builderResult(arg2 as InjectRunTypeId<unknown> | undefined, {type: 'intersection', children: arg1});
  }
  // Positional form: unused member slots are `undefined`, the injected id is padded to arg5.
  return builderResult(arg5, {
    type: 'intersection',
    children: [arg1, arg2, arg3, arg4] as readonly RunType[],
  });
}

/** A record / index-signature builder. With one schema the key defaults to `string`; with two, the
 *  key schema's type `K` (any `string | number` subtype, a template-literal pattern included) becomes
 *  the index-signature key. **/
export function record<V>(
  valueSchema: CompTimeArgs<RunType<V>>,
  id?: InjectRunTypeId<Record<string, V>>
): RunType<Record<string, V>>;
export function record<V, const P extends FormattedObjectParamsValueFirst>(
  valueSchema: CompTimeArgs<RunType<V>>,
  params: CompTimeArgs<ExactParams<P, FormattedObjectParamsValueFirst>>,
  id?: InjectRunTypeId<FormattedObjectFrom<Record<string, V>, P>>
): RunType<FormattedObjectFrom<Record<string, V>, P>>;
export function record<K extends string | number, V>(
  keySchema: CompTimeArgs<RunType<K>>,
  valueSchema: CompTimeArgs<RunType<V>>,
  id?: InjectRunTypeId<Record<K, V>>
): RunType<Record<K, V>>;
export function record<K extends string | number, V, const P extends FormattedObjectParamsValueFirst>(
  keySchema: CompTimeArgs<RunType<K>>,
  valueSchema: CompTimeArgs<RunType<V>>,
  params: CompTimeArgs<ExactParams<P, FormattedObjectParamsValueFirst>>,
  id?: InjectRunTypeId<FormattedObjectFrom<Record<K, V>, P>>
): RunType<FormattedObjectFrom<Record<K, V>, P>>;
export function record(
  arg1: RunType,
  arg2?: RunType | FormattedObjectParamsValueFirst | InjectRunTypeId<unknown>,
  arg3?: FormattedObjectParamsValueFirst | InjectRunTypeId<unknown>,
  arg4?: InjectRunTypeId<unknown>
): RunType {
  // arg2 is a child RunType → (key, value) form; a params bag → (value, params);
  // else (string / tuple / undefined) → value-only, key defaults to string.
  if (isRunTypeLike(arg2)) {
    const base = {type: 'record', index: arg1, child: arg2 as RunType};
    if (isFormatParams(arg3)) {
      return builderResult(arg4, base);
    }
    return builderResult(arg3 as InjectRunTypeId<unknown> | undefined, base);
  }
  const base = {type: 'record', child: arg1};
  if (isFormatParams(arg2)) {
    return builderResult(arg3 as InjectRunTypeId<unknown> | undefined, base);
  }
  return builderResult(arg2 as InjectRunTypeId<unknown> | undefined, base);
}

/** A `Map` builder; key and value schemas are both validated per entry. A Map's entry is its
 *  `[key, value]` pair, so the trailing collection bag's `contains` takes a TUPLE schema and its
 *  `uniqueItems` compares pairs by value. Two overloads, like `array`: a single signature with an
 *  optional bag was measured and rejected (test/types/builderCost.compile.test.ts) — the bare call
 *  must keep its plain id at its plain type cost. **/
export function map<K, V>(
  keySchema: CompTimeArgs<RunType<K>>,
  valueSchema: CompTimeArgs<RunType<V>>,
  id?: InjectRunTypeId<Map<K, V>>
): RunType<Map<K, V>>;
export function map<K, V, const P extends FormattedMapParamsValueFirst>(
  keySchema: CompTimeArgs<RunType<K>>,
  valueSchema: CompTimeArgs<RunType<V>>,
  params: CompTimeArgs<ExactParams<P, FormattedMapParamsValueFirst>>,
  id?: InjectRunTypeId<FormattedMapFrom<Map<K, V>, P>>
): RunType<FormattedMapFrom<Map<K, V>, P>>;
export function map(
  keySchema: RunType,
  valueSchema: RunType,
  arg3?: FormattedMapParamsValueFirst | InjectRunTypeId<unknown>,
  arg4?: InjectRunTypeId<unknown>
): RunType {
  const base = {type: 'map', index: keySchema, child: valueSchema};
  if (isFormatParams(arg3)) return builderResult(arg4, base);
  return builderResult(arg3 as InjectRunTypeId<unknown> | undefined, base);
}

/** A `Set` builder — each member is validated against the value schema; the trailing bag is the collection bag. **/
export function set<V>(valueSchema: CompTimeArgs<RunType<V>>, id?: InjectRunTypeId<Set<V>>): RunType<Set<V>>;
export function set<V, const P extends FormattedCollectionParamsValueFirst>(
  valueSchema: CompTimeArgs<RunType<V>>,
  params: CompTimeArgs<ExactParams<P, FormattedCollectionParamsValueFirst>>,
  id?: InjectRunTypeId<FormattedSetFrom<Set<V>, P>>
): RunType<FormattedSetFrom<Set<V>, P>>;
export function set(
  valueSchema: RunType,
  arg2?: FormattedCollectionParamsValueFirst | InjectRunTypeId<unknown>,
  arg3?: InjectRunTypeId<unknown>
): RunType {
  const base = {type: 'set', child: valueSchema};
  if (isFormatParams(arg2)) return builderResult(arg3, base);
  return builderResult(arg2 as InjectRunTypeId<unknown> | undefined, base);
}

/** The self-reference placeholder, only meaningful inside a `circular(...)` body. **/
export function self(id?: InjectRunTypeId<Self>): RunType<Self> {
  return builderResult(id, {type: 'self'});
}

/** A recursive schema with NO hand-written type: the body is passed DIRECTLY (no enclosing closure)
 *  and points back to itself with the compile-time `self()` marker. Brands the resolved
 *  `Recursive<Body>`, so the scanner reflects an ordinary recursive type. Under mutual recursion only
 *  a type's OWN back-edge uses `self()`; another already-declared run-type is a plain const reference. **/
export function circular<Body>(
  body: CompTimeArgs<RunType<Body>>,
  id?: InjectRunTypeId<Recursive<Body>>
): RunType<Recursive<Body>> {
  return builderResult(id, {type: 'circular', child: body});
}

/** Validates the thenable shape only: a pending promise's value isn't available synchronously. **/
export function promise<V>(valueSchema: CompTimeArgs<RunType<V>>, id?: InjectRunTypeId<Promise<V>>): RunType<Promise<V>> {
  return builderResult(id, {type: 'promise', child: valueSchema});
}

/** A function builder; `ret` defaults to `void` and both keys are optional. The `params` group takes
 *  three forms: an ARRAY of positional param RunTypes, an array of `slot(name, …)` carriers (parameter
 *  names fold into the structural id; all-required only), or a single params-TUPLE RunType, which is how
 *  optional / rest params are authored. An empty or omitted `params` brands a bare `() => InferType<R>`
 *  (see `FuncFromParams`, static.ts). Function values aren't serialisable, so the validator depends on
 *  POSITION: an object property is skipped, a tuple slot must be `undefined`, a top-level function passes
 *  a `typeof === 'function'` gate. **/
export function func<const P extends readonly RunType[] = [], R extends RunType = RunType<void>>(
  parts?: CompTimeArgs<{readonly params?: P; readonly ret?: R}>,
  id?: InjectRunTypeId<FuncFromParams<P, InferType<R>>>
): RunType<FuncFromParams<P, InferType<R>>>;
export function func<const P extends readonly SlotCarrier<string, unknown>[], R extends RunType = RunType<void>>(
  parts: CompTimeArgs<{readonly params: P; readonly ret?: R}>,
  id?: InjectRunTypeId<(...args: LabeledTuple<P>) => InferType<R>>
): RunType<(...args: LabeledTuple<P>) => InferType<R>>;
export function func<T extends readonly unknown[], R extends RunType = RunType<void>>(
  parts: CompTimeArgs<{readonly params: RunType<T>; readonly ret?: R}>,
  id?: InjectRunTypeId<(...args: T) => InferType<R>>
): RunType<(...args: T) => InferType<R>>;
export function func(
  parts?: {
    readonly params?: readonly (RunType | SlotCarrier<string, unknown>)[] | RunType;
    readonly ret?: RunType;
  },
  id?: InjectRunTypeId<unknown>
): RunType {
  // An ARRAY `params` is the array/slots form; a RunType OBJECT is the tuple form (its carried T
  // is the param tuple). The carrier `parameters` is not walked for root function schemas.
  const params = parts?.params;
  const parameters = Array.isArray(params) ? params.map(slotChild) : (params ?? []);
  return builderResult(id, {type: 'function', parameters, return: parts?.ret});
}

/** A callable-interface builder — a value that is BOTH callable AND carries data properties,
 *  `{(a: number): string; extra: string}`. The InferType is `Fn & Props` because TS can't express a
 *  call signature and mapped props in one object literal, but the scanner projects it as one, so it
 *  converges with the type-first callable interface. The function half isn't validated: the emitted
 *  validator checks `typeof === 'function'` PLUS the declared data properties. **/
export function callable<Fn, Props>(
  fn: CompTimeArgs<RunType<Fn>>,
  iface: CompTimeArgs<RunType<Props>>,
  id?: InjectRunTypeId<Fn & Props>
): RunType<Fn & Props> {
  return builderResult(id, {type: 'intersection', children: [fn, iface]});
}

/** Builds a TS template-literal type from a parts array mixing string segments and `RunType`
 *  placeholders: `templateLiteral(['api/user/', number()])` → `` RunType<`api/user/${number}`> ``.
 *  The result is a real template-literal TYPE, so it nests anywhere; the `const` type parameter is
 *  what keeps a segment a string literal instead of `string`. **/
export function templateLiteral<const P extends readonly TemplatePart[]>(
  parts: CompTimeArgs<P>,
  id?: InjectRunTypeId<AssembleTemplate<P>>
): RunType<AssembleTemplate<P>> {
  return builderResult(id, {type: 'templateLiteral', children: parts});
}

// ─────────────────── Object assembler + property modifiers ───────────
//
// The modifiers `propMod` / `optional` carry are a property-POSITION concern, NOT part of a field's
// identity, so they ride a DISTINCT carrier `object` unwraps: a brand intersection would corrupt the
// `__rtFormatName` / `__rtFormatParams` sentinels. `object`'s mapped type (`ObjectType<C>`) applies them.

/** Applies property modifiers to a field; only meaningful as a field inside `object(...)`. **/
export function propMod<const M extends PropModifiers, const F>(
  modifiers: CompTimeArgs<ExactParams<M, PropModifiers>>,
  field: CompTimeArgs<F>
): PropModCarrier<M, F> {
  return {__propMod: modifiers, __field: field};
}

/** Shortcut for the common modifier; use `propMod` for `readonly` or combinations. **/
export function optional<const F>(field: CompTimeArgs<F>): PropModCarrier<{optional: true}, F> {
  return propMod({optional: true}, field);
}

/** Assembles an object run-type from named field builders via `ObjectType<C>`: a bare field is a
 *  required + mutable property, a `propMod(...)` wrapper places the key (`key?:` / `readonly key:`).
 *  Strips the `const`-capture `readonly` from un-modified keys. The nested field builders are skipped
 *  by the scanner — the enclosing `object` marker reflects the whole shape. **/
export function object<const C extends Record<string, unknown>>(
  config: CompTimeArgs<C>,
  id?: InjectRunTypeId<ObjectType<C>>
): RunType<ObjectType<C>>;
export function object<const C extends Record<string, unknown>, const P extends FormattedObjectParamsValueFirst>(
  config: CompTimeArgs<C>,
  params: CompTimeArgs<ExactParams<P, FormattedObjectParamsValueFirst>>,
  id?: InjectRunTypeId<FormattedObjectFrom<ObjectType<C>, P>>
): RunType<FormattedObjectFrom<ObjectType<C>, P>>;
export function object(
  config: Record<string, unknown>,
  arg2?: FormattedObjectParamsValueFirst | InjectRunTypeId<unknown>,
  arg3?: InjectRunTypeId<unknown>
): RunType {
  if (isFormatParams(arg2)) {
    return builderResult(arg3, config);
  }
  return builderResult(arg2 as InjectRunTypeId<unknown> | undefined, config);
}
