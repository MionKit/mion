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
import {soakTestTimeout} from '../core/soakBudget.ts';

describe('fuzz / type-generation — oracle sweep over generated types', () => {
  const register = hasBinary() ? it : it.skip;

  register(
    'finds no oracle violations across a batch of generated types',
    async () => {
      const report = await runTypeFuzz({seed: 0xc0ffee, iterations: 100});
      if (report.violations.length > 0) {
        const summary = report.violations
          .slice(0, 25)
          .map((v) => `  [${v.oracle}/${v.phase}] ${v.target} (seed=${v.seed}): ${v.message}\n      ${v.value}`)
          .join('\n');
        throw new Error(
          `${report.violations.length} oracle violation(s) over ${report.runs} generated types:\n${summary}` +
            (report.violations.length > 25 ? `\n  …and ${report.violations.length - 25} more` : '')
        );
      }
      expect(report.runs).toBe(100);
    },
    120_000
  );

  // Autonomous soak: opt-in via RT_FUZZ_TYPES_SOAK_MS=<ms>.
  const soakMs = Number(process.env.RT_FUZZ_TYPES_SOAK_MS ?? 0);
  it.runIf(soakMs > 0)(
    'soak — generate types continuously and log all findings',
    async () => {
      const report = await runTypeFuzzForDuration(soakMs, {seed: Number(process.env.RT_FUZZ_SEED ?? 1)}, (v) => {
        console.error(`[type-fuzz][${v.oracle}/${v.phase}] ${v.target} (seed=${v.seed}): ${v.message}\n    ${v.value}`);
      });
      console.error(
        `[type-fuzz] soak finished: ${report.runs} types, ${report.violations.length} violation(s), ${report.skippedInvalidTypes} invalid-TS false positive(s) filtered`
      );
      expect(report.violations).toHaveLength(0);
    },
    soakTestTimeout(soakMs)
  );
});
