// Temporal format family runtime spec — TFT.X<{min,max}> bound
// constraints. Validates that the emitted `Temporal.X.compare(v, bound)`
// checks accept in-range values and reject out-of-range ones, for both
// absolute Temporal-string bounds and relative `now±P` bounds.
//
// Relative bounds use wide margins (now±P1000Y / now±PT1000000H) so the
// boolean assertions hold regardless of the wall clock — no fake timers.
//
// Temporal is the polyfill global (test/support/setup.ts); types resolve via the
// ambient test/support/temporal-ambient.d.ts + the
// ts-runtypes/formats/temporal subpath.

import type * as TFT from '@ts-runtypes/core/formats/temporal';
import {describe, expect, it} from 'vitest';
import {createValidateFn, createGetValidationErrorsFn, createMockDataFn} from '@ts-runtypes/core';

const T = (globalThis as {Temporal: typeof Temporal}).Temporal;

describe('TFT.PlainDate — absolute min/max', () => {
  it('accepts in-range, rejects out-of-range, rejects non-PlainDate', () => {
    const validate = createValidateFn<TFT.PlainDate<{min: '2020-01-01'; max: '2020-12-31'}>>();
    expect(validate(T.PlainDate.from('2020-01-01'))).toBe(true);
    expect(validate(T.PlainDate.from('2020-06-15'))).toBe(true);
    expect(validate(T.PlainDate.from('2020-12-31'))).toBe(true);
    expect(validate(T.PlainDate.from('2019-12-31'))).toBe(false);
    expect(validate(T.PlainDate.from('2021-01-01'))).toBe(false);
    // base instanceof rejects a non-PlainDate WITHOUT throwing on compare
    expect(validate(T.Instant.from('2020-06-15T00:00:00Z'))).toBe(false);
    expect(validate('2020-06-15')).toBe(false);
  });

  it('getValidationErrors reports the failing bound via formatPath', () => {
    const getErrors = createGetValidationErrorsFn<TFT.PlainDate<{min: '2020-01-01'}>>();
    expect(getErrors(T.PlainDate.from('2020-06-15'))).toEqual([]);
    const errs = getErrors(T.PlainDate.from('2019-01-01'));
    expect(errs.length).toBe(1);
    const fmt = (errs[0] as {format?: {name?: string; formatPath?: string[]}}).format;
    expect(fmt?.name).toBe('temporalPlainDate');
    expect(fmt?.formatPath?.[fmt.formatPath.length - 1]).toBe('min');
  });
});

describe('TFT.Instant — absolute bounds', () => {
  it('accepts in-range instants', () => {
    const validate = createValidateFn<TFT.Instant<{min: '2020-01-01T00:00:00Z'; max: '2020-12-31T23:59:59Z'}>>();
    expect(validate(T.Instant.from('2020-06-15T12:00:00Z'))).toBe(true);
    expect(validate(T.Instant.from('2019-06-15T12:00:00Z'))).toBe(false);
    expect(validate(T.Instant.from('2021-06-15T12:00:00Z'))).toBe(false);
  });
});

describe('TFT.PlainTime — absolute bounds', () => {
  it('business hours window', () => {
    const validate = createValidateFn<TFT.PlainTime<{min: '09:00:00'; max: '17:00:00'}>>();
    expect(validate(T.PlainTime.from('12:30:00'))).toBe(true);
    expect(validate(T.PlainTime.from('08:59:59'))).toBe(false);
    expect(validate(T.PlainTime.from('17:00:01'))).toBe(false);
  });
});

describe('TFT.PlainDateTime — absolute bounds', () => {
  it('accepts in-range datetimes', () => {
    const validate = createValidateFn<TFT.PlainDateTime<{min: '2020-01-01T00:00:00'; max: '2020-12-31T23:59:59'}>>();
    expect(validate(T.PlainDateTime.from('2020-06-15T12:00:00'))).toBe(true);
    expect(validate(T.PlainDateTime.from('2019-06-15T12:00:00'))).toBe(false);
  });
});

describe('Temporal relative now±P bounds (wide margins, clock-independent)', () => {
  it('PlainDate min:now-P1000Y accepts a recent date, rejects an ancient one', () => {
    const validate = createValidateFn<TFT.PlainDate<{min: 'now-P1000Y'}>>();
    expect(validate(T.PlainDate.from('2020-06-15'))).toBe(true);
    expect(validate(T.PlainDate.from('0500-01-01'))).toBe(false);
  });

  it('PlainDate max:now-P1000Y rejects any recent date', () => {
    const validate = createValidateFn<TFT.PlainDate<{max: 'now-P1000Y'}>>();
    expect(validate(T.PlainDate.from('2020-06-15'))).toBe(false);
  });

  it('Instant min:now-PT1000000H accepts recent instants (time-only relative)', () => {
    const validate = createValidateFn<TFT.Instant<{min: 'now-PT1000000H'}>>();
    expect(validate(T.Instant.from('2020-06-15T12:00:00Z'))).toBe(true);
  });

  it('bare now as max rejects the far future', () => {
    const validate = createValidateFn<TFT.PlainDate<{max: 'now'}>>();
    expect(validate(T.PlainDate.from('2999-01-01'))).toBe(false);
  });
});

