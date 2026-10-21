/* ########
 * 2026 ma-jerez
 * Author: Ma-jerez
 * License: MIT, see LICENSE
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {CompiledPureFunction, PureFunction as PureFn, PureFunctionFactory as PureFnFactory} from './types.ts';
import {getRTUtils} from './rtUtils.ts';
import {initFromTuple, isEntryTuple, type EntryTuple} from './entryTuple.ts';
import type {
  InjectPureFnId,
  PureFunction as PureFunctionMarker,
  PureFunctionFactory as PureFunctionFactoryMarker,
} from '../markers.ts';

/** A pure function's identity: the owning package plus a hash of the body that ships, like `'@acme/text#pf_9Zt1bRm4cVaPqL'`. */
// A move or a rename keeps the id; a change to the body, or to the id of a helper it reaches, changes it.
// The brand means only a value a registrar returned type-checks where an id is asked for, so a body reaches another pure fn by importing it.
export type PureFnId<ID extends string = string> = ID & {readonly __rtPureFnIdBrand: true};

/** TWO authoring forms, one runtime shape: the cache always stores a factory `(utl) => fn` for lazy materialisation. */
// FACTORY: the argument IS the factory, emitted as-is, so it can do one-time setup + `utl` composition.
// DIRECT: the argument IS the pure fn and the compiler wraps it into `() => fn`, so `inputFrom(t => t.id)` works.
// That wrap is a BUILD-TIME concern (the Go extractor synthesises the factory), so both registrars share the core below.
// `wrap` only matters on the dev-override path, where the argument is the live function rather than a tuple.
function asFactory(fn: PureFn | PureFnFactory, wrap: boolean): PureFnFactory {
  return wrap ? () => fn as PureFn : (fn as PureFnFactory);
}

/** Shared registration core, and the one place the three shapes of `arg` are told apart. */
// Entry-module tuple: the normal, build-rewritten case, where calling this at module load IS the registration.
// Live function: the dev-tool override path, where `wrap` says whether it is the pure fn or the factory. `null`: body ships elsewhere.
// A missing `id` is the one hard error: no build processed this file, so there is no identity to register under.
function registerCore(caller: string, arg: unknown, id: string | undefined, wrap: boolean): PureFnId {
  // Hollowed registration: a package build stripped the body, which now travels on demand through the pure-fn cache.
  // Nothing is cached here: an empty entry would mask the real tuple whenever this call wins the load order.
  // Nothing ever invokes it either, because a body only reaches a pure fn the build demanded, served and registered before it runs.
  // The id is not needed: a consumer's build lowers an imported id to a literal from the `.d.ts`, so the generated id module tree-shakes out.
  if (arg == null) return (id ?? '') as PureFnId;
  if (id === undefined) {
    throw new Error(
      `[mion] ${caller}: no id injected. The build plugin must process this file — ` +
        `check that @mionjs/devtools is installed and the dev server has restarted ` +
        `after recent edits.`
    );
  }
  if (isEntryTuple(arg)) {
    initFromTuple(arg as EntryTuple);
    const registered = getRTUtils().getCompiledPureFnByKey(id);
    if (registered) return id as PureFnId;
    // An entry tuple that doesn't register its own id is an emitter bug, louder here than a lookup miss much later.
    throw new Error(`[mion] ${caller}: the entry tuple for "${id}" did not register it.`);
  }
  // Untracked: `id` is whatever this function was called with, so the build has no consumer reference to track.
  const existing = getRTUtils().getCompiledPureFnByKey(id);
  if (existing) {
    if (arg) {
      // Manual override — dev-tool only. The build rewrite injects the tuple.
      existing.createPureFn = asFactory(arg as PureFn | PureFnFactory, wrap);
      existing.fn = undefined;
    }
    return id as PureFnId;
  }
  if (typeof arg === 'function') {
    // No-transform fallback (a dev-tool override, or a file the build skipped): the function is right here.
    // Build-time metadata (id hash, stripped code, static dep extraction) is build-only; behaviour is identical because the function IS the body.
    const compiled: CompiledPureFunction = {
      id,
      paramNames: [],
      code: '',
      pureFnDependencies: [],
      createPureFn: asFactory(arg as PureFn | PureFnFactory, wrap),
      fn: undefined,
    };
    getRTUtils().addPureFn(id, compiled);
    return id as PureFnId;
  }
  return id as PureFnId;
}

/** FACTORY registration: `createPureFn` is emitted as-is, so it can compile one-time setup and compose other pure fns through `utl.usePureFn(otherId)`. */
// Returns the id the build computed, the value other pure fns import to reach this one; `null` registers a hollowed pure fn.
// The contract is encoded in the parameter brands, so the Go scanner discovers calls by brand and a library can wrap this registrar by forwarding both.
export function registerPureFnFactory<F extends PureFnFactory, ID extends string = string>(
  createPureFn: PureFunctionFactoryMarker<F> | null,
  id?: InjectPureFnId<F> & ID
): PureFnId<ID> {
  return registerCore('registerPureFnFactory', createPureFn, id, false) as PureFnId<ID>;
}

/** DIRECT registration: `fn` is the pure function ITSELF and the compiler wraps it into `() => fn`. */
// Use `registerPureFnFactory` instead when the pure fn needs one-time setup or `utl` composition.
export function registerPureFn<F extends PureFn, ID extends string = string>(
  fn: PureFunctionMarker<F> | null,
  id?: InjectPureFnId<F> & ID
): PureFnId<ID> {
  return registerCore('registerPureFn', fn, id, true) as PureFnId<ID>;
}
