// secformat: pump every shipped string format validator and every registered
// pattern regex with strings built to make a scanner do super-linear work.
// Needs the Go binary (the format leaves compile to their real validators);
// skipped when it is missing.

import {describe, it, expect} from 'vitest';
import {hasBinary} from './securityHarness.ts';
import {runFormatFuzz, runFormatFuzzForDuration} from './formatPatternRunner.ts';
import {soakTestTimeout, pathologyReport} from '../core/soakBudget.ts';
import {entrySeed} from '../core/fuzzPolicy.ts';
import {renderCrashes} from '../core/crashGuard.ts';
import {renderViolations} from './securityOracle.ts';

describe('fuzz / security / format validators — pump strings never throw or run away', () => {
  const register = hasBinary() ? it : it.skip;

  register(
    'finds no oracle violations across every format leaf and registered pattern',
    async () => {
      const report = await runFormatFuzz({seed: entrySeed('secformat'), iterations: 2});
      if (report.compileErrors.length > 0)
        throw new Error(`format leaves that did not compile:\n  ${report.compileErrors.join('\n  ')}`);
      if (report.violations.length > 0 || report.crashes.length > 0) {
        throw new Error(
          `${report.violations.length} oracle violation(s) + ${report.crashes.length} crash(es) over ${report.targets} targets:\n` +
            renderViolations(report.violations) +
            (report.crashes.length > 0 ? `\n${renderCrashes(report.crashes)}` : '')
        );
      }
      expect(report.targets).toBeGreaterThan(20);
      expect(report.checked).toBeGreaterThan(0);
    },
    240_000
  );

  const soakMs = Number(process.env.MION_FUZZ_SECFORMAT_SOAK_MS ?? 0);
  it.runIf(soakMs > 0)(
    'soak — keep pumping every format and pattern and log every finding',
    async () => {
      const report = await runFormatFuzzForDuration(soakMs, {seed: entrySeed('secformat')}, (v) => {
        console.error(
          `[secformat-fuzz][${v.oracle}] ${v.target} · ${v.attack} (seed=0x${v.seed.toString(16)}): ${v.message}\n    ${v.input}`
        );
      });
      console.error(
        `[secformat-fuzz] soak finished: ${report.runs} pump sets over ${report.targets} targets, ${report.violations.length} violation(s)`
      );
      if (report.compileErrors.length > 0)
        throw new Error(`format leaves that did not compile:\n  ${report.compileErrors.join('\n  ')}`);
      expect(pathologyReport(report.slowestIterationMs, report.slowestIterationRound)).toBeNull();
      if (report.crashes.length > 0) throw new Error(renderCrashes(report.crashes));
      expect(report.violations).toHaveLength(0);
    },
    soakTestTimeout(soakMs)
  );
});
