// Ops/sec timing for gen-serialization.mjs. Each cycle lasts at least `cycleMs`: a sub-millisecond window either
// catches the optimized code or not, so one encoder read 1.0M/s in one process and 2.0M/s in the next.

import {performance} from 'node:perf_hooks';

// Results land here so the optimizer cannot drop the call.
const sink = {last: undefined};
let loopId = 0;

// One loop per measured stream: a call site shared by every codec goes megamorphic, skewing later cases.
// The trailing id keeps sources unique: identical `new Function` sources share type feedback via V8's eval cache.
function freshLoop() {
  const make = new Function(
    'performance',
    'sink',
    `return function timePool(fn, pool) {
  let last;
  const start = performance.now();
  for (let i = 0; i < pool.length; i++) last = fn(pool[i]);
  const elapsed = performance.now() - start;
  sink.last = last;
  return elapsed;
};
//loop ${loopId++}`
  );
  return make(performance, sink);
}

/**
 * Median calls/sec of `fn`, with `calls` grown during warm-up until one pass lasts `cycleMs`.
 * Each pass gets a fresh `makePool(n)` built off the clock, so an in-place encoder never sees a value twice.
 */
export function measureOps(fn, makePool, {cycles, cycleMs, warmupMs, startCalls, maxCalls}) {
  const loop = freshLoop();
  let calls = Math.max(1, Math.min(startCalls, maxCalls));
  let warmed = 0;
  do {
    const pool = makePool(calls);
    if (pool.length === 0) return {median: 0, rates: [], calls: 0};
    const elapsed = loop(fn, pool);
    warmed += elapsed;
    if (elapsed < cycleMs && calls < maxCalls) {
      calls = Math.min(maxCalls, Math.ceil(calls * Math.min(10, cycleMs / Math.max(elapsed, 0.01))));
    }
  } while (warmed < warmupMs);
  const rates = [];
  for (let c = 0; c < cycles; c++) {
    const pool = makePool(calls);
    const elapsed = loop(fn, pool);
    rates.push(pool.length / (Math.max(elapsed, 1e-6) / 1000));
  }
  const sorted = [...rates].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return {median, rates, calls};
}
