// secgen: scan the code the emitters produce for generated types whose names
// and literals carry every character that could break a string literal, plus
// a planted marker. Needs the Go binary; skipped when it is missing.

import {describe, it, expect} from 'vitest';
import {hasBinary} from './securityHarness.ts';
import {runGeneratedCodeFuzz, runGeneratedCodeFuzzForDuration} from './generatedCodeRunner.ts';
import {renderGeneratedCodeViolations} from './generatedCodeOracle.ts';
import {soakTestTimeout, pathologyReport} from '../core/soakBudget.ts';
import {entrySeed} from '../core/fuzzPolicy.ts';
import {renderCrashes} from '../core/crashGuard.ts';

describe('fuzz / security / generated code — every emitted body passes the audit checklist', () => {
  const register = hasBinary() ? it : it.skip;

  register(
    'finds no oracle violations across a batch of generated types',
    async () => {
      const report = await runGeneratedCodeFuzz({seed: entrySeed('secgen'), iterations: 40});
      if (report.violations.length > 0 || report.crashes.length > 0) {
        throw new Error(
          `${report.violations.length} oracle violation(s) + ${report.crashes.length} crash(es) over ${report.runs} generated types ` +
            `(${report.checked} checked, ${report.skipped} skipped, ${report.bodies} bodies):\n` +
            renderGeneratedCodeViolations(report.violations) +
            (report.crashes.length > 0 ? `\n${renderCrashes(report.crashes)}` : '')
        );
      }
      expect(report.runs).toBe(40);
      expect(report.checked).toBeGreaterThan(0);
      expect(report.bodies).toBeGreaterThan(40);
      // The injection oracle is vacuous unless the marker reached emitted code.
      expect(report.markerBodies).toBeGreaterThan(0);
    },
    240_000
  );

  const soakMs = Number(process.env.MION_FUZZ_SECGEN_SOAK_MS ?? 0);
  it.runIf(soakMs > 0)(
    'soak — keep scanning generated code and log every finding',
    async () => {
      const report = await runGeneratedCodeFuzzForDuration(soakMs, {seed: entrySeed('secgen')}, (v) => {
        console.error(`[secgen-fuzz][${v.oracle}] ${v.key} (${v.family}): ${v.message}`);
      });
      console.error(
        `[secgen-fuzz] soak finished: ${report.runs} types, ${report.checked} checked, ${report.bodies} bodies (${report.markerBodies} with the marker), ${report.violations.length} violation(s)`
      );
      expect(pathologyReport(report.slowestIterationMs, report.slowestIterationRound)).toBeNull();
      if (report.crashes.length > 0) throw new Error(renderCrashes(report.crashes));
      expect(report.violations).toHaveLength(0);
    },
    soakTestTimeout(soakMs)
  );
});
