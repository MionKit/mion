/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// mion-owned response-size statistics for the binary lane.
//
// mion predicts the buffer size itself and passes it to @ts-runtypes/core explicitly, so upstream's
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

/** Recent observed sizes for one key. `ring` is a circular buffer of the last `ring.length`
 *  observations; `max` is the running max over that window, recomputed on wrap. */
interface SizeStats {
    ring: Float64Array;
    /** number of observations recorded, capped at ring length */
    count: number;
    /** next write position */
    idx: number;
}

export interface SizeStatsConfig {
    /** observations retained per key. Larger = steadier quantiles, slower to follow a regime shift. */
    ringSize: number;
    /** hard cap on tracked keys; oldest-inserted are dropped first (FILO, as routesFlow's chain cache) */
    maxKeys: number;
}

const DEFAULTS: SizeStatsConfig = {ringSize: 64, maxKeys: 500};

let config: SizeStatsConfig = {...DEFAULTS};
const stats = new Map<string, SizeStats>();

/** Patches the statistics config. Resets tracked keys when the ring size changes, since existing
 *  rings are sized to the old value. */
export function configureSizeStats(patch: Partial<SizeStatsConfig>): void {
    const ringChanged = patch.ringSize !== undefined && patch.ringSize !== config.ringSize;
    config = {...config, ...patch};
    if (ringChanged) stats.clear();
}

/** Drops all tracked sizes. For tests and for tenant teardown. */
export function resetSizeStats(): void {
    stats.clear();
    config = {...DEFAULTS};
}

/** How many observations a key has. Callers gate strategy on this — a key with too little history
 *  cannot support a meaningful high quantile. */
export function observationCount(key: string): number {
    return stats.get(key)?.count ?? 0;
}

/** Records one observed payload size. */
export function recordSize(key: string, bytes: number): void {
    let entry = stats.get(key);
    if (entry === undefined) {
        // Binary serialization only runs on a MATCHED route, so the key space is bounded by the
        // route table. The cap is a backstop against that invariant breaking, not a working limit.
        if (stats.size >= config.maxKeys) evictOldest();
        entry = {ring: new Float64Array(config.ringSize), count: 0, idx: 0};
        stats.set(key, entry);
    }
    entry.ring[entry.idx] = bytes;
    entry.idx = (entry.idx + 1) % entry.ring.length;
    if (entry.count < entry.ring.length) entry.count++;
}

/** Drops the oldest-inserted half, mirroring the FILO idiom used by the routesFlow chain cache. */
function evictOldest(): void {
    const drop = Math.max(1, Math.floor(stats.size / 2));
    let n = 0;
    for (const key of stats.keys()) {
        stats.delete(key);
        if (++n >= drop) break;
    }
}

/**
 * Predicted byte size for `key` at `quantile` (0-1), scaled by `pad` (1.25 = +25% headroom).
 * Falls back to `fallback` until the key has been observed.
 * `floorAtMax` returns at least the largest size in the window — for the pooled strategy, where an
 * underestimate costs a re-encode rather than an in-place grow.
 */
export function predictSize(key: string, quantile: number, pad: number, fallback: number, floorAtMax = false): number {
    const entry = stats.get(key);
    if (entry === undefined || entry.count === 0) return Math.ceil(fallback * pad);
    const sorted = Float64Array.prototype.slice.call(entry.ring, 0, entry.count).sort();
    const at = sorted[Math.min(sorted.length - 1, Math.floor(quantile * sorted.length))];
    const base = floorAtMax ? Math.max(at, sorted[sorted.length - 1]) : at;
    return Math.ceil(base * pad);
}
