// Temporal runtime spec — exercises every RT-fn family against real
// Temporal instances (provided by the polyfill global wired in test/support/setup.ts;
// native on Node 26+). Types resolve via test/support/temporal-ambient.d.ts.
//
// Covers: validate (instanceof), getValidationErrors, JSON round-trip
// (encode→decode equality via the type's own equals()), binary round-trip,
// and mock validity. One block per Temporal type for the core matrix, plus
// targeted edge cases.

import {describe, expect, it} from 'vitest';
import {
  createValidateFn,
  createGetValidationErrorsFn,
  createMockDataFn,
  createJsonEncoderFn,
  createJsonDecoderFn,
  createBinaryEncoderFn,
  createBinaryDecoderFn,
  type BinaryDecoderFn,
} from '@ts-runtypes/core';

// Temporal is the polyfill global in tests (see test/support/setup.ts).
const T = (globalThis as {Temporal: typeof Temporal}).Temporal;

// A sample value + an equality fn per type, so round-trip asserts by value.
const samples = {
  Instant: () => T.Instant.from('2020-01-15T10:30:00Z'),
  ZonedDateTime: () => T.ZonedDateTime.from('2020-01-15T10:30:00[UTC]'),
  PlainDate: () => T.PlainDate.from('2020-08-24'),
  PlainTime: () => T.PlainTime.from('19:39:09'),
  PlainDateTime: () => T.PlainDateTime.from('1995-12-07T15:00:00'),
  PlainYearMonth: () => T.PlainYearMonth.from('2020-10'),
  PlainMonthDay: () => T.PlainMonthDay.from('07-14'),
  Duration: () => T.Duration.from('P1Y2M10DT2H30M'),
};

describe('Temporal validate — instanceof', () => {
  it('PlainDate accepts a PlainDate, rejects others', () => {
    const validate = createValidateFn<Temporal.PlainDate>();
    expect(validate(samples.PlainDate())).toBe(true);
    expect(validate(samples.Instant())).toBe(false);
    expect(validate('2020-08-24')).toBe(false); // a string is not a PlainDate
    expect(validate(null)).toBe(false);
  });

  it('Instant accepts an Instant, rejects a ZonedDateTime', () => {
    const validate = createValidateFn<Temporal.Instant>();
    expect(validate(samples.Instant())).toBe(true);
    expect(validate(samples.ZonedDateTime())).toBe(false);
  });

  it('Duration accepts a Duration', () => {
    const validate = createValidateFn<Temporal.Duration>();
    expect(validate(samples.Duration())).toBe(true);
    expect(validate(samples.PlainDate())).toBe(false);
  });
});

describe('Temporal getValidationErrors', () => {
  it('PlainDate — no errors for valid, one error for invalid', () => {
    const getErrors = createGetValidationErrorsFn<Temporal.PlainDate>();
    expect(getErrors(samples.PlainDate())).toEqual([]);
    expect(getErrors('nope').length).toBe(1);
  });
});

// asStr stringifies a round-tripped value for by-value comparison.
const asStr = (v: unknown): string => (v as {toString(): string}).toString();

// The createX<T>() factories MUST be called with a CONCRETE type literally
// at the call site — the vite plugin rewrites each call by injecting the
// resolved type id, and a generic wrapper (createX<T>() inside a helper)
// gives the plugin no concrete T to resolve, so no id is injected. Hence
// each case spells out its own factory inline. (Concrete, not the union
// `samples[name]()` widens to — union-of-Temporal is a separate path.)

