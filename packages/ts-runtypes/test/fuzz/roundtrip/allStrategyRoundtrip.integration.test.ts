// All-strategy round-trip end-to-end: generate random SERIALISABLE types, compile
// EVERY JSON codec strategy (clone / mutate / direct / compact) plus binary for
// the same type, round-trip one conforming value through all of them, and check
// they agree (round-trip identity, both-ends validate, cross-strategy agreement,
// wire stability, native-JSON cross-check).
//
// Needs the Go binary (spawned by the runner's ResolverClient); skipped when it
// isn't built. The runner owns the resolver process and restarts it if a
// pathological type ever wedges it.

import {describe, it, expect} from 'vitest';
import {hasBinary} from './roundtripHarness.ts';
import {runRoundtripFuzz, runRoundtripFuzzForDuration} from './roundtripRunner.ts';
import {soakTestTimeout, pathologyReport} from '../core/soakBudget.ts';
import {entrySeed} from '../core/fuzzPolicy.ts';
import {renderCrashes} from '../core/crashGuard.ts';

describe('fuzz / all-strategy round-trip — every codec agrees over generated types', () => {
  const register = hasBinary() ? it : it.skip;

  register(
    'finds no oracle violations across a batch of generated types',
    async () => {
      const report = await runRoundtripFuzz({seed: entrySeed('roundtrip'), iterations: 100});
      if (report.violations.length > 0 || report.crashes.length > 0) {
        const summary = report.violations
          .slice(0, 25)
          .map((v) => `  [${v.oracle}/${v.lane}] ${v.target} (seed=${v.seed}): ${v.message}\n      ${v.value}`)
          .join('\n');
        throw new Error(
          `${report.violations.length} oracle violation(s) + ${report.crashes.length} crash(es) over ${report.runs} generated types ` +
            `(${report.checked} checked, ${report.skipped} skipped, ${report.skippedInvalidTypes} invalid-TS filtered):\n${summary}` +
            (report.violations.length > 25 ? `\n  …and ${report.violations.length - 25} more` : '') +
            (report.crashes.length > 0 ? `\n${renderCrashes(report.crashes)}` : '')
        );
      }
      expect(report.runs).toBe(100);
      // The corpus must actually exercise the matrix — a run that skipped every
      // type would pass vacuously.
      expect(report.checked).toBeGreaterThan(0);
    },
    180_000
  );

  // Autonomous soak: opt-in via RT_FUZZ_ROUNDTRIP_SOAK_MS=<ms>.
  const soakMs = Number(process.env.RT_FUZZ_ROUNDTRIP_SOAK_MS ?? 0);
  it.runIf(soakMs > 0)(
    'soak — round-trip generated types continuously and log all findings',
    async () => {
      const report = await runRoundtripFuzzForDuration(soakMs, {seed: entrySeed('roundtrip')}, (v) => {
        console.error(`[roundtrip-fuzz][${v.oracle}/${v.lane}] ${v.target} (seed=${v.seed}): ${v.message}\n    ${v.value}`);
      });
      console.error(
        `[roundtrip-fuzz] soak finished: ${report.runs} types, ${report.checked} checked, ` +
          `${report.violations.length} violation(s), ${report.skippedInvalidTypes} invalid-TS false positive(s) filtered`
      );
      expect(pathologyReport(report.slowestIterationMs, report.slowestIterationRound)).toBeNull();
      if (report.crashes.length > 0) throw new Error(renderCrashes(report.crashes));
      expect(report.violations).toHaveLength(0);
    },
    soakTestTimeout(soakMs)
  );
});
