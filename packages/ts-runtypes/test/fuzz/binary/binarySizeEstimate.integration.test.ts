// End-to-end: the binary cold-start size estimate holds for in-bounds data. For
// each varied estimator config, generate a random serialisable type, compile it
// with that config, and source values from createMockDataFn(respectBinarySize):
//
//   in-bounds (true)  — the cold buffer NEVER resizes, and the bytes round-trip.
//   oversized (false) — the cold buffer DOES resize, and still round-trips (the
//                       negative control proving the lane has teeth + grow-in-place
//                       stays sound).
//
// The oracle is dumb (just "did it resize?"); soundness lives in createMockDataFn's
// `respectBinarySize` bounds + the matching estimate. Needs the Go binary (spawned
// by the runner's ResolverClient); skipped when it isn't built.

import {describe, it, expect} from 'vitest';
import {hasBinary} from './sizeFuzzRunner.ts';
import {runSizeFuzz, runSizeFuzzForDuration} from './sizeFuzzRunner.ts';
import {soakTestTimeout} from '../core/soakBudget.ts';
import {laneSeed, soakSeed} from '../core/fuzzPolicy.ts';

describe('fuzz / binary size estimate — sound for in-bounds data', () => {
  const register = hasBinary() ? it : it.skip;

  register(
    'no under-allocation for in-bounds data; oversized data grows and round-trips',
    async () => {
      const report = await runSizeFuzz({seed: laneSeed('size', 0xc0ffee), iterations: 80});
      if (report.violations.length > 0) {
        const summary = report.violations
          .slice(0, 25)
          .map((v) => `  [${v.oracle}] ${v.type} (seed=${v.seed}): ${v.message}\n      ${v.value}`)
          .join('\n');
        throw new Error(
          `${report.violations.length} size violation(s) over ${report.runs} types:\n${summary}` +
            (report.violations.length > 25 ? `\n  …and ${report.violations.length - 25} more` : '')
        );
      }
      expect(report.runs).toBe(80);
      // The lanes must not be vacuous: in-bounds values were checked for no-resize,
      // and oversized values actually exercised grows. runSizeFuzz drives a fixed
      // deterministic floor case first, so these hold by construction whenever the
      // resolver is reachable — a resolver that dies under load makes runFloor throw
      // a clear "resolver unavailable" instead of silently zeroing these counters.
      expect(report.stats.noGrowChecked, 'no-resize lane never ran').toBeGreaterThan(0);
      expect(report.stats.negativesExercised, 'negative control never grew a buffer').toBeGreaterThan(0);
    },
    120_000
  );

  // Autonomous soak: opt-in via RT_FUZZ_SIZE_SOAK_MS=<ms>.
  const soakMs = Number(process.env.RT_FUZZ_SIZE_SOAK_MS ?? 0);
  it.runIf(soakMs > 0)(
    'soak — generate sized types continuously and log all findings',
    async () => {
      const report = await runSizeFuzzForDuration(soakMs, {seed: soakSeed()}, (v) => {
        console.error(`[size-fuzz][${v.oracle}] ${v.type} (seed=${v.seed}): ${v.message}\n    ${v.value}`);
      });
      console.error(
        `[size-fuzz] soak finished: ${report.runs} types, ${report.violations.length} violation(s), ` +
          `${report.stats.noGrowChecked} no-resize checks, ${report.stats.negativesExercised} grows, ${report.stats.skipped} skipped`
      );
      expect(report.violations).toHaveLength(0);
    },
    soakTestTimeout(soakMs)
  );
});
