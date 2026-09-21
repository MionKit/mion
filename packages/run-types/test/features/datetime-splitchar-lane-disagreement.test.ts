// Regression for the dateTime splitChar validate/verr disagreement.
//
// The invariant: createValidateFn<T>() and createGetValidationErrorsFn<T>() must
// ALWAYS agree — for every value v, `validate(v) === (getValidationErrors(v).length === 0)`
// (fuzz oracle O4). It broke for the string `dateTime` format: the validate lane
// located the date/time separator case-insensitively (`.search(/[Tt]/)`, because
// RFC 3339 allows `1963-06-19t08:30:06z`), while the error lane used a plain
// `.indexOf('T')`. So a lowercase separator passed `validate` and still drew a
// `splitChar` error from `getValidationErrors`.
//
// Drives the full vite-plugin pipeline, complementing the Go emitter test in
// internal/cachegen/typefunctions/formats/datetime/splitsearch_test.go.

import {describe, test, expect} from 'vitest';
import {createValidateFn, createGetValidationErrorsFn} from '@mionjs/run-types';
import * as TF from '@mionjs/run-types/formats';
import '@mionjs/run-types/formats';

describe('dateTime splitChar — validate and getValidationErrors agree (O4)', () => {
  test('a lowercase `t` separator is the minimal disagreement repro', () => {
    const validate = createValidateFn<TF.StringDateTime>();
    const errors = createGetValidationErrorsFn<TF.StringDateTime>();
    // RFC 3339 §5.6 NOTE: lower case is permitted for both the separator and `Z`.
    const value = '1963-06-19t08:30:06z';
    expect(validate(value)).toBe(true);
    // Before the fix: one {formatPath: ['splitChar']} error while validate said true.
    expect(errors(value)).toEqual([]);
  });

  test('the separator search stays exact for a splitChar with no case', () => {
    type Spaced = TF.StringDateTime<{date: {format: 'DD-MM-YYYY'}; time: {format: 'HH:mm'}; splitChar: ' '}>;
    const validate = createValidateFn<Spaced>();
    const errors = createGetValidationErrorsFn<Spaced>();
    expect(validate('29-02-2024 23:59')).toBe(true);
    expect(errors('29-02-2024 23:59')).toEqual([]);
    // A `T` where a space is required still trips splitChar in BOTH lanes.
    expect(validate('29-02-2024T23:59')).toBe(false);
    expect(errors('29-02-2024T23:59')).toEqual([
      {expected: 'string', path: [], format: {name: 'dateTime', formatPath: ['splitChar'], val: ' '}},
    ]);
  });

  test('a bound splits the value the same way, so a lowercase separator still compares', () => {
    // The min/max key splits the value too. It kept its own case-sensitive
    // search, so a bounded dateTime rejected the lowercase form in BOTH lanes.
    type Bounded = TF.StringDateTime<{min: '1963-01-01T00:00:00'; max: '1963-12-31T23:59:59'}>;
    const validate = createValidateFn<Bounded>();
    const errors = createGetValidationErrorsFn<Bounded>();
    expect(validate('1963-06-19t08:30:06z')).toBe(true);
    expect(errors('1963-06-19t08:30:06z')).toEqual([]);
    // A lowercase separator outside the window still trips the bound, not the split char.
    expect(validate('1964-06-19t08:30:06z')).toBe(false);
    expect(errors('1964-06-19t08:30:06z')).toEqual([
      {expected: 'string', path: [], format: {name: 'dateTime', formatPath: ['max'], val: '1963-12-31T23:59:59'}},
    ]);
  });

  test('a bound literal written with a lowercase separator is accepted', () => {
    type LowerBound = TF.StringDateTime<{min: '1963-01-01t00:00:00'}>;
    const validate = createValidateFn<LowerBound>();
    const errors = createGetValidationErrorsFn<LowerBound>();
    expect(validate('1963-06-19T08:30:06Z')).toBe(true);
    expect(errors('1963-06-19T08:30:06Z')).toEqual([]);
    expect(validate('1962-06-19T08:30:06Z')).toBe(false);
  });

  test('both lanes agree over the whole separator battery', () => {
    const validate = createValidateFn<TF.StringDateTime>();
    const errors = createGetValidationErrorsFn<TF.StringDateTime>();
    const values = [
      '2024-02-29T12:30:45Z',
      '2024-02-29t12:30:45Z',
      '1963-06-19t08:30:06z',
      '1963-06-19T08:30:06z',
      '2024-02-29 12:30:45Z',
      '2023-02-29T12:30:45Z',
      '2024-02-29T25:30:45Z',
      'not-a-datetime',
    ];
    for (const value of values) {
      const ok = validate(value);
      const errs = errors(value);
      expect(ok, `O4: validate=${ok} but getValidationErrors returned ${errs.length} error(s) for ${value}`).toBe(
        errs.length === 0
      );
    }
  });
});
