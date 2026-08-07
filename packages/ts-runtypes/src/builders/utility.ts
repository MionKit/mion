// Utility-type builders — value-first authoring of the standard-library utility
// generics: Partial / Required / Pick / Omit / Exclude / Extract / NonNullable /
// Readonly / ReturnType, plus Parameters. Each returns the generic `RunType<…>`
// for the APPLIED utility type via the trailing `InjectRunTypeId` marker: the
// brand `InjectRunTypeId<UtilityType<…>>` carries the resolved utility type, and
// tsgo natively resolves Partial / Pick / Omit / … to a concrete shape BEFORE the
// Go scanner computes the structural id — so `createValidateFn(partial(model))`
// converges with the type-first `createValidateFn<Partial<T>>()` on one structural id
// (one engine, two front doors). The children ride the carrier only (the scanner
// reflects the whole resolved type off the brand); no Go-side change.

import {builderResult} from '../runtypes/builderCore.ts';
import type {RunType} from '../runtypes/types.ts';
import type {InjectRunTypeId, CompTimeArgs} from '../markers.ts';

// Each child run-type / key-array param is branded `CompTimeArgs<…>` — these
// builders' children ride the carrier and are discarded at runtime (the injected
// marker returns the reflected utility type), so the scanner enforces each child
// be a static builder call (or `const` bound to one) and a dynamic schema raises
// a `CTA0xx` diagnostic. Every param here is a single `RunType<…>` (or, for
// pick/omit, a `const` key array), so the simple `CompTimeArgs<RunType<…>>` wrap
// preserves inference — no `const`/spread juggling like the variadic composers.

/** `Partial<T>` — every property optional. **/
export function partial<T>(model: CompTimeArgs<RunType<T>>, id?: InjectRunTypeId<Partial<T>>): RunType<Partial<T>> {
  return builderResult(id, {type: 'partial', child: model});
}

/** `Required<T>` — every property required. **/
export function required<T>(model: CompTimeArgs<RunType<T>>, id?: InjectRunTypeId<Required<T>>): RunType<Required<T>> {
  return builderResult(id, {type: 'required', child: model});
}

/** `Readonly<T>` — readonly bit (erased at runtime). The function can't be named
 *  `readonly` (reserved word), so it's `readonlyType` here and the `/define`
 *  index re-exports it as `readonly` so `RT.readonly(model)` reads naturally —
 *  same pattern as `voidType` → `void`. **/
export function readonlyType<T>(model: CompTimeArgs<RunType<T>>, id?: InjectRunTypeId<Readonly<T>>): RunType<Readonly<T>> {
  return builderResult(id, {type: 'readonly', child: model});
}

/** `NonNullable<T>` — strips `null | undefined` from a union. **/
export function nonNullable<T>(rt: CompTimeArgs<RunType<T>>, id?: InjectRunTypeId<NonNullable<T>>): RunType<NonNullable<T>> {
  return builderResult(id, {type: 'nonNullable', child: rt});
}

/** `ReturnType<F>` — the function's return type. Dual of `parameters`: takes a
 *  function run-type and brands `ReturnType<F>` (an ordinary type) which drives
 *  the id through the existing reflection. **/
export function returnType<F extends (...args: any[]) => any>(
  fnRt: CompTimeArgs<RunType<F>>,
  id?: InjectRunTypeId<ReturnType<F>>
): RunType<ReturnType<F>> {
  return builderResult(id, {type: 'returnType', child: fnRt});
}

/** `Pick<T, K>` — keep only the listed keys. `const K` captures the keys array as
 *  a literal tuple; `K[number]` is the key union the brand needs, and the
 *  `keyof T` bound rejects a misspelled key right at the call site. **/
export function pick<T, const K extends readonly (keyof T)[]>(
  model: CompTimeArgs<RunType<T>>,
  keys: CompTimeArgs<K>,
  id?: InjectRunTypeId<Pick<T, K[number]>>
): RunType<Pick<T, K[number]>> {
  return builderResult(id, {type: 'pick', child: model, keys});
}

/** `Omit<T, K>` — drop the listed keys; the optionality of the rest is preserved. **/
export function omit<T, const K extends readonly (keyof T)[]>(
  model: CompTimeArgs<RunType<T>>,
  keys: CompTimeArgs<K>,
  id?: InjectRunTypeId<Omit<T, K[number]>>
): RunType<Omit<T, K[number]>> {
  return builderResult(id, {type: 'omit', child: model, keys});
}

/** `Exclude<U, X>` — remove union members assignable to `X`. The removed type
 *  rides as a RunType so it can be any shape (`literal('age')` or
 *  `object({kind: literal('circle')})`); the brand `Exclude<U, X>` is the exact
 *  expression tsgo resolves type-first. **/
export function exclude<U, X>(
  union: CompTimeArgs<RunType<U>>,
  removed: CompTimeArgs<RunType<X>>,
  id?: InjectRunTypeId<Exclude<U, X>>
): RunType<Exclude<U, X>> {
  return builderResult(id, {type: 'exclude', child: union, excluded: removed});
}

/** `Extract<U, X>` — keep only union members assignable to `X`. **/
export function extract<U, X>(
  union: CompTimeArgs<RunType<U>>,
  extracted: CompTimeArgs<RunType<X>>,
  id?: InjectRunTypeId<Extract<U, X>>
): RunType<Extract<U, X>> {
  return builderResult(id, {type: 'extract', child: union, extracted});
}

/** `Parameters<F>` — `parameters(func([number(), boolean()], string()))` →
 *  `RunType<[number, boolean]>`. Takes a function run-type and yields its
 *  parameter tuple (exactly the tuple `Parameters<F>` denotes), so a function's
 *  parameters can be validated as a first-class tuple. The function rides the
 *  carrier; the brand `Parameters<F>` (an ordinary tuple type) drives the id and
 *  reflects through the existing tuple path. **/
export function parameters<F extends (...args: any[]) => any>(
  fnRt: CompTimeArgs<RunType<F>>,
  id?: InjectRunTypeId<Parameters<F>>
): RunType<Parameters<F>> {
  return builderResult(id, {type: 'parameters', child: fnRt});
}
