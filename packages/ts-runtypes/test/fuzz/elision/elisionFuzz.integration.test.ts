// Elision form-equivalence lane over the FULL generated type space: one
// generator (core/typeGen.ts), builder spellings derived by the REAL
// `ts-runtypes convert --to builders` CLI, oracles E0-E3 (see
// elisionRunner.ts / elisionOracle.ts).
//
// Needs the Go binary (the converter CLI + the runner's ResolverClient);
// skipped when it isn't built. Soak: opt-in via RT_FUZZ_ELISION_SOAK_MS=<ms>.

import {describe, it, expect} from 'vitest';
import {hasBinary, runElisionFuzz, runElisionFuzzForDuration, type ElisionFuzzReport} from './elisionRunner.ts';
import {soakTestTimeout} from '../core/soakBudget.ts';
import {entrySeed, STRONG_ORACLE_FLOOR} from '../core/fuzzPolicy.ts';

function renderViolations(report: ElisionFuzzReport): string {
  const summary = report.violations
    .slice(0, 25)
    .map((v) => `  [${v.oracle}] ${v.title} (seed=${v.seed}):\n      ${v.message}`)
    .join('\n');
  return (
    `${report.violations.length} oracle violation(s) over ${report.runs} generated schemas (${report.rerolls} re-rolls):\n${summary}` +
    (report.violations.length > 25 ? `\n  …and ${report.violations.length - 25} more` : '')
  );
}

describe('fuzz / elision — the two schema spellings stay equivalent', () => {
  const register = hasBinary() ? it : it.skip;

  register(
    'finds no oracle violations across a batch of generated schemas',
    async () => {
      const report = await runElisionFuzz({seed: entrySeed('elision'), iterations: 10});
      if (report.violations.length > 0) throw new Error(renderViolations(report));
      expect(report.runs).toBe(10);
      // Anti-vacuity: `runs` only proves the loop turned; require that a real
      // share reached the E3 validator probes (the strong tier) so a tiering
      // regression cannot hollow the lane silently.
      expect(
        report.strongRuns,
        `only ${report.strongRuns}/${report.runs} schemas reached the E3 probes — the lane is close to vacuous`
      ).toBeGreaterThanOrEqual(Math.ceil(report.runs * STRONG_ORACLE_FLOOR));
    },
    120_000
  );

  // Autonomous soak: opt-in via RT_FUZZ_ELISION_SOAK_MS=<ms>.
  const soakMs = Number(process.env.RT_FUZZ_ELISION_SOAK_MS ?? 0);
  it.runIf(soakMs > 0 && hasBinary())(
    'soak — generate schemas continuously and report all findings',
    async () => {
      const report = await runElisionFuzzForDuration(soakMs, {seed: entrySeed('elision')});
      if (report.violations.length > 0) throw new Error(renderViolations(report));
      expect(report.runs).toBeGreaterThan(0);
    },
    soakTestTimeout(soakMs)
  );
});
