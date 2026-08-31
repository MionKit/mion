// Composer builders — `array` / `tuple` / `union` / `intersection` / `record` /
// `map` / `set` / `promise` / `circular` / `self` / `func` / `templateLiteral`, plus the
// `object` assembler and the `propMod` / `optional` property modifiers. Each
// takes child `RunType` schemas and returns the generic `RunType<…>` for the
// COMPOSED type, via the same trailing-`InjectRunTypeId` marker every builder
// uses: the Go scanner reflects the whole composed type off the brand (collapsing
// intersections, distributing unions, …) and the runtime returns that reflected
// node. Nested child builders are skipped by the scanner — they exist only to
// drive TS inference for the brand (see atomic.ts `builderResult`).
//
// Minimal `infer` (per CLAUDE.md): `array`/`record` read their single child's `T`
// directly; `tuple` maps the child tuple with a homomorphic mapped type
// (`MapTuple`); `union` / `intersection` brand a DIRECT `A | B | …` / `A & B & …`
// via fixed-arity overloads (plain generic inference, NO `infer`) for the common
// arities, falling back to `UnionOf<T>` (distributive) / `IntersectionOf<T>` (the
// one recursive `infer` exception, see static.ts) only past 8 members. (`union` is
// array-form throughout; `intersection` is positional for 1–8 and array-form for
// 9+, since a positional builder can't carry a trailing injected id past a JS rest
// param.) The type-level helpers (`MapTuple`, `UnionOf`, `IntersectionOf`,
// `AssembleTemplate`, `ObjectType`, …) all live in static.ts; this file is
// runtime-only.
//
// Child schema params are branded `CompTimeArgs<…>`: the children ride the
// carrier only and are DISCARDED at runtime (the injected marker returns the
// reflected node), so the scanner enforces each child be a static builder call /
// array of builder calls / module-scope `const` bound to one — a dynamic schema
// (`cond ? a : b`, a `.map(...)`, a spread) raises a `CTA0xx` diagnostic instead
// of silently freezing whatever type it happened to resolve to. The grouped
// `tuple` / `func` capture each group with `const T` (not a
// `readonly [...T]` spread): intersecting a spread target with the
// `CompTimeArgs` brand collapses the tuple to an array, so `const` + `MapTuple`'s
// `-readonly` is the combination that keeps precise per-slot inference. `union`'s
// fixed-arity overloads take explicit member tuples (`[RunType<A>, RunType<B>]`),
// and its variable-arity fallback keeps the `[...T]` spread for `UnionOf<T>`.

import {builderResult} from '../runtypes/builderCore.ts';
import type {RunType} from '../runtypes/types.ts';
import type {ExactParams} from '../runtypes/builderTypes.ts';
import type {InjectRunTypeId, CompTimeArgs} from '../markers.ts';
import type {
  FormattedArrayParamsValueFirst,
  FormattedObjectParamsValueFirst,
  FormattedArrayFrom,
  FormattedObjectFrom,
} from '../formats/structural.ts';

// A trailing structural-format-params bag is a PLAIN object with none of the
// runtime RunType markers (`kind` on a reflected node, `type` on a builder
// carrier, `__rtType` on the phantom) — that's what tells it apart from a
// child schema in a slot that also accepts one (`record`'s key/value), and
// from an injected id (a string or an entry-module tuple / Array).
function isRunTypeLike(arg: unknown): boolean {
  return typeof arg === 'object' && arg !== null && !Array.isArray(arg) && ('kind' in arg || 'type' in arg || '__rtType' in arg);
}
function isFormatParams(arg: unknown): boolean {
  return typeof arg === 'object' && arg !== null && !Array.isArray(arg) && !isRunTypeLike(arg);
}
// A slot carrier from `slot(label, value)` — probed structurally so the
// labeled forms unwrap elements at runtime.
function isSlotCarrier(arg: unknown): arg is {__slotLabel: string; __slotValue: RunType} {
  return typeof arg === 'object' && arg !== null && typeof (arg as {__slotLabel?: unknown}).__slotLabel === 'string';
}
// Unwraps a slot carrier to its child RunType; bare RunTypes pass through.
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

/** An array builder. `array(string())` → `RunType<string[]>`; with a trailing
 *  structural-format params bag, `array(number(), {uniqueItems: true, maxItems: 3})`
 *  → `RunType<FormattedArray<number[], …>>`, the value-first spelling of the
 *  JSON Schema array keywords (`minItems`/`maxItems`/`uniqueItems`/`contains`
 *  + `minContains`/`maxContains`). **/
