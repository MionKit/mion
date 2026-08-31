// Determinism fuzz for seeded mock data: over hundreds of random runtypes, a
// seeded generation must be repeatable (see mockSeedFuzz.ts for the oracle).
// Pure TS over hand-built runtype graphs driven through the walker, so it runs
// in the fuzz UNIT lane (no Go binary).

import {describe, it, expect} from 'vitest';
import {isDeepStrictEqual} from 'node:util';
import {runMockSeedFuzz, generateMock} from './mockSeedFuzz.ts';
import type {RunType} from '../../../src/runtypes/types.ts';
import {RunTypeKind, RunTypeSubKind} from '../../../src/go-generated/runTypeKind.generated.ts';

const K = RunTypeKind;

// A high-entropy runtype (uuid + string + number + Date) — two different seeds
// are astronomically unlikely to collide, so it's a reliable negative control.
const highEntropy = {
  id: 'neg-root',
  kind: K.objectLiteral,
  children: [
    {
      id: 'p-id',
      kind: K.propertySignature,
      name: 'id',
      child: {id: 'c-id', kind: K.string, formatAnnotation: {name: 'uuid', params: {version: '4'}}},
    },
    {id: 'p-name', kind: K.propertySignature, name: 'name', child: {id: 'c-name', kind: K.string}},
    {id: 'p-n', kind: K.propertySignature, name: 'n', child: {id: 'c-n', kind: K.number}},
    {id: 'p-when', kind: K.propertySignature, name: 'when', child: {id: 'c-when', kind: K.class, subKind: RunTypeSubKind.date}},
  ],
} as unknown as RunType;

describe('seeded mock data — determinism fuzz (do-it-twice over random runtypes)', () => {
  it('same seed ⇒ deep-equal mock for every generated runtype', () => {
    const report = runMockSeedFuzz({seed: 0x5eed1234, iterations: 400});
    if (report.violations.length > 0) {
      const v = report.violations[0];
      throw new Error(
        `${report.violations.length} determinism violation(s) over ${report.runs} runs. First: ${v.message} ` +
          `(mockSeed ${v.mockSeed}, replay withSeededRandom(${v.iterSeed})).`
      );
    }
    expect(report.violations).toEqual([]);
    expect(report.runs).toBe(400);
  });

  // Negative control: the oracle's deep-equal detector MUST fire on genuinely
  // different mocks, or a real determinism regression could slip past unseen.
  it('negative control — the determinism check distinguishes different values', () => {
    // Different seeds on a high-entropy type ⇒ different values.
    expect(isDeepStrictEqual(generateMock(highEntropy, 1), generateMock(highEntropy, 2))).toBe(false);
    // Seeded vs no-seed ⇒ different values — the exact failure the oracle guards.
    expect(isDeepStrictEqual(generateMock(highEntropy, 1), generateMock(highEntropy, undefined))).toBe(false);
  });
});
