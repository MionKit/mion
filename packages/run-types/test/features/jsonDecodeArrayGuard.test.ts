// Pins the JSON decoders' array guard: a wire object such as `{"length": 1e9}`
// at an array position used to drive the restore loop a billion times (the
// loop bound was the value's own `.length`), exhausting the heap before
// validate ever ran. Every family that walks an array in place now checks
// `Array.isArray` first and throws on a non-array (json_decode_errors.go in
// the emitter); an array whose elements need no rebuild has no loop at all,
// so the object reaches validate untouched and is refused there.
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

  // `nums` and the number tail of `rest` have no per-element rebuild, so no loop
  // and no throw: validate refuses the object. The other fields walk their
  // elements and throw at the guard.
  const expectations: Array<[keyof WithArrays, string | null]> = [
    ['nums', null],
    ['dates', 'Can not json decode array: expected an array'],
    ['rest', null],
    ['lookup', 'Can not json decode Map: expected an array of entries or a Map'],
    ['bag', 'Can not json decode Set: expected an array or a Set'],
  ];

  for (const [field, message] of expectations) {
    it(`{"length": 1e9} at '${field}' ${message ? 'throws' : 'is refused by validate'} within milliseconds`, () => {
      const text = bombAt(field);
      for (const decode of [strip, preserve]) {
        const started = performance.now();
        if (message === null) expect(validate(decode(text))).toBe(false);
        else expect(() => decode(text)).toThrow(message);
        expect(performance.now() - started).toBeLessThan(200);
      }
      const started = performance.now();
      expect(() => parse(JSON.parse(text))).toThrow(RTParseError);
      expect(performance.now() - started).toBeLessThan(200);
    });
  }

  it('the compact decoder is guarded too', () => {
    // The compact wire is positional; the bomb lands where the `dates` slot is.
    const started = performance.now();
    expect(() => compact(`[[],${BOMB},["a"],[],[]]`)).toThrow('Can not json decode array: expected an array');
    expect(performance.now() - started).toBeLessThan(200);
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
