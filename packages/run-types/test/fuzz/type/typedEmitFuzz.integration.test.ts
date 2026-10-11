// The emitMode 'ts' lane over generated types: strip parity (TE1), the same validate verdict as emitMode 'both' (TE2)
// and a strictest-tsconfig type check of every typed module (TE3). See typedEmitFuzz.ts. Needs the Go binary.
import {describe, expect, it} from 'vitest';
import {hasBinary} from './typeFuzzHarness.ts';
import {runTypedEmitFuzz} from './typedEmitFuzz.ts';
import {entrySeed} from '../core/fuzzPolicy.ts';
import {soakTestTimeout} from '../core/soakBudget.ts';
import {renderCrashes} from '../core/crashGuard.ts';

const soakMs = Number(process.env.MION_FUZZ_TYPEDEMIT_SOAK_MS ?? 0);

describe('fuzz / typed emit — emitMode ts against emitMode both', () => {
  const register = hasBinary() ? it : it.skip;

  register(
    'typed modules strip to emitMode both, answer the same and type-check strictly',
    async () => {
      const report = await runTypedEmitFuzz({
        seed: entrySeed('typedemit'),
        ...(soakMs > 0 ? {durationMs: soakMs} : {iterations: 30}),
      });
      const summary = report.violations
        .slice(0, 20)
        .map((v) => `  [${v.oracle}] ${v.target} (seed=${v.seed}): ${v.message}`)
        .join('\n');
      if (report.crashes.length > 0) throw new Error(renderCrashes(report.crashes));
      expect(
        report.violations,
        `${report.violations.length} violation(s) over ${report.runs} types (entry seed ${report.seed}):\n${summary}`
      ).toEqual([]);
      // Anti-vacuity: the loop turning proves nothing unless typed modules were compared and validators ran on values.
      expect(report.typedModules).toBeGreaterThan(report.runs);
      expect(report.verdictRuns).toBeGreaterThan(0);
    },
    soakMs > 0 ? soakTestTimeout(soakMs) : 300_000
  );
});
