/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, it, expect} from 'vitest';
import {HeadersSubset} from '@mionjs/core';
import {survivesPlainJson} from './plainJson.ts';

// Whether the first call of a route can go out as plain JSON before its metadata is known: only values that read
// the same on every strategy the server may have compiled for the route.
describe('survivesPlainJson', () => {
  it('scalars, null, undefined and arrays of them do', () => {
    expect(survivesPlainJson([])).toBe(true);
    expect(survivesPlainJson(['a', 1, true, null, undefined])).toBe(true);
    expect(survivesPlainJson([[1, 2, ['three', [false]]]])).toBe(true);
  });

  it('a HeadersSubset does: it travels as HTTP headers, never in the body', () => {
    expect(survivesPlainJson([new HeadersSubset({Authorization: 'token'}), 'x'])).toBe(true);
  });

  it('a plain object does not: a compact route reads it as a positional array', () => {
    expect(survivesPlainJson([{name: 'john'}])).toBe(false);
    expect(survivesPlainJson([[{nested: true}]])).toBe(false);
  });

  it('a Date, a Map, a Set, a class instance and a bigint need the compiled encoder', () => {
    expect(survivesPlainJson([new Date()])).toBe(false);
    expect(survivesPlainJson([new Map([['a', 1]])])).toBe(false);
    expect(survivesPlainJson([new Set([1])])).toBe(false);
    class Pet {
      name = 'rex';
    }
    expect(survivesPlainJson([new Pet()])).toBe(false);
    expect(survivesPlainJson([10n])).toBe(false);
  });
});
