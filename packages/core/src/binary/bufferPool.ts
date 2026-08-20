/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Size-classed ArrayBuffer pool for the binary lane.
//
// @ts-runtypes/core allocates a fresh ArrayBuffer per serializer and has no reuse of its own, so in
// a hot server loop every response is one allocation (plus another per growth step) left to the GC.
// mion can do better because it knows the request boundary — but only where the platform gives us a
// safe point to hand the buffer back, which is why acquisition returns a LEASE rather than a raw
// buffer, and why the pool is enabled per-platform rather than globally.
//
// Failure mode is deliberately benign: a lease that is never released is simply not returned to the
// free list and gets collected as before. A lost reuse, never a corrupted response.

export interface BufferPoolConfig {
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

export interface BufferPoolStats {
    /** leases served from the free list */
    hits: number;
    /** leases that had to allocate (cold class, empty free list, or above maxClassBytes) */
    misses: number;
    /** buffers currently held on free lists */
    held: number;
    /** bytes currently held on free lists */
    bytesHeld: number;
    /** buffers dropped because a cap was hit */
    dropped: number;
}

/** A buffer borrowed from the pool. `release()` is idempotent. */
export interface BufferLease {
    readonly buffer: ArrayBuffer;
    release(): void;
}

const DEFAULTS: BufferPoolConfig = {
    minClassBytes: 1024, // 1 KiB
    maxClassBytes: 1024 * 1024, // 1 MiB
    maxPerClass: 32,
    maxTotalBytes: 64 * 1024 * 1024, // 64 MiB
};

let config: BufferPoolConfig = {...DEFAULTS};
let enabled = false;
const freeLists = new Map<number, ArrayBuffer[]>();
const stats = {hits: 0, misses: 0, dropped: 0};
let bytesHeld = 0;

/** Enables/configures the pool. Platform adapters that own a safe release point call this. */
export function configureBufferPool(patch: Partial<BufferPoolConfig> & {enabled?: boolean}): void {
    const {enabled: nextEnabled, ...rest} = patch;
    config = {...config, ...rest};
    if (nextEnabled !== undefined) enabled = nextEnabled;
    if (!enabled) clearBufferPool();
}

/** True when pooled serialization should be attempted at all. */
export function isBufferPoolEnabled(): boolean {
    return enabled;
}

/** Drops every retained buffer. For tests and shutdown. */
export function clearBufferPool(): void {
    freeLists.clear();
    bytesHeld = 0;
}

/** Resets pool state AND config. Tests only. */
export function resetBufferPool(): void {
    clearBufferPool();
    config = {...DEFAULTS};
    enabled = false;
    stats.hits = 0;
    stats.misses = 0;
    stats.dropped = 0;
}

export function getBufferPoolStats(): BufferPoolStats {
    let held = 0;
    for (const list of freeLists.values()) held += list.length;
    return {hits: stats.hits, misses: stats.misses, held, bytesHeld, dropped: stats.dropped};
}

/** Rounds up to the next power-of-two size class, floored at minClassBytes. */
export function sizeClassFor(bytes: number): number {
    const min = config.minClassBytes;
    if (bytes <= min) return min;
    // next power of two at or above `bytes`
    return 2 ** Math.ceil(Math.log2(bytes));
}

/** A lease over a buffer the pool does not retain (oversized, or pooling disabled). */
function unpooledLease(bytes: number): BufferLease {
    stats.misses++;
    return {buffer: new ArrayBuffer(bytes), release: () => {}};
}

/**
 * Borrows a buffer of at least `minBytes`. The returned buffer may be LARGER than requested — the
 * caller must size the payload by the serializer's own index, never by buffer.byteLength.
 */
export function acquireBuffer(minBytes: number): BufferLease {
    if (!enabled) return unpooledLease(minBytes);
    const cls = sizeClassFor(minBytes);
    // Above the ceiling: serve it, but never retain it.
    if (cls > config.maxClassBytes) return unpooledLease(minBytes);

    const list = freeLists.get(cls);
    const pooled = list?.pop();
    if (pooled !== undefined) {
        bytesHeld -= cls;
        stats.hits++;
        return makeLease(pooled, cls);
    }
    stats.misses++;
    return makeLease(new ArrayBuffer(cls), cls);
}

function makeLease(buffer: ArrayBuffer, cls: number): BufferLease {
    let released = false;
    return {
        buffer,
        release(): void {
            if (released) return; // idempotent: adapters may fire on both 'finish' and 'close'
            released = true;
            returnToPool(buffer, cls);
        },
    };
}

function returnToPool(buffer: ArrayBuffer, cls: number): void {
    if (!enabled) return;
    let list = freeLists.get(cls);
    if (list === undefined) {
        list = [];
        freeLists.set(cls, list);
    }
    if (list.length >= config.maxPerClass || bytesHeld + cls > config.maxTotalBytes) {
        stats.dropped++;
        return;
    }
    list.push(buffer);
    bytesHeld += cls;
}
