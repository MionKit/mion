// String date/time/dateTime format TYPE aliases, sharing the min/max bound params in
// ./dateTimeParams.ts with the native `Date` family. These stay plain string formats: the wire value
// is a string, validated against the chosen layout AND (when present) the bounds, with validation /
// mocking emitted on the Go side and in ../../mocking/mockStringFormat.ts. `TypeFormat` IS imported
// as a value (not `import type`): the value-level import keeps each brand alias's reflection metadata
// reachable for tsgo.

import {TypeFormat} from '../../runtypes/typeFormat.ts';
import type {MinMax, DateBound, TimeBound, DateTimeBound} from './dateTimeParams.ts';

// ─────────────────────────────── Date ───────────────────────────────

export type DateFmt = 'ISO' | 'YYYY-MM-DD' | 'DD-MM-YYYY' | 'MM-DD-YYYY' | 'YYYY-MM' | 'MM-DD' | 'DD-MM';
// Each bound is an absolute literal in `format`'s layout, or a relative `now±P…` using ONLY date
// components (Go rejects time components for a date format).
export interface DateParams extends MinMax<DateBound> {
  format: DateFmt;
}
export type DEFAULT_DATE_PARAMS = {format: 'ISO'};
export type StringDate<P extends Partial<DateParams> = DEFAULT_DATE_PARAMS> = TypeFormat<string, 'date', P, never>;

// ─────────────────────────────── Time ───────────────────────────────

export type TimeFmt = 'ISO' | 'HH:mm:ss[.mmm]TZ' | 'HH:mm:ss[.mmm]' | 'HH:mm:ss' | 'HH:mm' | 'mm:ss' | 'HH' | 'mm' | 'ss';
// Each bound is an absolute literal in `format`'s layout, or a relative `now±P…` using ONLY time
// components (Go rejects date components for a time format).
export interface TimeParams extends MinMax<TimeBound> {
  format: TimeFmt;
}
export type DEFAULT_TIME_FORMAT_PARAMS = {format: 'ISO'};
export type StringTime<P extends Partial<TimeParams> = DEFAULT_TIME_FORMAT_PARAMS> = TypeFormat<string, 'time', P, never>;

// ───────────────────────────── DateTime ─────────────────────────────

// A dateTime bound may use both date and time duration components.
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
// P is passed through verbatim, NOT intersected with the defaults (that would collapse an overridden
// `format` literal to `never`); Go defaults missing nested formats / splitChar to ISO / 'T'.
export type StringDateTime<P extends Partial<DateTimeParams> = DEFAULT_DATE_TIME_PARAMS> = TypeFormat<
  string,
  'dateTime',
  P,
  never
>;
