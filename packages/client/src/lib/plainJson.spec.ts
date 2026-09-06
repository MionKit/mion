/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, it, expect} from 'vitest';
import {HeadersSubset} from '@mionjs/core';
import {survivesPlainJson} from './plainJson.ts';

// The gate of the optimistic first request: plain JSON.stringify is only the wire form when every
// value is a scalar, whatever strategy the route turns out to use.
describe('survivesPlainJson', () => {
  it('accepts scalars, null, undefined and arrays of them, nested', () => {
    expect(survivesPlainJson('a')).toBe(true);
    expect(survivesPlainJson(1)).toBe(true);
    expect(survivesPlainJson(true)).toBe(true);
    expect(survivesPlainJson(null)).toBe(true);
    expect(survivesPlainJson(undefined)).toBe(true);
    expect(survivesPlainJson([])).toBe(true);
    expect(survivesPlainJson(['a', 1, [true, null, ['x']]])).toBe(true);
  });

  it('refuses any object: plain, Date, Map, Set, class instance, and a bigint', () => {
    expect(survivesPlainJson({a: 1})).toBe(false);
    expect(survivesPlainJson([{a: 1}])).toBe(false);
    expect(survivesPlainJson(new Date())).toBe(false);
    expect(survivesPlainJson(new Map())).toBe(false);
    expect(survivesPlainJson(new Set())).toBe(false);
    expect(survivesPlainJson(new (class Pet {})())).toBe(false);
    expect(survivesPlainJson(10n)).toBe(false);
    expect(survivesPlainJson(['ok', 10n])).toBe(false);
  });

  it('ignores a HeadersSubset param: it travels as HTTP headers, never in the body', () => {
    expect(survivesPlainJson([new HeadersSubset({Authorization: 'x'})])).toBe(true);
  });
});
