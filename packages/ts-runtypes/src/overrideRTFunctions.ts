/* ########
 * 2026 ma-jerez
 * Author: Ma-jerez
 * License: UNLICENSED - proprietary, see LICENSE
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Per-type custom function overrides — `overrideX<T>(pureFn)`.
//
// Register a custom PURE function for one specific type T, so that every
// `createX<T>()` call site for that T returns the user's function instead of the
// Go-emitted structural body. The override is the WRITE side of the same
// `(family, typeId)` routing `createX` reads: same `InjectTypeFnArgs<T, fnKey>`
// marker, same family. The pure-fn body is hashed (a "cfn") and folded into T's
// type id, so the override propagates to every containing type and the cache
// stays idempotent (no `<fnHash>_<typeId>` key is ever reused with a different
// body). The `fn` MUST type-check against the family's compiled signature for T
// — the SAME signature the emitter uses internally (e.g. the validation-errors
// override receives `(value, path, errors)`).

import {isEntryTuple, initFromTuple, type EntryTuple} from './runtypes/entryTuple.ts';
import type {InjectTypeFnArgs, PureFunction} from './markers.ts';
import type {DataOnly} from './runtypes/dataOnly.ts';
import type {
  ValidateFn,
  GetValidationErrorsFn,
  HasUnknownKeysFn,
  CloneExactShapeFn,
  UnknownKeyErrorsFn,
  FormatTransformFn,
  JsonEncoderFn,
  JsonDecoderFn,
} from './createRTFunctions.ts';
import type {ToBinaryFn, FromBinaryFn} from './createRTFBinary.ts';

/** Shared runtime body for every overrideX twin. The override is a compile-time
 *  declaration: the plugin injects the cfn-redirect entry tuple at the trailing
 *  slot, so registering it (and its cfn module via the dep closure) is all the
 *  runtime does. The `pureFn` argument is ignored at runtime — its body now
 *  lives only in the emitted `cfn::<hash>` module. Without the plugin there is
 *  no injected tuple and the override cannot take effect, but the matching
 *  `createX` still resolves its structural body, so this warns rather than
 *  throws. */
function overrideImpl(_pureFn: unknown, id?: unknown): void {
  if (isEntryTuple(id)) {
    initFromTuple(id as EntryTuple);
    return;
  }
  if (typeof console !== 'undefined') {
    console.warn(
      '[ts-runtypes] overrideX(): no entry injected. The ts-runtypes-devtools plugin ' +
        'must be active for per-type overrides to take effect.'
    );
  }
}

// The `as unknown as <T>(…) => void` cast restores the generic <T> + the
// `PureFunction` / `InjectTypeFnArgs` brands the Go scanner reads at call sites;
// <T> is erased before execution. One twin per PUBLIC operation — the internal
// primitives (pj / pjs / rj / sj / ukuw) are not user-overridable.

export const overrideValidate = overrideImpl as unknown as <T>(
  fn: PureFunction<ValidateFn<T>>,
  id?: InjectTypeFnArgs<T, 'val'>
) => void;

export const overrideGetValidationErrors = overrideImpl as unknown as <T>(
  fn: PureFunction<GetValidationErrorsFn>,
  id?: InjectTypeFnArgs<T, 'verr'>
) => void;

export const overrideHasUnknownKeys = overrideImpl as unknown as <T>(
  fn: PureFunction<HasUnknownKeysFn>,
  id?: InjectTypeFnArgs<T, 'huk'>
) => void;

export const overrideCloneExactShape = overrideImpl as unknown as <T>(
  fn: PureFunction<CloneExactShapeFn<T>>,
  id?: InjectTypeFnArgs<T, 'ces'>
) => void;

export const overrideUnknownKeyErrors = overrideImpl as unknown as <T>(
  fn: PureFunction<UnknownKeyErrorsFn>,
  id?: InjectTypeFnArgs<T, 'uke'>
) => void;

export const overrideFormatTransform = overrideImpl as unknown as <T>(
  fn: PureFunction<FormatTransformFn<T>>,
  id?: InjectTypeFnArgs<T, 'fmt'>
) => void;

// Binary overrides target the internal toBinary / fromBinary entries (the
// serializer-threading shape the emitter uses), not the public wrapper.
export const overrideBinaryEncoder = overrideImpl as unknown as <T>(
  fn: PureFunction<ToBinaryFn>,
  id?: InjectTypeFnArgs<T, 'tb'>
) => void;

export const overrideBinaryDecoder = overrideImpl as unknown as <T>(
  fn: PureFunction<FromBinaryFn<DataOnly<T>>>,
  id?: InjectTypeFnArgs<T, 'fb'>
) => void;

export const overrideJsonEncoder = overrideImpl as unknown as <T>(
  fn: PureFunction<JsonEncoderFn>,
  id?: InjectTypeFnArgs<T, 'jsonEncoder'>
) => void;

export const overrideJsonDecoder = overrideImpl as unknown as <T>(
  fn: PureFunction<JsonDecoderFn<DataOnly<T>>>,
  id?: InjectTypeFnArgs<T, 'jsonDecoder'>
) => void;
