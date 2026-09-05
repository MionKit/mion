/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Measurement harness for the binary buffer lane.
// Reports allocation churn, grow rate and prediction accuracy per payload profile so the
// buffer-strategy work is judged on numbers rather than intuition. Run with:
//   pnpm exec vitest bench --project router binaryBuffer

import {bench, describe} from 'vitest';
import {createMionRouter, resetRouter, getRouteExecutionChain} from '../router.ts';
import {Routes} from '../types/general.ts';
import {
  serializeBinaryBody,
  predictSize,
  configureBinary,
  resetBufferPool,
  getBufferPoolStats,
  getBinaryStrategyStats,
  resetBinaryStrategyStats,
} from '@mionjs/core';
import type {MethodWithJitFns} from '@mionjs/core';

const mion = createMionRouter({serializer: 'binary'});

interface Item {
  id: string;
  name: string;
  tags: string[];
  score: number;
}

const routes = {
  tiny: mion.route((_ctx: any, n: number): number => n),
  small: mion.route((_ctx: any, id: string): Item => ({id, name: 'n', tags: ['a'], score: 1})),
  skewed: mion.route((): Item[] => []),
} satisfies Routes;

resetRouter();
void mion.initRoutes(routes);

/** Execution chain for a route path, as dispatch would build it. */
function chainFor(path: string): MethodWithJitFns[] {
  return getRouteExecutionChain(path)!.methods as unknown as MethodWithJitFns[];
}

/** One serialization, capturing what it cost. */
function measureOnce(path: string, chain: MethodWithJitFns[], routeId: string, value: unknown) {
  // What the adaptive strategy will allocate. Accurate for every warm request (the cold-start
  // fallback only applies while the key has no observations at all). Sizes are keyed by METHOD,
  // so the route id is the key, not the path.
  const predicted = predictSize(routeId, true, 0.9, 1.25, 0);
  const {serializer, release} = serializeBinaryBody(path, chain, {[routeId]: value}, true);
  const payload = serializer.getLength();
  const final = serializer.buffer.byteLength;
  release();
  // serializeBinaryBody no longer slices an owned copy; the view the adapters read is free.
  return {payload, final, predicted, grew: predicted > 0 && final > predicted, copies: 0};
}

function pct(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

/** Runs a profile N times and prints the allocation/accuracy table. */
function profile(name: string, routeId: string, path: string, make: (i: number) => unknown, n = 2000, pooled = false) {
  resetBufferPool();
  resetBinaryStrategyStats();
  if (pooled) configureBinary({pool: {enabled: true}});
  const chain = chainFor(path);
  const payloads: number[] = [];
  let grows = 0;
  let allocated = 0;
  let payloadCopies = 0;
  for (let i = 0; i < n; i++) {
    const m = measureOnce(path, chain, routeId, make(i));
    payloads.push(m.payload);
    if (m.grew) grows++;
    // bytes actually allocated for this request: the working buffer, including whatever
    // growth added on top. Full-payload copies are counted separately — the serialize path
    // should make none (adapters read a zero-copy getBufferView()).
    allocated += m.final;
    payloadCopies += m.copies;
  }
  const sorted = [...payloads].sort((a, b) => a - b);
  const mean = payloads.reduce((a, b) => a + b, 0) / payloads.length;
  const pool = getBufferPoolStats();
  const strategy = getBinaryStrategyStats();
  const dist =
    `${name.padEnd(11)} n=${n} payload(mean/p50/p90/p99/max)=` +
    `${mean.toFixed(0)}/${pct(sorted, 50)}/${pct(sorted, 90)}/${pct(sorted, 99)}/${sorted[sorted.length - 1]}`;
  // The two strategies are judged on different things, so report what each actually does rather
  // than forcing both into one set of columns: a pooled buffer cannot grow and is a size CLASS
  // rather than a fitted size, so "grows" and "overAlloc" are meaningless for it.
  if (pooled) {
    console.log(`${dist} | allocations=${pool.misses} reuses=${pool.hits} retries=${strategy.retries}`);
    return;
  }
  const totalPayload = Math.max(
    1,
    payloads.reduce((a, b) => a + b, 0)
  );
  console.log(
    `${dist} allocations=${n} grows=${grows} (${((grows / n) * 100).toFixed(1)}%)` +
      ` allocKB=${(allocated / 1024).toFixed(0)} payloadCopies=${payloadCopies}` +
      ` overAlloc=${(allocated / totalPayload).toFixed(1)}x`
  );
}

// Right-skewed: most responses small, a fat tail of large ones — the shape mean+2*stddev
// handles worst and the shape real APIs actually produce.
function skewedList(i: number): Item[] {
  const big = i % 20 === 0;
  const len = big ? 200 + (i % 300) : 1 + (i % 4);
  return Array.from({length: len}, (_, k) => ({
    id: `id-${k}`,
    name: `name-${k}`,
    tags: ['a', 'b'],
    score: k,
  }));
}

describe('binary buffer baseline', () => {
  bench(
    'measure profiles (table printed once)',
    () => {
      const smallValue = (i: number) => ({id: `id-${i}`, name: 'name', tags: ['a', 'b'], score: i});
      profile('tiny', 'tiny', '/tiny', () => 42);
      profile('small', 'small', '/small', smallValue);
      profile('skewed', 'skewed', '/skewed', skewedList, 1000);
      profile('tiny+pool', 'tiny', '/tiny', () => 42, 2000, true);
      profile('small+pool', 'small', '/small', smallValue, 2000, true);
      profile('skewed+pool', 'skewed', '/skewed', skewedList, 1000, true);
    },
    {iterations: 1, warmupIterations: 0, time: 0}
  );
});
