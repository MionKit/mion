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

/**
 * A pure function's identity: where it lives. The build computes it from the
 * package, the file and the name the registration is bound to, so
 * `export const slugify = registerPureFn(v => …)` in `src/slug.ts` of
 * `@acme/text` is `'@acme/text/src/slug#slugify'`. A registration bound to no
 * name is identified by a hash of its body instead.
 *
 * The brand means only a value a registrar returned type-checks where an id is
 * asked for, so a body reaches another pure fn by importing it:
 *
 * ```ts
 * import {slugify} from './slug';
 * export const titleOf = registerPureFnFactory((utl) => (v: string) => utl.getPureFn(slugify)(v));
 * ```
 */
export type PureFnId<ID extends string = string> = ID & {readonly __rtPureFnIdBrand: true};

/**
 * The pure-fn surface is ONE lane, TWO forms (factory or direct). Every form
 * ends up as the same runtime `CompiledPureFunction` — the cache always stores a
 * factory `(utl) => fn` for lazy materialisation. The only difference is the
 * AUTHORING shape the marker declares:
 *
 *   - FACTORY (`PureFunctionFactory<F>` marker): the argument IS the factory,
 *     emitted as-is, so it can do one-time setup + `utl` composition.
 *   - DIRECT (`PureFunction<F>` marker): the argument IS the pure fn; the
 *     compiler wraps it into `() => fn`, so `inputFrom(t => t.id)` works.
 *
 * The wrap difference is a BUILD-TIME concern (the Go extractor synthesises the
 * factory for the direct form); at runtime the plugin has already rewritten the
 * argument to its entry-module tuple, so both registrars share the same core
 * below. `wrap` only matters on the dev-override path, where the argument is the
 * live function rather than a tuple.
 */

/** Wrap a live function into the factory the cache stores: the direct form
 *  returns the pure fn from a zero-arg factory (`() => fn`); the factory form
 *  is already a factory and rides through unchanged. */
function asFactory(fn: PureFn | PureFnFactory, wrap: boolean): PureFnFactory {
  return wrap ? () => fn as PureFn : (fn as PureFnFactory);
}

/**
 * Shared registration core for both registrars, and the one place the four
 * shapes of `arg` are told apart. `arg` is the build-rewritten entry-module
 * tuple in the normal case (calling this at module load IS the registration —
 * the tuple's dep closure loads and registers with it); a live function is the
 * dev-tool override path, where `wrap` decides whether it is the pure fn (wrap)
 * or the factory (no wrap); `null` is a hollowed registration whose body ships
 * elsewhere.
 *
 * A missing `id` is the one hard error: it means no build processed this file,
 * so there is no identity to register under and nothing else can be assumed.
 */
function registerCore(caller: string, arg: unknown, id: string | undefined, wrap: boolean): PureFnId {
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
    // An entry tuple that doesn't register its own id is an emitter bug worth
    // surfacing loudly rather than leaving as a lookup miss much later.
    throw new Error(`[mion] ${caller}: the entry tuple for "${id}" did not register it.`);
  }
  // Untracked: `id` is whatever this function was called with, so there is no
  // consumer reference for the build to track.
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
    // No-transform fallback (a dev-tool override, or a file the build skipped):
    // the function is right here, so register it directly. Build-time metadata
    // (bodyHash, stripped code, static dep extraction) is build-only; runtime
    // behaviour is identical because the function IS the body.
    const compiled: CompiledPureFunction = {
      id,
      bodyHash: '',
      paramNames: [],
      code: '',
      pureFnDependencies: [],
      createPureFn: asFactory(arg as PureFn | PureFnFactory, wrap),
      fn: undefined,
    };
    getRTUtils().addPureFn(id, compiled);
    return id as PureFnId;
  }
  // Hollowed registration: the body no longer ships in this file (a package
  // build stripped it) and travels on demand through the pure-fn cache,
  // registering via a fn entry's deps thunk instead. Deliberately NOT cached:
  // caching an empty entry here would mask the real tuple whenever this call
  // wins the load order. Nothing ever invokes it, because a body only reaches a
  // pure fn the build demanded, which is served and registered before it runs.
  return id as PureFnId;
}
    }
    return id as PureFnId;
  }
  if (typeof arg === 'function') {
    // No-transform fallback (a dev-tool override, or a file the build skipped):
    // the function is right here, so register it directly. Build-time metadata
    // (bodyHash, stripped code, static dep extraction) is build-only; runtime
    // behaviour is identical because the function IS the body.
    const compiled: CompiledPureFunction = {
      id,
      bodyHash: '',
      paramNames: [],
      code: '',
      pureFnDependencies: [],
      createPureFn: asFactory(arg as PureFn | PureFnFactory, wrap),
      fn: undefined,
    };
    getRTUtils().addPureFn(id, compiled);
    return id as PureFnId;
  }
  // Hollowed registration: the body no longer ships in this file (a package
  // build stripped it) and travels on demand through the pure-fn cache,
  // registering via a fn entry's deps thunk instead. Deliberately NOT cached:
  // caching an empty entry here would mask the real tuple whenever this call
  // wins the load order. Nothing ever invokes it, because a body only reaches a
  // pure fn the build demanded, which is served and registered before it runs.
  return id as PureFnId;
}

/**
 * FACTORY registration. `createPureFn` is a factory `(utl) => fn` — emitted
 * as-is, so it can compile one-time setup and compose other pure fns through
 * `utl.usePureFn(otherId)`. Returns the id the build computed, which is the
 * value other pure fns import to reach this one.
 *
 * `null` registers a hollowed pure fn: the body ships elsewhere and arrives on
 * demand. The contract is encoded in the parameter brands
 * (`PureFunctionFactory` + `InjectPureFnId`), so the Go scanner discovers calls
 * by brand and a library can wrap this registrar by forwarding both.
 */
export function registerPureFnFactory<F extends PureFnFactory, ID extends string = string>(
  createPureFn: PureFunctionFactoryMarker<F> | null,
  id?: InjectPureFnId<F> & ID
): PureFnId<ID> {
  return registerCore('registerPureFnFactory', createPureFn, id, false) as PureFnId<ID>;
}

/**
 * DIRECT registration — the ergonomic twin of `registerPureFnFactory`. `fn` is
 * the pure function ITSELF (a single callback); the compiler wraps it into
 * `() => fn`. Use this when the pure fn needs no one-time setup or `utl`
 * composition; reach for `registerPureFnFactory` when it does.
 */
export function registerPureFn<F extends PureFn, ID extends string = string>(
  fn: PureFunctionMarker<F> | null,
  id?: InjectPureFnId<F> & ID
): PureFnId<ID> {
  return registerCore('registerPureFn', fn, id, true) as PureFnId<ID>;
}
