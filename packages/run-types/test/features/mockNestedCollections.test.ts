// Nested Sets / Maps / records once drew up to 60 items at every level, so one mock held about a million leaves.

import {describe, expect, it} from 'vitest';
import {createValidateFn} from '@mionjs/run-types';
import {createMockDataFn} from '@mionjs/run-types/mocking';

type SetOfMaps = Set<Map<string, Record<string, string>>>;
type RecordOfSetOfMaps = Record<string, Set<Map<string, Record<string, string>>>>;

const SAMPLES = 20;

/** Leaves (non-container values) inside a mocked value. **/
function countLeaves(value: unknown): number {
  if (value instanceof Set) return [...value].reduce((sum: number, item) => sum + countLeaves(item), 0);
  if (value instanceof Map) return [...value].reduce((sum: number, [key, item]) => sum + countLeaves(key) + countLeaves(item), 0);
  if (Array.isArray(value)) return value.reduce((sum: number, item) => sum + countLeaves(item), 0);
  if (value && typeof value === 'object') return Object.values(value).reduce((sum: number, item) => sum + countLeaves(item), 0);
  return 1;
}

/** Mean ms per mock and the largest leaf count over SAMPLES seeded draws, every draw validated. **/
function measure<T>(mock: (options?: {mock?: {seed?: number}}) => T, validate: (value: T) => boolean) {
  let maxLeaves = 0;
  const start = performance.now();
  for (let seed = 1; seed <= SAMPLES; seed++) {
    const value = mock({mock: {seed}});
    expect(validate(value)).toBe(true);
    maxLeaves = Math.max(maxLeaves, countLeaves(value));
  }
  return {meanMs: (performance.now() - start) / SAMPLES, maxLeaves};
}

describe('mocking nested collections stays small and fast', () => {
  it('Set<Map<string, Record<string, string>>> mocks in well under 100 ms', () => {
    const {meanMs, maxLeaves} = measure(createMockDataFn<SetOfMaps>(), createValidateFn<SetOfMaps>());
    expect(maxLeaves).toBeLessThan(5_000);
    expect(meanMs).toBeLessThan(100);
  });

  it('Record<string, Set<Map<string, Record<string, string>>>> mocks in well under 100 ms', () => {
    const {meanMs, maxLeaves} = measure(createMockDataFn<RecordOfSetOfMaps>(), createValidateFn<RecordOfSetOfMaps>());
    expect(maxLeaves).toBeLessThan(5_000);
    expect(meanMs).toBeLessThan(100);
  });

  it('an explicit arrayLength still sets every level', () => {
    const mock = createMockDataFn<string[][]>();
    const value = mock({mock: {arrayLength: 3, seed: 7}});
    expect(value).toHaveLength(3);
    for (const inner of value) expect(inner).toHaveLength(3);
  });

  it('stays deterministic under a seed', () => {
    const mock = createMockDataFn<SetOfMaps>();
    const toJson = (value: SetOfMaps) => JSON.stringify([...value].map((map) => [...map]));
    expect(toJson(mock({mock: {seed: 42}}))).toBe(toJson(mock({mock: {seed: 42}})));
  });
});
