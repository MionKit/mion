// sechttp: hostile requests through the mion router in process, plus raw HTTP
// against the node adapter. Every response must be a well-formed envelope, never
// a 5xx, never carry engine text, and the router must keep answering.

import {describe, it, expect} from 'vitest';
import {runHttpFuzz, runHttpFuzzForDuration, runSocketAttacks, renderHttpViolations} from './httpFuzzRunner.ts';
import {soakTestTimeout, pathologyReport} from '../../../../run-types/test/fuzz/core/soakBudget.ts';
import {entrySeed} from '../../../../run-types/test/fuzz/core/fuzzPolicy.ts';
import {renderCrashes} from '../../../../run-types/test/fuzz/core/crashGuard.ts';

describe('fuzz / security / http — hostile requests never crash, hang, leak or 5xx', () => {
  it('finds no oracle violations across a batch of attacks in process', async () => {
    const report = await runHttpFuzz({seed: entrySeed('sechttp'), iterations: 60});
    if (report.violations.length > 0 || report.crashes.length > 0) {
      throw new Error(
        `${report.violations.length} oracle violation(s) + ${report.crashes.length} crash(es) over ${report.runs} attacks ` +
          `(statuses ${JSON.stringify(report.statuses)}):\n` +
          renderHttpViolations(report.violations) +
          (report.crashes.length > 0 ? `\n${renderCrashes(report.crashes)}` : '')
      );
    }
    expect(report.runs).toBe(60);
    // every attack family fired
    const families = new Set(Object.keys(report.applied).map((id) => id.split('.')[0]));
    expect([...families].sort()).toEqual(['bin', 'flow', 'headers', 'json', 'path', 'query', 'text']);
  }, 240_000);

  it('the node adapter answers every raw-socket attack with a typed response and keeps serving', async () => {
    const report = await runSocketAttacks(entrySeed('sechttp'));
    try {
      if (report.violations.length > 0)
        throw new Error(`${report.violations.length} violation(s):\n${renderHttpViolations(report.violations)}`);
      expect(Object.keys(report.applied).length).toBeGreaterThan(10);
    } finally {
      await report.close();
    }
  }, 120_000);

  const soakMs = Number(process.env.MION_FUZZ_SECHTTP_SOAK_MS ?? 0);
  it.runIf(soakMs > 0)(
    'soak — keep attacking the router and log every finding',
    async () => {
      const report = await runHttpFuzzForDuration(soakMs, {seed: entrySeed('sechttp')}, (v) => {
        console.error(`[sechttp-fuzz][${v.oracle}] ${v.attack} (seed=0x${v.seed.toString(16)}): ${v.message}\n    ${v.input}`);
      });
      console.error(
        `[sechttp-fuzz] soak finished: ${report.runs} attacks, ${report.violations.length} violation(s); ` +
          `statuses ${JSON.stringify(report.statuses)}; applied ${JSON.stringify(report.applied)}`
      );
      expect(pathologyReport(report.slowestIterationMs, report.slowestIterationRound)).toBeNull();
      if (report.crashes.length > 0) throw new Error(renderCrashes(report.crashes));
      expect(report.violations).toHaveLength(0);
    },
    soakTestTimeout(soakMs)
  );
});
