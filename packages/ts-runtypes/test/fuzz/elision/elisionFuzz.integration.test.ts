// Elision form-equivalence lane: generated builder schemas, both spellings
// compiled through the real resolver, oracles E1 (byte-identical shared
// entries), E2 (static form emits zero reflection payload; value form keeps
// it), E3 (the static form's compiled functions behave). See elisionRunner.ts.
//
// Needs the Go binary (spawned by the runner's ResolverClient); skipped when
// it isn't built. Soak: opt-in via RT_FUZZ_ELISION_SOAK_MS=<ms>.

import {describe, it, expect} from 'vitest';
import {hasBinary, runElisionFuzz, runElisionFuzzForDuration} from './elisionRunner.ts';
import {soakTestTimeout} from '../core/soakBudget.ts';
import {entrySeed} from '../core/fuzzPolicy.ts';

function renderViolations(report: {
  violations: {oracle: string; seed: number; title: string; message: string}[];
  runs: number;
}): string {
  const summary = report.violations
    .slice(0, 25)
    .map((v) => `  [${v.oracle}] ${v.title} (seed=${v.seed}):\n      ${v.message}`)
    .join('\n');
  return (
    `${report.violations.length} oracle violation(s) over ${report.runs} generated schemas:\n${summary}` +
    (report.violations.length > 25 ? `\n  …and ${report.violations.length - 25} more` : '')
  );
}

describe('fuzz / elision — the two schema spellings stay equivalent', () => {
  const register = hasBinary() ? it : it.skip;

  register(
    'finds no oracle violations across a batch of generated builder schemas',
    async () => {
      const report = await runElisionFuzz({seed: entrySeed('elision'), iterations: 25});
      if (report.violations.length > 0) throw new Error(renderViolations(report));
      expect(report.runs).toBe(25);
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
