/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Measurement harness for the batch BUFFER MODEL question: is one buffer per request the right
// shape, or should each route own a buffer that gets merged on the way out?
//
// Three strategies are run over IDENTICAL traffic — a batch whose composition and payload sizes
// change every request, which is the case that makes a single predicted buffer hard:
//
//   core-hybrid      — whatever packages/core currently does: one buffer for the whole envelope,
//                      sized from the per-method size statistics and measured exactly when that
//                      window straddles a size class.
//   per-route-merge  — one buffer PER ROUTE, each sized from that route's own stats, concatenated
//                      into an exactly-sized output buffer at the end.
//   single-exact     — one buffer for the whole envelope, always sized by the MEASURE PASS.
//   single-predicted — one buffer, ALWAYS sized from the statistics (the pre-hybrid behaviour),
//                      kept so the over-allocation the hybrid removes stays visible.
//
// Reported per strategy: fresh allocations, bytes allocated, peak bytes held concurrently within one
// request, bytes memcpy'd, pool reuse, and prediction misses. Run with:
//   pnpm exec vitest bench --project router batchBuffer

import {bench, describe} from 'vitest';
import {createMionRouter, resetRouter, getRouteExecutionChain} from '../router.ts';
import {Routes} from '../types/general.ts';
import {
  acquireBuffer,
  sizeClassFor,
  createDataViewSerializer,
  createSizingSerializer,
  getBinaryStrategyStats,
  resetBinaryStrategyStats,
  createPooledDataViewSerializer,
  configureBinary,
  resetBinaryOptions,
  resetBufferPool,
  getBufferPoolStats,
  resetSizeStats,
  predictSize,
  recordSize,
  serializeBinaryBody,
  deserializeBinaryBody,
  type BufferLease,
} from '@mionjs/core';
import type {DataViewSerializer, MethodWithJitFns} from '@mionjs/core';

const mion = createMionRouter({serializer: 'binary'});

interface Item {
  id: string;
  name: string;
  tags: string[];
  score: number;
}

const routes = {
  getCount: mion.route((): number => 0),
  getUser: mion.route((_ctx: any, id: string): Item => ({id, name: 'n', tags: ['a'], score: 1})),
  listItems: mion.route((_ctx: any, n: number): Item[] =>
    Array.from({length: n}, (_, k) => ({id: `id-${k}`, name: 'n', tags: ['a'], score: k}))
  ),
  getBlob: mion.route((_ctx: any, n: number): string => 'x'.repeat(n)),
} satisfies Routes;

const ENVELOPE_HEADER_BYTES = 4;
const KEY_OVERHEAD_BYTES = 24;
const POOLED_QUANTILE = 1;
const POOLED_PAD = 1.25;

resetRouter();
void mion.initRoutes(routes);

function chainFor(path: string): MethodWithJitFns[] {
  return getRouteExecutionChain(path)!.methods as unknown as MethodWithJitFns[];
}

