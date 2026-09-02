/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Size-classed ArrayBuffer pool for the binary lane.
//
// @mionjs/run-types allocates a fresh ArrayBuffer per serializer and has no reuse of its own, so in
// a hot server loop every response is one allocation (plus another per growth step) left to the GC.
// mion can do better because it knows the request boundary — but only where the platform gives us a
// safe point to hand the buffer back, which is why acquisition returns a LEASE rather than a raw
// buffer, and why the pool is enabled per-platform rather than globally.
//
// Failure mode is deliberately benign: a lease that is never released is simply not returned to the
// free list and gets collected as before. A lost reuse, never a corrupted response.
//
// Configuration lives in ./options.ts (`configureBinary({pool: {...}})`); this module owns only the
// STATE — the free lists and their counters.

import {getBinaryOptions, type BufferPoolOptions} from './options.ts';
import {getOrCreateGlobal} from '../utils.ts';

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

interface BufferPoolState {
  freeLists: Map<number, ArrayBuffer[]>;
  stats: {hits: number; misses: number; dropped: number};
  bytesHeld: number;
  /** the options the retained buffers were filed under; -1 until the first reconcile */
  filedEnabled: boolean;
  filedMin: number;
  filedMax: number;
}

// process-wide singleton: under a dual load of @mionjs/core (a module-graph duplication a consumer
// bundle once produced) the free lists must be the same ones the serializer borrows from
const state = getOrCreateGlobal<BufferPoolState>('mion.core.binary.bufferPool', () => ({
  freeLists: new Map<number, ArrayBuffer[]>(),
  stats: {hits: 0, misses: 0, dropped: 0},
  bytesHeld: 0,
  filedEnabled: false,
  filedMin: -1,
  filedMax: -1,
}));

/**
 * Reconciles the retained buffers with the current options, and is called from every entry point of
 * this module so the pool heals itself whenever the options change, from wherever they change —
 * rather than `configureBinary` having to know the pool exists.
 *
 * Two changes invalidate what is held: pooling being turned OFF, which must not leave megabytes
 * retained for a pool nobody is drawing from; and a class boundary MOVING, which would leave every
 * retained buffer filed under a key nothing looks up any more while still counting against
 * `maxTotalBytes`.
 */
function reconcile(pool: BufferPoolOptions): void {
  if (pool.enabled === state.filedEnabled && pool.minClassBytes === state.filedMin && pool.maxClassBytes === state.filedMax)
    return;
  state.filedEnabled = pool.enabled;
  state.filedMin = pool.minClassBytes;
  state.filedMax = pool.maxClassBytes;
  clearBufferPool();
}

/** True when pooled serialization should be attempted at all. */
export function isBufferPoolEnabled(): boolean {
  const pool = getBinaryOptions().pool;
  reconcile(pool);
  return pool.enabled;
}

/** Drops every retained buffer. For tests and shutdown. */
export function clearBufferPool(): void {
  state.freeLists.clear();
  state.bytesHeld = 0;
}

/** Drops every retained buffer and zeroes the counters. Tests and shutdown; the OPTIONS are reset
 *  separately through `resetBinaryOptions`. */
export function resetBufferPool(): void {
  clearBufferPool();
  state.stats.hits = 0;
  state.stats.misses = 0;
  state.stats.dropped = 0;
}

export function getBufferPoolStats(): BufferPoolStats {
  reconcile(getBinaryOptions().pool);
  let held = 0;
  for (const list of state.freeLists.values()) held += list.length;
  return {hits: state.stats.hits, misses: state.stats.misses, held, bytesHeld: state.bytesHeld, dropped: state.stats.dropped};
}

/** Rounds up to the next power-of-two size class, floored at minClassBytes. */
export function sizeClassFor(bytes: number): number {
  const min = getBinaryOptions().pool.minClassBytes;
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
  const pool = getBinaryOptions().pool;
  reconcile(pool);
  if (!pool.enabled) return unpooledLease(minBytes);
  const cls = sizeClassFor(minBytes);
  // Above the ceiling: serve it, but never retain it.
  if (cls > pool.maxClassBytes) return unpooledLease(minBytes);

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
  const pool = getBinaryOptions().pool;
  reconcile(pool);
  if (!pool.enabled) return;
  // a reconfigure may have moved the class boundaries under a lease taken before it: only file a
  // buffer whose byte length still IS its class, so nothing lands under a stale key
  if (cls !== sizeClassFor(buffer.byteLength) || cls > pool.maxClassBytes) return;
  let list = state.freeLists.get(cls);
  if (list === undefined) {
    list = [];
    state.freeLists.set(cls, list);
  }
  if (list.length >= pool.maxPerClass || state.bytesHeld + cls > pool.maxTotalBytes) {
    state.stats.dropped++;
    return;
  }
  list.push(buffer);
  state.bytesHeld += cls;
}
