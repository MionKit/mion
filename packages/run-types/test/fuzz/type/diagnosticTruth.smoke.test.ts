// Replays seeds the diagnostics lane (D1–D4) failed on: a symbol-keyed index signature dropped unnoted (1680075118),
// call sites read a line off (a non-ASCII name; 3063578975, a U+2028 in a key), a foreign throw left unreported,
// of another kind (2357953336) or the same kind as an own throw (3823141169), and DataOnly keeping an optional
// non-data member (2649564061, 3811392738) or a whole all-optional type (360858409). An O12 false positive: the
// oracle's value copy flattened a DataView (3065189181), and a D4 one: a dropped member left in the mock faced
// DataOnly<T>'s number index signature (982099663), the same with a function-typed member (4151093482, 2456381542)
// and inside a Map value (339162220, 16959456).

import {describe, expect, it} from 'vitest';
import {openClient, compileType, hasBinary} from './typeFuzzHarness.ts';
import {dataOnlyViolations, replayTypeFuzzSeeds} from './typeFuzzRunner.ts';
import {NONDATA_GEN_OPTIONS, type GeneratedType} from '../core/typeGen.ts';

const PINNED_SEEDS = [
  1680075118, 3063578975, 1528970412, 4181522326, 2357953336, 360858409, 2649564061, 3811392738, 3065189181, 982099663,
  3823141169, 4151093482, 2456381542, 339162220, 16959456,
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

// Shrunk 2456381542: the function-typed p0 reflects as a method, so DataOnly drops it.
const functionBesideIndex: GeneratedType = {
  decls: [],
  root: {
    kind: 'object',
    props: [
      {name: 'p0', optional: false, readonly: false, method: false, shape: {kind: 'function', params: [], ret: {kind: 'date'}}},
    ],
    index: {kind: 'null'},
    indexKey: ['number'],
  },
};

// Shrunk 4151093482: `{p1: () => symbol; p2: bigint; [k: number | symbol]: string}`.
const functionBesideSymbolIndex: GeneratedType = {
  decls: [],
  root: {
    kind: 'object',
    props: [
      {name: 'p1', optional: false, readonly: false, method: false, shape: {kind: 'function', params: [], ret: {kind: 'symbol'}}},
      {name: 'p2', optional: false, readonly: false, method: false, shape: {kind: 'bigint'}},
    ],
    index: {kind: 'string'},
    indexKey: ['number', 'symbol'],
  },
};

const functionInMapValue: GeneratedType = {
  decls: [],
  root: {kind: 'map', key: {kind: 'string'}, value: functionBesideIndex.root},
};

describe('fuzz / diagnostics lane regressions', () => {
  (hasBinary() ? it : it.skip).each([
    ['a dropped member', droppedBesideIndex, {p2: /a/, 0: 'la', 1: 'lb'}],
    ['a function-typed member', functionBesideIndex, {p0: () => new Date(), 0: null, 1: null}],
    ['a function-typed member and a symbol key', functionBesideSymbolIndex, {p1: () => Symbol(), p2: 1n, 0: 'a'}],
    ['a function-typed member in a Map value', functionInMapValue, new Map([['k', {p0: () => new Date(), 0: null}]])],
  ])(
    'DataOnly<T> accepts what the serializer makes of a value carrying %s',
    async (_label, gen, value) => {
      const client = openClient();
      try {
        const compiled = await compileType(client, gen);
        const {validate, validateDataOnly, jsonEncode, jsonDecode} = compiled.wired;
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
