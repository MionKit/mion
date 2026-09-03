// secjson: attack the three JSON decoders and `parse` with the vulnerability
// dictionary at every position of the parsed wire (plus blind junk
// mutations). Needs the Go binary; skipped when it is missing.

import {describe, it, expect} from 'vitest';
import {hasBinary} from './securityHarness.ts';
import {runJsonFuzz, runJsonFuzzForDuration} from './jsonDecodeRunner.ts';
import {soakTestTimeout, pathologyReport} from '../core/soakBudget.ts';
import {entrySeed} from '../core/fuzzPolicy.ts';
import {renderCrashes} from '../core/crashGuard.ts';
import {renderViolations} from './securityOracle.ts';
import {renderCoverage} from './laneShared.ts';

describe('fuzz / security / JSON decoders — hostile trees never pollute, hang, or slip past parse', () => {
  const register = hasBinary() ? it : it.skip;

  register(
    'finds no oracle violations across a batch of generated types',
    async () => {
      const report = await runJsonFuzz({seed: entrySeed('secjson'), iterations: 40});
      if (report.violations.length > 0 || report.crashes.length > 0) {
        throw new Error(
          `${report.violations.length} oracle violation(s) + ${report.crashes.length} crash(es) over ${report.runs} generated types ` +
            `(${report.checked} checked, ${report.skipped} skipped, ${report.skippedInvalidTypes} invalid-TS filtered):\n` +
            renderViolations(report.violations) +
            (report.crashes.length > 0 ? `\n${renderCrashes(report.crashes)}` : '')
        );
      }
      expect(report.runs).toBe(40);
      expect(report.checked).toBeGreaterThan(0);
      // The prototype attacks and the wrong-type matrix must have fired.
      expect(
        Object.keys(report.applied).some((id) => id.startsWith('object.proto-key') || id.startsWith('record.proto-key'))
      ).toBe(true);
      expect(Object.keys(report.applied).some((id) => id.startsWith('wrong-type.'))).toBe(true);
    },
    240_000
  );

  const soakMs = Number(process.env.MION_FUZZ_SECJSON_SOAK_MS ?? 0);
  it.runIf(soakMs > 0)(
    'soak — keep attacking generated JSON wires and log every finding',
    async () => {
      const report = await runJsonFuzzForDuration(soakMs, {seed: entrySeed('secjson')}, (v) => {
        console.error(
          `[secjson-fuzz][${v.oracle}] ${v.target} · ${v.attack} (seed=0x${v.seed.toString(16)}): ${v.message}\n    ${v.input}`
        );
      });
      console.error(
        `[secjson-fuzz] soak finished: ${report.runs} types, ${report.checked} checked, ${report.violations.length} violation(s); ` +
          `decoder throws ${JSON.stringify(report.outcomes)}\n[secjson-fuzz] coverage ${renderCoverage(report.applied)}`
      );
      expect(pathologyReport(report.slowestIterationMs, report.slowestIterationRound)).toBeNull();
      if (report.crashes.length > 0) throw new Error(renderCrashes(report.crashes));
      expect(report.violations).toHaveLength(0);
    },
    soakTestTimeout(soakMs)
  );
});
