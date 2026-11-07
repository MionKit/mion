// Pins the JSON decoders' array guard: a wire object such as `{"length": 1e9}`
// at an array position used to drive the restore loop a billion times (the
// loop bound was the value's own `.length`), exhausting the heap before
// validate ever ran. Every family that walks an array in place now checks
// `Array.isArray` first and leaves a non-array for the check to refuse.
//
// Found by the secjson fuzz lane (dictionary entry `array.length-object`);
// this is its seed-free repro.

import {describe, expect, it} from 'vitest';
import {createJsonDecoderFn, createValidateFn} from '@mionjs/run-types';

interface WithArrays {
  nums: number[];
  dates: Date[];
  rest: [string, ...number[]];
  lookup: Map<string, Date>;
  bag: Set<bigint>;
}

const BOMB = '{"length":1000000000}';

function bombAt(field: keyof WithArrays): string {
  const wire: Record<string, unknown> = {
    nums: [1],
    dates: ['2024-01-01T00:00:00.000Z'],
    rest: ['a', 1],
    lookup: [['k', '2024-01-01T00:00:00.000Z']],
    bag: ['1'],
  };
  return JSON.stringify(wire).replace(JSON.stringify(wire[field]), BOMB);
}

describe('JSON decoders never loop over a non-array length', () => {
  const clone = createJsonDecoderFn<WithArrays>(undefined, {strategy: 'clone'});
  const mutate = createJsonDecoderFn<WithArrays>(undefined, {strategy: 'mutate'});
  const compact = createJsonDecoderFn<WithArrays>(undefined, {strategy: 'compact'});
  const validate = createValidateFn<WithArrays>();

  // A restore loop over the bomb would hang or fill the heap.
  for (const field of ['nums', 'dates', 'rest', 'lookup', 'bag'] as const) {
    it(`{"length": 1e9} at '${field}' is left as it is, and never validates`, () => {
      const text = bombAt(field);
      for (const decode of [clone, mutate]) {
        const value = decode(text) as Record<string, unknown>;
        expect(value[field]).toStrictEqual({length: 1e9});
        expect(validate(value)).toBe(false);
      }
    });
  }

  it('the compact decoder is guarded too', () => {
    // The compact wire is positional; the bomb lands where the array slot is.
    const value = compact(`[${BOMB},[],["a"],[],[]]`) as Record<string, unknown>;
    expect(value.nums).toStrictEqual({length: 1e9});
    expect(validate(value)).toBe(false);
  });

  it('real arrays still decode', () => {
    const wire = JSON.stringify({
      nums: [1, 2],
      dates: ['2024-01-01T00:00:00.000Z'],
      rest: ['a', 1, 2],
      lookup: [['k', '2024-01-01T00:00:00.000Z']],
      bag: ['5'],
    });
    const value = mutate(wire) as WithArrays;
    expect(value.nums).toEqual([1, 2]);
    expect(value.dates[0]).toBeInstanceOf(Date);
    expect(value.rest).toEqual(['a', 1, 2]);
    expect(value.lookup.get('k')).toBeInstanceOf(Date);
    expect(value.bag.has(5n)).toBe(true);
    expect(validate(value)).toBe(true);
  });
});
