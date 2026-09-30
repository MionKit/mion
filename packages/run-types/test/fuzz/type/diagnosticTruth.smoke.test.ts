// Seeds the diagnostics lane (D1–D3) once failed on, replayed exactly: a symbol-keyed index signature dropped with
// no note (1680075118), and call sites read off by a line (a non-ASCII name, 3063578975 with a U+2028 in a key).

import {describe, expect, it} from 'vitest';
import {hasBinary} from './typeFuzzHarness.ts';
import {replayTypeFuzzSeeds} from './typeFuzzRunner.ts';
import {NONDATA_GEN_OPTIONS} from '../core/typeGen.ts';

const PINNED_SEEDS = [1680075118, 3063578975, 1528970412, 4181522326];

describe('fuzz / diagnostics lane regressions', () => {
  (hasBinary() ? it : it.skip)(
    'every pinned seed passes every oracle',
    async () => {
      const violations = await replayTypeFuzzSeeds(PINNED_SEEDS, {gen: NONDATA_GEN_OPTIONS, valueSource: 'mock'});
      expect(violations.map((violation) => `[${violation.oracle}] ${violation.target}: ${violation.message}`)).toEqual([]);
    },
    120_000
  );
});