describe('Temporal JSON round-trip (encode → decode → equals)', () => {
  const jrt = (encoded: unknown, decode: (v: never) => unknown, original: unknown): void =>
    expect(asStr(decode(JSON.parse(JSON.stringify(encoded)) as never))).toBe(asStr(original));

  it('Instant', () =>
    jrt(
      createJsonEncoderFn<Temporal.Instant>()(samples.Instant() as never),
      createJsonDecoderFn<Temporal.Instant>(),
      samples.Instant()
    ));
  it('ZonedDateTime', () =>
    jrt(
      createJsonEncoderFn<Temporal.ZonedDateTime>()(samples.ZonedDateTime() as never),
      createJsonDecoderFn<Temporal.ZonedDateTime>(),
      samples.ZonedDateTime()
    ));
  it('PlainDate', () =>
    jrt(
      createJsonEncoderFn<Temporal.PlainDate>()(samples.PlainDate() as never),
      createJsonDecoderFn<Temporal.PlainDate>(),
      samples.PlainDate()
    ));
  it('PlainTime', () =>
    jrt(
      createJsonEncoderFn<Temporal.PlainTime>()(samples.PlainTime() as never),
      createJsonDecoderFn<Temporal.PlainTime>(),
      samples.PlainTime()
    ));
  it('PlainDateTime', () =>
    jrt(
      createJsonEncoderFn<Temporal.PlainDateTime>()(samples.PlainDateTime() as never),
      createJsonDecoderFn<Temporal.PlainDateTime>(),
      samples.PlainDateTime()
    ));
  it('PlainYearMonth', () =>
    jrt(
      createJsonEncoderFn<Temporal.PlainYearMonth>()(samples.PlainYearMonth() as never),
      createJsonDecoderFn<Temporal.PlainYearMonth>(),
      samples.PlainYearMonth()
    ));
  it('PlainMonthDay', () =>
    jrt(
      createJsonEncoderFn<Temporal.PlainMonthDay>()(samples.PlainMonthDay() as never),
      createJsonDecoderFn<Temporal.PlainMonthDay>(),
      samples.PlainMonthDay()
    ));
  it('Duration', () =>
    jrt(
      createJsonEncoderFn<Temporal.Duration>()(samples.Duration() as never),
      createJsonDecoderFn<Temporal.Duration>(),
      samples.Duration()
    ));
});

describe('Temporal binary round-trip', () => {
  const brt = (bytes: Uint8Array, decode: BinaryDecoderFn<unknown>, original: unknown): void =>
    expect(asStr(decode(bytes))).toBe(asStr(original));

  it('Instant', () =>
    brt(
      createBinaryEncoderFn<Temporal.Instant>()(samples.Instant() as never),
      createBinaryDecoderFn<Temporal.Instant>(),
      samples.Instant()
    ));
  it('PlainDate', () =>
    brt(
      createBinaryEncoderFn<Temporal.PlainDate>()(samples.PlainDate() as never),
      createBinaryDecoderFn<Temporal.PlainDate>(),
      samples.PlainDate()
    ));
  it('PlainDateTime', () =>
    brt(
      createBinaryEncoderFn<Temporal.PlainDateTime>()(samples.PlainDateTime() as never),
      createBinaryDecoderFn<Temporal.PlainDateTime>(),
      samples.PlainDateTime()
    ));
  it('Duration', () =>
    brt(
      createBinaryEncoderFn<Temporal.Duration>()(samples.Duration() as never),
      createBinaryDecoderFn<Temporal.Duration>(),
      samples.Duration()
    ));
});

