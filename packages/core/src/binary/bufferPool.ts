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

import {getOrCreateGlobal} from '../utils.ts';

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

interface BufferPoolState {
    config: BufferPoolConfig;
    enabled: boolean;
    freeLists: Map<number, ArrayBuffer[]>;
    stats: {hits: number; misses: number; dropped: number};
    bytesHeld: number;
}

// process-wide singleton: under a dual load of @mionjs/core (see
// docs/done/virtual-module-retired-and-dual-core-load.md) `configureBufferPool` and
// `serializeBinaryBody` would otherwise land on different pools, and pooling would be silently off
// while the configuration appeared to apply.
const state = getOrCreateGlobal<BufferPoolState>('mion.core.binary.bufferPool', () => ({
    config: {...DEFAULTS},
    enabled: false,
    freeLists: new Map<number, ArrayBuffer[]>(),
    stats: {hits: 0, misses: 0, dropped: 0},
    bytesHeld: 0,
}));

/** Enables/configures the pool. Platform adapters that own a safe release point call this. */
export function configureBufferPool(patch: Partial<BufferPoolConfig> & {enabled?: boolean}): void {
    const {enabled: nextEnabled, ...rest} = patch;
    // Held buffers are filed under a size class derived from the current boundaries. Changing one
    // would orphan them: filed under a key nothing looks up any more, yet still counted in
    // bytesHeld, permanently shrinking maxTotalBytes. Drain instead.
    const classesChanged =
        (rest.minClassBytes !== undefined && rest.minClassBytes !== state.config.minClassBytes) ||
        (rest.maxClassBytes !== undefined && rest.maxClassBytes !== state.config.maxClassBytes);
    state.config = {...state.config, ...rest};
    if (nextEnabled !== undefined) state.enabled = nextEnabled;
    if (!state.enabled || classesChanged) clearBufferPool();
}

/** True when pooled serialization should be attempted at all. */
export function isBufferPoolEnabled(): boolean {
    return state.enabled;
}

/** Drops every retained buffer. For tests and shutdown. */
export function clearBufferPool(): void {
    state.freeLists.clear();
    state.bytesHeld = 0;
}

/** Resets pool state AND config. Tests only. */
export function resetBufferPool(): void {
    clearBufferPool();
    state.config = {...DEFAULTS};
    state.enabled = false;
    state.stats.hits = 0;
    state.stats.misses = 0;
    state.stats.dropped = 0;
}

export function getBufferPoolStats(): BufferPoolStats {
    let held = 0;
    for (const list of state.freeLists.values()) held += list.length;
    return {hits: state.stats.hits, misses: state.stats.misses, held, bytesHeld: state.bytesHeld, dropped: state.stats.dropped};
}

/** Rounds up to the next power-of-two size class, floored at minClassBytes. */
export function sizeClassFor(bytes: number): number {
    const min = state.config.minClassBytes;
    if (bytes <= min) return min;
    // next power of two at or above `bytes`
    return 2 ** Math.ceil(Math.log2(bytes));
}

/** A lease over a buffer the pool does not retain (oversized, or pooling disabled). */
function unpooledLease(bytes: number): BufferLease {
    state.stats.misses++;
    return {buffer: new ArrayBuffer(bytes), release: () => {}};
}

/**
 * Borrows a buffer of at least `minBytes`. The returned buffer may be LARGER than requested — the
 * caller must size the payload by the serializer's own index, never by buffer.byteLength.
 */
export function acquireBuffer(minBytes: number): BufferLease {
    if (!state.enabled) return unpooledLease(minBytes);
    const cls = sizeClassFor(minBytes);
    // Above the ceiling: serve it, but never retain it.
    if (cls > state.config.maxClassBytes) return unpooledLease(minBytes);

    const list = state.freeLists.get(cls);
    const pooled = list?.pop();
    if (pooled !== undefined) {
        state.bytesHeld -= cls;
        state.stats.hits++;
        return makeLease(pooled, cls);
    }
    state.stats.misses++;
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
    if (!state.enabled) return;
    // a reconfigure may have moved the class boundaries under a lease taken before it: only file a
    // buffer whose byte length still IS its class, so nothing lands under a stale key
    if (cls !== sizeClassFor(buffer.byteLength) || cls > state.config.maxClassBytes) return;
    let list = state.freeLists.get(cls);
    if (list === undefined) {
        list = [];
        state.freeLists.set(cls, list);
    }
    if (list.length >= state.config.maxPerClass || state.bytesHeld + cls > state.config.maxTotalBytes) {
        state.stats.dropped++;
        return;
    }
    list.push(buffer);
    state.bytesHeld += cls;
}
