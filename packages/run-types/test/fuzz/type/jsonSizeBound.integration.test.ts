// End-to-end: the build-time jsonMaxBytes is a true upper bound of what the
// serializer emits. For each generated BOUNDED type (every string leaf a bounded
// format, every array a maxItems, every Map / Set a maxSize), compile it, read
// the bound off its reflection root, draw values from the product mock, and
// measure both `JSON.stringify(value)` and the compiled JSON encoder's output in
// UTF-8 bytes: neither may pass the bound. The DataOnly preset (functions /
// symbols / Promise members) runs too, so the walk's "a dropped member costs at
// most null" rule is checked against the encoder that drops them. Needs the Go
// binary; skipped when it isn't built.

import {describe, it, expect} from 'vitest';
import {hasBinary, runJsonSizeFuzz, runJsonSizeFuzzForDuration} from './jsonSizeFuzzRunner.ts';
import {soakTestTimeout, pathologyReport} from '../core/soakBudget.ts';
import {entrySeed} from '../core/fuzzPolicy.ts';
import {renderCrashes} from '../core/crashGuard.ts';

describe('fuzz / json size bound, the serializer never emits more than jsonMaxBytes', () => {
  const register = hasBinary() ? it : it.skip;

  register(
    'every mocked value of a bounded type fits its jsonMaxBytes, raw and encoded',
    async () => {
      const report = await runJsonSizeFuzz({seed: entrySeed('jsonsize'), iterations: 80});
      if (report.violations.length > 0 || report.crashes.length > 0) {
        const summary = report.violations
          .slice(0, 25)
          .map((v) => `  [${v.oracle}] ${v.type} (seed=${v.seed}): ${v.message}\n      ${v.value}`)
          .join('\n');
        throw new Error(
          `${report.violations.length} json size violation(s) + ${report.crashes.length} crash(es) over ${report.runs} types:\n${summary}` +
            (report.violations.length > 25 ? `\n  …and ${report.violations.length - 25} more` : '') +
            (report.crashes.length > 0 ? `\n${renderCrashes(report.crashes)}` : '')
        );
      }
      expect(report.runs).toBe(80);
      // never vacuous: the floor proves the resolver answered and the comparison
      // has teeth, and the random space must produce bounded types to check
      expect(report.stats.negativesExercised, 'the inflated floor value never passed the bound').toBeGreaterThan(0);
      expect(report.stats.checked, 'no generated type carried a bound').toBeGreaterThan(10);
      expect(report.stats.valuesChecked).toBeGreaterThan(report.stats.checked);
    },
    120_000
  );

  // Autonomous soak: opt-in via MION_FUZZ_JSONSIZE_SOAK_MS=<ms>.
  const soakMs = Number(process.env.MION_FUZZ_JSONSIZE_SOAK_MS ?? 0);
  it.runIf(soakMs > 0)(
    'soak, generate bounded types continuously and log all findings',
    async () => {
      const report = await runJsonSizeFuzzForDuration(soakMs, {seed: entrySeed('jsonsize')}, (v) => {
        console.error(`[jsonsize-fuzz][${v.oracle}] ${v.type} (seed=${v.seed}): ${v.message}\n    ${v.value}`);
      });
      console.error(
        `[jsonsize-fuzz] soak finished: ${report.runs} types, ${report.violations.length} violation(s), ` +
          `${report.stats.checked} bounded types (${report.stats.valuesChecked} values), ${report.stats.unbounded} unbounded, ${report.stats.skipped} skipped`
      );
      expect(pathologyReport(report.slowestIterationMs, report.slowestIterationRound)).toBeNull();
      if (report.crashes.length > 0) throw new Error(renderCrashes(report.crashes));
      expect(report.violations).toHaveLength(0);
    },
    soakTestTimeout(soakMs)
  );
});
