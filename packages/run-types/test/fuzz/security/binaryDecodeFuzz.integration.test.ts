// secbinary: attack the binary decoder with mutated bytes (blind mutators +
// the vulnerability dictionary at every wire-map position), every decode in a
// heap-capped worker thread. Needs the Go binary and the built run-types dist
// (the worker loads it natively); skipped when the binary is missing.

import {describe, it, expect} from 'vitest';
import {hasBinary} from './securityHarness.ts';
import {runBinaryFuzz, runBinaryFuzzForDuration} from './binaryDecodeRunner.ts';
import {soakTestTimeout, pathologyReport} from '../core/soakBudget.ts';
import {entrySeed} from '../core/fuzzPolicy.ts';
import {renderCrashes} from '../core/crashGuard.ts';
import {renderViolations} from './securityOracle.ts';
import {renderCoverage} from './laneShared.ts';

describe('fuzz / security / binary decoder — hostile bytes never crash, hang, overrun or mis-decode', () => {
  const register = hasBinary() ? it : it.skip;

  register(
    'finds no oracle violations across a batch of generated types',
    async () => {
      const report = await runBinaryFuzz({seed: entrySeed('secbinary'), iterations: 20});
      if (report.violations.length > 0 || report.crashes.length > 0) {
        throw new Error(
          `${report.violations.length} oracle violation(s) + ${report.crashes.length} crash(es) over ${report.runs} generated types ` +
            `(${report.checked} checked, ${report.skipped} skipped, ${report.skippedInvalidTypes} invalid-TS filtered):\n` +
            renderViolations(report.violations) +
            (report.crashes.length > 0 ? `\n${renderCrashes(report.crashes)}` : '')
        );
      }
      expect(report.runs).toBe(20);
      expect(report.checked).toBeGreaterThan(0);
      // The dictionary must actually fire: the count bomb and the truncation
      // families are reachable on every wire with at least one length prefix.
      expect(report.applied['count.2^31']).toBeGreaterThan(0);
      expect(report.applied['blind.truncate']).toBeGreaterThan(0);
    },
    240_000
  );

  const soakMs = Number(process.env.MION_FUZZ_SECBINARY_SOAK_MS ?? 0);
  it.runIf(soakMs > 0)(
    'soak — keep attacking generated wires and log every finding',
    async () => {
      const report = await runBinaryFuzzForDuration(soakMs, {seed: entrySeed('secbinary')}, (v) => {
        console.error(
          `[secbinary-fuzz][${v.oracle}] ${v.target} · ${v.attack} (seed=0x${v.seed.toString(16)}): ${v.message}\n    ${v.input}`
        );
      });
      console.error(
        `[secbinary-fuzz] soak finished: ${report.runs} types, ${report.checked} checked, ${report.violations.length} violation(s), ` +
          `${report.crashes.length} crash(es); outcomes ${JSON.stringify(report.outcomes)}\n[secbinary-fuzz] coverage ${renderCoverage(report.applied)}`
      );
      expect(pathologyReport(report.slowestIterationMs, report.slowestIterationRound)).toBeNull();
      if (report.crashes.length > 0) throw new Error(renderCrashes(report.crashes));
      expect(report.violations).toHaveLength(0);
    },
    soakTestTimeout(soakMs)
  );
});
