// The FE convert roundtrip sweep — real binary, real temp project, the full
// generated type space, randomized form chains. See convertRoundtrip.ts for
// the oracles: per-leg id preservation (every declaration, every leg) and the
// byte-equal type-form fixpoint across two independently random chains.
// Replay a reported failure with RT_FUZZ_SEED; widen with RT_FUZZ_ITER.
import {describe, expect, it} from 'vitest';
import {entrySeed, parseSeed} from '../core/fuzzPolicy.ts';
import {hasBinary, runConvertFuzz} from './convertRoundtrip.ts';

const register = hasBinary() ? it : it.skip;

function iterations(fallback: number): number {
  return parseSeed(process.env.RT_FUZZ_ITER, fallback);
}

describe('convert roundtrip fuzz (CLI end to end)', () => {
  register('randomized form chains preserve every id and land on one canonical type form', {timeout: 900_000}, async () => {
    const report = await runConvertFuzz({
      seed: entrySeed('convertcli'),
      iterations: iterations(5),
    });
    expect(report.failures, report.failures.join('\n\n')).toEqual([]);
    // The reroll filter and the designed-refusal allowlist must stay
    // filters, not the generator: if most draws reroll or skip, the
    // convertible space has silently shrunk.
    expect(report.rerolls, 'reroll rate').toBeLessThan(report.iterations * 10);
    expect(report.expectedRefusals, 'expected-refusal rate').toBeLessThan(Math.max(2, report.iterations / 2));
  });
});
