// D4 end to end: the rule fires when the DataOnly side keeps a member the Go side strips, and the seeds it once
// failed on stay green. 360858409, 2649564061 and 3811392738 carried an optional non-data member DataOnly kept as
// `p?: undefined`.
import {describe, it, expect} from 'vitest';
import {openClient, compileType, hasBinary} from './typeFuzzHarness.ts';
import {dataOnlyViolations, replayTypeFuzzSeeds} from './typeFuzzRunner.ts';
import {NONDATA_GEN_OPTIONS, type GeneratedType} from '../core/typeGen.ts';

const PINNED_SEEDS = [360858409, 2649564061, 3811392738];

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

describe('D4 — DataOnly<T> agrees with the Go non-data decision', () => {
  (hasBinary() ? it : it.skip)(
    'fires when the DataOnly side strips nothing',
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

  (hasBinary() ? it : it.skip)(
    'replays the seeds D4 once failed on',
    async () => {
      const violations = await replayTypeFuzzSeeds(PINNED_SEEDS, {gen: NONDATA_GEN_OPTIONS, valueSource: 'mock'});
      expect(violations.map((violation) => `[${violation.oracle}] ${violation.message}`)).toEqual([]);
    },
    120_000
  );
});
