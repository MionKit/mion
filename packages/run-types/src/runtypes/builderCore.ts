// The shared value-first BUILDER primitives — the runtime helpers every builder
// (the scalar/format builders under `formats/` AND the composer/utility builders
// under `schema/`) is constructed from. It lives in the neutral `runtypes/` layer
// so neither authoring surface depends on the other: moving these out of
// `schema/atomic.ts` removed the old `formats`-builder → `schema/atomic.ts` value
// edge, making `formats/` self-contained. Runtime deps are only the registry
// (`rtUtils.ts`) + the entry-tuple decoder (`entryTuple.ts`).

import {getRTUtils} from './rtUtils.ts';
import {entryTupleKey, initFromTuple, isEntryTuple} from './entryTuple.ts';
import type {RunType} from './types.ts';
import type {InjectRunTypeId} from '../markers.ts';
import type {BrandArg} from './builderTypes.ts';

// ───────────────────────────── builderResult ────────────────────────
//
// Each builder is an INJECTABLE MARKER (Tier 2): the trailing
// `id?: InjectRunTypeId<…>` is filled by ts-runtypes-devtools with the resolved
// structural id, and the body returns the LIVE RunType node for it
// (`getRunType(id)`) — the exact node the type compiler produces for the
// equivalent written type. A builder nested inside a composer is skipped by the
// scanner (the enclosing marker reflects the whole shape), so it has no id and
// returns the carrier the composer discards.

/** Resolves the live RunType node for an injected marker id — the exact node
 *  the type compiler produces for the builder's return type. With no id (the
 *  builder is nested inside a composer, so the scanner skipped it) or before the
 *  cache module has loaded, it returns the `carrier` the enclosing composer
 *  discards. **/
export function builderResult<T>(id: InjectRunTypeId<T> | undefined, carrier: unknown): RunType<T> {
  // The plugin injects the runtype's ENTRY-MODULE TUPLE — register the type
  // graph (children included) and recover the id string. A bare string id
  // keeps working for callers that pre-resolved it.
  let resolvedId: string | undefined = typeof id === 'string' ? id : undefined;
  if (isEntryTuple(id)) {
    initFromTuple(id);
    resolvedId = entryTupleKey(id);
  }
  if (resolvedId !== undefined) {
    const runType = getRTUtils().getRunType(resolvedId);
    if (runType) return runType as RunType<T>;
  }
  return carrier as RunType<T>;
}

/** Brand tag for the value-first leaf builders — `string({…}, brand('UserId'))`
 *  opts the leaf INTO a nominal `Format*<P, 'UserId'>` (matching the type-first
 *  `String<P, 'UserId'>`). The tag is TS-only: the Go scanner reads the
 *  brand off the reflected `LeafType<…, B>`, NOT off this object, so at runtime
 *  the builder discards it and resolves the injected id as usual. It rides BEFORE
 *  the trailing id slot — an object, never confused with the id string. **/
export function brand<const B extends string>(name: B): BrandArg<B> {
  return {__rtBrandName: name};
}

/** Recovers the plugin-injected id from a leaf builder's args. The plugin appends
 *  the resolved id as the TRAILING argument; the optional params (object) and
 *  brand (object) slots before it are never strings, so the id is simply the last
 *  string argument. Before injection (no id arg) there is no string → `undefined`,
 *  and the builder falls back to the carrier. **/
export function lastInjectedId(...args: unknown[]): string | undefined {
  for (let i = args.length - 1; i >= 0; i--) {
    const arg = args[i];
    if (typeof arg === 'string') return arg;
    if (isEntryTuple(arg)) {
      // Entry-module tuple: register the type graph and hand back its id —
      // the params (plain object) and brand (plain object) slots before it
      // are never arrays, so tuple detection is unambiguous.
      initFromTuple(arg);
      return entryTupleKey(arg);
    }
  }
  return undefined;
}

/** Builds a no-param preset builder for a FIXED named format `T` (e.g.
 *  `Email`, `Int8`). The returned function's only param is the injected
 *  `InjectRunTypeId<T>` brand, so the scanner reflects `T` and the value-first id
 *  matches the type-first alias. Used by the predefined-format builder files
 *  (stringFormats.ts / numberFormats.ts / bigintFormats.ts); `tag` is the Go
 *  format name, carried only on the fallback carrier. **/
export function presetBuilder<T>(tag: string): (id?: InjectRunTypeId<T>) => RunType<T> {
  return (id?: InjectRunTypeId<T>) => builderResult(id, {type: tag, formatParams: {}});
}
