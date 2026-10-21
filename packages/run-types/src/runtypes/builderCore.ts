// The shared value-first BUILDER primitives every builder under `formats/` and `schema/` is constructed from.
// They live in the neutral `runtypes/` layer so neither authoring surface depends on the other and `formats/` stays self-contained.
// Runtime deps are only the registry (`rtUtils.ts`) and the entry-tuple decoder (`entryTuple.ts`).

import {getRTUtils} from './rtUtils.ts';
import {entryTupleKey, initFromTuple, isEntryTuple} from './entryTuple.ts';
import type {RunType} from './types.ts';
import type {InjectRunTypeId} from '../markers.ts';
import type {BrandArg} from './builderTypes.ts';

// ───────────────────────────── builderResult ────────────────────────
//
// Each builder is an INJECTABLE MARKER (Tier 2): @mionjs/devtools fills the trailing `id?: InjectRunTypeId<…>` with the resolved structural id.

/** Resolves the live RunType node for an injected id: the exact node the type compiler produces for the builder's return type. **/
// With no id (nested inside a composer, which the scanner reflects whole) or before the cache module has loaded, the `carrier` is returned instead.
export function builderResult<T>(id: InjectRunTypeId<T> | undefined, carrier: unknown): RunType<T> {
  // The plugin injects the runtype's ENTRY-MODULE TUPLE: registering it brings in the type graph, children included, and yields the id string.
  // A bare string id keeps working for callers that pre-resolved it.
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

/** `string({…}, brand('UserId'))` opts the leaf INTO a nominal `Format*<P, 'UserId'>`, matching the type-first `String<P, 'UserId'>`. **/
// TS-only: the Go scanner reads the brand off the reflected `LeafType<…, B>`, NOT off this object, so the builder discards it at runtime.
// It rides BEFORE the trailing id slot — an object, never confused with the id string.
export function brand<const B extends string>(name: B): BrandArg<B> {
  return {__rtBrandName: name};
}

/** The plugin appends the resolved id as the TRAILING argument, and the params and brand slots before it are never strings, so the id is the last string. **/
// Before injection there is no string argument, so the builder falls back to the carrier.
export function lastInjectedId(...args: unknown[]): string | undefined {
  for (let i = args.length - 1; i >= 0; i--) {
    const arg = args[i];
    if (typeof arg === 'string') return arg;
    if (isEntryTuple(arg)) {
      // The params and brand slots before it are plain objects, never arrays, so tuple detection is unambiguous.
      initFromTuple(arg);
      return entryTupleKey(arg);
    }
  }
  return undefined;
}

/** A no-param builder for a FIXED named format `T` (`Email`, `Int8`), used by stringFormats.ts / numberFormats.ts / bigintFormats.ts. **/
// The only param is the injected `InjectRunTypeId<T>` brand, so the scanner reflects `T` and the value-first id matches the type-first alias.
// `tag` is the Go format name, carried only on the fallback carrier.
export function presetBuilder<T>(tag: string): (id?: InjectRunTypeId<T>) => RunType<T> {
  return (id?: InjectRunTypeId<T>) => builderResult(id, {type: tag, formatParams: {}});
}
