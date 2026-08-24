// Per-element mock options: `tupleOptions` steers each tuple slot, and
// `paramsOptions` is its alias. A function's `Parameters<typeof fn>` reflects as
// a tuple, so the same per-element indexing covers both a plain tuple and a
// function's argument tuple. Driven low-level over a hand-built tuple runtype
// (createMockDataFn needs a plugin-injected id; the walker takes a RunType
// directly), mirroring mockData.test.ts.

import {describe, it, expect} from 'vitest';
import {mockRunType} from '../../../src/mocking/mockType.ts';
import {MockRandom} from '../../../src/mocking/mockRandom.ts';
import {defaultMockOptions} from '../../../src/mocking/constants.mock.ts';
import type {MockOptions, RunTypeMockOptions} from '../../../src/mocking/mockTypes.ts';
import type {RunType} from '../../../src/runtypes/types.ts';
import {RunTypeKind} from '../../../src/go-generated/runTypeKind.generated.ts';

const K = RunTypeKind;

// A tuple [number, number] — two slots we can pin independently.
const numberTuple = {
  id: 'tup',
  kind: K.tuple,
  children: [
    {id: 'm0', kind: K.tupleMember, child: {id: 'c0', kind: K.number}},
    {id: 'm1', kind: K.tupleMember, child: {id: 'c1', kind: K.number}},
  ],
} as unknown as RunType;

// A full MockOptions pinning a number to exactly `n` (min === max).
const pin = (n: number): MockOptions => ({...defaultMockOptions, minNumber: n, maxNumber: n});

function mockTuple(perElem: {tupleOptions?: MockOptions[]; paramsOptions?: MockOptions[]}): unknown {
  const options: RunTypeMockOptions = {mock: {...defaultMockOptions, ...perElem}};
  return mockRunType(numberTuple, options, []);
}

describe('per-element mock options — tupleOptions and its paramsOptions alias', () => {
  it('tupleOptions pins each tuple slot', () => {
    expect(mockTuple({tupleOptions: [pin(5), pin(9)]})).toEqual([5, 9]);
  });

  it('paramsOptions is an alias — steers each slot identically', () => {
    expect(mockTuple({paramsOptions: [pin(5), pin(9)]})).toEqual([5, 9]);
  });

  it('tupleOptions and paramsOptions give the same result for the same per-element options', () => {
    expect(mockTuple({paramsOptions: [pin(3), pin(7)]})).toEqual(mockTuple({tupleOptions: [pin(3), pin(7)]}));
  });

  it('tupleOptions wins when both are set (explicit tuple options take precedence)', () => {
    expect(mockTuple({tupleOptions: [pin(1), pin(2)], paramsOptions: [pin(8), pin(8)]})).toEqual([1, 2]);
  });

  // The seed fix in mergeChildOptions: per-element options replace the mock bag,
  // so the seeded RNG must be carried over or the overridden slots go random.
  it('a seeded mock with per-element options stays deterministic', () => {
    const build = (): RunTypeMockOptions => ({
      mock: {
        ...defaultMockOptions,
        seed: 42,
        random: new MockRandom(42),
        // Full-range numbers per slot (not pinned), so only the seed makes them repeatable.
        paramsOptions: [{...defaultMockOptions}, {...defaultMockOptions}],
      },
    });
    expect(mockRunType(numberTuple, build(), [])).toEqual(mockRunType(numberTuple, build(), []));
  });
});
