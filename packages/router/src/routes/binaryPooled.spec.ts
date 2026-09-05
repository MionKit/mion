/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// End-to-end behaviour of the POOLED binary strategy: it must be byte-identical to the growing
// strategy, must never expose bytes from a previous response, must size itself from a measure pass
// whenever the recent-size window cannot be trusted to pick the right class, and must still recover
// if a buffer turns out too small anyway (a pooled buffer cannot grow — upstream refuses to resize a
// buffer it does not own).

import {describe, expect, it, beforeEach, afterEach} from 'vitest';
import {createMionRouter, resetRouter, getRouteExecutionChain} from '../router.ts';
import {Routes} from '../types/general.ts';
import {
  serializeBinaryBody,
  deserializeBinaryBody,
  configureBinary,
  resetBinaryOptions,
  resetBufferPool,
  getBufferPoolStats,
  resetSizeStats,
  observationCount,
  getBinaryStrategyStats,
  resetBinaryStrategyStats,
} from '@mionjs/core';
import type {MethodWithJitFns} from '@mionjs/core';

const mion = createMionRouter({serializer: 'binary'});

interface Named {
  name: string;
}

const routes = {
  echo: mion.route((ctx: any, msg: string): string => msg),
  shout: mion.route((ctx: any, msg: string): string => msg.toUpperCase()),
  named: mion.route((ctx: any, name: string): Named => ({name})),
} satisfies Routes;

/** enough requests for a route's size stats to settle */
const WARMUP = 8;

function chainFor(path: string): MethodWithJitFns[] {
  return getRouteExecutionChain(path)!.methods as unknown as MethodWithJitFns[];
}

