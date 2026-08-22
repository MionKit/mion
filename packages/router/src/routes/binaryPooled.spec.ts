/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// End-to-end behaviour of the POOLED binary strategy: it must be byte-identical to the growing
// strategy, must never expose bytes from a previous response, and must recover from a payload that
// outruns the borrowed buffer (a pooled buffer cannot grow — upstream refuses to resize a buffer it
// does not own).

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
    observationCount,
    getBinaryStrategyStats,
    resetBinaryStrategyStats,
} from '@mionjs/core';
import type {MethodWithJitFns} from '@mionjs/core';

const routes = {
    echo: route((ctx: any, msg: string): string => msg),
    shout: route((ctx: any, msg: string): string => msg.toUpperCase()),
} satisfies Routes;

/** enough requests for a route's size stats to settle */
const WARMUP = 8;

function chainFor(path: string): MethodWithJitFns[] {
    return getRouteExecutionChain(path)!.methods as unknown as MethodWithJitFns[];
}

/** The merged, id-deduplicated chain a routesFlow request runs — several routes, ONE envelope. */
function mergedChain(...paths: string[]): MethodWithJitFns[] {
    const seen = new Set<string>();
    const merged: MethodWithJitFns[] = [];
    for (const path of paths) {
        for (const method of chainFor(path)) {
            if (seen.has(method.id)) continue;
            seen.add(method.id);
            merged.push(method);
        }
    }
    return merged;
}

function serialize(msg: string) {
    return serializeBinaryBody('/echo', chainFor('/echo'), {echo: msg}, true);
}

/** Runs enough requests for the route's recent-size window to settle. */
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

    it('recovers from a payload that outruns its pooled class', () => {
        configureBufferPool({enabled: true});
        // warm up on a small payload so the predicted class is small...
        warmUp('small');
        // (the warm-up itself ran on the adaptive path, so nothing is pooled yet)
        expect(getBufferPoolStats().held).toBe(0);
        // ...then send one that cannot possibly fit it
        const huge = 'Y'.repeat(50_000);
        const result = serialize(huge);

        // the pooled attempt must have been abandoned and re-encoded, not merely succeeded
        expect(getBinaryStrategyStats().retries).toBe(1);
        // the borrowed buffer went back to the pool rather than being lost with the attempt
        expect(getBufferPoolStats().held).toBe(1);
        const {body} = deserializeBinaryBody('/echo', new Uint8Array(result.view), true);
        expect(body.echo).toBe(huge);
        result.release();
    });

    it('stops missing once the recent-size window has seen the bigger payload', () => {
        configureBufferPool({enabled: true});
        warmUp('small');
        const huge = 'Z'.repeat(50_000);
        // the first oversize request re-encodes; subsequent ones must round-trip from the pool
        for (let i = 0; i < 5; i++) {
            const result = serialize(huge);
            const {body} = deserializeBinaryBody('/echo', new Uint8Array(result.view), true);
            expect(body.echo).toBe(huge);
            result.release();
        }
        // one miss, then steady state — the real bytes it observed sized the next request
        expect(getBinaryStrategyStats().retries).toBe(1);
        expect(getBinaryStrategyStats().pooled).toBe(4);
    });

    it('release is idempotent end-to-end', () => {
        configureBufferPool({enabled: true});
        warmUp('payload');
        const result = serialize('payload');
        result.release();
        result.release();
        expect(getBufferPoolStats().held).toBeGreaterThan(0);
    });

    describe('routesFlow (several routes, one envelope)', () => {
        const big = 'A'.repeat(4000);
        const flow = () =>
            serializeBinaryBody('/routesFlow', mergedChain('/echo', '/shout'), {echo: big, shout: big.toUpperCase()}, true);
        const warmUpShout = (msg: string) => {
            for (let i = 0; i < WARMUP; i++)
                serializeBinaryBody('/shout', chainFor('/shout'), {shout: msg}, true).release();
        };

        it('pools a merged envelope sized from the member routes it has already served', () => {
            configureBufferPool({enabled: true});
            // ordinary single-route traffic on each member — the merged COMBINATION is never seen
            warmUp(big);
            warmUpShout(big.toUpperCase());
            resetBinaryStrategyStats();

            const result = flow();
            // sized by summing the parts, so the first merged request pools AND fits
            expect(getBinaryStrategyStats().pooled).toBe(1);
            expect(getBinaryStrategyStats().retries).toBe(0);
            const {body} = deserializeBinaryBody('/routesFlow', new Uint8Array(result.view), true);
            expect(body.echo).toBe(big);
            expect(body.shout).toBe(big.toUpperCase());
            result.release();
        });

        it('teaches every route it carried, not just the combination', () => {
            configureBufferPool({enabled: true});
            expect(observationCount('echo', true)).toBe(0);
            expect(observationCount('shout', true)).toBe(0);

            flow().release();

            // a routesFlow request is real traffic for each member route
            expect(observationCount('echo', true)).toBe(1);
            expect(observationCount('shout', true)).toBe(1);
        });

        it('warms up on routesFlow traffic alone', () => {
            configureBufferPool({enabled: true});
            for (let i = 0; i < WARMUP; i++) flow().release();
            resetBinaryStrategyStats();

            const result = flow();
            expect(getBinaryStrategyStats().pooled).toBe(1);
            expect(getBinaryStrategyStats().retries).toBe(0);
            const {body} = deserializeBinaryBody('/routesFlow', new Uint8Array(result.view), true);
            expect(body.echo).toBe(big);
            result.release();
        });

        it('holds a merged envelope back until EVERY member route is warm', () => {
            configureBufferPool({enabled: true});
            warmUp(big); // only /echo is warm
            resetBinaryStrategyStats();

            flow().release();
            expect(getBinaryStrategyStats().pooled).toBe(0);
            expect(getBinaryStrategyStats().adaptive).toBe(1);
        });
    });
});
