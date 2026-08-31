// Test-only twins of the `createXxx` factories. Each `deserializeXxx<T>()`
// rebuilds its per-id closure from the serialized `RTCompiledFnData.code`
// string via `new Function('utl', code)(rtUtils)` on every call — the same
// reconstruction path `materializeRTFn` (in src/runtypes/rtUtils.ts) runs
// lazily on the first `getRT(hash)` lookup for a production caller.
//
// Lives under test/util/ rather than src/ because production code has no
// reason to call these directly: cache modules auto-register entries on
// import and `materializeRTFn` builds `entry.fn` on demand, so the
// regular `createXxx` factories already return the deserialized closure
// transparently. The wrappers exist purely so the test suites can assert
// that each `entry.code` round-trips to an equivalent fn.
//
// Marker scanning works the same as for the production factories — the
// Vite plugin walks every call site whose resolved signature has a
// trailing `id?: InjectTypeFnArgs<T, Fn>` slot, regardless of where the
// function is declared. The vitest config's `tsconfig.test.json` puts
// `test/**` in the plugin's scan scope, so calls to `deserializeXxx<T>()`
// from test files get the same compile-time `[typeId, fnHash]` tuple
// injection that `createXxx<T>()` calls do.
//
// PER-ENTRY MODULE NOTE: the deserialize twins route through the SAME
// `InjectTypeFnArgs<T, Fn>` marker as the production factories, so each call
// site receives the ENTRY-MODULE TUPLE binding. The key comes off the tuple
// (slot 3) after registering its dep closure — identical derivation to the
// production `resolveEntryTupleFn`. The distinguishing behavior (rebuild from
// `entry.code` instead of reading the materialized `entry.fn`) is unchanged.

import {
  type InjectTypeFnArgs,
  type RunType,
  type ValidateOptions,
  type ValidateFn,
  type GetValidationErrorsFn,
  type HasUnknownKeysFn,
  type CloneExactShapeFn,
  type UnknownKeyErrorsFn,
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
        `${fnName}(): no id injected. ts-runtypes-devtools must be active for ${fnName} to dispatch to a precompiled factory.`
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
const unknownKeyErrorsIdentity: UnknownKeyErrorsFn = () => [];
const stringifyJsonIdentity: StringifyJsonFn = (v) => JSON.stringify(v);

// The trailing `as unknown as <T>(...) => Fn` cast restores the generic <T>
// signature the Go-side marker scanner reads to identify call sites. The
// runtime function is a non-generic JS closure; <T> is type-checker-only.
//
// Each cast declares the SAME overload pair as its production twin: a
// value-first `RunType<T>` in slot 0, then the reflection form. The runtime
// already accepted a RunType there (resolveDeserializedEntry reads its id via
// isRunTypeValue), but without the overload the type said otherwise — so
// `ts-runtypes convert` left these calls in type form while rewriting every
// other factory around them, and the deserialize half of the suites never ran
// value-first. Declaring the pair is what puts them on the same footing.

export const deserializeValidate = deserializeRTFunctionWithOptions<ValidateFn>(
  'deserializeValidate',
  (_value): _value is unknown => true
) as unknown as (<T>(runType: RunType<T>, options?: ValidateOptions, id?: InjectTypeFnArgs<T, 'val'>) => ValidateFn) &
  (<T>(val?: T, options?: ValidateOptions, id?: InjectTypeFnArgs<T, 'val'>) => ValidateFn);

export const deserializeGetValidationErrors = deserializeRTFunctionWithOptions<GetValidationErrorsFn>(
  'deserializeGetValidationErrors',
  getValidationErrorsIdentity
) as unknown as (<T>(runType: RunType<T>, options?: ValidateOptions, id?: InjectTypeFnArgs<T, 'verr'>) => GetValidationErrorsFn) &
  (<T>(val?: T, options?: ValidateOptions, id?: InjectTypeFnArgs<T, 'verr'>) => GetValidationErrorsFn);

export const deserializeHasUnknownKeys = deserializeRTFunction<HasUnknownKeysFn>(
  'deserializeHasUnknownKeys',
  () => false
) as unknown as (<T>(runType: RunType<T>, id?: InjectTypeFnArgs<T, 'huk'>) => HasUnknownKeysFn) &
  (<T>(val?: T, id?: InjectTypeFnArgs<T, 'huk'>) => HasUnknownKeysFn);

export const deserializeCloneExactShape = deserializeRTFunction<CloneExactShapeFn>(
  'deserializeCloneExactShape',
  identityValueFn
) as unknown as (<T>(runType: RunType<T>, id?: InjectTypeFnArgs<T, 'ces'>) => CloneExactShapeFn) &
  (<T>(val?: T, id?: InjectTypeFnArgs<T, 'ces'>) => CloneExactShapeFn);

export const deserializeUnknownKeyErrors = deserializeRTFunction<UnknownKeyErrorsFn>(
  'deserializeUnknownKeyErrors',
  unknownKeyErrorsIdentity
) as unknown as (<T>(runType: RunType<T>, id?: InjectTypeFnArgs<T, 'uke'>) => UnknownKeyErrorsFn) &
  (<T>(val?: T, id?: InjectTypeFnArgs<T, 'uke'>) => UnknownKeyErrorsFn);

export const deserializePrepareForJson = deserializeRTFunction<PrepareForJsonFn>(
  'deserializePrepareForJson',
  identityValueFn
) as unknown as (<T>(runType: RunType<T>, id?: InjectTypeFnArgs<T, 'pj'>) => PrepareForJsonFn) &
  (<T>(val?: T, id?: InjectTypeFnArgs<T, 'pj'>) => PrepareForJsonFn);

export const deserializeRestoreFromJson = deserializeRTFunction<RestoreFromJsonFn>(
  'deserializeRestoreFromJson',
  identityValueFn
) as unknown as (<T>(runType: RunType<T>, id?: InjectTypeFnArgs<T, 'rj'>) => RestoreFromJsonFn) &
  (<T>(val?: T, id?: InjectTypeFnArgs<T, 'rj'>) => RestoreFromJsonFn);

export const deserializeStringifyJson = deserializeRTFunction<StringifyJsonFn>(
  'deserializeStringifyJson',
  stringifyJsonIdentity
) as unknown as (<T>(runType: RunType<T>, id?: InjectTypeFnArgs<T, 'sj'>) => StringifyJsonFn) &
  (<T>(val?: T, id?: InjectTypeFnArgs<T, 'sj'>) => StringifyJsonFn);