/** The merged, id-deduplicated chain a batch request runs — several routes, ONE envelope. */
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
    resetBinaryOptions();
    resetSizeStats();
    resetBinaryStrategyStats();
    mion.initRoutes(routes);
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
    configureBinary({pool: {enabled: true}});
    warmUp(msg);
    const pooled = serialize(msg);
    expect(Array.from(pooled.view)).toEqual(Array.from(expected));
    pooled.release();
  });

  it('actually reuses buffers once the route is warm', () => {
    configureBinary({pool: {enabled: true}});
    warmUp('steady payload');
    const before = getBufferPoolStats().hits;
    for (let i = 0; i < 5; i++) serialize('steady payload').release();
    expect(getBufferPoolStats().hits).toBeGreaterThan(before);
  });

  it('pools a cold route by MEASURING it — there is no history to predict from', () => {
    configureBinary({pool: {enabled: true}});
    const result = serialize('cold');
    // no window to trust, so the size is exact rather than guessed, and cannot be too small
    expect(getBinaryStrategyStats().measured).toBe(1);
    expect(getBinaryStrategyStats().pooled).toBe(1);
    expect(getBinaryStrategyStats().retries).toBe(0);
    result.release();
    // and the buffer it borrowed is now in the pool for the next request
    serialize('cold again').release();
    expect(getBufferPoolStats().hits).toBe(1);
  });

  it('stops measuring once a steady window can pick the class on its own', () => {
    configureBinary({pool: {enabled: true}});
    warmUp('steady payload');
    resetBinaryStrategyStats();
    for (let i = 0; i < 5; i++) serialize('steady payload').release();
    // the typical and worst-case envelopes land in the same class, so the measure pass is skipped
    expect(getBinaryStrategyStats().measured).toBe(0);
    expect(getBinaryStrategyStats().pooled).toBe(5);
  });

  it('never exposes stale bytes from a previous, larger response', () => {
    configureBinary({pool: {enabled: true}});
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

  it('costs ONE miss when a steady route jumps, then measures from then on', () => {
    configureBinary({pool: {enabled: true}});
    // a steady window is trusted, and it cannot see a payload it has never been shown...
    warmUp('small');
    resetBinaryStrategyStats();
    const huge = 'Y'.repeat(50_000);
    const first = serialize(huge);
    expect(getBinaryStrategyStats().measured).toBe(0);
    expect(getBinaryStrategyStats().retries).toBe(1);
    const {body} = deserializeBinaryBody('/echo', new Uint8Array(first.view), true);
    expect(body.echo).toBe(huge);
    first.release();

    // ...but that request put 50 KB in the window, which now straddles size classes, so every
    // later request is sized exactly and none of them can miss
    resetBinaryStrategyStats();
    for (let i = 0; i < 4; i++) serialize(huge).release();
    expect(getBinaryStrategyStats().measured).toBe(4);
    expect(getBinaryStrategyStats().retries).toBe(0);
  });

  it('keeps round-tripping a volatile route request after request', () => {
    configureBinary({pool: {enabled: true}});
    warmUp('small');
    // the first jump is the only one allowed to miss; after that the window knows it is volatile
    serialize('Z'.repeat(50_000)).release();
    resetBinaryStrategyStats();

    for (const size of [30, 12_000, 40, 80_000, 25, 60_000]) {
      const payload = 'Z'.repeat(size);
      const result = serialize(payload);
      const {body} = deserializeBinaryBody('/echo', new Uint8Array(result.view), true);
      expect(body.echo).toBe(payload);
      result.release();
    }
    expect(getBinaryStrategyStats().retries).toBe(0);
    expect(getBinaryStrategyStats().measured).toBe(6);
  });

  it('recovers when a value CHANGES between the measure pass and the write', () => {
    // the one way a measured size can still be wrong: the encoder reads a value twice and is
    // given different bytes. The pooled attempt must be abandoned, not truncated.
    configureBinary({pool: {enabled: true}});
    let reads = 0;
    const shifty: Named = {
      get name(): string {
        // small on the measure pass, far too big on the write
        return reads++ === 0 ? 'small' : 'W'.repeat(9000);
      },
    };
    const chain = chainFor('/named');
    const result = serializeBinaryBody('/named', chain, {named: shifty}, true);

    expect(getBinaryStrategyStats().retries).toBe(1);
    expect(getBinaryStrategyStats().adaptive).toBe(1);
    const {body} = deserializeBinaryBody('/named', new Uint8Array(result.view), true);
    expect(body.named.name).toBe('W'.repeat(9000));
    result.release();
  });

  it('release is idempotent end-to-end', () => {
    configureBinary({pool: {enabled: true}});
    warmUp('payload');
    const result = serialize('payload');
    result.release();
    result.release();
    expect(getBufferPoolStats().held).toBeGreaterThan(0);
  });

  describe('batch (several routes, one envelope)', () => {
    const big = 'A'.repeat(4000);
    const flow = () =>
      serializeBinaryBody('/mion-batch', mergedChain('/echo', '/shout'), {echo: big, shout: big.toUpperCase()}, true);
    const warmUpShout = (msg: string) => {
      for (let i = 0; i < WARMUP; i++) serializeBinaryBody('/shout', chainFor('/shout'), {shout: msg}, true).release();
    };

    it('pools a merged envelope sized from the member routes it has already served', () => {
      configureBinary({pool: {enabled: true}});
      // ordinary single-route traffic on each member — the merged COMBINATION is never seen
      warmUp(big);
      warmUpShout(big.toUpperCase());
      resetBinaryStrategyStats();

      const result = flow();
      // sized by summing the parts, so the first merged request pools AND fits
      expect(getBinaryStrategyStats().pooled).toBe(1);
      expect(getBinaryStrategyStats().retries).toBe(0);
      const {body} = deserializeBinaryBody('/mion-batch', new Uint8Array(result.view), true);
      expect(body.echo).toBe(big);
      expect(body.shout).toBe(big.toUpperCase());
      result.release();
    });

    it('teaches every route it carried, not just the combination', () => {
      configureBinary({pool: {enabled: true}});
      expect(observationCount('echo', true)).toBe(0);
      expect(observationCount('shout', true)).toBe(0);

      flow().release();

      // a batch request is real traffic for each member route
      expect(observationCount('echo', true)).toBe(1);
      expect(observationCount('shout', true)).toBe(1);
    });

    it('warms up on batch traffic alone', () => {
      configureBinary({pool: {enabled: true}});
      for (let i = 0; i < WARMUP; i++) flow().release();
      resetBinaryStrategyStats();

      const result = flow();
      expect(getBinaryStrategyStats().pooled).toBe(1);
      expect(getBinaryStrategyStats().retries).toBe(0);
      const {body} = deserializeBinaryBody('/mion-batch', new Uint8Array(result.view), true);
      expect(body.echo).toBe(big);
      result.release();
    });

    it('measures a merged envelope whose members are not all warm yet', () => {
      configureBinary({pool: {enabled: true}});
      warmUp(big); // only /echo is warm
      resetBinaryStrategyStats();

      const result = flow();
      // /shout has no window, so the envelope is sized exactly rather than guessed — and it
      // still pools, which the old warm-up gate would not have allowed
      expect(getBinaryStrategyStats().measured).toBe(1);
      expect(getBinaryStrategyStats().pooled).toBe(1);
      expect(getBinaryStrategyStats().retries).toBe(0);
      const {body} = deserializeBinaryBody('/mion-batch', new Uint8Array(result.view), true);
      expect(body.shout).toBe(big.toUpperCase());
      result.release();
    });
  });
});
