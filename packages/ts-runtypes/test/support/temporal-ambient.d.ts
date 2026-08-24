// Ambient Temporal namespace for the scanner. The repo's tsconfig libs
// (ES2023) predate Temporal (ES2026), and tsgo's inferred-program path can't
// be coaxed into loading a newer lib without breaking lib resolution
// entirely — so tests declare the Temporal surface here, the same trick the
// fake `ts-runtypes` module uses. This is NOT shipped to
// consumers; production consumers resolve Temporal from their own tsconfig
// `lib`. It only needs to mirror the SHAPE the scanner reads: each type is an
// `interface X` + `const X: XConstructor` (with `prototype: X`), exactly how
// lib.esnext.temporal.d.ts declares them and how `Date` is declared.
//
// Keep the member surface minimal but realistic — enough that validate /
// serialization codegen can reference toJSON()/from()/compare()/equals() and
// the per-type getters used by mock builders.

declare namespace Temporal {
  interface Instant {
    readonly epochMilliseconds: number;
    readonly epochNanoseconds: bigint;
    toString(): string;
    toJSON(): string;
    equals(other: Instant): boolean;
  }
  interface InstantConstructor {
    from(item: Instant | string): Instant;
    fromEpochMilliseconds(epochMilliseconds: number): Instant;
    fromEpochNanoseconds(epochNanoseconds: bigint): Instant;
    compare(a: Instant | string, b: Instant | string): number;
    prototype: Instant;
  }
  const Instant: InstantConstructor;

  interface ZonedDateTime {
    readonly epochMilliseconds: number;
    readonly epochNanoseconds: bigint;
    readonly timeZoneId: string;
    toString(): string;
    toJSON(): string;
    equals(other: ZonedDateTime | string): boolean;
  }
  interface ZonedDateTimeConstructor {
    from(item: ZonedDateTime | string): ZonedDateTime;
    compare(a: ZonedDateTime | string, b: ZonedDateTime | string): number;
    prototype: ZonedDateTime;
  }
  const ZonedDateTime: ZonedDateTimeConstructor;

  interface PlainDate {
    readonly year: number;
    readonly month: number;
    readonly day: number;
    readonly calendarId: string;
    toString(): string;
    toJSON(): string;
    equals(other: PlainDate | string): boolean;
  }
  interface PlainDateConstructor {
    new (year: number, month: number, day: number): PlainDate;
    from(item: PlainDate | string | {year: number; month: number; day: number}): PlainDate;
    compare(a: PlainDate | string, b: PlainDate | string): number;
    prototype: PlainDate;
  }
  const PlainDate: PlainDateConstructor;

  interface PlainTime {
    readonly hour: number;
    readonly minute: number;
    readonly second: number;
    readonly millisecond: number;
    toString(): string;
    toJSON(): string;
    equals(other: PlainTime | string): boolean;
  }
  interface PlainTimeConstructor {
    new (hour?: number, minute?: number, second?: number, millisecond?: number): PlainTime;
    from(item: PlainTime | string): PlainTime;
    compare(a: PlainTime | string, b: PlainTime | string): number;
    prototype: PlainTime;
  }
  const PlainTime: PlainTimeConstructor;

  interface PlainDateTime {
    readonly year: number;
    readonly month: number;
    readonly day: number;
    readonly hour: number;
    readonly minute: number;
    readonly second: number;
    readonly calendarId: string;
    toString(): string;
    toJSON(): string;
    equals(other: PlainDateTime | string): boolean;
  }
  interface PlainDateTimeConstructor {
    from(item: PlainDateTime | string): PlainDateTime;
    compare(a: PlainDateTime | string, b: PlainDateTime | string): number;
    prototype: PlainDateTime;
  }
  const PlainDateTime: PlainDateTimeConstructor;

  interface PlainYearMonth {
    readonly year: number;
    readonly month: number;
    toString(): string;
    toJSON(): string;
    equals(other: PlainYearMonth | string): boolean;
  }
  interface PlainYearMonthConstructor {
    from(item: PlainYearMonth | string): PlainYearMonth;
    compare(a: PlainYearMonth | string, b: PlainYearMonth | string): number;
    prototype: PlainYearMonth;
  }
  const PlainYearMonth: PlainYearMonthConstructor;

  interface PlainMonthDay {
    readonly monthCode: string;
    readonly day: number;
    toString(): string;
    toJSON(): string;
    equals(other: PlainMonthDay | string): boolean;
  }
  interface PlainMonthDayConstructor {
    from(item: PlainMonthDay | string): PlainMonthDay;
    prototype: PlainMonthDay;
  }
  const PlainMonthDay: PlainMonthDayConstructor;

  interface Duration {
    readonly years: number;
    readonly months: number;
    readonly days: number;
    readonly hours: number;
    readonly minutes: number;
    readonly seconds: number;
    toString(): string;
    toJSON(): string;
  }
  interface DurationConstructor {
    from(item: Duration | string): Duration;
    compare(a: Duration | string, b: Duration | string, options?: unknown): number;
    prototype: Duration;
  }
  const Duration: DurationConstructor;

  // `Temporal.Now` — wall-clock readers. Tests use these to build "current"
  // sample instances; only the shapes the suites reference are declared.
  const Now: {
    instant(): Instant;
    zonedDateTimeISO(timeZone?: string): ZonedDateTime;
    plainDateISO(timeZone?: string): PlainDate;
    plainTimeISO(timeZone?: string): PlainTime;
    plainDateTimeISO(timeZone?: string): PlainDateTime;
  };
}
