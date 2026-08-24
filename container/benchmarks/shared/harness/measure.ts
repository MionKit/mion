// Correctness + throughput measurement, lifted from the old src/run.ts
// (check / benchOps / safe) so every competitor measures identically.

import {performance} from 'node:perf_hooks';
import type {Validator} from './types.ts';

const TIME_MS = Number(process.env.RT_BENCH_TIME_MS ?? 100);

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

function safe(validator: Validator, sample: unknown): boolean {
  try {
    return validator(sample);
  } catch {
    return false;
  }
}

/** Validations/sec over `samples` (warm up, then batch for TIME_MS). */
export function benchOps(validator: Validator, samples: unknown[]): number {
  if (samples.length === 0) return 0;
  for (let i = 0; i < 1000; i++) for (const sample of samples) safe(validator, sample);
  let batches = 0;
  const start = performance.now();
  while (performance.now() - start < TIME_MS) {
    for (const sample of samples) safe(validator, sample);
    batches++;
  }
  return (batches * samples.length) / ((performance.now() - start) / 1000);
}