export function array<T>(item: CompTimeArgs<RunType<T>>, id?: InjectRunTypeId<T[]>): RunType<T[]>;
export function array<T, const P extends FormattedArrayParamsValueFirst>(
  item: CompTimeArgs<RunType<T>>,
  params: CompTimeArgs<ExactParams<P, FormattedArrayParamsValueFirst>>,
  id?: InjectRunTypeId<FormattedArrayFrom<T[], P>>
): RunType<FormattedArrayFrom<T[], P>>;
export function array(
  item: RunType,
  arg2?: FormattedArrayParamsValueFirst | InjectRunTypeId<unknown>,
  arg3?: InjectRunTypeId<unknown>
): RunType {
  const base = {type: 'array', child: item};
  if (isFormatParams(arg2)) {
    return builderResult(arg3, base);
  }
  return builderResult(arg2 as InjectRunTypeId<unknown> | undefined, base);
}

/** One labeled tuple slot / named function parameter, for the labeled forms
 *  of `tuple(...)` and `func(...)`: `slot('x', number())` names its slot `x`.
 *  Labels are part of a type's structural identity (a labeled tuple is a
 *  different type from its unlabeled twin), which is why they ride an explicit
 *  per-slot carrier — a slot-name-keyed spelling cannot work, as the type system
 *  never observes object key order (see static.ts, SlotCarrier). The group keys
 *  those builders DO take (`required` / `optional` / `rest`, `params` / `ret`)
 *  are a fixed set read by name, so no order rides them. A bare `slot(...)` is
 *  only meaningful inside `tuple(...)` / `func(...)`. **/
export function slot<const Label extends string, Value>(
  label: CompTimeArgs<Label>,
  value: CompTimeArgs<RunType<Value>>
): SlotCarrier<Label, Value> {
  return {__slotLabel: label, __slotValue: value};
}

/** A tuple builder. The three slot GROUPS are named and every key is optional.
 *  Groups of PLAIN RunTypes author UNLABELED tuples:
 *   - Fixed:    `tuple({required: [string(), number()]})` → `RunType<[string, number]>`.
 *   - Optional: `tuple({required: [number()], optional: [bigint(), boolean()]})` →
 *               `RunType<[number, bigint?, boolean?]>` — the `optional` group holds
 *               the trailing optional elements; `Partial<MapTuple<O>>` makes each
 *               slot `?`. A separate group (not inline `optional()` in one list) so
 *               the brand needs no recursive `infer`.
 *   - Rest:     `tuple({required: [number()], rest: string()})` →
 *               `RunType<[number, ...string[]]>`.
 *   - Optional + rest: `tuple({required: [number()], optional: [bigint()], rest: string()})` →
 *               `RunType<[number, bigint?, ...string[]]>`.
 *   - Empty:    `tuple({})` → `RunType<[]>`.
 *  Groups of `slot(label, value)` carriers author LABELED tuples under the same
 *  keys, converging with the type-first labeled tuple on one structural id (the
 *  `__rtLabels` sentinel; static.ts). TS labels all slots or none, so slots and
 *  plain RunTypes never mix — the rest element is a slot too, carrying any rest
 *  label:
 *   - `tuple({required: [slot('x', number()), slot('y', number())]})` → `RunType<[x: number, y: number]>`.
 *   - `tuple({required: [slot('x', number())], optional: [slot('y', number())]})` → `RunType<[x: number, y?: number]>`.
 *   - `tuple({required: [slot('x', number())], rest: slot('items', string())})` →
 *     `RunType<[x: number, ...items: string[]]>`.
 *  The keys name the GROUPS, never the slots — a slot-name-keyed object
 *  (`{x: number()}`) cannot work, as the type system never observes object key
 *  order (see `slot`); order rides the array INSIDE each group. Each group is
 *  captured as a tuple via `const T` (length/order preserved) — the
 *  `CompTimeArgs` brand rules out the `readonly [...T]` spread, which would
 *  collapse it to an array; `MapTuple` / `SlotValues` recover element types. The
 *  scanner reflects the whole tuple type off the brand, so the children ride the
 *  carrier only. **/
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
  // The groups are read by NAME, so there is no trailing-slot probing: the id
  // always lands in the one unfilled slot the overloads declare. Slot carriers
  // unwrap to their child RunTypes; the labels live on the brand only (the
  // scanner reflects the whole type off it).
  return builderResult(id, {
    type: 'tuple',
    children: (parts.required ?? []).map(slotChild),
    optionalChildren: parts.optional?.map(slotChild),
    rest: parts.rest === undefined ? undefined : slotChild(parts.rest),
  });
}

