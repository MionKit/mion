// DataOnly non-data lane: random types carrying the DataOnly-stripped kinds, with REAL values from createMockDataFn
// (nonDataTypes: true). An accepted type serializes with the stripped members dropped and both round-trips stable and
// agreeing (O1/O3/O4/O5/O12/O14); a rejected one makes every encoder throw a `[CODE]` its own site reports (D1);
// DataOnly<T> agrees with the Go non-data decision (D4). The tier is read off the resolver's own diagnostics, so no
// model can drift from the Go type switch. Separate from the WILD sweep so it cannot destabilise the default run.

import {describe, it, expect} from 'vitest';
import {hasBinary} from './typeFuzzHarness.ts';
import {runTypeFuzz, runTypeFuzzForDuration} from './typeFuzzRunner.ts';
import {NONDATA_GEN_OPTIONS} from '../core/typeGen.ts';
import {soakTestTimeout, pathologyReport} from '../core/soakBudget.ts';
import {entrySeed, SUPPRESSION_CEILING, STRONG_ORACLE_FLOOR} from '../core/fuzzPolicy.ts';
import {renderCrashes} from '../core/crashGuard.ts';

describe('fuzz / DataOnly non-data lane — serialize-or-fail contract over non-data types', () => {
  const register = hasBinary() ? it : it.skip;

  register(
    'finds no DataOnly-contract violations across a batch of non-data types',
    async () => {
      const report = await runTypeFuzz({
        seed: entrySeed('nondata'),
        iterations: 100,
        gen: NONDATA_GEN_OPTIONS,
        valueSource: 'mock',
      });
      if (report.violations.length > 0 || report.crashes.length > 0) {
        const summary = report.violations
          .slice(0, 25)
          .map((v) => `  [${v.oracle}/${v.phase}] ${v.target} (seed=${v.seed}): ${v.message}\n      ${v.value}`)
          .join('\n');
        throw new Error(
          `${report.violations.length} DataOnly violation(s) + ${report.crashes.length} crash(es) over ${report.runs} non-data types:\n${summary}` +
            (report.violations.length > 25 ? `\n  …and ${report.violations.length - 25} more` : '') +
            (report.crashes.length > 0 ? `\n${renderCrashes(report.crashes)}` : '')
        );
      }
      expect(report.runs).toBe(100);
      // The TS-validity gate discards violations for a generated type that does
      // not compile. Sound in principle, but it must never be able to swallow
      // the whole lane: a generator regression emitting mostly-invalid
      // TypeScript would turn this test green and silent. Observed rate is 0.
      expect(
        report.skippedInvalidTypes,
        `the TS-validity gate suppressed ${report.skippedInvalidTypes}/${report.runs} runs — a generator regression can hide every violation behind it`
      ).toBeLessThanOrEqual(Math.ceil(report.runs * SUPPRESSION_CEILING));
      // Anti-vacuity: `runs` only proves the loop turned. A lane whose generator
      // regressed into producing only robustness-probed types would still hit
      // 100 runs while asserting almost nothing, so require that a real share of
      // them reached the STRONG oracles.
      expect(
        report.strongOracleRuns,
        `only ${report.strongOracleRuns}/${report.runs} generated types reached the strong oracles — the lane is close to vacuous`
      ).toBeGreaterThanOrEqual(Math.ceil(report.runs * STRONG_ORACLE_FLOOR));
    },
    120_000
  );

  // Autonomous soak: opt-in via MION_FUZZ_NONDATA_SOAK_MS=<ms>.
  const soakMs = Number(process.env.MION_FUZZ_NONDATA_SOAK_MS ?? 0);
  it.runIf(soakMs > 0)(
    'soak — generate non-data types continuously and log all findings',
    async () => {
      const report = await runTypeFuzzForDuration(
        soakMs,
        {seed: entrySeed('nondata'), gen: NONDATA_GEN_OPTIONS, valueSource: 'mock'},
        (v) => {
          console.error(`[nondata-fuzz][${v.oracle}/${v.phase}] ${v.target} (seed=${v.seed}): ${v.message}\n    ${v.value}`);
        }
      );
      console.error(
        `[nondata-fuzz] soak finished: ${report.runs} types, ${report.violations.length} violation(s), ${report.skippedInvalidTypes} invalid-TS false positive(s) filtered`
      );
      expect(pathologyReport(report.slowestIterationMs, report.slowestIterationRound)).toBeNull();
      if (report.crashes.length > 0) throw new Error(renderCrashes(report.crashes));
      expect(report.violations).toHaveLength(0);
    },
    soakTestTimeout(soakMs)
  );
});
