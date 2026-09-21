// Utility-type builders — value-first authoring of the standard-library utility generics. tsgo
// resolves the branded `InjectRunTypeId<UtilityType<…>>` to a concrete shape BEFORE the Go scanner
// computes the structural id, so `createValidateFn(partial(model))` converges with the type-first
// `createValidateFn<Partial<T>>()` on one id, with no Go-side change.

import {builderResult} from '../runtypes/builderCore.ts';
import type {RunType} from '../runtypes/types.ts';
import type {InjectRunTypeId, CompTimeArgs} from '../markers.ts';

// The `CompTimeArgs<…>` brand: children ride the carrier and are discarded at runtime, so the
// scanner requires each be a static builder call (or a `const` bound to one) and a dynamic schema
// raises a `CTA0xx` diagnostic. Every param here is a single `RunType<…>` (or, for pick/omit, a
// `const` key array), so the plain wrap preserves inference — no spread juggling like the composers.

export function partial<T>(model: CompTimeArgs<RunType<T>>, id?: InjectRunTypeId<Partial<T>>): RunType<Partial<T>> {
  return builderResult(id, {type: 'partial', child: model});
}

export function required<T>(model: CompTimeArgs<RunType<T>>, id?: InjectRunTypeId<Required<T>>): RunType<Required<T>> {
  return builderResult(id, {type: 'required', child: model});
}

/** The readonly bit is erased at runtime. Can't be named `readonly` (reserved word); re-exported as `readonly`. **/
export function readonlyType<T>(model: CompTimeArgs<RunType<T>>, id?: InjectRunTypeId<Readonly<T>>): RunType<Readonly<T>> {
  return builderResult(id, {type: 'readonly', child: model});
}

export function nonNullable<T>(rt: CompTimeArgs<RunType<T>>, id?: InjectRunTypeId<NonNullable<T>>): RunType<NonNullable<T>> {
  return builderResult(id, {type: 'nonNullable', child: rt});
}

export function returnType<F extends (...args: any[]) => any>(
  fnRt: CompTimeArgs<RunType<F>>,
  id?: InjectRunTypeId<ReturnType<F>>
): RunType<ReturnType<F>> {
  return builderResult(id, {type: 'returnType', child: fnRt});
}

/** `const K` captures the keys as a literal tuple; the `keyof T` bound rejects a misspelled key at the call site. **/
export function pick<T, const K extends readonly (keyof T)[]>(
  model: CompTimeArgs<RunType<T>>,
  keys: CompTimeArgs<K>,
  id?: InjectRunTypeId<Pick<T, K[number]>>
): RunType<Pick<T, K[number]>> {
  return builderResult(id, {type: 'pick', child: model, keys});
}

/** Drops the listed keys; the optionality of the rest is preserved. **/
export function omit<T, const K extends readonly (keyof T)[]>(
  model: CompTimeArgs<RunType<T>>,
  keys: CompTimeArgs<K>,
  id?: InjectRunTypeId<Omit<T, K[number]>>
): RunType<Omit<T, K[number]>> {
  return builderResult(id, {type: 'omit', child: model, keys});
}

/** Removes union members assignable to `X`. The removed type rides as a RunType so it can be any shape. **/
export function exclude<U, X>(
  union: CompTimeArgs<RunType<U>>,
  removed: CompTimeArgs<RunType<X>>,
  id?: InjectRunTypeId<Exclude<U, X>>
): RunType<Exclude<U, X>> {
  return builderResult(id, {type: 'exclude', child: union, excluded: removed});
}

export function extract<U, X>(
  union: CompTimeArgs<RunType<U>>,
  extracted: CompTimeArgs<RunType<X>>,
  id?: InjectRunTypeId<Extract<U, X>>
): RunType<Extract<U, X>> {
  return builderResult(id, {type: 'extract', child: union, extracted});
}

/** Yields a function's parameter tuple, so those parameters can be validated as a first-class tuple. **/
export function parameters<F extends (...args: any[]) => any>(
  fnRt: CompTimeArgs<RunType<F>>,
  id?: InjectRunTypeId<Parameters<F>>
): RunType<Parameters<F>> {
  return builderResult(id, {type: 'parameters', child: fnRt});
}