/** The merged, id-deduplicated chain a batch request runs. */
function mergedChain(paths: string[]): MethodWithJitFns[] {
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

/** Methods of a chain that actually put bytes on the wire for this body. */
function writers(chain: MethodWithJitFns[], body: Record<string, any>): MethodWithJitFns[] {
  return chain.filter((m) => {
    const toBinary = m.returnJitFns.toBinary;
    if (!toBinary?.fn || toBinary.isNoop) return false;
    if (!m.hasReturnData || typeof body[m.id] === 'undefined') return false;
    return true;
  });
}

function coldFor(method: MethodWithJitFns): number {
  return (method.returnBinarySizeEstimate ?? 0) + KEY_OVERHEAD_BYTES;
}

/** Writes one (key, value) pair — the unit every strategy shares. */
function writePair(ser: DataViewSerializer, method: MethodWithJitFns, value: unknown): void {
  ser.serString(method.id);
  method.returnJitFns.toBinary!.fn(value, ser);
}

// ############# accounting #############

interface Run {
  /** ArrayBuffers freshly allocated (pool misses + un-pooled allocations) */
  allocations: number;
  /** bytes freshly allocated */
  allocatedBytes: number;
  /** largest number of bytes held at once WITHIN one request */
  peakBytes: number;
  /** buffer bytes a request occupies, summed over requests — the footprint pooling has to carry */
  bufferBytes: number;
  /** payload bytes memcpy'd (merging) */
  copiedBytes: number;
  /** predictions that did not fit and forced a re-encode */
  misses: number;
  /** total payload bytes written */
  payloadBytes: number;
}

function newRun(): Run {
  return {allocations: 0, allocatedBytes: 0, peakBytes: 0, bufferBytes: 0, copiedBytes: 0, misses: 0, payloadBytes: 0};
}

/** Accounting is OFF for the throughput benches, so measuring does not distort what is measured. */
let accounting = true;

/** Acquires through the pool, charging a fresh allocation to the run when the pool had to make one. */
function chargedAcquire(bytes: number, run: Run, held: {now: number}): BufferLease {
  if (!accounting) return acquireBuffer(bytes);
  const before = getBufferPoolStats().misses;
  const lease = acquireBuffer(bytes);
  if (getBufferPoolStats().misses > before) {
    run.allocations++;
    run.allocatedBytes += lease.buffer.byteLength;
  }
  run.bufferBytes += lease.buffer.byteLength;
  held.now += lease.buffer.byteLength;
  if (held.now > run.peakBytes) run.peakBytes = held.now;
  return lease;
}

// ############# the three strategies #############

/** ONE buffer for the whole envelope, sized by summing each member's own quantile. Ships today. */
function singlePredicted(chain: MethodWithJitFns[], body: Record<string, any>, run: Run): Uint8Array {
  if (!accounting) {
    const r = serializeBinaryBody('/mion-batch', chain, body, true);
    const bytes = new Uint8Array(r.view);
    r.release();
    return bytes;
  }
  const before = getBufferPoolStats().misses;
  const beforeRetries = getBinaryStrategyStats().retries;
  const {serializer, view, release} = serializeBinaryBody('/mion-batch', chain, body, true);
  const capacity = serializer.buffer.byteLength;
  if (getBufferPoolStats().misses > before) {
    run.allocations++;
    run.allocatedBytes += capacity;
  }
  run.misses += getBinaryStrategyStats().retries - beforeRetries;
  run.bufferBytes += capacity;
  if (capacity > run.peakBytes) run.peakBytes = capacity;
  run.payloadBytes += view.byteLength;
  const copy = new Uint8Array(view); // the bench needs the bytes after release
  release();
  return copy;
}

/** ONE buffer PER ROUTE, each predicted from that route's own stats, concatenated into an
 *  exactly-sized output buffer at the end. */
function perRouteMerge(chain: MethodWithJitFns[], body: Record<string, any>, run: Run): Uint8Array {
  const held = {now: 0};
  const parts: Uint8Array[] = [];
  const leases: BufferLease[] = [];
  let total = ENVELOPE_HEADER_BYTES;

  for (const method of writers(chain, body)) {
    const size = predictSize(method.id, true, POOLED_QUANTILE, POOLED_PAD, coldFor(method));
    const lease = chargedAcquire(size, run, held);
    let ser = createPooledDataViewSerializer(method.id, lease.buffer);
    try {
      writePair(ser, method, body[method.id]);
      if (ser.index > ser.buffer.byteLength) throw new RangeError('overflow');
    } catch {
      // this route's prediction missed: re-encode THIS ROUTE only, on a growing buffer
      run.misses++;
      held.now -= lease.buffer.byteLength;
      lease.release();
      ser = createDataViewSerializer(method.id, coldFor(method));
      writePair(ser, method, body[method.id]);
      run.allocations++;
      run.allocatedBytes += ser.buffer.byteLength;
      held.now += ser.buffer.byteLength;
      if (held.now > run.peakBytes) run.peakBytes = held.now;
      parts.push(ser.getBufferView());
      recordSize(method.id, ser.index, true);
      total += ser.index;
      continue;
    }
    leases.push(lease);
    parts.push(ser.getBufferView());
    recordSize(method.id, ser.index, true);
    total += ser.index;
  }

  // the output buffer needs NO prediction — every part is already written, so its size is exact
  const outLease = chargedAcquire(total, run, held);
  const out = new Uint8Array(outLease.buffer, 0, total);
  new DataView(outLease.buffer).setUint32(0, parts.length, true);
  let at = ENVELOPE_HEADER_BYTES;
  for (const part of parts) {
    out.set(part, at);
    at += part.byteLength;
    run.copiedBytes += part.byteLength;
  }
  run.payloadBytes += total;
  const copy = new Uint8Array(out);
  for (const lease of leases) lease.release();
  outLease.release();
  return copy;
}

/** Writes the whole envelope and records each method's real byte span, as core does. */
function writeEnvelopeInto(ser: DataViewSerializer, writing: MethodWithJitFns[], body: Record<string, any>): void {
  ser.index = ENVELOPE_HEADER_BYTES;
  for (const method of writing) {
    const start = ser.index;
    writePair(ser, method, body[method.id]);
    recordSize(method.id, ser.index - start, true);
  }
  ser.view.setUint32(0, writing.length, true);
}

/** Predicted envelope size, the way core computes it. */
function predictEnvelope(writing: MethodWithJitFns[]): number {
  let total = ENVELOPE_HEADER_BYTES;
  for (const method of writing) total += predictSize(method.id, true, POOLED_QUANTILE, POOLED_PAD, coldFor(method));
  return total;
}

/** Exact envelope size from the measure pass. */
function measureEnvelope(writing: MethodWithJitFns[], body: Record<string, any>): number {
  const sizer = createSizingSerializer();
  sizer.index = ENVELOPE_HEADER_BYTES;
  for (const method of writing) writePair(sizer, method, body[method.id]);
  return sizer.index;
}

/** HYBRID: predict cheaply, and only pay the measure pass when the predicted buffer is big enough
 *  for exactness to change which size class we land in. Below the pool's smallest class the buffer
 *  is the same either way, so measuring there is pure cost. */
function makeHybrid(threshold: number): Strategy {
  return (chain, body, run) => {
    const held = {now: 0};
    const writing = writers(chain, body);
    const predicted = predictEnvelope(writing);
    const size = predicted > threshold ? measureEnvelope(writing, body) : predicted;
    const exact = predicted > threshold;

    const lease = chargedAcquire(size, run, held);
    const ser = createPooledDataViewSerializer('/mion-batch', lease.buffer);
    try {
      writeEnvelopeInto(ser, writing, body);
      if (ser.index > ser.buffer.byteLength) throw new RangeError('overflow');
    } catch {
      if (exact) throw new Error('an exactly-sized buffer must never overflow');
      run.misses++;
      lease.release();
      const grow = createDataViewSerializer('/mion-batch', measureEnvelope(writing, body));
      writeEnvelopeInto(grow, writing, body);
      return new Uint8Array(grow.getBufferView());
    }
    run.payloadBytes += ser.index;
    const copy = new Uint8Array(ser.getBufferView());
    lease.release();
    return copy;
  };
}

/** HYBRID, straddle gate: the measure pass only earns its cost when exactness can change which
 *  SIZE CLASS the request lands in. Compare the typical envelope (per-method medians) with the
 *  worst-case one (per-method maxima): if both fall in the same class, the buffer is the same either
 *  way and the cheap prediction is used. They only diverge for genuinely volatile payloads — which
 *  is exactly where summing maxima over-allocates. */
function hybridStraddle(chain: MethodWithJitFns[], body: Record<string, any>, run: Run): Uint8Array {
  const held = {now: 0};
  const writing = writers(chain, body);

  let typical = ENVELOPE_HEADER_BYTES;
  let worst = ENVELOPE_HEADER_BYTES;
  for (const method of writing) {
    const cold = coldFor(method);
    typical += predictSize(method.id, true, 0.5, 1, cold);
    worst += predictSize(method.id, true, POOLED_QUANTILE, POOLED_PAD, cold);
  }
  const straddles = sizeClassFor(typical) !== sizeClassFor(worst);
  const size = straddles ? measureEnvelope(writing, body) : worst;

  const lease = chargedAcquire(size, run, held);
  const ser = createPooledDataViewSerializer('/mion-batch', lease.buffer);
  try {
    writeEnvelopeInto(ser, writing, body);
    if (ser.index > ser.buffer.byteLength) throw new RangeError('overflow');
  } catch {
    if (straddles) throw new Error('an exactly-sized buffer must never overflow');
    run.misses++;
    lease.release();
    const grow = createDataViewSerializer('/mion-batch', measureEnvelope(writing, body));
    writeEnvelopeInto(grow, writing, body);
    return new Uint8Array(grow.getBufferView());
  }
  run.payloadBytes += ser.index;
  const copy = new Uint8Array(ser.getBufferView());
  lease.release();
  return copy;
}

/** ONE buffer for the whole envelope, sized by a MEASURE PASS — exact, no prediction, no overflow. */
function singleExact(chain: MethodWithJitFns[], body: Record<string, any>, run: Run): Uint8Array {
  const held = {now: 0};
  const writing = writers(chain, body);

  const sizer = createSizingSerializer();
  sizer.index = ENVELOPE_HEADER_BYTES;
  for (const method of writing) writePair(sizer, method, body[method.id]);
  const total = sizer.index;

  const lease = chargedAcquire(total, run, held);
  const ser = createPooledDataViewSerializer('/mion-batch', lease.buffer);
  ser.index = ENVELOPE_HEADER_BYTES;
  for (const method of writing) writePair(ser, method, body[method.id]);
  ser.view.setUint32(0, writing.length, true);
  if (ser.index !== total) throw new Error(`measure pass disagreed with the encoder: ${total} vs ${ser.index}`);

  run.payloadBytes += ser.index;
  const copy = new Uint8Array(ser.getBufferView());
  lease.release();
  return copy;
}

// ############# traffic #############

/** A batch whose MEMBERSHIP and payload sizes both change per request — the case a single
 *  predicted buffer is supposed to struggle with. Deterministic (seeded), so every strategy sees
 *  exactly the same sequence. */
function makeRequest(i: number): {paths: string[]; body: Record<string, any>} {
  let seed = (i * 1103515245 + 12345) & 0x7fffffff;
  const next = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

  const all = ['/getCount', '/getUser', '/listItems', '/getBlob'];
  const count = 2 + Math.floor(next() * 3); // 2..4 members
  const paths: string[] = [];
  for (const path of all) {
    if (paths.length < count && next() < 0.75) paths.push(path);
  }
  if (!paths.length) paths.push('/getCount');

  const body: Record<string, any> = {};
  for (const path of paths) {
    const id = path.slice(1);
    if (id === 'getCount') body[id] = Math.floor(next() * 1e6);
    else if (id === 'getUser') body[id] = {id: `u-${i}`, name: 'name', tags: ['a', 'b'], score: i};
    else if (id === 'listItems') {
      // right-skewed: mostly short lists, a fat tail
      const len = next() < 0.05 ? 150 + Math.floor(next() * 250) : 1 + Math.floor(next() * 6);
      body[id] = Array.from({length: len}, (_, k) => ({id: `id-${k}`, name: `name-${k}`, tags: ['a'], score: k}));
    } else if (id === 'getBlob') {
      const len = next() < 0.1 ? 2000 + Math.floor(next() * 8000) : 20 + Math.floor(next() * 200);
      body[id] = 'x'.repeat(len);
    }
  }
  return {paths, body};
}

/** The shape the "you cannot predict a batch" argument is strongest for: one route whose
 *  payload swings over three orders of magnitude, carried alongside small steady ones. Summing
 *  per-route maxima should over-allocate every request that is not on the fat tail. */
function makeVolatileRequest(i: number): {paths: string[]; body: Record<string, any>} {
  let seed = (i * 1103515245 + 12345) & 0x7fffffff;
  const next = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const paths = ['/getCount', '/getUser', '/getBlob'];
  const roll = next();
  // 1 in 20 requests is 100x the size of the rest
  const len = roll < 0.05 ? 20_000 + Math.floor(next() * 40_000) : 50 + Math.floor(next() * 150);
  return {
    paths,
    body: {
      getCount: i,
      getUser: {id: `u-${i}`, name: 'name', tags: ['a'], score: i},
      getBlob: 'x'.repeat(len),
    },
  };
}

/** The common case: fixed membership, steady payload sizes. Nothing here needs measuring — the
 *  window never straddles a class — so this is where a measure-always policy would be pure loss. */
function makeSteadyRequest(i: number): {paths: string[]; body: Record<string, any>} {
  return {
    paths: ['/getCount', '/getUser'],
    body: {getCount: i, getUser: {id: `u-${i}`, name: 'name', tags: ['a', 'b'], score: i}},
  };
}

type Strategy = (chain: MethodWithJitFns[], body: Record<string, any>, run: Run) => Uint8Array;
type Traffic = (i: number) => {paths: string[]; body: Record<string, any>};

function profile(name: string, strategy: Strategy, traffic: Traffic, n: number, ringSize?: number): Run {
  resetBufferPool();
  resetSizeStats();
  resetBinaryOptions();
  resetBinaryStrategyStats();
  configureBinary({pool: {enabled: true}});
  if (ringSize !== undefined) configureBinary({sizeStats: {ringSize}});
  const run = newRun();
  for (let i = 0; i < n; i++) {
    const {paths, body} = traffic(i);
    strategy(mergedChain(paths), body, run);
  }
  const pool = getBufferPoolStats();
  const kb = (bytes: number) => (bytes / 1024).toFixed(0);
  console.log(
    `${name.padEnd(16)} allocs=${String(run.allocations).padStart(5)}` +
      ` allocKB=${kb(run.allocatedBytes).padStart(7)}` +
      ` peakKB=${kb(run.peakBytes).padStart(6)}` +
      ` bufferKB=${kb(run.bufferBytes).padStart(7)}` +
      ` overAlloc=${(run.bufferBytes / Math.max(1, run.payloadBytes)).toFixed(1)}x`.padStart(15) +
      ` copiedKB=${kb(run.copiedBytes).padStart(7)}` +
      ` measured=${String(getBinaryStrategyStats().measured).padStart(5)}` +
      ` reuses=${String(pool.hits).padStart(5)} misses=${String(run.misses).padStart(4)}` +
      ` retainedKB=${kb(pool.bytesHeld).padStart(5)}`
  );
  return run;
}

/** Every strategy must produce the SAME bytes, or the comparison is meaningless. */
function assertIdenticalOutput(): void {
  for (let i = 0; i < 50; i++) {
    const {paths, body} = makeRequest(i);
    const chain = mergedChain(paths);
    resetBufferPool();
    resetSizeStats();
    configureBinary({pool: {enabled: true}});
    const a = singlePredicted(chain, body, newRun());
    resetBufferPool();
    resetSizeStats();
    configureBinary({pool: {enabled: true}});
    const b = perRouteMerge(chain, body, newRun());
    resetBufferPool();
    resetSizeStats();
    configureBinary({pool: {enabled: true}});
    const c = singleExact(chain, body, newRun());
    if (a.byteLength !== b.byteLength || a.byteLength !== c.byteLength)
      throw new Error(`length mismatch at ${i}: single=${a.byteLength} merge=${b.byteLength} exact=${c.byteLength}`);
    for (let k = 0; k < a.byteLength; k++) {
      if (a[k] !== b[k] || a[k] !== c[k]) throw new Error(`byte ${k} differs at request ${i}`);
    }
    // and it must still round-trip
    deserializeBinaryBody('/mion-batch', b, true);
  }
}

const N = 2000;

describe('batch buffer model', () => {
  bench(
    'allocation + memory profile (table printed once)',
    () => {
      accounting = true;
      assertIdenticalOutput();
      console.log(`\n--- A: varying membership (2-4 routes), right-skewed sizes  (n=${N}) ---`);
      profile('core-hybrid', singlePredicted, makeRequest, N);
      profile('per-route-merge', perRouteMerge, makeRequest, N);
      profile('single-exact', singleExact, makeRequest, N);
      console.log(`\n--- B: fixed membership, ONE volatile route (100x swings)  (n=${N}) ---`);
      profile('core-hybrid', singlePredicted, makeVolatileRequest, N);
      profile('per-route-merge', perRouteMerge, makeVolatileRequest, N);
      profile('single-exact', singleExact, makeVolatileRequest, N);
      console.log(`\n--- C: fixed membership, steady sizes — the common case  (n=${N}) ---`);
      profile('core-hybrid', singlePredicted, makeSteadyRequest, N);
      profile('single-exact', singleExact, makeSteadyRequest, N);
      profile('hybrid-straddle', hybridStraddle, makeSteadyRequest, N);
      // How long the window should remember a spike. Shortening it makes the worst case
      // forget sooner, which sounds like it should cut the exact-measure passes — measured, it
      // trades them for RE-ENCODES, which cost more and leave a grown adaptive buffer behind.
      console.log(`\n--- ringSize sweep: how long the window remembers a spike ---`);
      for (const w of [8, 16, 32, 64]) {
        profile(`ring=${w} A`, singlePredicted, makeRequest, N, w);
        profile(`ring=${w} B`, singlePredicted, makeVolatileRequest, N, w);
      }
      console.log(`\n--- hybrid gates, profile A then B ---`);
      for (const threshold of [1024, 4096]) {
        profile(`hybrid-${threshold / 1024}k A`, makeHybrid(threshold), makeRequest, N);
        profile(`hybrid-${threshold / 1024}k B`, makeHybrid(threshold), makeVolatileRequest, N);
      }
      profile('hybrid-straddle A', hybridStraddle, makeRequest, N);
      profile('hybrid-straddle B', hybridStraddle, makeVolatileRequest, N);
    },
    {iterations: 1, warmupIterations: 0, time: 0}
  );

  bench('core-hybrid (throughput)', () => {
    accounting = false;
    const run = newRun();
    for (let i = 0; i < 200; i++) {
      const {paths, body} = makeRequest(i);
      singlePredicted(mergedChain(paths), body, run);
    }
  });

  bench('per-route-merge (throughput)', () => {
    accounting = false;
    const run = newRun();
    for (let i = 0; i < 200; i++) {
      const {paths, body} = makeRequest(i);
      perRouteMerge(mergedChain(paths), body, run);
    }
  });

  bench('single-exact (throughput)', () => {
    accounting = false;
    const run = newRun();
    for (let i = 0; i < 200; i++) {
      const {paths, body} = makeRequest(i);
      singleExact(mergedChain(paths), body, run);
    }
  });

  bench('hybrid-straddle (throughput)', () => {
    accounting = false;
    const run = newRun();
    for (let i = 0; i < 200; i++) {
      const {paths, body} = makeRequest(i);
      hybridStraddle(mergedChain(paths), body, run);
    }
  });

  bench('core-hybrid STEADY (throughput)', () => {
    accounting = false;
    const run = newRun();
    for (let i = 0; i < 200; i++) {
      const {paths, body} = makeSteadyRequest(i);
      singlePredicted(mergedChain(paths), body, run);
    }
  });

  bench('single-exact STEADY (throughput)', () => {
    accounting = false;
    const run = newRun();
    for (let i = 0; i < 200; i++) {
      const {paths, body} = makeSteadyRequest(i);
      singleExact(mergedChain(paths), body, run);
    }
  });

  bench('hybrid-straddle STEADY (throughput)', () => {
    accounting = false;
    const run = newRun();
    for (let i = 0; i < 200; i++) {
      const {paths, body} = makeSteadyRequest(i);
      hybridStraddle(mergedChain(paths), body, run);
    }
  });
});
