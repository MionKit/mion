/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// mion-owned response-size statistics for the binary lane.
//
// mion predicts the buffer size itself and passes it to @mionjs/run-types explicitly, so upstream's
// own predictor (and its unbounded module-global sizeHistory) is never consulted. Two reasons this
// lives here rather than being delegated:
//
//   - SKEW. Upstream predicts `mean + sizeMultiplier * stddev`, which assumes a symmetric
//     distribution. Response sizes are right-skewed. Measured on the fat-tailed bench profile that
//     predictor allocated ~9.3x the bytes actually written AND still missed 4.9% of the time — it
//     pays for headroom on every request and buys accuracy on none. A real quantile does better on
//     both counts at once.
//   - REGIME SHIFTS. A lifetime accumulator dilutes a change in payload size across all history. A
//     bounded ring ages the old regime out in RING_SIZE requests.
//
// Keys are METHOD ids, not request paths: a routesFlow request merges several routes into ONE
// envelope, so only per-method statistics let a never-seen combination be predicted from parts that
// have been seen. Request-param sizes and response-return sizes are separate distributions for the
// same method id — and a single process can write both (a mion client inside a mion server) — so
// each direction keeps its own key space.

import {getBinaryOptions} from './options.ts';
import {getOrCreateGlobal} from '../utils.ts';

/** Recent observed sizes for one key. `ring` holds the last `ring.length` observations in ARRIVAL
 *  order, so the oldest one is the one that ages out; `sorted` holds the same values ASCENDING and
 *  is maintained on insert, so reading a quantile is an index rather than a copy + sort on every
 *  serialization (this runs once per method per request). */
interface SizeStats {
  ring: Float64Array;
  sorted: Float64Array;
  /** number of observations recorded, capped at ring length */
  count: number;
  /** next write position */
  idx: number;
}

interface SizeStatsState {
  /** response-return sizes, keyed by method id */
  res: Map<string, SizeStats>;
  /** request-param sizes, keyed by method id */
  req: Map<string, SizeStats>;
}

// process-wide singleton: every copy of @mionjs/core under a dual load (a module-graph duplication a
// consumer bundle once produced) must record into the same rings the serializer reads
const state = getOrCreateGlobal<SizeStatsState>('mion.core.binary.sizeStats', () => ({
  res: new Map<string, SizeStats>(),
  req: new Map<string, SizeStats>(),
}));

/** Stats key space for one direction. */
function statsFor(isResponse: boolean): Map<string, SizeStats> {
  return isResponse ? state.res : state.req;
}

/** Drops all tracked sizes. For tests and for tenant teardown; the OPTIONS are reset separately
 *  through `resetBinaryOptions`. */
export function resetSizeStats(): void {
  state.res.clear();
  state.req.clear();
}

/** How many observations a key has, in the given direction. */
export function observationCount(key: string, isResponse: boolean): number {
  return statsFor(isResponse).get(key)?.count ?? 0;
}

/** Records one observed payload size for a method, in the given direction. */
export function recordSize(key: string, bytes: number, isResponse: boolean): void {
  const {ringSize, maxKeys} = getBinaryOptions().sizeStats;
  const stats = statsFor(isResponse);
  let entry = stats.get(key);
  // A ring sized to a since-changed `ringSize` is rebuilt rather than read at the wrong length, so
  // the statistics heal themselves whenever the options change, from wherever they change.
  if (entry !== undefined && entry.ring.length !== ringSize) entry = undefined;
  if (entry === undefined) {
    // Binary serialization only runs on a MATCHED route, so the key space is bounded by the
    // route table. The cap is a backstop against that invariant breaking, not a working limit.
    if (stats.size >= maxKeys) evictOldest(stats);
    entry = {ring: new Float64Array(ringSize), sorted: new Float64Array(ringSize), count: 0, idx: 0};
    stats.set(key, entry);
  }
  // a full ring overwrites its oldest observation, which must leave the sorted view too
  if (entry.count === entry.ring.length) sortedRemove(entry.sorted, entry.count, entry.ring[entry.idx]);
  else entry.count++;
  sortedInsert(entry.sorted, entry.count - 1, bytes);
  entry.ring[entry.idx] = bytes;
  entry.idx = (entry.idx + 1) % entry.ring.length;
}

/** Drops the oldest-inserted half, mirroring the FILO idiom used by the routesFlow chain cache. */
function evictOldest(stats: Map<string, SizeStats>): void {
  const drop = Math.max(1, Math.floor(stats.size / 2));
  let n = 0;
  for (const key of stats.keys()) {
    stats.delete(key);
    if (++n >= drop) break;
  }
}

/** Index of the first slot in the ascending `sorted[0..len)` holding a value >= `value`. */
function lowerBound(sorted: Float64Array, len: number, value: number): number {
  let lo = 0;
  let hi = len;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (sorted[mid] < value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Inserts `value` into the ascending `sorted[0..len)`, which must have room for one more. */
function sortedInsert(sorted: Float64Array, len: number, value: number): void {
  const at = lowerBound(sorted, len, value);
  if (at < len) sorted.copyWithin(at + 1, at, len);
  sorted[at] = value;
}

/** Removes one occurrence of `value` (guaranteed present) from the ascending `sorted[0..len)`. */
function sortedRemove(sorted: Float64Array, len: number, value: number): void {
  const at = lowerBound(sorted, len, value);
  if (at < len - 1) sorted.copyWithin(at, at + 1, len);
  sorted[len - 1] = 0;
}

/**
 * Predicted byte size for `key` at `quantile` (0-1), scaled by `pad` (1.25 = +25% headroom).
 * Quantile 1 is the largest size in the window — what the pooled strategy asks for, since it would
 * rather over-class a reused buffer than pay a grow copy off it.
 * Falls back to `fallback` until the key has been observed.
 */
export function predictSize(key: string, isResponse: boolean, quantile: number, pad: number, fallback: number): number {
  const entry = statsFor(isResponse).get(key);
  if (entry === undefined || entry.count === 0) return Math.ceil(fallback * pad);
  const at = entry.sorted[Math.min(entry.count - 1, Math.floor(quantile * entry.count))];
  return Math.ceil(at * pad);
}