/** A union builder — `union([string(), number()])` → `RunType<string | number>`.
 *
 *  The brand must be a DIRECT union of the member types (`A | B | …`), NOT
 *  `MapTuple<T>[number]`: mapping the whole tuple before indexing it materialises
 *  a mapped type the union never needs. The fixed-arity overloads below brand the
 *  direct union with plain generic inference for up to 8 members; beyond that the
 *  trailing array overload falls back to `UnionOf<T>`, which distributes
 *  `InferType` over `T[number]`. The cutoff is 8 (was 4): the 8-arm union is a
 *  measured outlier (`UNION.large_union_eight_arms`) where the direct
 *  `A | … | H` brand still wins, and overload resolution stops at the first
 *  matching arity, so narrower unions never pay for the wider overloads. **/
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
// Variable-arity fallback (9+ members) — `UnionOf<T>`. Captures the member tuple
// with `const T` (not a `readonly [...T]` spread, which the CompTimeArgs brand
// collapses to an array — losing the per-member precision UnionOf distributes
// over).
export function union<const T extends readonly RunType[]>(
  members: CompTimeArgs<T>,
  id?: InjectRunTypeId<UnionOf<T>>
): RunType<UnionOf<T>>;
export function union(members: readonly RunType[], id?: InjectRunTypeId<unknown>): RunType {
  return builderResult(id, {type: 'union', children: members});
}

/** The at-least-one combinator builder — JSON Schema `anyOf` name parity.
 *  A union already IS at-least-one, so this is the union builder itself:
 *  same brand, same id, same generated validator. **/
export const anyOf = union;

/** An intersection builder, two call shapes:
 *   - Positional (1–4 members): `intersection(a, b, …)` → `RunType<A & B & …>`.
 *     Omitted slots default to `unknown` and vanish (`X & unknown = X`); the plugin
 *     pads the unused slots with `undefined` so the injected id lands on the trailing
 *     `InjectRunTypeId` parameter.
 *   - Array (5+ members): `intersection([a, b, …])` → `RunType<IntersectionOf<T>>`.
 *     A positional builder + a TRAILING injected id can't go variadic (JS rest
 *     params must be last), so wider intersections use the array form — the same
 *     array+`infer` pattern as `union` / `tuple`. The recursive `infer`
 *     (`IntersectionOf`) runs ONLY here. The positional cutoff matches `union` (4):
 *     real intersections are 2–3 types, and `IntersectionOf`'s shallow tuple
 *     recursion at 5+ is cheap (see the `union` note). **/
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
  // Array form (5+ / variadic path): members in arg1, the injected id in arg2.
  if (Array.isArray(arg1)) {
    return builderResult(arg2 as InjectRunTypeId<unknown> | undefined, {type: 'intersection', children: arg1});
  }
  // Positional form (1–4): members a–d (unused slots are `undefined`), the injected
  // id padded to the trailing slot (arg5).
  return builderResult(arg5, {
    type: 'intersection',
    children: [arg1, arg2, arg3, arg4] as readonly RunType[],
  });
}

/** A record / index-signature builder. Two forms:
 *   - Value-only: `record(number())` → `RunType<Record<string, number>>`
 *     (`{[k: string]: number}`) — the key defaults to `string`.
 *   - Key + value: `record(templateLiteral(['api/', string()]), number())` → a
 *     `Record` whose key is the template-literal pattern the key schema carries.
 *     The key schema's type `K` (any `string | number` subtype, incl. a
 *     template-literal pattern) becomes the index-signature key. **/
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

/** A `Map` builder — `map(string(), number())` → `RunType<Map<string, number>>`.
 *  Both the key and value schemas are validated per entry. **/
export function map<K, V>(
  keySchema: CompTimeArgs<RunType<K>>,
  valueSchema: CompTimeArgs<RunType<V>>,
  id?: InjectRunTypeId<Map<K, V>>
): RunType<Map<K, V>> {
  return builderResult(id, {type: 'map', index: keySchema, child: valueSchema});
}

