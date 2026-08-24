// Reflection-node accessor — the value-bearing companion to `getRunTypeId`.
// Where `getRunTypeId<T>()` returns the opaque id string, `getRunType<T>()`
// returns the traversable `RunType<T>` node the build registered for `T`, i.e.
// `getRTUtils().getRunType(getRunTypeId<T>())` collapsed into one call. Kept in
// its own file (like `createMockDataFn`) so markers.ts stays registry-free.

import {getRTUtils} from './runtypes/rtUtils.ts';
import {entryTupleKey, initFromTuple, isEntryTuple} from './runtypes/entryTuple.ts';
import type {InjectRunTypeId} from './markers.ts';
import type {RunType} from './runtypes/types.ts';

/**
 * Returns the reflected `RunType<T>` node — the parsed, traversable type graph
 * (`kind`, `children`, `parameters`, `child`, `return`, format annotations, …).
 * Three call shapes, mirroring `createMockDataFn`:
 *
 *   - STATIC — bring the type, no value: `getRunType<User>()`.
 *   - REFLECTION — let `T` be inferred from a runtime value: `getRunType(user)`.
 *     The value is read only for its type; at runtime it is ignored.
 *   - RUN-TYPE — pass the run-type a builder returned, reflect the type it
 *     MODELS: `getRunType(object({…}))`. `T` is the UNWRAPPED modeled type, so
 *     the graph is the run-type's type, NOT the `RunType` wrapper interface.
 *     Without this overload `getRunType(runType)` infers `T = RunType<…>` and
 *     reflects the whole `RunType` interface (id, kind, children, format
 *     annotation, …) instead of the type the run-type describes.
 *
 * A trailing `InjectRunTypeId<T>` parameter the build fills at the call site, so
 * `getRunType` is itself a `getRunTypeId` wrapper — the transformer injects the
 * entry tuple, the call registers the type graph, and the node is returned.
 * Throws if the transformer isn't active (no id injected) or the build emitted
 * no entry for the resolved id.
 */
// Run-type overload first so `getRunType(runType)` binds `T` from
// `RunType<T>` rather than matching `(_value?: T)` with `T = RunType<T>`.
export function getRunType<T>(runType: RunType<T>, id?: InjectRunTypeId<T>): RunType<T>;
export function getRunType<T>(_value?: T, id?: InjectRunTypeId<T>): RunType<T>;
export function getRunType<T>(_valueOrSchema?: T | RunType<T>, id?: InjectRunTypeId<T>): RunType<T> {
  let injectedId: string | undefined = id;
  if (isEntryTuple(id)) {
    // The plugin injects the runtype's entry-module tuple — register the type
    // graph and recover the id string, exactly as createMockDataFn does.
    initFromTuple(id);
    injectedId = entryTupleKey(id);
  }
  if (injectedId === undefined) {
    throw new Error('getRunType(): no id injected. ts-runtypes-devtools must be active.');
  }
  const runType = getRTUtils().getRunType(injectedId);
  if (!runType) {
    throw new Error(
      `getRunType(): no RunType entry for "${injectedId}" in rtUtils. The build pipeline didn't emit a cache entry for that runtype.`
    );
  }
  return runType as RunType<T>;
}
