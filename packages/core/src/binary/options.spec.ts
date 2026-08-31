/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, expect, it, beforeEach} from 'vitest';
import {configureBinary, getBinaryOptions, resetBinaryOptions, DEFAULT_BINARY_OPTIONS} from './options.ts';
import {acquireBuffer, isBufferPoolEnabled, resetBufferPool, sizeClassFor, getBufferPoolStats} from './bufferPool.ts';
import {observationCount, recordSize, resetSizeStats} from './sizeStats.ts';
import {createDataViewSerializer} from './dataView.ts';

describe('binary options', () => {
  beforeEach(() => {
    resetBufferPool();
    resetSizeStats();
    resetBinaryOptions();
  });

  it('starts at the documented defaults', () => {
    expect(getBinaryOptions()).toEqual(DEFAULT_BINARY_OPTIONS);
    expect(isBufferPoolEnabled()).toBe(false);
  });

  it('merges nested groups rather than replacing them', () => {
    configureBinary({pool: {minClassBytes: 256, maxPerClass: 4}});
    configureBinary({pool: {enabled: true}});
    const {pool} = getBinaryOptions();
    // the second patch must not have wiped the first
    expect(pool).toEqual({...DEFAULT_BINARY_OPTIONS.pool, enabled: true, minClassBytes: 256, maxPerClass: 4});
    // ...nor touched the other group
    expect(getBinaryOptions().sizeStats).toEqual(DEFAULT_BINARY_OPTIONS.sizeStats);
  });

  it('is the single source the pool reads', () => {
    expect(sizeClassFor(1)).toBe(DEFAULT_BINARY_OPTIONS.pool.minClassBytes);
    configureBinary({pool: {enabled: true, minClassBytes: 256}});
    expect(sizeClassFor(1)).toBe(256);
    expect(acquireBuffer(1).buffer.byteLength).toBe(256);
  });

  it('is the single source the size statistics read', () => {
    configureBinary({sizeStats: {ringSize: 4}});
    for (let i = 0; i < 20; i++) recordSize('someMethod', 100, true);
    expect(observationCount('someMethod', true)).toBe(4);
  });

  it('rebuilds a ring whose size no longer matches the options', () => {
    configureBinary({sizeStats: {ringSize: 16}});
    for (let i = 0; i < 16; i++) recordSize('someMethod', 100, true);
    expect(observationCount('someMethod', true)).toBe(16);
    // a window sized to the old value must not be read at the new length
    configureBinary({sizeStats: {ringSize: 4}});
    recordSize('someMethod', 100, true);
    expect(observationCount('someMethod', true)).toBe(1);
  });

  it('drops retained buffers when pooling is turned off', () => {
    configureBinary({pool: {enabled: true}});
    acquireBuffer(2000).release();
    expect(getBufferPoolStats().held).toBe(1);
    configureBinary({pool: {enabled: false}});
    expect(getBufferPoolStats().held).toBe(0);
  });

  it('drops retained buffers when a size class boundary moves', () => {
    configureBinary({pool: {enabled: true}});
    acquireBuffer(2000).release();
    expect(getBufferPoolStats().held).toBe(1);
    // held buffers are filed by class; moving the floor would orphan them under a stale key
    configureBinary({pool: {minClassBytes: 512}});
    expect(getBufferPoolStats().held).toBe(0);
    expect(getBufferPoolStats().bytesHeld).toBe(0);
  });

  it('forwards the inherited mion options to mion', () => {
    // proven by effect rather than by reading upstream state back: a string short enough to be
    // cacheable lands in the cache mion handed it, which only happens if the option arrived
    const cache = new Map<string, Uint8Array>();
    configureBinary({stringBytesCache: cache, maxStrCacheLength: 64});
    createDataViewSerializer('options-spec', 256).serString('cache me');
    expect(cache.has('cache me')).toBe(true);

    // and the cutoff is honoured: a string at or above it bypasses the cache entirely
    configureBinary({maxStrCacheLength: 4});
    createDataViewSerializer('options-spec', 256).serString('too long to cache');
    expect(cache.has('too long to cache')).toBe(false);
  });
});