/** A `Set` builder — `set(string())` → `RunType<Set<string>>`. Each member is
 *  validated against the value schema. **/
export function set<V>(valueSchema: CompTimeArgs<RunType<V>>, id?: InjectRunTypeId<Set<V>>): RunType<Set<V>> {
  return builderResult(id, {type: 'set', child: valueSchema});
}

/** The self-reference placeholder for `circular(…)` — marks where a recursive
 *  type points back to itself. Only meaningful inside a `circular(...)` body. **/
export function self(id?: InjectRunTypeId<Self>): RunType<Self> {
  return builderResult(id, {type: 'self'});
}

/** A self-referential (recursive) schema with NO hand-written type. The body is
 *  passed DIRECTLY (no enclosing function) and points back to itself with the
 *  `self()` marker — a compile-time placeholder, so RunTypes needs no runtime
 *  closure to capture the self-reference the way runtime schema libraries do:
 *
 *    const Node = circular(object({value: number(), next: optional(self())}));
 *    type Node = InferType<typeof Node>;   // {value: number; next?: Node}
 *
 *  Brands the resolved `Recursive<Body>`, so the scanner reflects an ordinary
 *  recursive type and converges with the type-first form (structural cycle token).
 *  Mutual recursion: each type's OWN back-edge uses `self()`; cross-references to
 *  another already-declared run-type are plain const references. **/
export function circular<Body>(
  body: CompTimeArgs<RunType<Body>>,
  id?: InjectRunTypeId<Recursive<Body>>
): RunType<Recursive<Body>> {
  return builderResult(id, {type: 'circular', child: body});
}

/** A `Promise` builder — `promise(string())` → `RunType<Promise<string>>`.
 *  Validates the thenable shape (the resolved value type is not checked at
 *  runtime — a pending promise's value isn't available synchronously). **/
export function promise<V>(valueSchema: CompTimeArgs<RunType<V>>, id?: InjectRunTypeId<Promise<V>>): RunType<Promise<V>> {
  return builderResult(id, {type: 'promise', child: valueSchema});
}

/** A function builder. The `params` group takes three forms, `ret` names the
 *  return (defaulting to `void`), and both keys are optional:
 *   - Array: `func({params: [string(), number()], ret: boolean()})` →
 *            `RunType<(a: string, b: number) => boolean>` — each element is a
 *            positional param RunType, mapped via `MapTuple` (rest-tuple form, so
 *            `(...args: [string, number])` ≡ `(a: string, b: number)`).
 *   - Slots: `func({params: [slot('event', string()), slot('retries', number())], ret: boolean()})` →
 *            `RunType<(event: string, retries: number) => boolean>` — each slot
 *            names its parameter, so the value-first id converges with the
 *            written call signature's (parameter names fold into the structural
 *            id). All-required params only; optional/rest params ride the
 *            tuple form.
 *   - Tuple: `func({params: tuple({required: [number()], optional: [string()]}), ret: date()})` →
 *            `RunType<(a: number, b?: string) => Date>` — a single params-TUPLE
 *            RunType, so optional/rest params ride the `tuple()` builder
 *            (labels included when the tuple uses its slot form).
 *  `func()` and `func({})` → `RunType<() => void>`; an empty or omitted `params`
 *  group brands a bare `() => InferType<R>` (see `FuncFromParams`, static.ts).
 *  Function values aren't serialisable, so the validator a function lowers to
 *  depends on POSITION: a function-typed object property is skipped entirely, a
 *  function at a tuple slot must be `undefined`, and a top-level function passes
 *  a `typeof === 'function'` gate. The builder exists so those shapes can be
 *  authored value-first. **/
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
  // An ARRAY `params` is the array/slots form (positional param RunTypes, slot
  // carriers unwrapped); a RunType OBJECT is the tuple form (a single
  // params-tuple RunType whose carried T is the param tuple — lets optional/rest
  // params be authored via tuple()). The carrier `parameters` is not walked for
  // root function schemas.
  const params = parts?.params;
  const parameters = Array.isArray(params) ? params.map(slotChild) : (params ?? []);
  return builderResult(id, {type: 'function', parameters, return: parts?.ret});
}

