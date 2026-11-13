// Seeded mock determinism fuzz: a random runtype mocked twice under one seed must be deep-equal, for every type.
// Calls `mockRunType` directly because createMockDataFn needs a plugin-injected id a runtime-built graph can't carry.
// The seeded path draws from its own PRNG, never the Math.random withSeededRandom swaps to replay the shape.

import {isDeepStrictEqual} from 'node:util';
import {mixSeed, withSeededRandom} from '../core/seededRng.ts';
import {randomRunType} from '../core/runTypeGen.ts';
import {mockRunType} from '../../../src/mocking/mockType.ts';
import {MockRandom} from '../../../src/mocking/mockRandom.ts';
import {defaultMockOptions} from '../../../src/mocking/constants.mock.ts';
import type {RunTypeMockOptions} from '../../../src/mocking/mockTypes.ts';
import type {RunType} from '../../../src/runtypes/types.ts';
// Side-effect: registers the per-kind format mock fns (uuid / number / bigint)
// so a runtype carrying a formatAnnotation resolves through the seeded path.
import '../../../src/formats/index.ts';

/** Generate a mock for `runType` exactly as createMockDataFn would seed it: a
 *  fresh `MockRandom(seed)` on the options bag (native when `seed` is
 *  undefined). Small collection / string caps keep generations fast. **/
export function generateMock(runType: RunType, seed: number | undefined): unknown {
  const random = seed === undefined ? undefined : new MockRandom(seed);
  const options: RunTypeMockOptions = {
    mock: {...defaultMockOptions, seed, random, maxRandomItemsLength: 6, maxRandomStringLength: 12},
  };
  return mockRunType(runType, options, []);
}

export interface SeedViolation {
  mockSeed: number;
  iterSeed: number;
  message: string;
}

/** The do-it-twice oracle: two same-seed generations of the SAME runtype must
 *  be deep-equal (a fresh MockRandom(seed) each time, mirroring createMockDataFn's
 *  per-invocation reset). Returns a violation or null. **/
export function checkSeedDeterminism(runType: RunType, mockSeed: number, iterSeed: number): SeedViolation | null {
  if (!isDeepStrictEqual(generateMock(runType, mockSeed), generateMock(runType, mockSeed))) {
    return {mockSeed, iterSeed, message: 'two same-seed generations produced different values'};
  }
  return null;
}

export interface MockSeedReport {
  runs: number;
  iterations: number;
  seed: number;
  violations: SeedViolation[];
}

/** Run `iterations` reproducible iterations; each builds a random runtype and a
 *  random seed, then checks the determinism oracle. Pure data-in / report-out
 *  (seed carried through) so a finding replays via `withSeededRandom(iterSeed)`. **/
export function runMockSeedFuzz(options: {seed?: number; iterations?: number} = {}): MockSeedReport {
  const seed = options.seed ?? 0x5eed1234;
  const iterations = options.iterations ?? 300;
  const violations: SeedViolation[] = [];
  let runs = 0;
  for (let i = 0; i < iterations; i++) {
    const iterSeed = mixSeed(seed, 'mock-seed-determinism', i);
    withSeededRandom(iterSeed, () => {
      runs++;
      const runType = randomRunType(0);
      const mockSeed = 1 + Math.floor(Math.random() * 1_000_000);
      const violation = checkSeedDeterminism(runType, mockSeed, iterSeed);
      if (violation) violations.push(violation);
    });
  }
  return {runs, iterations, seed, violations};
}
