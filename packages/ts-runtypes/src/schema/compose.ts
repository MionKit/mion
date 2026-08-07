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
// arities, falling back to a recursive `UnionOf<T>` / `IntersectionOf<T>` — the
// annotated `infer` exceptions (see static.ts) — only past 8 members. (`union` is
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
// of silently freezing whatever type it happened to resolve to. The variadic
// `tuple` / `func` capture their child tuple with `const T` (not a
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
import type {Conj, DepRequiredFold, DepSchemasFoldOf, KeysToTuple} from '../json-schema/fromJsonSchema.ts';
import type {NotSlot, NotableFormat, ValidNotOperand} from '../formats/not.ts';

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
import type {
  InferType,
  MapTuple,
  UnionOf,
  OneOf,
  IntersectionOf,
  TemplatePart,
  AssembleTemplate,
  ObjectType,
  PropModifiers,
  PropModCarrier,
  Self,
  Recursive,
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

/** A tuple builder. Four forms, each adding a trailing kind:
 *   - Fixed:    `tuple([string(), number()])` → `RunType<[string, number]>`.
 *   - Optional: `tuple([number()], [bigint(), boolean()])` →
 *               `RunType<[number, bigint?, boolean?]>` — the SECOND array holds
 *               the trailing optional elements; `Partial<MapTuple<O>>` makes each
 *               slot `?`. A separate arg (not inline `optional()` in one array) so
 *               the brand needs no recursive `infer`.
 *   - Rest:     `tuple([number()], string())` → `RunType<[number, ...string[]]>`
 *               — a single RunType second arg is the rest element.
 *   - Optional + rest: `tuple([number()], [bigint()], string())` →
 *               `RunType<[number, bigint?, ...string[]]>`.
 *  Disambiguated at runtime: an ARRAY second arg is the optional-items list, a
 *  RunType (object) second arg is the legacy rest element, a string is the
 *  injected id. Each list is captured as a tuple via `const T` (length/order
 *  preserved) — the `CompTimeArgs` brand rules out the `readonly [...T]` spread,
 *  which would collapse it to an array; `MapTuple` recovers element types. The
 *  scanner reflects the whole tuple type off the brand, so the children ride the
 *  carrier only. **/
export function tuple<const T extends readonly RunType[]>(
  items: CompTimeArgs<T>,
  id?: InjectRunTypeId<MapTuple<T>>
): RunType<MapTuple<T>>;
export function tuple<const T extends readonly RunType[], const O extends readonly RunType[]>(
  items: CompTimeArgs<T>,
  optionalItems: CompTimeArgs<O>,
  id?: InjectRunTypeId<[...MapTuple<T>, ...Partial<MapTuple<O>>]>
): RunType<[...MapTuple<T>, ...Partial<MapTuple<O>>]>;
export function tuple<const T extends readonly RunType[], const O extends readonly RunType[], R>(
  items: CompTimeArgs<T>,
  optionalItems: CompTimeArgs<O>,
  rest: CompTimeArgs<RunType<R>>,
  id?: InjectRunTypeId<[...MapTuple<T>, ...Partial<MapTuple<O>>, ...R[]]>
): RunType<[...MapTuple<T>, ...Partial<MapTuple<O>>, ...R[]]>;
export function tuple<const T extends readonly RunType[], R>(
  items: CompTimeArgs<T>,
  rest: CompTimeArgs<RunType<R>>,
  id?: InjectRunTypeId<[...MapTuple<T>, ...R[]]>
): RunType<[...MapTuple<T>, ...R[]]>;
export function tuple(
  items: readonly RunType[],
  arg2?: readonly RunType[] | RunType | InjectRunTypeId<unknown>,
  arg3?: RunType | InjectRunTypeId<unknown>,
  arg4?: InjectRunTypeId<unknown>
): RunType {
  // Disambiguate positional args at runtime:
  //   arg2 — optional-items list (Array) | legacy rest element (RunType object)
  //          | injected id (string)
  //   arg3 — rest element (RunType object) | injected id (string)
  //   arg4 — injected id (string)
  let optionalChildren: readonly RunType[] | undefined;
  let rest: RunType | undefined;
  let injectedId: InjectRunTypeId<unknown> | undefined;
  if (Array.isArray(arg2)) {
    optionalChildren = arg2;
    if (typeof arg3 === 'object' && arg3 !== null) {
      rest = arg3 as RunType;
      injectedId = arg4;
    } else {
      injectedId = arg3 as InjectRunTypeId<unknown> | undefined;
    }
  } else if (typeof arg2 === 'object' && arg2 !== null) {
    rest = arg2 as RunType;
    injectedId = arg3 as InjectRunTypeId<unknown> | undefined;
  } else {
    injectedId = arg2 as InjectRunTypeId<unknown> | undefined;
  }
  return builderResult(injectedId, {type: 'tuple', children: items, optionalChildren, rest});
}

/** A union builder — `union([string(), number()])` → `RunType<string | number>`.
 *
 *  The brand must be a DIRECT union of the member types (`A | B | …`), NOT
 *  `MapTuple<T>[number]`: the indexed-access form is subtype-REDUCED by tsgo, so a
 *  subset arm swallows its superset (`{a} | {a; b}` → `{a}`) and diverges from the
 *  written union. The fixed-arity overloads below brand the direct union with plain
 *  generic inference (NO `infer`) for up to 8 members; beyond that the trailing
 *  array overload falls back to the recursive `UnionOf<T>`. The cutoff is 8 (was 4):
 *  the 8-arm union is a measured outlier (`UNION.large_union_eight_arms`) where the
 *  recursive `UnionOf` build costs ~25% more than the direct `A | … | H` brand,
 *  and overload resolution stops at the
 *  first matching arity, so narrower unions never pay for the wider overloads.
 *  9+ members still recurse via `UnionOf<T>` — its non-tail recursion only nears
 *  TS's depth wall on very wide unions, which the fixed overloads can't cover anyway. **/
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
// Variable-arity fallback (9+ members) — recursive `UnionOf<T>`. Captures the
// member tuple with `const T` (not a `readonly [...T]` spread, which the
// CompTimeArgs brand collapses to an array — losing the per-member precision
// UnionOf needs to recurse).
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

/** The exactly-one combinator builder — `oneOf([string(), number()])` →
 *  `RunType<OneOf<[string, number]>>`. The brand carries the member tuple on
 *  the `__rtOneOf` sentinel (exclusivity counts BRANCHES, and TS union
 *  flattening erases that grouping), so the generated validator asserts the
 *  value matches exactly one member — a value matching two overlapping
 *  members fails where `union` / `anyOf` accept it. Fixed-arity overloads
 *  brand the direct tuple for 2–8 members (the `union` discipline: no
 *  recursive `infer` on the common path); the trailing array overload
 *  covers 9+ via `MapTuple`. **/
export function oneOf<A, B>(
  members: CompTimeArgs<readonly [RunType<A>, RunType<B>]>,
  id?: InjectRunTypeId<OneOf<[A, B]>>
): RunType<OneOf<[A, B]>>;
export function oneOf<A, B, C>(
  members: CompTimeArgs<readonly [RunType<A>, RunType<B>, RunType<C>]>,
  id?: InjectRunTypeId<OneOf<[A, B, C]>>
): RunType<OneOf<[A, B, C]>>;
export function oneOf<A, B, C, D>(
  members: CompTimeArgs<readonly [RunType<A>, RunType<B>, RunType<C>, RunType<D>]>,
  id?: InjectRunTypeId<OneOf<[A, B, C, D]>>
): RunType<OneOf<[A, B, C, D]>>;
export function oneOf<A, B, C, D, E>(
  members: CompTimeArgs<readonly [RunType<A>, RunType<B>, RunType<C>, RunType<D>, RunType<E>]>,
  id?: InjectRunTypeId<OneOf<[A, B, C, D, E]>>
): RunType<OneOf<[A, B, C, D, E]>>;
export function oneOf<A, B, C, D, E, F>(
  members: CompTimeArgs<readonly [RunType<A>, RunType<B>, RunType<C>, RunType<D>, RunType<E>, RunType<F>]>,
  id?: InjectRunTypeId<OneOf<[A, B, C, D, E, F]>>
): RunType<OneOf<[A, B, C, D, E, F]>>;
export function oneOf<A, B, C, D, E, F, G>(
  members: CompTimeArgs<readonly [RunType<A>, RunType<B>, RunType<C>, RunType<D>, RunType<E>, RunType<F>, RunType<G>]>,
  id?: InjectRunTypeId<OneOf<[A, B, C, D, E, F, G]>>
): RunType<OneOf<[A, B, C, D, E, F, G]>>;
export function oneOf<A, B, C, D, E, F, G, H>(
  members: CompTimeArgs<
    readonly [RunType<A>, RunType<B>, RunType<C>, RunType<D>, RunType<E>, RunType<F>, RunType<G>, RunType<H>]
  >,
  id?: InjectRunTypeId<OneOf<[A, B, C, D, E, F, G, H]>>
): RunType<OneOf<[A, B, C, D, E, F, G, H]>>;
export function oneOf<const T extends readonly [RunType, RunType, ...RunType[]]>(
  members: CompTimeArgs<T>,
  id?: InjectRunTypeId<OneOf<MapTuple<T>>>
): RunType<OneOf<MapTuple<T>>>;
export function oneOf(members: readonly RunType[], id?: InjectRunTypeId<unknown>): RunType {
  return builderResult(id, {type: 'oneOf', children: members});
}

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

/** A function builder. Two param forms:
 *   - Array: `func([string(), number()], boolean())` →
 *            `RunType<(a: string, b: number) => boolean>` — each element is a
 *            positional param RunType, mapped via `MapTuple` (rest-tuple form, so
 *            `(...args: [string, number])` ≡ `(a: string, b: number)`).
 *   - Tuple: `func(tuple([number()], [string()]), date())` →
 *            `RunType<(a: number, b?: string) => Date>` — a single params-TUPLE
 *            RunType, so optional/rest params ride the `tuple()` builder.
 *  `func()` → `RunType<() => void>`; `ret` defaults to `void`. Function values
 *  aren't serialisable, so the validator a function lowers to depends on POSITION:
 *  a function-typed object property is skipped entirely, a function at a tuple slot
 *  must be `undefined`, and a top-level function passes a `typeof === 'function'`
 *  gate. The builder exists so those shapes can be authored value-first. **/
// No-PARAMS form (overloads resolve top-to-bottom, so this is tried FIRST): an
// empty / omitted param list brands a bare `() => InferType<R>`. NOT `(...args: []) => …`
// — the empty-tuple rest-spread is reflected by tsgo as a spurious rest parameter,
// diverging from the written `() => R` and method shorthand. `ret` defaults to `void`.
export function func<R extends RunType = RunType<void>>(
  params?: CompTimeArgs<readonly []>,
  ret?: CompTimeArgs<R>,
  id?: InjectRunTypeId<() => InferType<R>>
): RunType<() => InferType<R>>;
export function func<const P extends readonly RunType[] = [], R extends RunType = RunType<void>>(
  params?: CompTimeArgs<P>,
  ret?: CompTimeArgs<R>,
  id?: InjectRunTypeId<(...args: MapTuple<P>) => InferType<R>>
): RunType<(...args: MapTuple<P>) => InferType<R>>;
export function func<T extends readonly unknown[], R extends RunType = RunType<void>>(
  paramsTuple: CompTimeArgs<RunType<T>>,
  ret?: CompTimeArgs<R>,
  id?: InjectRunTypeId<(...args: T) => InferType<R>>
): RunType<(...args: T) => InferType<R>>;
export function func(paramsOrTuple?: readonly RunType[] | RunType, ret?: RunType, id?: InjectRunTypeId<unknown>): RunType {
  // An ARRAY first arg is the array form (a list of positional param RunTypes); a
  // RunType OBJECT first arg is the tuple form (a single params-tuple RunType whose
  // carried T is the param tuple — lets optional/rest params be authored via
  // tuple()). The carrier `parameters` is not walked for root function schemas.
  const parameters = Array.isArray(paramsOrTuple) ? paramsOrTuple : (paramsOrTuple ?? []);
  return builderResult(id, {type: 'function', parameters, return: ret});
}

/** A callable-interface builder — a value that is BOTH callable AND carries data
 *  properties, e.g. `{(a: number, b: boolean): string; extra: string}`. It mixes a
 *  call-signature schema (`func(...)`) with an interface's data properties
 *  (`object({...})`): `callable(func([number(), boolean()], string()), object({extra: string()}))`.
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

// ───────────────── JSON Schema dependency + conditional builders ─────────────────
//
// The value-first twins of the schema door's dependent* / if-then-else
// lowerings (docs/todos/schema-builder-gaps.md). Each returns the EXACT type
// the door computes for the matching keyword — the arm and fold types are
// imported from fromJsonSchema.ts, so the two entrances share one lowering and
// converge on one structural id by construction. Without these, a schema →
// builder translation had to hand-expand the case-split union, losing the
// intent the reverse translation needs.

/** The consequence types of a dependentSchemas map — each value's RunType
 *  unwrapped to the type it carries. **/
type DepConsequences<D> = {[K in keyof D]: D[K] extends RunType<infer T> ? T : never};

/** JSON Schema `dependentRequired` as a builder: when a key is present, the
 *  listed keys must be present too. `dependentRequired({card: ['cvv']})`
 *  accepts any non-object, any object without `card`, and an object carrying
 *  `card` only when `cvv` rides along. Compose beside a shape with the array
 *  form of `intersection` when the schema also declares properties. **/
export function dependentRequired<const D extends {readonly [key: string]: readonly string[]}>(
  dependencies: CompTimeArgs<D>,
  id?: InjectRunTypeId<DepRequiredFold<D, KeysToTuple<D>>>
): RunType<DepRequiredFold<D, KeysToTuple<D>>>;
export function dependentRequired(
  dependencies: {readonly [key: string]: readonly string[]},
  id?: InjectRunTypeId<unknown>
): RunType {
  return builderResult(id, {type: 'dependentRequired', dependencies});
}

/** JSON Schema `dependentSchemas` as a builder: when a key is present, the
 *  whole value must additionally satisfy that key's schema.
 *  `dependentSchemas({card: object({cvv: string()})})` accepts any
 *  non-object, any object without `card`, and an object carrying `card` only
 *  when the object also matches the consequence. **/
export function dependentSchemas<const D extends {readonly [key: string]: RunType}>(
  dependencies: CompTimeArgs<D>,
  id?: InjectRunTypeId<DepSchemasFoldOf<DepConsequences<D>, KeysToTuple<D>>>
): RunType<DepSchemasFoldOf<DepConsequences<D>, KeysToTuple<D>>>;
export function dependentSchemas(dependencies: {readonly [key: string]: RunType}, id?: InjectRunTypeId<unknown>): RunType {
  return builderResult(id, {type: 'dependentSchemas', dependencies});
}

/** The lowered type of a conditional: (if ∧ then) ∨ (¬if ∧ else) — the same
 *  desugaring the schema door applies to if/then/else. A missing branch is
 *  `unknown` (no assertion for that side), which `Conj` absorbs. The ¬if arm
 *  is `Not<C>` spelled inline (base kind + NotSlot) — the builder's own
 *  constraint already vetted C, so re-proving it inside `Not`'s generic
 *  bound would only fight the checker. **/
type ConditionalOf<C extends NotableFormat, T, E> =
  | Conj<C, T>
  | Conj<([C] extends [string] ? string : [C] extends [number] ? number : bigint) & NotSlot<C>, E>;

/** JSON Schema `if`/`then`/`else` as a builder — named `conditional` because
 *  a bare `if` is a reserved word and `ifThenElse` reads like control flow.
 *  One object argument keeps the schema's vocabulary:
 *
 *    conditional({if: string({maxLength: 4}), then: literal('yes'), else: literal('other')})
 *
 *  The `if` arm is constrained to the SAME family `Not` accepts — a
 *  primitive-based format — because the else branch needs ¬if, and negation
 *  is only offered where it is crisp (see formats/not.ts). This covers the
 *  translatable conditionals; a schema whose `if` gates on object shape stays
 *  door-only or expands by hand. Convergence with the door's lowering holds
 *  when the branches share the condition's base kind (the door's negation
 *  spans every kind; same-base branches collapse the others identically). **/
export function conditional<const C extends NotableFormat & ValidNotOperand<C>, T = unknown, E = unknown>(
  parts: CompTimeArgs<{readonly if: RunType<C>; readonly then?: RunType<T>; readonly else?: RunType<E>}>,
  id?: InjectRunTypeId<ConditionalOf<C, T, E>>
): RunType<ConditionalOf<C, T, E>>;
export function conditional(
  parts: {readonly if: RunType; readonly then?: RunType; readonly else?: RunType},
  id?: InjectRunTypeId<unknown>
): RunType {
  return builderResult(id, {type: 'conditional', ...parts});
}
