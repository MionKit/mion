// Deterministic pin for the size lane's NEGATIVE CONTROL: the floor type's
// `respectBinarySize:false` mock must grow the cold buffer for EVERY seed, under
// EVERY size config. Before this pin the oversized generator inflated one string
// past its own per-position budget only, so a seed whose base value came in
// under budget elsewhere (an empty `items` array) never reached the estimate
// and the fuzz threw "the negative control lost its teeth" (CI seed 0xd179ff0b).
// Now the inflated position's reserve exceeds sizeMaxBytes, the cap every
// estimate stays under, so the overflow no longer depends on the seed.

import {describe, it, expect} from 'vitest';
import {createMockDataFn} from '@mionjs/run-types';
import type {BinarySizingOptions} from '../../../src/mocking/mockTypes.ts';
import {mixSeed, withSeededRandom} from '../core/seededRng.ts';
import {openClient, compileType, hasBinary, type CompiledType} from '../type/typeFuzzHarness.ts';
import {checkInBounds, checkOversized} from './sizeOracle.ts';
import {FLOOR_TYPE, SIZE_CONFIGS} from './sizeFuzzRunner.ts';

// The CI seed that first tripped the floor, a second under-budget seed found
// while replaying it, the lane's default seed, and a sweep of small ones.
const SEEDS = [0xd179ff0b, 8, 0xc0ffee, ...Array.from({length: 48}, (_, i) => i + 1)];

function mock(compiled: CompiledType, respectBinarySize: boolean, cfg: BinarySizingOptions): unknown {
  const fn = createMockDataFn(
    undefined,
    {mock: {respectBinarySize, binarySizingOptions: cfg}},
    compiled.reflectionTuple as never
  );
  return (fn as () => unknown)();
}

describe('binary size — the oversized negative control grows the cold buffer for every seed', () => {
  const register = hasBinary() ? it : it.skip;

  register.each(SIZE_CONFIGS.map((cfg, i) => [i, cfg] as const))('config %i', async (_i, cfg) => {
    const client = openClient(cfg);
    try {
      const compiled = await compileType(client, FLOOR_TYPE);
      expect(compiled.resolverError, 'resolver').toBeUndefined();
      expect(compiled.errorDiagnostics).toEqual([]);
      expect(compiled.seed, 'estimate').toBeDefined();
      expect(compiled.seed! < cfg.sizeMaxBytes, 'the floor estimate stays under the cap').toBe(true);
      for (const seed of SEEDS) {
        const ctx = {seed};
        const inBounds = withSeededRandom(mixSeed(seed, 'floor-value', 0), () => mock(compiled, true, cfg));
        expect(checkInBounds(compiled, inBounds, ctx), `seed ${seed.toString(16)}: in-bounds`).toEqual([]);
        const oversized = withSeededRandom(mixSeed(seed, 'floor-over', 0), () => mock(compiled, false, cfg));
        const neg = checkOversized(compiled, oversized, ctx);
        expect(neg.violation, `seed ${seed.toString(16)}: oversized round-trip`).toBeNull();
        expect(neg.exercised, `seed ${seed.toString(16)}: the oversized value must grow the cold buffer`).toBe(true);
      }
    } finally {
      client.close();
    }
  });
});
