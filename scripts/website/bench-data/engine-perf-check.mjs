// engine-perf-check.mjs — does the key-counter inversion still hold on THIS engine?
//
// The per-engine branch in `rt::countEnumKeys` rests on one empirical claim:
//
//     on V8              `for-in` beats `Object.keys`
//     on JavaScriptCore  `Object.keys` beats `for-in`
//
// Being wrong costs throughput and never correctness — both counters are pinned to
// answer identically for every input — which is exactly why nothing would notice if a
// future engine release flipped it. This script is that tripwire.
//
// WHAT IT DOES NOT DO: compare bun against node. That was the first version of this
// check and it was measuring the wrong thing. Bun is currently ~2.4x slower than node
// on the strict path overall, which says nothing about whether the branch picked the
// right counter FOR bun — the branch is still a clear win there (~1.4x over `for-in`).
// The claim is per-engine, so the comparison has to be per-engine: both counters, same
// process, same engine.
//
// The benchmark suite cannot do this, because a competitor bundle has exactly one
// counter body baked in at build time. So the counters are re-stated here, and the
// vitest suite (packages/run-types/test/features/countEnumKeys.test.ts) is what
// guards their BEHAVIOUR. If pf_countEnumKeys changes shape, update both.
//
// Methodology (the same rules the original measurements had to follow, for the same
// reasons — see docs/done/runtime-aware-key-counting.md):
//   - ONE variant per child process: a shared timing helper taking a different
//     function per variant makes that call site polymorphic and hands whichever ran
//     first a monomorphic fast path. Measured at low iteration counts this does not
//     merely add noise, it produces a confidently WRONG answer (0/21 correct in one
//     configuration).
//   - non-constant inputs (rotating pool), or the engine folds the call away.
//   - median of samples, and enough iterations to be past warmup.
//
// usage: node engine-perf-check.mjs           # check whichever runtimes are available
//        node engine-perf-check.mjs --self <variant>   # internal: one measured child

import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const SELF = fileURLToPath(import.meta.url);
const ASSERT = process.env.RT_BENCH_ENGINE_ASSERT === '1';
// How much slower the expected winner may measure before this is called a real
// inversion rather than runner noise. Generous on purpose: the signal is a flip
// (1.4x+), not a few percent. Tighten only with data from the runner that enforces it.
const MARGIN = Number(process.env.RT_BENCH_ENGINE_MARGIN ?? 1.15);
const ITERS = Number(process.env.RT_BENCH_ENGINE_ITERS ?? 2_000_000);
const SAMPLES = 7;

// ── the two counters, mirroring pf_countEnumKeys ──────────────────────────────
const OBJECT_PROTO = Object.prototype;

function makeCounter(variant) {
  if (variant === 'forin') {
    return function _countEnumKeys(obj) {
      let count = 0;
      for (const _key in obj) count++;
      return count;
    };
  }
  if (variant === 'keys') {
    return function _countEnumKeys(obj) {
      const proto = obj != null ? Object.getPrototypeOf(obj) : undefined;
      if (proto === OBJECT_PROTO || proto === null) return Object.keys(obj).length;
      let count = 0;
      for (const _key in obj) count++;
      return count;
    };
  }
  throw new Error(`unknown variant: ${variant}`);
}

// ── the measured child ────────────────────────────────────────────────────────
function runSelf(variant) {
  const cntEK = makeCounter(variant);

  // A 7-field shape with a 3-field nested object: the moltar DTO's layout, which is
  // what the STRICT benchmark group measures.
  const POOL = 64;
  const pool = [];
  for (let i = 0; i < POOL; i++) {
    pool.push({
      number: i,
      negNumber: -i,
      maxNumber: Number.MAX_VALUE,
      string: 's' + i,
      longString: 'l'.repeat(160),
      boolean: i % 2 === 0,
      deeplyNested: {foo: 'f' + i, num: i, bool: i % 3 === 0},
    });
  }

  // The emitted strict check for that shape, verbatim: `cntEK(v) !== 7 || cntEK(v.deeplyNested) !== 3`.
  const isClean = (v) => !(cntEK(v) !== 7 || cntEK(v.deeplyNested) !== 3);

  const sample = () => {
    let acc = 0;
    const start = process.hrtime.bigint();
    for (let i = 0; i < ITERS; i++) if (isClean(pool[i & (POOL - 1)])) acc++;
    const end = process.hrtime.bigint();
    if (acc !== ITERS) throw new Error('strict check rejected clean data — bad harness');
    return Number(end - start) / ITERS;
  };

  for (let w = 0; w < 3; w++) sample();
  const samples = [];
  for (let s = 0; s < SAMPLES; s++) samples.push(sample());
  samples.sort((a, b) => a - b);
  process.stdout.write(JSON.stringify({variant, nsPerOp: samples[Math.floor(SAMPLES / 2)]}) + '\n');
}

