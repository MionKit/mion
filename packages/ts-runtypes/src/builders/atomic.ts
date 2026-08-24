// Value-first ATOMIC / NON-FORMAT builders — a Zod/TypeBox-style BUILDER API for
// the kinds that carry no format params: `boolean` / `literal` / `regexp` /
// `symbol`, the top / bottom kinds (`any` / `unknown` / `never` / `void`), the
// class-instance builder, and the enum builder. Each returns a generic
// `RunType<T>` (the runtime run-type node, typed with the source type `T`);
// `InferType<typeof X>` recovers `T`:
//
//   import {boolean, literal, enumType} from '@ts-runtypes/core/builders';
//   import {createValidateFn, type InferType} from '@ts-runtypes/core';
//
//   const Flag = boolean();              // RunType<boolean>
//   const isFlag = createValidateFn(Flag); // validator from the schema
//
// The Go scanner reflects the SAME kind off the builder's `InjectRunTypeId<…>`
// brand as the type-first surface, so a value-first leaf and the hand-written type
// converge on one structural id; the runtime then resolves the same precompiled
// factory (see createValidateFn).
//
// The FORMAT leaf builders (`string` / `number` / `bigInt` / `date` / `email` / …
// and the `temporal.*` family) moved to the `ts-runtypes/formats` surface
// (namespaced `TF` / `TFT`); composition (`object` / `array` / `union` / … plus
// the `propMod` / `optional` modifiers) lives in compose.ts; the standard-library
// utility builders in utility.ts. The shared builder primitive `builderResult`
// lives in runtypes/builderCore.ts and the type helpers in static.ts /
// runtypes/builderTypes.ts, so this file is runtime-only. The Go binary, not the
// type system, is the validation engine.

import {builderResult} from '../runtypes/builderCore.ts';
import type {RunType} from '../runtypes/types.ts';
import type {InjectRunTypeId} from '../markers.ts';

/** A boolean builder — no params, no format brand (kind boolean). Returns
 *  `RunType<boolean>`. **/
export function boolean(id?: InjectRunTypeId<boolean>): RunType<boolean> {
  return builderResult(id, {type: 'boolean', formatParams: {}});
}

/** A literal builder — `literal('a')` → `RunType<'a'>`, plus `literal(42)`,
 *  `literal(10n)`, `literal(true)`, `literal(null)`, `literal(undefined)`. The
 *  `const V` narrows the argument to its literal type (so `literal(true)` is
 *  `RunType<true>`, not `RunType<boolean>`); the scanner reflects that literal
 *  off the `InjectRunTypeId<V>` brand. **/
export function literal<const V extends string | number | bigint | boolean | null | undefined>(
  value: V,
  id?: InjectRunTypeId<V>
): RunType<V> {
  return builderResult(id, {type: 'literal', literal: value});
}

/** A `RegExp` builder — `regexp()` → `RunType<RegExp>`, matches any `RegExp`
 *  instance. TS has NO regex-literal type (a `/abc/i` literal widens to `RegExp`
 *  even under `as const`), so there is deliberately no "specific source/flags"
 *  form: it would make the structural id depend on data absent from `T`, breaking
 *  the id ≡ f(T) invariant. To validate a STRING against a pattern, use
 *  `string({pattern: {source, flags, mockSamples}})`. **/
export function regexp(id?: InjectRunTypeId<RegExp>): RunType<RegExp> {
  return builderResult(id, {type: 'regexp', formatParams: {}});
}

/** A `symbol` builder — `symbol()` → `RunType<symbol>`. Provided for
 *  composition/parity; symbol identity is not round-trippable, so the Go side
 *  emits an unsupported validator — a standalone
 *  `createValidateFn(symbol())` throws the same way the type-first `symbol` case
 *  does. **/
export function symbol(id?: InjectRunTypeId<symbol>): RunType<symbol> {
  return builderResult(id, {type: 'symbol', formatParams: {}});
}

// Top / bottom atomic builders — `any` / `unknown` / `never` / `void`. Dedicated
// builders: each carries its kind off the trailing `InjectRunTypeId<…>` brand, so
// the scanner reflects the SAME kind as the type-first `createValidateFn<any>()` /
// `<never>` / … surface and the value-first form converges on one structural id.

/** An `any` builder — `any()` → `RunType<any>` (no-op validator; every value
 *  passes). **/
export function any(id?: InjectRunTypeId<any>): RunType<any> {
  return builderResult(id, {type: 'any', formatParams: {}});
}

/** An `unknown` builder — `unknown()` → `RunType<unknown>` (every value passes,
 *  same as `any`). **/
export function unknown(id?: InjectRunTypeId<unknown>): RunType<unknown> {
  return builderResult(id, {type: 'unknown', formatParams: {}});
}

/** A `never` builder — `never()` → `RunType<never>` (no value passes; the
 *  validator returns `false` for every input). **/
export function never(id?: InjectRunTypeId<never>): RunType<never> {
  return builderResult(id, {type: 'never', formatParams: {}});
}

/** A `void` builder — `voidType()` → `RunType<void>` (accepts `undefined`,
 *  rejects `null`). The function can't be named `void` (reserved word); the
 *  `/schema` index also re-exports it as `void` so `RT.void()` reads naturally. **/
export function voidType(id?: InjectRunTypeId<void>): RunType<void> {
  return builderResult(id, {type: 'void', formatParams: {}});
}

/** A class builder — `classType(MyClass)` → `RunType<MyClass>`. `Instance` infers
 *  directly from the constructor's instance type, so it converges with the
 *  type-first `createValidateFn<MyClass>()`. validate matches by SHAPE (data properties;
 *  methods skipped), NOT `instanceof` — a plain object of the right shape passes.
 *  For a GENERIC class the instance type is pinned explicitly
 *  (`classType<Box<number>>(Box)`); otherwise it infers the unparameterised
 *  instance. The ctor rides the carrier (the runtime keeps a real class
 *  reference). **/
export function classType<Instance>(
  ctor: abstract new (...args: any[]) => Instance,
  id?: InjectRunTypeId<Instance>
): RunType<Instance> {
  return builderResult(id, {type: 'class', ctor});
}

/** An enum builder — accepts EITHER a TS `enum` (`enumType(Color)`) OR an
 *  enum-like record (`enumType({Red: 0, Green: 'green', Blue: 2})`), and carries
 *  the union of its VALUES (`E[keyof E]`). `InferType<typeof enumType(Color)>` is then
 *  assignment-equivalent to the enum — it accepts exactly the same values (proven:
 *  `Color.Red` is assignable to both, and they cross-assign). `const E` preserves a
 *  plain record's literal values (`{Red: 0}` → `0`, not `number`); a TS enum object
 *  is already precise, and its numeric reverse-mapping doesn't leak into the value
 *  union.
 *
 *  Because the carried type is the value-union, the Go scanner resolves it as a
 *  UNION (kind union), NOT a TS `enum` (kind enum): the two validate identically,
 *  but a value-first builder can't reconstruct the nominal enum's member-NAME
 *  metadata (used for mocks / error messages), so the cache ids are distinct by
 *  design — the enum id-integrity cases are flagged `idDivergent`. Exported as
 *  `enum` from the `/schema` index for a natural `RT.enum(...)` (the function can't
 *  be named `enum` — reserved word — same as `voidType`/`classType`). **/
export function enumType<const E extends Record<string, string | number>>(
  enumObject: E,
  id?: InjectRunTypeId<E[keyof E]>
): RunType<E[keyof E]> {
  return builderResult(id, {type: 'enum', members: enumObject});
}
