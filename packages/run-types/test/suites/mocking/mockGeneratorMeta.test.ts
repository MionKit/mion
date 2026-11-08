// The Go generator table (mockGeneratorMeta.generated.ts) must match the lengths, chars and names the TS shapes give.

import {describe, it, expect} from 'vitest';
import {GEN} from '@mionjs/run-types/formats';
import {mockGeneratorMeta} from '../../../src/go-generated/mockGeneratorMeta.generated.ts';
import {BUILTIN_GENERATORS, BUILTIN_SHAPES} from '../../../src/mocking/generators/builtins.ts';
import {reachableLengths, shapeChars} from '../../../src/mocking/generators/compose.ts';
import {MockRandom} from '../../../src/mocking/mockRandom.ts';

function spansOf(lengths: Iterable<number>): [number, number][] {
  const spans: [number, number][] = [];
  for (const length of [...new Set(lengths)].sort((left, right) => left - right)) {
    const last = spans[spans.length - 1];
    if (last && length === last[1] + 1) last[1] = length;
    else spans.push([length, length]);
  }
  return spans;
}

const names = Object.keys(BUILTIN_SHAPES).sort();

describe('mock generator table', () => {
  it('GEN, the Go table and the built-ins name the same generators', () => {
    expect(Object.keys(GEN).sort()).toEqual(names);
    expect(Object.keys(mockGeneratorMeta).sort()).toEqual(names);
    expect(Object.keys(BUILTIN_GENERATORS).sort()).toEqual(names);
    for (const name of names) expect((GEN as Record<string, string>)[name]).toBe(name);
  });

  for (const name of names) {
    const shapes = BUILTIN_SHAPES[name as keyof typeof BUILTIN_SHAPES];
    const meta = mockGeneratorMeta[name as keyof typeof mockGeneratorMeta];

    it(`${name}: lengths and characters match the data`, () => {
      expect(meta.lengths).toEqual(spansOf(shapes.flatMap((shape) => reachableLengths(shape))));
      const {chars, required, leading} = shapeChars(shapes);
      expect(meta.chars).toBe(chars);
      expect(meta.required).toBe(required);
      expect(meta.leading).toBe(leading);
    });

    it(`${name}: draws stay inside the table, at every span edge too`, () => {
      const random = new MockRandom(42);
      const generate = BUILTIN_GENERATORS[name as keyof typeof BUILTIN_GENERATORS];
      const bounds: [number | undefined, number | undefined][] = [[undefined, undefined]];
      for (const [min, max] of meta.lengths) bounds.push([min, min], [max, max]);
      for (const [lo, hi] of bounds) {
        for (let i = 0; i < 200; i++) {
          const value = generate({random, lo, hi, params: {}});
          const size = [...value].length;
          if (lo !== undefined) expect(size).toBeGreaterThanOrEqual(lo);
          if (hi !== undefined) expect(size).toBeLessThanOrEqual(hi);
          expect(meta.lengths.some(([min, max]) => size >= min && size <= max)).toBe(true);
          for (const char of value) expect(meta.chars).toContain(char);
          for (const char of meta.required) expect(value).toContain(char);
          expect(meta.leading).toContain(value.charAt(0));
        }
      }
    });
  }
});
