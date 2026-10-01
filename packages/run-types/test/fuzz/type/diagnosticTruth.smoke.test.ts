// Replays seeds the diagnostics lane (D1–D3) failed on: a symbol-keyed index signature dropped unnoted (1680075118),
// call sites read a line off (a non-ASCII name; 3063578975, a U+2028 in a key), and a foreign throw of another kind
// left unreported (2357953336).

import {describe, expect, it} from 'vitest';
import {hasBinary} from './typeFuzzHarness.ts';
import {replayTypeFuzzSeeds} from './typeFuzzRunner.ts';
import {NONDATA_GEN_OPTIONS} from '../core/typeGen.ts';

const PINNED_SEEDS = [1680075118, 3063578975, 1528970412, 4181522326, 2357953336];

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
