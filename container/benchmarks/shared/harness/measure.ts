// Correctness + throughput measurement, lifted from the old src/run.ts
// (check / benchOps / safe) so every competitor measures identically.

import {performance} from 'node:perf_hooks';
import type {Validator} from './types.ts';

const TIME_MS = Number(process.env.MION_VALIDATION_BENCH_TIME_MS ?? 100);

/** Returns the index of the first sample whose result != `want`, or -1 if all
 *  match. A thrown validator counts as "rejects" (result false). */
export function check(validator: Validator, samples: unknown[], want: boolean): number {
  for (let i = 0; i < samples.length; i++) {
    let result: boolean;
    try {
      result = validator(samples[i]) === true;
    } catch {
      result = false;
    }
    if (result !== want) return i;
  }
  return -1;
}

// performance.now() costs ~50 ns, more than most validators: read it once per >= 1000 calls,
// else the clock read sets the score and fast libraries look as slow as slow ones.
const CALLS_PER_CLOCK_READ = 1000;
// Accepted counts land here so the optimizer cannot drop the validator call.
const sink = {accepted: 0};
let loopId = 0;

/** Validations/sec over `samples` (warm up, then time batches of >= 1000 calls for TIME_MS).
 *  Each call compiles its own loop: one call site shared by every case goes megamorphic and adds
 *  a flat few ns to every call. The trailing id keeps each source unique, since identical
 *  `new Function` sources share type feedback through V8's eval cache. */
export function benchOps(validator: Validator, samples: unknown[]): number {
  if (samples.length === 0) return 0;
  const make = new Function(
    'performance',
    'sink',
    'timeMs',
    'callsPerRead',
    `const safe = function (validator, sample) { try { return validator(sample); } catch { return false; } };
return function benchOps(validator, samples) {
  const reps = Math.max(1, Math.ceil(callsPerRead / samples.length));
  let accepted = 0;
  for (let i = 0; i < 1000; i++) for (let j = 0; j < samples.length; j++) if (safe(validator, samples[j]) === true) accepted++;
  let calls = 0;
  const start = performance.now();
  while (performance.now() - start < timeMs) {
    for (let r = 0; r < reps; r++) for (let j = 0; j < samples.length; j++) if (safe(validator, samples[j]) === true) accepted++;
    calls += reps * samples.length;
  }
  const elapsed = performance.now() - start;
  sink.accepted += accepted;
  return calls / (elapsed / 1000);
};
//loop ${loopId++}`
  ) as (perf: typeof performance, out: typeof sink, timeMs: number, callsPerRead: number) => typeof benchOps;
  return make(performance, sink, TIME_MS, CALLS_PER_CLOCK_READ)(validator, samples);
}
