/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// End-to-end behaviour of the POOLED binary strategy: it must be byte-identical to the growing
// strategy, must never expose bytes from a previous response, and must recover from an overflow
// (a pooled buffer cannot grow — upstream refuses to resize a buffer it does not own).

import {describe, expect, it, beforeEach, afterEach} from 'vitest';
import {initMionRouter, resetRouter, getRouteExecutionChain} from '../router.ts';
import {route} from '../lib/handlers.ts';
import {Routes} from '../types/general.ts';
import {
    serializeBinaryBody,
    deserializeBinaryBody,
    configureBufferPool,
    resetBufferPool,
    getBufferPoolStats,
    resetSizeStats,
    getBinaryStrategyStats,
    resetBinaryStrategyStats,
} from '@mionjs/core';
import type {MethodWithJitFns} from '@mionjs/core';

const routes = {
    echo: route((ctx: any, msg: string): string => msg),
} satisfies Routes;

/** enough requests to clear the pool warm-up threshold */
const WARMUP = 8;

function chainFor(path: string): MethodWithJitFns[] {
    return getRouteExecutionChain(path)!.methods as unknown as MethodWithJitFns[];
}

function serialize(msg: string) {
    return serializeBinaryBody('/echo', chainFor('/echo'), {echo: msg}, true);
}

/** Runs enough requests that the route becomes pool-eligible. */
function warmUp(msg: string) {
    for (let i = 0; i < WARMUP; i++) serialize(msg).release();
}

describe('binary pooled strategy', () => {
    beforeEach(async () => {
        resetRouter();
        resetBufferPool();
        resetSizeStats();
        resetBinaryStrategyStats();
        await initMionRouter(routes, {serializer: 'binary'});
    });
    afterEach(() => {
        resetBufferPool();
        resetSizeStats();
    });

    it('produces bytes identical to the growing strategy', () => {
        const msg = 'hello pooled world';
        const unpooled = serialize(msg);
        const expected = new Uint8Array(unpooled.view); // copy before release
        unpooled.release();

        resetSizeStats();
        configureBufferPool({enabled: true});
        warmUp(msg);
        const pooled = serialize(msg);
        expect(Array.from(pooled.view)).toEqual(Array.from(expected));
        pooled.release();
    });

    it('actually reuses buffers once the route is warm', () => {
        configureBufferPool({enabled: true});
        warmUp('steady payload');
        const before = getBufferPoolStats().hits;
        for (let i = 0; i < 5; i++) serialize('steady payload').release();
        expect(getBufferPoolStats().hits).toBeGreaterThan(before);
    });

    it('does not pool a cold route (the type estimate is too tight to risk it)', () => {
        configureBufferPool({enabled: true});
        // first request on a cold route: nothing may be taken from the pool
        const result = serialize('cold');
        result.release();
        expect(getBufferPoolStats().hits).toBe(0);
    });

    it('never exposes stale bytes from a previous, larger response', () => {
        configureBufferPool({enabled: true});
        const big = 'X'.repeat(400);
        warmUp(big);
        // a large response settles a large size class...
        serialize(big).release();

        // ...and a small one that reuses the very same buffer must expose only its own bytes
        const hitsBefore = getBufferPoolStats().hits;
        const small = serialize('tiny');
        // it must genuinely have come off the free list, or this proves nothing
        expect(getBufferPoolStats().hits).toBe(hitsBefore + 1);
        expect(small.view.byteLength).toBeLessThan(100);
        const {body} = deserializeBinaryBody('/echo', new Uint8Array(small.view), true);
        expect(body.echo).toBe('tiny');
        // not a single trailing byte of the previous payload
        expect(small.view.includes('X'.charCodeAt(0))).toBe(false);
        small.release();
    });

    it('recovers from an overflow when a payload outruns its pooled class', () => {
        configureBufferPool({enabled: true});
        // warm up on a small payload so the predicted class is small...
        warmUp('small');
        // ...then send one that cannot possibly fit it
        const huge = 'Y'.repeat(50_000);
        const result = serialize(huge);

        // the pooled attempt must have overflowed and been re-encoded, not merely succeeded
        expect(getBinaryStrategyStats().retries).toBe(1);
        const {body} = deserializeBinaryBody('/echo', new Uint8Array(result.view), true);
        expect(body.echo).toBe(huge);
        result.release();
    });

    it('stops overflowing after the class escalates', () => {
        configureBufferPool({enabled: true});
        warmUp('small');
        const huge = 'Z'.repeat(50_000);
        // the first oversize request escalates; subsequent ones must round-trip cleanly
        for (let i = 0; i < 5; i++) {
            const result = serialize(huge);
            const {body} = deserializeBinaryBody('/echo', new Uint8Array(result.view), true);
            expect(body.echo).toBe(huge);
            result.release();
        }
        // one escalation, then steady state — not a retry on every request
        expect(getBinaryStrategyStats().retries).toBeLessThanOrEqual(2);
    });

    it('release is idempotent end-to-end', () => {
        configureBufferPool({enabled: true});
        warmUp('payload');
        const result = serialize('payload');
        result.release();
        result.release();
        expect(getBufferPoolStats().held).toBeGreaterThan(0);
    });
});
