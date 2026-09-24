/* ########
 * 2026 ma-jerez
 * Author: Ma-jerez
 * License: MIT, see LICENSE
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Per-type custom function overrides — `overrideX<T>(pureFn)` registers a custom PURE function for
// one specific T, so every `createX<T>()` call site for that T returns it instead of the Go-emitted
// structural body. This is the WRITE side of the same `(family, typeId)` routing `createX` reads:
// same `InjectTypeFnArgs<T, fnKey>` marker, same family. The pure-fn body is hashed (a "cfn") and
// folded into T's type id, so the override propagates to every containing type and no
// `<fnHash>_<typeId>` key is ever reused with a different body. The `fn` MUST type-check against the
// family's compiled signature for T, the SAME signature the emitter uses internally (e.g. the
// validation-errors override receives `(value, path, errors)`).

import {isEntryTuple, initFromTuple, type EntryTuple} from './runtypes/entryTuple.ts';
import type {InjectTypeFnArgs, PureFunction} from './markers.ts';
import type {DataOnly} from './runtypes/dataOnly.ts';
import type {
  ValidateFn,
  GetValidationErrorsFn,
  RemoveUnknownKeysFn,
  FormatTransformFn,
  JsonEncoderFn,
  JsonDecoderFn,
} from './createRTFunctions.ts';
import type {ToBinaryFn, FromBinaryFn} from './createRTFBinary.ts';

/** Shared runtime body for every overrideX twin. The override is a compile-time declaration: the
 *  plugin injects the cfn-redirect entry tuple at the trailing slot, so registering it (and its cfn
 *  module via the dep closure) is all the runtime does, and `pureFn` is ignored — its body now lives
 *  only in the emitted `cfn::<hash>` module. Without the plugin nothing is injected and the override
 *  cannot take effect, but the matching `createX` still resolves its structural body, so this warns
 *  rather than throws. */
function overrideImpl(_pureFn: unknown, id?: unknown): void {
  if (isEntryTuple(id)) {
    initFromTuple(id as EntryTuple);
    return;
  }
  if (typeof console !== 'undefined') {
    console.warn(
      '[mion] overrideX(): no entry injected. The @mionjs/devtools plugin ' +
        'must be active for per-type overrides to take effect.'
    );
  }
}

// The cast restores the generic <T> + the `PureFunction` / `InjectTypeFnArgs` brands the Go scanner
// reads at call sites; <T> is erased before execution. One twin per PUBLIC operation — the internal
// primitives (pj / pjs / rj / rjs / cj / cjr) are not user-overridable.

export const overrideValidate = overrideImpl as unknown as <T>(
  fn: PureFunction<ValidateFn<T>>,
  id?: InjectTypeFnArgs<T, 'validate'>
) => void;

export const overrideGetValidationErrors = overrideImpl as unknown as <T>(
  fn: PureFunction<GetValidationErrorsFn>,
  id?: InjectTypeFnArgs<T, 'validationErrors'>
) => void;

export const overrideRemoveUnknownKeys = overrideImpl as unknown as <T>(
  fn: PureFunction<RemoveUnknownKeysFn<T>>,
  id?: InjectTypeFnArgs<T, 'removeUnknownKeys'>
) => void;

export const overrideFormatTransform = overrideImpl as unknown as <T>(
  fn: PureFunction<FormatTransformFn<T>>,
  id?: InjectTypeFnArgs<T, 'formatTransform'>
) => void;

// Binary overrides target the internal toBinary / fromBinary entries (the
// serializer-threading shape the emitter uses), not the public wrapper.
export const overrideBinaryEncoder = overrideImpl as unknown as <T>(
  fn: PureFunction<ToBinaryFn>,
  id?: InjectTypeFnArgs<T, 'toBinary'>
) => void;

export const overrideBinaryDecoder = overrideImpl as unknown as <T>(
  fn: PureFunction<FromBinaryFn<DataOnly<T>>>,
  id?: InjectTypeFnArgs<T, 'fromBinary'>
) => void;

export const overrideJsonEncoder = overrideImpl as unknown as <T>(
  fn: PureFunction<JsonEncoderFn>,
  id?: InjectTypeFnArgs<T, 'jsonEncoder'>
) => void;

export const overrideJsonDecoder = overrideImpl as unknown as <T>(
  fn: PureFunction<JsonDecoderFn<DataOnly<T>>>,
  id?: InjectTypeFnArgs<T, 'jsonDecoder'>
) => void;
