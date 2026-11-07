import {describe, expect, it} from 'vitest';
// @ts-expect-error — a plain .mjs script, no types
import {measureOps} from '../../../scripts/website/bench-data/ops-timer.mjs';

const opts = {cycles: 3, cycleMs: 2, warmupMs: 4, startCalls: 10, maxCalls: 5000};
const freshPool = (count: number) => Array.from({length: count}, () => ({seen: false}));
const busy = (ms: number) => {
  const end = performance.now() + ms;
  while (performance.now() < end);
};

describe('serialization ops timer', () => {
  it('hands every call a value no earlier call saw', () => {
    let reused = 0;
    measureOps(
      (value: {seen: boolean}) => {
        if (value.seen) reused++;
        value.seen = true;
      },
      freshPool,
      opts
    );
    expect(reused).toBe(0);
  });

  it('grows a fast pass until it lasts a cycle, up to the cap', () => {
    const {rates, calls} = measureOps(() => 1, freshPool, opts);
    expect(rates).toHaveLength(3);
    expect(calls).toBeGreaterThan(opts.startCalls);
    expect(calls).toBeLessThanOrEqual(opts.maxCalls);
  });

  it('keeps a pass that already lasts a cycle', () => {
    const {calls, median} = measureOps(() => busy(0.3), freshPool, opts);
    expect(calls).toBe(10);
    expect(median).toBeGreaterThan(0);
    expect(median).toBeLessThan(1 / 0.0003);
  });

  it('measures nothing without samples', () => {
    expect(
      measureOps(
        () => 1,
        () => [],
        opts
      )
    ).toEqual({median: 0, rates: [], calls: 0});
  });
});
