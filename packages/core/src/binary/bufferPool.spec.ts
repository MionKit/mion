/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, expect, it, beforeEach} from 'vitest';
import {
    acquireBuffer,
    clearBufferPool,
    configureBufferPool,
    getBufferPoolStats,
    isBufferPoolEnabled,
    resetBufferPool,
    sizeClassFor,
} from './bufferPool.ts';

describe('binary bufferPool', () => {
    beforeEach(() => {
        resetBufferPool();
        configureBufferPool({enabled: true});
    });

    it('is disabled until a platform arms it', () => {
        resetBufferPool();
        expect(isBufferPoolEnabled()).toBe(false);
        const lease = acquireBuffer(100);
        lease.release();
        // nothing is retained while disabled
        expect(getBufferPoolStats().held).toBe(0);
    });

    it('rounds up to power-of-two size classes, floored at the smallest', () => {
        expect(sizeClassFor(1)).toBe(1024);
        expect(sizeClassFor(1024)).toBe(1024);
        expect(sizeClassFor(1025)).toBe(2048);
        expect(sizeClassFor(5000)).toBe(8192);
    });

    it('reuses a released buffer for the next request in the same class', () => {
        const first = acquireBuffer(2000);
        const buffer = first.buffer;
        first.release();

        const second = acquireBuffer(2000);
        expect(second.buffer).toBe(buffer);
        expect(getBufferPoolStats().hits).toBe(1);
    });

    it('serves a buffer at least as large as requested', () => {
        const lease = acquireBuffer(3000);
        expect(lease.buffer.byteLength).toBeGreaterThanOrEqual(3000);
    });

    it('release is idempotent — adapters may fire on both finish and close', () => {
        const lease = acquireBuffer(2000);
        lease.release();
        lease.release();
        lease.release();
        expect(getBufferPoolStats().held).toBe(1);
    });

    it('never retains a buffer above the pooled ceiling', () => {
        configureBufferPool({enabled: true, maxClassBytes: 4096});
        const lease = acquireBuffer(1_000_000);
        expect(lease.buffer.byteLength).toBe(1_000_000);
        lease.release();
        expect(getBufferPoolStats().held).toBe(0);
    });

    it('respects the per-class depth cap', () => {
        configureBufferPool({enabled: true, maxPerClass: 2});
        const leases = [acquireBuffer(2000), acquireBuffer(2000), acquireBuffer(2000), acquireBuffer(2000)];
        leases.forEach((l) => l.release());
        expect(getBufferPoolStats().held).toBe(2);
        expect(getBufferPoolStats().dropped).toBe(2);
    });

    it('respects the total byte cap', () => {
        configureBufferPool({enabled: true, maxTotalBytes: 4096});
        const leases = [acquireBuffer(2000), acquireBuffer(2000), acquireBuffer(2000)];
        leases.forEach((l) => l.release());
        expect(getBufferPoolStats().bytesHeld).toBeLessThanOrEqual(4096);
    });

    it('an unreleased lease costs a reuse, never correctness', () => {
        const leaked = acquireBuffer(2000);
        const next = acquireBuffer(2000);
        // the leaked buffer was never returned, so the next request gets a DIFFERENT buffer
        expect(next.buffer).not.toBe(leaked.buffer);
        expect(getBufferPoolStats().held).toBe(0);
    });

    it('clear() drops everything held', () => {
        acquireBuffer(2000).release();
        expect(getBufferPoolStats().held).toBe(1);
        clearBufferPool();
        expect(getBufferPoolStats().held).toBe(0);
    });

    it('disabling the pool releases what it held', () => {
        acquireBuffer(2000).release();
        configureBufferPool({enabled: false});
        expect(getBufferPoolStats().held).toBe(0);
    });
});
