// Replays seeds the diagnostics lane (D1–D4) failed on: a symbol-keyed index signature dropped unnoted (1680075118),
// call sites read a line off (a non-ASCII name; 3063578975, a U+2028 in a key), a foreign throw of another kind left
// unreported (2357953336), and DataOnly keeping an optional non-data member (2649564061, 3811392738) or a whole
// all-optional type (360858409).

import {describe, expect, it} from 'vitest';
import {openClient, compileType, hasBinary} from './typeFuzzHarness.ts';
import {dataOnlyViolations, replayTypeFuzzSeeds} from './typeFuzzRunner.ts';
import {NONDATA_GEN_OPTIONS, type GeneratedType} from '../core/typeGen.ts';

const PINNED_SEEDS = [1680075118, 3063578975, 1528970412, 4181522326, 2357953336, 360858409, 2649564061, 3811392738];

const withSymbol: GeneratedType = {
  decls: [],
  root: {
    kind: 'object',
    props: [
      {name: 'a', optional: false, readonly: false, method: false, shape: {kind: 'string'}},
      {name: 's', optional: false, readonly: false, method: false, shape: {kind: 'symbol'}},
    ],
  },
};

describe('fuzz / diagnostics lane regressions', () => {
  (hasBinary() ? it : it.skip)(
    'every pinned seed passes every oracle',
    async () => {
      const violations = await replayTypeFuzzSeeds(PINNED_SEEDS, {gen: NONDATA_GEN_OPTIONS, valueSource: 'mock'});
      expect(violations.map((violation) => `[${violation.oracle}] ${violation.target}: ${violation.message}`)).toEqual([]);
    },
    120_000
  );

  (hasBinary() ? it : it.skip)(
    'D4 fires when the DataOnly side strips nothing',
    async () => {
      const client = openClient();
      try {
        const shipped = await compileType(client, withSymbol);
        expect(dataOnlyViolations(shipped, 1)).toEqual([]);
        const noStrip = await compileType(client, withSymbol, {name: 'NoStrip', decl: 'type NoStrip<X> = X;'});
        const violations = dataOnlyViolations(noStrip, 1);
        expect(violations.map((violation) => violation.oracle)).toContain('D4');
        expect(violations.map((violation) => violation.message).join('\n')).toContain('$.s is kept by DataOnly<T>');
      } finally {
        client.close();
      }
    },
    60_000
  );
});