const selfIndex = process.argv.indexOf('--self');
if (selfIndex !== -1) {
  runSelf(process.argv[selfIndex + 1]);
  process.exit(0);
}

// ── the driver ────────────────────────────────────────────────────────────────
function measure(runtime, variant) {
  const proc = spawnSync(runtime, [SELF, '--self', variant], {encoding: 'utf8'});
  if (proc.status !== 0) return null;
  try {
    return JSON.parse(proc.stdout.trim().split('\n').pop()).nsPerOp;
  } catch {
    return null;
  }
}

function available(runtime) {
  return spawnSync(runtime, ['--version'], {encoding: 'utf8'}).status === 0;
}

// Which counter each engine is expected to prefer. Bun is JavaScriptCore; node (and
// deno) are V8 and take the default `for-in` counter.
const EXPECTED = {node: 'forin', bun: 'keys'};

const failures = [];
let checked = 0;

for (const runtime of ['node', 'bun']) {
  if (!available(runtime)) {
    console.log(`engine-perf-check: ${runtime} not on PATH — skipped`);
    continue;
  }
  // Reverse the order across the two passes so neither variant can win by going first.
  const forward = ['forin', 'keys'].map((v) => [v, measure(runtime, v)]);
  const reversed = ['keys', 'forin'].map((v) => [v, measure(runtime, v)]);
  const best = {};
  for (const [variant, ns] of [...forward, ...reversed]) {
    if (ns === null) continue;
    best[variant] = best[variant] === undefined ? ns : Math.min(best[variant], ns);
  }
  if (best.forin === undefined || best.keys === undefined) {
    console.log(`engine-perf-check: ${runtime} — measurement failed, skipped`);
    continue;
  }
  checked++;
  const expected = EXPECTED[runtime];
  const other = expected === 'forin' ? 'keys' : 'forin';
  const ratio = best[expected] / best[other]; // < 1 means the expected winner is faster
  const verdict = ratio <= MARGIN ? 'OK' : 'INVERTED';
  console.log(
    `engine-perf-check: ${runtime.padEnd(4)} for-in ${best.forin.toFixed(2)} ns/op   keys ${best.keys.toFixed(2)} ns/op   ` +
      `expected winner '${expected}' ratio ${ratio.toFixed(2)}  ${verdict}`
  );
  if (ratio > MARGIN) {
    failures.push(`${runtime}: expected '${expected}' to win but it is ${ratio.toFixed(2)}x slower than '${other}'`);
  }
}

if (checked === 0) {
  console.log('engine-perf-check: no runtime could be measured — nothing to report');
  process.exit(0);
}
if (!failures.length) {
  console.log(`engine-perf-check: OK — the counter inversion holds on every runtime checked (margin ${MARGIN}x)`);
  process.exit(0);
}
const summary = failures.join('; ');
if (!ASSERT) {
  console.log(`engine-perf-check: REPORT ONLY — would have failed: ${summary}`);
  console.log('engine-perf-check: set RT_BENCH_ENGINE_ASSERT=1 once these numbers are trusted on this runner.');
  process.exit(0);
}
console.error(`engine-perf-check: FAILED — ${summary}`);
console.error('engine-perf-check: the per-engine branch in pf_countEnumKeys may now be choosing the slower counter.');
process.exit(1);
