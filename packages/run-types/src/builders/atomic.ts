// Value-first ATOMIC / NON-FORMAT builders — the kinds that carry no format params, each
// returning `RunType<T>`. The Go scanner reflects the SAME kind off the builder's
// `InjectRunTypeId<…>` brand as the type-first surface, so both converge on one structural id
// and resolve the same precompiled factory. The FORMAT leaf builders live on the
// `@mionjs/run-types/formats` surface, composition in compose.ts, the standard-library utility
// builders in utility.ts; runtime-only here, the type helpers are in static.ts /
// runtypes/builderTypes.ts.

import {builderResult} from '../runtypes/builderCore.ts';
import type {RunType} from '../runtypes/types.ts';
import type {InjectRunTypeId} from '../markers.ts';

export function boolean(id?: InjectRunTypeId<boolean>): RunType<boolean> {
  return builderResult(id, {type: 'boolean', formatParams: {}});
}

/** `const V` narrows the argument to its literal type, so `literal(true)` is `RunType<true>`, not `RunType<boolean>`. **/
export function literal<const V extends string | number | bigint | boolean | null | undefined>(
  value: V,
  id?: InjectRunTypeId<V>
): RunType<V> {
  return builderResult(id, {type: 'literal', literal: value});
}

/** No source/flags form: TS has no regex-literal type, and the id would then depend on data absent from `T`.
 *  To validate a STRING against a pattern, use `string({pattern: {source, flags, mockSamples}})`. **/
export function regexp(id?: InjectRunTypeId<RegExp>): RunType<RegExp> {
  return builderResult(id, {type: 'regexp', formatParams: {}});
}

/** Symbol identity is not round-trippable, so `createValidateFn(symbol())` throws like the type-first `symbol`. **/
export function symbol(id?: InjectRunTypeId<symbol>): RunType<symbol> {
  return builderResult(id, {type: 'symbol', formatParams: {}});
}

/** No-op validator: every value passes. **/
export function any(id?: InjectRunTypeId<any>): RunType<any> {
  return builderResult(id, {type: 'any', formatParams: {}});
}

/** Every value passes, same as `any`. **/
export function unknown(id?: InjectRunTypeId<unknown>): RunType<unknown> {
  return builderResult(id, {type: 'unknown', formatParams: {}});
}

/** No value passes: the validator returns `false` for every input. **/
export function never(id?: InjectRunTypeId<never>): RunType<never> {
  return builderResult(id, {type: 'never', formatParams: {}});
}

/** Accepts `undefined`, rejects `null`. Can't be named `void` (reserved word); re-exported as `void` by the index. **/
export function voidType(id?: InjectRunTypeId<void>): RunType<void> {
  return builderResult(id, {type: 'void', formatParams: {}});
}

/** Validate matches by SHAPE (data properties, methods skipped), NOT `instanceof`: a plain object of the right shape passes.
 *  A GENERIC class needs its instance type pinned (`classType<Box<number>>(Box)`), else it infers the unparameterised one. **/
export function classType<Instance>(
  ctor: abstract new (...args: any[]) => Instance,
  id?: InjectRunTypeId<Instance>
): RunType<Instance> {
  return builderResult(id, {type: 'class', ctor});
}

/** Takes a TS `enum` or an enum-like record, and carries the union of its VALUES; `const E` keeps a record's literals.
 *  That value-union resolves as a UNION, not an enum, so the id diverges from the type-first enum BY DESIGN: a builder
 *  can't reconstruct the member-NAME metadata (mocks / error messages). Can't be named `enum` (reserved word). **/
export function enumType<const E extends Record<string, string | number>>(
  enumObject: E,
  id?: InjectRunTypeId<E[keyof E]>
): RunType<E[keyof E]> {
  return builderResult(id, {type: 'enum', members: enumObject});
}