// The numeric packing (dataView.ts serTemporal*/desTemporal*) must be
// lossless across the full value range — nanosecond precision, pre-epoch
// (negative) instants, far-past ISO years — and must fall back to the
// lossless toJSON() string for non-ISO calendars. A fresh encoder per call
// allocates its own serializer/buffer, so inline each round-trip.
describe('Temporal binary round-trip — numeric precision & calendar fallback', () => {
  it('Instant — nanosecond precision survives', () => {
    const v = T.Instant.fromEpochNanoseconds(1_579_084_200_123_456_789n);
    const decoded = createBinaryDecoderFn<Temporal.Instant>()(createBinaryEncoderFn<Temporal.Instant>()(v as never));
    // epochNanoseconds is authoritative (some polyfill equals() are flaky on
    // reconstructed instances).
    expect(decoded.epochNanoseconds).toBe(v.epochNanoseconds);
  });
  it('Instant — pre-epoch (negative, sub-second) survives', () => {
    const v = T.Instant.fromEpochNanoseconds(-6_857_222_999_999_999n);
    const decoded = createBinaryDecoderFn<Temporal.Instant>()(createBinaryEncoderFn<Temporal.Instant>()(v as never));
    expect(decoded.epochNanoseconds).toBe(v.epochNanoseconds);
  });
  it('Instant — epoch zero survives', () => {
    const v = T.Instant.fromEpochNanoseconds(0n);
    const decoded = createBinaryDecoderFn<Temporal.Instant>()(createBinaryEncoderFn<Temporal.Instant>()(v as never));
    expect(decoded.epochNanoseconds).toBe(v.epochNanoseconds);
  });

  it('PlainTime — full nanosecond precision', () => {
    const v = T.PlainTime.from('23:59:59.999999999');
    const decoded = createBinaryDecoderFn<Temporal.PlainTime>()(createBinaryEncoderFn<Temporal.PlainTime>()(v as never));
    expect(decoded.toString()).toBe(v.toString());
  });
  it('PlainTime — midnight', () => {
    const v = T.PlainTime.from('00:00:00');
    const decoded = createBinaryDecoderFn<Temporal.PlainTime>()(createBinaryEncoderFn<Temporal.PlainTime>()(v as never));
    expect(decoded.toString()).toBe(v.toString());
  });

  it('PlainDate — far-past ISO year', () => {
    const v = T.PlainDate.from('-001000-06-15');
    const decoded = createBinaryDecoderFn<Temporal.PlainDate>()(createBinaryEncoderFn<Temporal.PlainDate>()(v as never));
    expect(decoded.toString()).toBe(v.toString());
  });
  it('PlainDate — non-ISO calendar falls back to string (lossless)', () => {
    const v = T.PlainDate.from('2024-03-20[u-ca=hebrew]');
    const decoded = createBinaryDecoderFn<Temporal.PlainDate>()(createBinaryEncoderFn<Temporal.PlainDate>()(v as never));
    expect(decoded.calendarId).toBe('hebrew');
    expect(decoded.toString()).toBe(v.toString());
  });

  it('PlainDateTime — nanosecond precision (ISO)', () => {
    const v = T.PlainDateTime.from('2020-01-15T10:30:00.123456789');
    const decoded = createBinaryDecoderFn<Temporal.PlainDateTime>()(createBinaryEncoderFn<Temporal.PlainDateTime>()(v as never));
    expect(decoded.toString()).toBe(v.toString());
  });
  it('PlainDateTime — non-ISO calendar falls back to string', () => {
    const v = T.PlainDateTime.from('2024-03-20T08:15:30[u-ca=hebrew]');
    const decoded = createBinaryDecoderFn<Temporal.PlainDateTime>()(createBinaryEncoderFn<Temporal.PlainDateTime>()(v as never));
    expect(decoded.calendarId).toBe('hebrew');
    expect(decoded.toString()).toBe(v.toString());
  });

  it('PlainYearMonth — ISO round-trips', () => {
    const v = T.PlainYearMonth.from('2020-07');
    const decoded = createBinaryDecoderFn<Temporal.PlainYearMonth>()(
      createBinaryEncoderFn<Temporal.PlainYearMonth>()(v as never)
    );
    expect(decoded.toString()).toBe(v.toString());
  });
});

describe('Temporal mock — every generated value passes validate', () => {
  const ITER = 30;
  it('PlainDate', () => {
    const validate = createValidateFn<Temporal.PlainDate>();
    const mock = createMockDataFn<Temporal.PlainDate>();
    for (let i = 0; i < ITER; i++) expect(validate(mock())).toBe(true);
  });
  it('Instant', () => {
    const validate = createValidateFn<Temporal.Instant>();
    const mock = createMockDataFn<Temporal.Instant>();
    for (let i = 0; i < ITER; i++) expect(validate(mock())).toBe(true);
  });
  it('Duration', () => {
    const validate = createValidateFn<Temporal.Duration>();
    const mock = createMockDataFn<Temporal.Duration>();
    for (let i = 0; i < ITER; i++) expect(validate(mock())).toBe(true);
  });
  it('ZonedDateTime', () => {
    const validate = createValidateFn<Temporal.ZonedDateTime>();
    const mock = createMockDataFn<Temporal.ZonedDateTime>();
    for (let i = 0; i < ITER; i++) expect(validate(mock())).toBe(true);
  });
});
