// The Go generator table (GEN and BuiltinMockGenerators) must name exactly the TS built-ins, and a built-in draw built
// to fit a natural length must land on it.

import {describe, it, expect} from 'vitest';
import {GEN} from '@mionjs/run-types/formats';
import {BUILTIN_GENERATORS, BUILTIN_SHAPES} from '../../../src/mocking/generators/builtins.ts';
import {reachableLengths} from '../../../src/mocking/generators/compose.ts';
import {MockRandom} from '../../../src/mocking/mockRandom.ts';

const names = Object.keys(BUILTIN_SHAPES).sort();

describe('mock generator names', () => {
  it('GEN, the Go table and the built-ins name the same generators', () => {
    expect(Object.keys(GEN).sort()).toEqual(names);
    expect(Object.keys(BUILTIN_GENERATORS).sort()).toEqual(names);
    for (const name of names) expect((GEN as Record<string, string>)[name]).toBe(name);
  });

  for (const name of names) {
    const shapes = BUILTIN_SHAPES[name as keyof typeof BUILTIN_SHAPES];
    const lengths = [...new Set(shapes.flatMap((shape) => reachableLengths(shape)))].sort((left, right) => left - right);

    it(`${name}: draws at the shortest and longest natural length hit it`, () => {
      const random = new MockRandom(42);
      const generate = BUILTIN_GENERATORS[name as keyof typeof BUILTIN_GENERATORS];
      for (const length of [lengths[0], lengths[lengths.length - 1]]) {
        for (let i = 0; i < 200; i++) expect([...generate({random, lo: length, hi: length, params: {}})].length).toBe(length);
      }
      for (let i = 0; i < 200; i++) expect(lengths).toContain([...generate({random, params: {}})].length);
    });
  }
});
