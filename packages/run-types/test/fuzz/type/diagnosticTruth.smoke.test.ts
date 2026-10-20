// Replays seeds the diagnostics lane (D1–D4) failed on: a symbol-keyed index signature dropped unnoted (1680075118),
// call sites read a line off (a non-ASCII name; 3063578975, a U+2028 in a key), a foreign throw of another kind left
// unreported (2357953336) or of the same kind as an own throw (3823141169), and DataOnly keeping an optional non-data member (2649564061, 3811392738) or a whole
// all-optional type (360858409). Also an O12 false positive: the oracle's value copy flattened a DataView (3065189181),
// and a D4 one: a dropped member left in the mock faced DataOnly<T>'s number index signature (982099663).

import {describe, expect, it} from 'vitest';
import {openClient, compileType, hasBinary} from './typeFuzzHarness.ts';
import {dataOnlyViolations, replayTypeFuzzSeeds} from './typeFuzzRunner.ts';
import {NONDATA_GEN_OPTIONS, type GeneratedType} from '../core/typeGen.ts';

const PINNED_SEEDS = [
  1680075118, 3063578975, 1528970412, 4181522326, 2357953336, 360858409, 2649564061, 3811392738, 3065189181, 982099663,
  3823141169,
];

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

// Shrunk 982099663: `{p2?: RegExp; [k: number]: "la" | "lb"}`. DataOnly drops p2; the index signature claims every key.
const droppedBesideIndex: GeneratedType = {
  decls: [],
  root: {
    kind: 'object',
    props: [{name: 'p2', optional: true, readonly: false, method: false, shape: {kind: 'regexp'}}],
    index: {
      kind: 'union',
      members: [
        {kind: 'literal', value: 'la'},
        {kind: 'literal', value: 'lb'},
      ],
    },
    indexKey: ['number'],
  },
};

describe('fuzz / diagnostics lane regressions', () => {
  (hasBinary() ? it : it.skip)(
    'DataOnly<T> accepts what the serializer makes of a value carrying a dropped member',
    async () => {
      const client = openClient();
      try {
        const compiled = await compileType(client, droppedBesideIndex);
        const {validate, validateDataOnly, jsonEncode, jsonDecode} = compiled.wired;
        const value = {p2: /a/, 0: 'la', 1: 'lb'};
        expect(validate!(value)).toBe(true);
        expect(validateDataOnly!(value)).toBe(false);
        expect(validateDataOnly!(jsonDecode!(jsonEncode!(value)!))).toBe(true);
        expect(dataOnlyViolations(compiled, 1, {value, hasValue: true})).toEqual([]);
      } finally {
        client.close();
      }
    },
    60_000
  );

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
