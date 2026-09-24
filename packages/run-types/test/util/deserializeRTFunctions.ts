// Test-only twins of the `createXxx` factories: each `deserializeXxx<T>()` rebuilds its per-id closure from the
// serialized `RTCompiledFnData.code` on every call, the same path `materializeRTFn` (src/runtypes/rtUtils.ts)
// runs lazily for a production caller. They live under test/util/ rather than src/ because production never
// needs them; they exist so the suites can assert each `entry.code` round-trips to an equivalent fn. They route
// through the SAME `InjectTypeFnArgs<T, Fn>` marker as the production factories, so each call site gets the
// entry-module tuple and the key comes off slot 3 exactly as `resolveEntryTupleFn` derives it; the vitest
// config's tsconfig.json puts `test/**` in the scan scope, so these calls get the same tuple injection.

import {
  type InjectTypeFnArgs,
  type RunType,
  type ValidateOptions,
  type ValidateFn,
  type GetValidationErrorsFn,
  type RemoveUnknownKeysFn,
  // The JSON value-level primitive fn shapes are public again (recoverable via
  // getRTFunction), so the deserialize twins that exercise the per-primitive
  // `entry.code` round-trip type against the published aliases.
  type PrepareForJsonFn,
  type RestoreFromJsonFn,
  type StringifyJsonFn,
} from '@mionjs/run-types';
import {getRTUtils, isRunTypeValue, buildFactoryFromCode, entryCode} from '../../src/runtypes/rtUtils.ts';
import {
  entryTupleKey,
  initFromTuple,
  isEntryTuple,
  isMissingTuple,
  FN_HASH_LEN,
  type EntryTuple,
} from '../../src/runtypes/entryTuple.ts';
import type {AnyFn, CompiledTypeFn} from '../../src/runtypes/types.ts';

/** Test-side mirror of the production `resolveEntryTupleFn`, but rebuilding the
 *  per-id closure from `entry.code` on every call instead of reading the
 *  materialized `entry.fn`. The plugin injects the entry-module tuple at the
 *  trailing slot; the key is the tuple's slot-3 cache key — the fnHash prefix
 *  already folds the ValidateOptions variant / strategy the build resolved, so
 *  nothing is recomputed here. Noop entries carry no code; they reuse the
 *  pre-populated `entry.fn`. **/
function resolveDeserializedEntry<F extends AnyFn>(fnName: string, identityFn: F, val: unknown, args: unknown): F {
  const utils = getRTUtils();
  const runTypeId = isRunTypeValue(val) ? val.id : undefined;
  if (isMissingTuple(args)) return identityFn;
  if (!isEntryTuple(args)) {
    if (runTypeId === undefined) {
      throw new Error(
        `${fnName}(): no id injected. @mionjs/devtools must be active for ${fnName} to dispatch to a precompiled factory.`
      );
    }
    if (utils.knowsType(runTypeId)) return identityFn;
    throw new Error(`${fnName}(): no RTCompiledFn entry for schema id "${runTypeId}" in rtUtils.`);
  }
  initFromTuple(args as EntryTuple);
  let key = entryTupleKey(args as EntryTuple);
  if (runTypeId !== undefined) key = key.slice(0, FN_HASH_LEN) + '_' + runTypeId;
  const entry = utils.getRT(key) as CompiledTypeFn | undefined;
  if (!entry) {
    if (utils.knowsType(key.slice(FN_HASH_LEN + 1))) return identityFn;
    throw new Error(
      `${fnName}(): no RTCompiledFn entry for "${key}" in rtUtils. The build pipeline didn't emit a factory for that runtype.`
    );
  }
  if (entry.isNoop) return entry.fn as F;
  // entryCode returns the body verbatim (code/both modes) or derives it from
  // the live factory (functions mode), so this round-trips in every emit mode.
  return buildFactoryFromCode(entryCode(entry))(utils) as F;
}

/** Three-arg deserialize wrapper for families that honour `ValidateOptions`
 *  (`deserializeValidate`, `deserializeGetValidationErrors`). The options bag is a
 *  compile-time arg folded into the injected fnHash; the runtime ignores it. **/