/** A callable-interface builder — a value that is BOTH callable AND carries data
 *  properties, e.g. `{(a: number, b: boolean): string; extra: string}`. It mixes a
 *  call-signature schema (`func(...)`) with an interface's data properties
 *  (`object({...})`): `callable(func({params: [number(), boolean()], ret: string()}), object({extra: string()}))`.
 *
 *  The result's InferType is `Fn & Props` — TS can't express a single object literal
 *  carrying a call signature AND mapped props in one type, so the mix is an
 *  intersection; but the Go scanner projects it as an object literal carrying the
 *  call signature + members, and the structural id embeds the call signature, so it
 *  converges with the type-first callable interface `{(): r; props}`. The function
 *  half is `notSupported` for validation (functions aren't validated) — the emitted
 *  validator checks `typeof === 'function'` PLUS the declared data properties. **/
export function callable<Fn, Props>(
  fn: CompTimeArgs<RunType<Fn>>,
  iface: CompTimeArgs<RunType<Props>>,
  id?: InjectRunTypeId<Fn & Props>
): RunType<Fn & Props> {
  return builderResult(id, {type: 'intersection', children: [fn, iface]});
}

/** A template-literal builder — value-first authoring of a TS template-literal
 *  type from a parts array mixing string segments and `RunType` placeholders:
 *  `templateLiteral(['api/user/', number()])` → `` RunType<`api/user/${number}`> ``;
 *  `templateLiteral([string(), '/', number()])` → `` RunType<`${string}/${number}`> ``;
 *  `templateLiteral([union([literal('a'), literal('b')]), '-', number()])` →
 *  `` RunType<`${'a' | 'b'}-${number}`> ``. Because the result is a real
 *  template-literal TYPE it nests anywhere (object property, union member) and
 *  converges with the type-first `` createValidateFn<`…`>() `` through the existing
 *  reflection — no Go-side change. The `const` type parameter captures
 *  string-literal segments (`'api/user/'` stays a literal, not `string`); the
 *  parts ride the carrier only. **/
export function templateLiteral<const P extends readonly TemplatePart[]>(
  parts: CompTimeArgs<P>,
  id?: InjectRunTypeId<AssembleTemplate<P>>
): RunType<AssembleTemplate<P>> {
  return builderResult(id, {type: 'templateLiteral', children: parts});
}

// ─────────────────── Object assembler + property modifiers ───────────
//
// `object(...)` composes leaf builders / composers into an object run-type;
// `propMod` / `optional` wrap a field with a property MODIFIER (optional /
// readonly) that `object`'s mapped type (`ObjectType<C>`, static.ts) applies. The
// modifiers are a property-POSITION concern, NOT part of a field's identity, so
// they ride a DISTINCT carrier (no brand intersection, which would corrupt the
// `__rtFormatName` / `__rtFormatParams` sentinels); `object` unwraps it.

/** Applies property modifiers to a field for use inside `object(...)`:
 *  `propMod({optional: true}, string({maxLength: 5}))`, `propMod({readonly:
 *  true}, number())`, or both. A bare `propMod(...)` is only meaningful as a
 *  field inside `object(...)`. **/
export function propMod<const M extends PropModifiers, const F>(
  modifiers: CompTimeArgs<ExactParams<M, PropModifiers>>,
  field: CompTimeArgs<F>
): PropModCarrier<M, F> {
  return {__propMod: modifiers, __field: field};
}

/** Shortcut for `propMod({optional: true}, field)` — marks a field optional
 *  (`key?:`) inside `object(...)`. The common modifier gets a terse spelling;
 *  reach for `propMod` for `readonly` or combinations. **/
export function optional<const F>(field: CompTimeArgs<F>): PropModCarrier<{optional: true}, F> {
  return propMod({optional: true}, field);
}

/** Assembles an object run-type from named field builders, building the object
 *  type via `ObjectType<C>`: a bare field is a required + mutable property; a
 *  `propMod({optional?, readonly?}, field)` wrapper places the key (`key?:` /
 *  `readonly key:`). Strips the `const`-capture `readonly` from un-modified keys
 *  and unwraps each field's `RunType<…>` to its type via `FieldOf`/`InferType`, so
 *  leaf builders AND composers (`array`/`tuple`/`union`/`record`/nested `object`)
 *  nest freely.
 *
 *  Like every builder, `object` returns the generic `RunType<ObjectType<C>>`:
 *  `typeof object({...})` is the run-type node, `InferType<typeof …>` recovers the
 *  object type, and the value drops straight into `createValidateFn(...)` or nests
 *  inside another composer. The nested field builders are skipped by the scanner —
 *  the enclosing `object` marker reflects the whole shape. **/
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
