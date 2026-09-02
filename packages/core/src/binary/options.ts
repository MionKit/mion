/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Every knob the binary lane has, in ONE object.
//
// mion decides the BUFFER, @mionjs/run-types does the ENCODING, so the options split along that
// line: `pool` and `sizeStats` are mion's (where the bytes live, and how many of them to ask for),
// while the inherited members are upstream's own and are forwarded to it.
//
// Only the upstream options that REACH mion are inherited. `defaultBufferSize` and `sizeMultiplier`
// drive upstream's own predictor, which mion never consults (every serializer it creates is given an
// explicit `size` or `buffer`), and `sizeHistory` is only written by `markAsEnded`, which mion never
// calls. Inheriting those three would put three knobs on the public surface that provably do nothing
// — the exact defect this lane was just audited for.

import {setSerializationOptions, type SerializationOptions} from '@mionjs/run-types';
import {getOrCreateGlobal} from '../utils.ts';

/** Where a serialization buffer comes from. Armed per platform: only an adapter with a proven-safe
 *  release point may enable it (see the release-point table in the docs). */
export interface BufferPoolOptions {
  /** whether buffers are borrowed from the pool at all */
  enabled: boolean;
  /** smallest size class in bytes; requests below this round up to it */
  minClassBytes: number;
  /** largest POOLED size class; anything above is allocated directly and never retained, so a
   *  single huge response cannot hold megabytes hostage */
  maxClassBytes: number;
  /** free-list depth per size class */
  maxPerClass: number;
  /** ceiling on total bytes held across all classes */
  maxTotalBytes: number;
}

/** How big a buffer to ask for, from mion's own record of what each method recently wrote. */
export interface SizeStatsOptions {
  /** observations retained per method. Larger = steadier quantiles, slower to follow a regime shift. */
  ringSize: number;
  /** hard cap on tracked methods per direction; oldest-inserted are dropped first (FILO) */
  maxKeys: number;
}

/**
 * The binary lane's configuration. Extends the `@mionjs/run-types` serialization options that mion
 * actually reaches — the encoded-string bytes cache, which decides whether a string write reserves
 * its exact byte count or upstream's worst-case `charLength * 3`.
 */
export interface BinaryOptions extends Partial<
  Pick<SerializationOptions, 'maxStrCacheLength' | 'maxCacheSize' | 'stringBytesCache'>
> {
  pool: BufferPoolOptions;
  sizeStats: SizeStatsOptions;
}

/** A partial patch of the binary options, nested groups included. */
export type BinaryOptionsPatch = Partial<Omit<BinaryOptions, 'pool' | 'sizeStats'>> & {
  pool?: Partial<BufferPoolOptions>;
  sizeStats?: Partial<SizeStatsOptions>;
};

/** mion's defaults. The upstream members are deliberately absent: leaving them unset means upstream
 *  keeps ITS defaults, rather than mion pinning values it has no opinion about. */
export const DEFAULT_BINARY_OPTIONS: BinaryOptions = {
  pool: {
    enabled: false,
    minClassBytes: 1024, // 1 KiB
    maxClassBytes: 1024 * 1024, // 1 MiB
    maxPerClass: 32,
    maxTotalBytes: 64 * 1024 * 1024, // 64 MiB
  },
  sizeStats: {
    ringSize: 64,
    maxKeys: 500,
  },
};

// process-wide singleton: a dual load of @mionjs/core (a module-graph duplication a consumer bundle
// once produced) must not leave `configureBinary` writing to a different object than the serializer reads
const state = getOrCreateGlobal<{options: BinaryOptions}>('mion.core.binary.options', () => ({
  options: cloneDefaults(),
}));

function cloneDefaults(): BinaryOptions {
  return {
    pool: {...DEFAULT_BINARY_OPTIONS.pool},
    sizeStats: {...DEFAULT_BINARY_OPTIONS.sizeStats},
  };
}

/** The options every binary function reads. Never mutate the result — patch through `configureBinary`. */
export function getBinaryOptions(): Readonly<BinaryOptions> {
  return state.options;
}

/**
 * Patches the binary options. Nested groups are merged, not replaced, so
 * `configureBinary({pool: {enabled: true}})` keeps the size classes already configured.
 *
 * The members inherited from `@mionjs/run-types` are forwarded to it, and only when present: an
 * absent member leaves upstream's own default alone rather than pinning it.
 */
export function configureBinary(patch: BinaryOptionsPatch): void {
  const {pool, sizeStats, ...upstream} = patch;
  state.options = {
    ...state.options,
    ...upstream,
    pool: pool ? {...state.options.pool, ...pool} : state.options.pool,
    sizeStats: sizeStats ? {...state.options.sizeStats, ...sizeStats} : state.options.sizeStats,
  };
  if (Object.keys(upstream).length) setSerializationOptions(upstream);
}

/** Restores mion's defaults. Does NOT reset upstream's serialization options — they are shared
 *  process state that mion only ever patches. Tests and tenant teardown. */
export function resetBinaryOptions(): void {
  state.options = cloneDefaults();
}
