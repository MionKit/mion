// Phase 2 end-to-end: generate random TYPES across the widest space (classes,
// functions, symbols, index signatures, native builtins, intersections,
// circular interfaces, any/unknown/never, …) and drive each through the real
// resolver → plugin → runtime pipeline, checking the resolver/emit robustness
// oracles (TR1–TR4) on every type and the value oracles (O1–O7) on the
// serialisable subset.
//
// Needs the Go binary (spawned by the runner's ResolverClient); skipped when it
// isn't built. The runner owns the resolver process and restarts it if a
// pathological type ever wedges it.

import {describe, it, expect} from 'vitest';
import {hasBinary} from './typeFuzzHarness.ts';
import {runTypeFuzz, runTypeFuzzForDuration} from './typeFuzzRunner.ts';
import {soakTestTimeout, pathologyReport} from '../core/soakBudget.ts';
import {entrySeed, SUPPRESSION_CEILING, STRONG_ORACLE_FLOOR} from '../core/fuzzPolicy.ts';
import {renderCrashes} from '../core/crashGuard.ts';

describe('fuzz / type-generation — oracle sweep over generated types', () => {
  const register = hasBinary() ? it : it.skip;

  register(
    'finds no oracle violations across a batch of generated types',
    async () => {
      const report = await runTypeFuzz({seed: entrySeed('types'), iterations: 100});
      if (report.violations.length > 0 || report.crashes.length > 0) {
        const summary = report.violations
          .slice(0, 25)
          .map((v) => `  [${v.oracle}/${v.phase}] ${v.target} (seed=${v.seed}): ${v.message}\n      ${v.value}`)
          .join('\n');
        throw new Error(
          `${report.violations.length} oracle violation(s) + ${report.crashes.length} crash(es) over ${report.runs} generated types:\n${summary}` +
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

  // Autonomous soak: opt-in via MION_FUZZ_TYPES_SOAK_MS=<ms>.
  const soakMs = Number(process.env.MION_FUZZ_TYPES_SOAK_MS ?? 0);
  it.runIf(soakMs > 0)(
    'soak — generate types continuously and log all findings',
    async () => {
      const report = await runTypeFuzzForDuration(soakMs, {seed: entrySeed('types')}, (v) => {
        console.error(`[type-fuzz][${v.oracle}/${v.phase}] ${v.target} (seed=${v.seed}): ${v.message}\n    ${v.value}`);
      });
      console.error(
        `[type-fuzz] soak finished: ${report.runs} types, ${report.violations.length} violation(s), ${report.skippedInvalidTypes} invalid-TS false positive(s) filtered`
      );
      expect(pathologyReport(report.slowestIterationMs, report.slowestIterationRound)).toBeNull();
      if (report.crashes.length > 0) throw new Error(renderCrashes(report.crashes));
      expect(report.violations).toHaveLength(0);
    },
    soakTestTimeout(soakMs)
  );
});
