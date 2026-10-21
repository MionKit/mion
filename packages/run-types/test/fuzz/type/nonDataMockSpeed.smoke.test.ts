// This seed's nested Set / Map mock took ~8 s per call and broke the soak's slow-round ceiling.

import {describe, expect, it} from 'vitest';
import {hasBinary} from './typeFuzzHarness.ts';
import {replayTypeFuzzSeeds} from './typeFuzzRunner.ts';
import {NONDATA_GEN_OPTIONS} from '../core/typeGen.ts';

const SLOW_MOCK_SEED = 3635804914;

describe('fuzz / non-data lane, nested collection mock speed', () => {
  (hasBinary() ? it : it.skip)(
    'the pinned seed passes every oracle well inside the slow-round ceiling',
    async () => {
      const start = performance.now();
      const violations = await replayTypeFuzzSeeds([SLOW_MOCK_SEED], {gen: NONDATA_GEN_OPTIONS, valueSource: 'mock'});
      const elapsed = performance.now() - start;
      expect(violations.map((violation) => `[${violation.oracle}] ${violation.target}: ${violation.message}`)).toEqual([]);
      expect(elapsed).toBeLessThan(15_000);
    },
    120_000
  );
});
