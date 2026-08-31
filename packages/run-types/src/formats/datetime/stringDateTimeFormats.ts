// String date/time/dateTime format TYPE aliases — extracted out of
// `../string/stringFormats.ts` so the whole date-ish surface (string
// formats here, the native `Date` family in ./dateFormats.ts, future
// Temporal) lives together and shares the min/max bound params from
// ./dateTimeParams.ts.
//
// These remain plain string formats: the value on the wire is a string,
// validated against the chosen layout AND (when present) the min/max
// bounds. Validation / mocking are emitted/registered on the Go side and
// in ../../mocking/mockStringFormat.ts; this file is type-only + brand
// wiring.
//
// `TypeFormat` IS imported as a value (not `import type`): the value-level
// import keeps each brand alias's reflection metadata reachable for tsgo
// (same constraint the reference documents and the sibling format files follow).

import {TypeFormat} from '../../runtypes/typeFormat.ts';
import type {MinMax, DateBound, TimeBound, DateTimeBound} from './dateTimeParams.ts';

// ─────────────────────────────── Date ───────────────────────────────

export type DateFmt = 'ISO' | 'YYYY-MM-DD' | 'DD-MM-YYYY' | 'MM-DD-YYYY' | 'YYYY-MM' | 'MM-DD' | 'DD-MM';
// DateParams — the chosen layout plus optional min/max. Each bound
// is a DateBound: an absolute literal in `format`'s layout, or a relative
// `now±P…` using ONLY date components (Go rejects time components for a
// date format).
export interface DateParams extends MinMax<DateBound> {
  format: DateFmt;
}
export type DEFAULT_DATE_PARAMS = {format: 'ISO'};
export type StringDate<P extends Partial<DateParams> = DEFAULT_DATE_PARAMS> = TypeFormat<string, 'date', P, never>;

// ─────────────────────────────── Time ───────────────────────────────

export type TimeFmt = 'ISO' | 'HH:mm:ss[.mmm]TZ' | 'HH:mm:ss[.mmm]' | 'HH:mm:ss' | 'HH:mm' | 'mm:ss' | 'HH' | 'mm' | 'ss';
// TimeParams — the chosen layout plus optional min/max. Each bound
// is a TimeBound: an absolute literal in `format`'s layout, or a relative
// `now±P…` using ONLY time components (Go rejects date components for a
// time format).
export interface TimeParams extends MinMax<TimeBound> {
  format: TimeFmt;
}
export type DEFAULT_TIME_FORMAT_PARAMS = {format: 'ISO'};
export type StringTime<P extends Partial<TimeParams> = DEFAULT_TIME_FORMAT_PARAMS> = TypeFormat<string, 'time', P, never>;

// ───────────────────────────── DateTime ─────────────────────────────

// DateTimeParams — nested date + time layouts, the split char, and
// optional top-level min/max. A dateTime bound (DateTimeBound) may use
// both date and time duration components.
export interface DateTimeParams extends MinMax<DateTimeBound> {
  date: DateParams;
  time: TimeParams;
  splitChar: string;
}
export type DEFAULT_DATE_TIME_PARAMS = {
  date: {format: 'ISO'};
  time: {format: 'ISO'};
  splitChar: 'T';
};
// P is passed through verbatim (NOT intersected with defaults — that
// would collapse overridden `format` literals to `never`); the Go side
// defaults missing nested formats / splitChar to ISO / 'T'.
export type StringDateTime<P extends Partial<DateTimeParams> = DEFAULT_DATE_TIME_PARAMS> = TypeFormat<
  string,
  'dateTime',
  P,
  never
>;