function deserializeRTFunctionWithOptions<F extends AnyFn>(
  fnName: string,
  identityFn: F
): (val?: unknown, options?: unknown, id?: unknown) => F {
  return (val, _options, id) => resolveDeserializedEntry(fnName, identityFn, val, id);
}

/** Two-arg deserialize wrapper for families that do NOT honour
 *  `ValidateOptions` — every non-validator family. **/
function deserializeRTFunction<F extends AnyFn>(fnName: string, identityFn: F): (val?: unknown, id?: unknown) => F {
  return (val, id) => resolveDeserializedEntry(fnName, identityFn, val, id);
}

const identityValueFn = (v: unknown) => v;
const getValidationErrorsIdentity: GetValidationErrorsFn = () => [];
const stringifyJsonIdentity: StringifyJsonFn = (v) => JSON.stringify(v);

// The trailing `as unknown as <T>(...) => Fn` cast restores the generic <T>
// signature the Go-side marker scanner reads to identify call sites. The
// runtime function is a non-generic JS closure; <T> is type-checker-only.
//
// Each cast declares the SAME overload pair as its production twin: a
// value-first `RunType<T>` in slot 0, then the reflection form. The runtime
// already accepted a RunType there (resolveDeserializedEntry reads its id via
// isRunTypeValue), but without the overload the type said otherwise — so
// `mion convert` left these calls in type form while rewriting every
// other factory around them, and the deserialize half of the suites never ran
// value-first. Declaring the pair is what puts them on the same footing.

export const deserializeValidate = deserializeRTFunctionWithOptions<ValidateFn>(
  'deserializeValidate',
  (_value): _value is unknown => true
) as unknown as (<T>(runType: RunType<T>, options?: ValidateOptions, id?: InjectTypeFnArgs<T, 'validate'>) => ValidateFn) &
  (<T>(val?: T, options?: ValidateOptions, id?: InjectTypeFnArgs<T, 'validate'>) => ValidateFn);

export const deserializeGetValidationErrors = deserializeRTFunctionWithOptions<GetValidationErrorsFn>(
  'deserializeGetValidationErrors',
  getValidationErrorsIdentity
) as unknown as (<T>(
  runType: RunType<T>,
  options?: ValidateOptions,
  id?: InjectTypeFnArgs<T, 'validationErrors'>
) => GetValidationErrorsFn) &
  (<T>(val?: T, options?: ValidateOptions, id?: InjectTypeFnArgs<T, 'validationErrors'>) => GetValidationErrorsFn);

export const deserializeRemoveUnknownKeys = deserializeRTFunction<RemoveUnknownKeysFn>(
  'deserializeRemoveUnknownKeys',
  identityValueFn
) as unknown as (<T>(runType: RunType<T>, id?: InjectTypeFnArgs<T, 'removeUnknownKeys'>) => RemoveUnknownKeysFn) &
  (<T>(val?: T, id?: InjectTypeFnArgs<T, 'removeUnknownKeys'>) => RemoveUnknownKeysFn);

export const deserializePrepareForJson = deserializeRTFunction<PrepareForJsonFn>(
  'deserializePrepareForJson',
  identityValueFn
) as unknown as (<T>(runType: RunType<T>, id?: InjectTypeFnArgs<T, 'prepareForJsonMutate'>) => PrepareForJsonFn) &
  (<T>(val?: T, id?: InjectTypeFnArgs<T, 'prepareForJsonMutate'>) => PrepareForJsonFn);

export const deserializeRestoreFromJson = deserializeRTFunction<RestoreFromJsonFn>(
  'deserializeRestoreFromJson',
  identityValueFn
) as unknown as (<T>(runType: RunType<T>, id?: InjectTypeFnArgs<T, 'restoreFromJsonMutate'>) => RestoreFromJsonFn) &
  (<T>(val?: T, id?: InjectTypeFnArgs<T, 'restoreFromJsonMutate'>) => RestoreFromJsonFn);

export const deserializeStringifyJson = deserializeRTFunction<StringifyJsonFn>(
  'deserializeStringifyJson',
  stringifyJsonIdentity
) as unknown as (<T>(runType: RunType<T>, id?: InjectTypeFnArgs<T, 'stringifyJson'>) => StringifyJsonFn) &
  (<T>(val?: T, id?: InjectTypeFnArgs<T, 'stringifyJson'>) => StringifyJsonFn);