// Bound-aware mocking — every generated value must re-pass validate for the
// same bounded type, across all orderable Temporal types and both inclusive
// (min/max) and exclusive (gt/lt) bounds.
describe('TFT.X mock — every generated value satisfies its bounds', () => {
  const ITERATIONS = 40;

  it('PlainDate min/max — mock stays in range', () => {
    const validate = createValidateFn<TFT.PlainDate<{min: '2020-01-01'; max: '2020-12-31'}>>();
    const mock = createMockDataFn<TFT.PlainDate<{min: '2020-01-01'; max: '2020-12-31'}>>();
    for (let i = 0; i < ITERATIONS; i++) expect(validate(mock()), `iter ${i}`).toBe(true);
  });

  it('PlainDate gt/lt — mock stays strictly inside', () => {
    const validate = createValidateFn<TFT.PlainDate<{gt: '2020-01-01'; lt: '2020-01-10'}>>();
    const mock = createMockDataFn<TFT.PlainDate<{gt: '2020-01-01'; lt: '2020-01-10'}>>();
    for (let i = 0; i < ITERATIONS; i++) expect(validate(mock()), `iter ${i}`).toBe(true);
  });

  it('Instant min/max — mock stays in range', () => {
    const validate = createValidateFn<TFT.Instant<{min: '2020-01-01T00:00:00Z'; max: '2020-12-31T23:59:59Z'}>>();
    const mock = createMockDataFn<TFT.Instant<{min: '2020-01-01T00:00:00Z'; max: '2020-12-31T23:59:59Z'}>>();
    for (let i = 0; i < ITERATIONS; i++) expect(validate(mock()), `iter ${i}`).toBe(true);
  });

  it('PlainTime gt/lt — mock stays strictly inside', () => {
    const validate = createValidateFn<TFT.PlainTime<{gt: '09:00:00'; lt: '17:00:00'}>>();
    const mock = createMockDataFn<TFT.PlainTime<{gt: '09:00:00'; lt: '17:00:00'}>>();
    for (let i = 0; i < ITERATIONS; i++) expect(validate(mock()), `iter ${i}`).toBe(true);
  });

  it('PlainDateTime min/max — mock stays in range', () => {
    const validate = createValidateFn<TFT.PlainDateTime<{min: '2020-01-01T00:00:00'; max: '2020-12-31T23:59:59'}>>();
    const mock = createMockDataFn<TFT.PlainDateTime<{min: '2020-01-01T00:00:00'; max: '2020-12-31T23:59:59'}>>();
    for (let i = 0; i < ITERATIONS; i++) expect(validate(mock()), `iter ${i}`).toBe(true);
  });

  it('PlainYearMonth min/max — mock stays in range', () => {
    const validate = createValidateFn<TFT.PlainYearMonth<{min: '2020-01'; max: '2020-12'}>>();
    const mock = createMockDataFn<TFT.PlainYearMonth<{min: '2020-01'; max: '2020-12'}>>();
    for (let i = 0; i < ITERATIONS; i++) expect(validate(mock()), `iter ${i}`).toBe(true);
  });

  it('ZonedDateTime min/max — mock stays in range', () => {
    const validate = createValidateFn<TFT.ZonedDateTime<{min: '2020-01-01T00:00:00[UTC]'; max: '2020-12-31T23:59:59[UTC]'}>>();
    const mock = createMockDataFn<TFT.ZonedDateTime<{min: '2020-01-01T00:00:00[UTC]'; max: '2020-12-31T23:59:59[UTC]'}>>();
    for (let i = 0; i < ITERATIONS; i++) expect(validate(mock()), `iter ${i}`).toBe(true);
  });

  it('PlainDate relative min:now-P1Y max:now+P1Y — mock stays in range', () => {
    const validate = createValidateFn<TFT.PlainDate<{min: 'now-P1Y'; max: 'now+P1Y'}>>();
    const mock = createMockDataFn<TFT.PlainDate<{min: 'now-P1Y'; max: 'now+P1Y'}>>();
    for (let i = 0; i < ITERATIONS; i++) expect(validate(mock()), `iter ${i}`).toBe(true);
  });
});
