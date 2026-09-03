// Pins the JSON decoders' array guard: a wire object such as `{"length": 1e9}`
// at an array position used to drive the restore loop a billion times (the
// loop bound was the value's own `.length`), exhausting the heap before
// validate ever ran. Every family that walks an array in place now checks
// `Array.isArray` first and leaves a non-array for the check to refuse.
//
// Found by the secjson fuzz lane (dictionary entry `array.length-object`);
// this is its seed-free repro.

import {describe, expect, it} from 'vitest';
import {createJsonDecoderFn, createParseFn, createValidateFn, RTParseError} from '@mionjs/run-types';

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
  const strip = createJsonDecoderFn<WithArrays>(undefined, {strategy: 'strip'});
  const preserve = createJsonDecoderFn<WithArrays>(undefined, {strategy: 'preserve'});
  const compact = createJsonDecoderFn<WithArrays>(undefined, {strategy: 'compact'});
  const parse = createParseFn<WithArrays>();
  const validate = createValidateFn<WithArrays>();

  for (const field of ['nums', 'dates', 'rest', 'lookup', 'bag'] as const) {
    it(`{"length": 1e9} at '${field}' returns or throws within milliseconds, and never validates`, () => {
      const text = bombAt(field);
      for (const decode of [strip, preserve]) {
        const started = performance.now();
        let value: unknown;
        let threw = false;
        try {
          value = decode(text);
        } catch {
          threw = true;
        }
        expect(performance.now() - started).toBeLessThan(200);
        if (!threw) expect(validate(value)).toBe(false);
      }
      const started = performance.now();
      expect(() => parse(JSON.parse(text))).toThrow(RTParseError);
      expect(performance.now() - started).toBeLessThan(200);
    });
  }

  it('the compact decoder is guarded too', () => {
    // The compact wire is positional; the bomb lands where the array slot is.
    const started = performance.now();
    let threw = false;
    let value: unknown;
    try {
      value = compact(`[${BOMB},[],["a"],[],[]]`);
    } catch {
      threw = true;
    }
    expect(performance.now() - started).toBeLessThan(200);
    if (!threw) expect(validate(value)).toBe(false);
  });

  it('real arrays still decode', () => {
    const wire = JSON.stringify({
      nums: [1, 2],
      dates: ['2024-01-01T00:00:00.000Z'],
      rest: ['a', 1, 2],
      lookup: [['k', '2024-01-01T00:00:00.000Z']],
      bag: ['5'],
    });
    const value = preserve(wire) as WithArrays;
    expect(value.nums).toEqual([1, 2]);
    expect(value.dates[0]).toBeInstanceOf(Date);
    expect(value.rest).toEqual(['a', 1, 2]);
    expect(value.lookup.get('k')).toBeInstanceOf(Date);
    expect(value.bag.has(5n)).toBe(true);
    expect(validate(value)).toBe(true);
  });
});
