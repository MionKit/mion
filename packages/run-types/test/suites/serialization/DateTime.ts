// serialization / DateTime — the date/time family grouped together: JS `Date`
// (also kept in Atomic) plus all 8 TC39 `Temporal` types, each through every
// JSON encoder × decoder pairing. All serialize via the type's own `toJSON()`
// (string on the wire) and restore via `.from()`.
//
// Temporal is the polyfill global in tests (see test/support/setup.ts); types resolve
// via test/support/temporal-ambient.d.ts. Each thunk spells out the concrete `<T>` at
// the call site so the vite plugin injects the resolved id. By-value equality
// for Temporal instances (no enumerable own keys) is handled in
// util/equalsHelpers.ts (canonical-string compare + immutable pass-through).

import * as TF from '@mionjs/run-types/formats';
import * as TFT from '@mionjs/run-types/formats/temporal';
import {createJsonDecoderFn, createJsonEncoderFn} from '@mionjs/run-types';
import '@mionjs/run-types/formats';
import type {SerializationCase} from './types.ts';

const T = (globalThis as {Temporal: typeof Temporal}).Temporal;

export const DATETIME = {
  // Duplicated from Atomic.ts so the date/time family reads as one group here too.
  date: {
    title: 'date',
    description: 'Root `Date` round-trips through JSON, returning a real Date instance on decode.',
    serializeNotes: 'JSON serializes Date to an ISO string and revives it with `new Date(...)`.',
    mutateEncoder: () => createJsonEncoderFn<Date>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<Date>(undefined, {strategy: 'clone'}),
    compactEncoder: () => createJsonEncoderFn<Date>(undefined, {strategy: 'compact'}),
    cloneDecoder: () => createJsonDecoderFn<Date>(),
    mutateDecoder: () => createJsonDecoderFn<Date>(undefined, {strategy: 'mutate'}),
    compactDecoder: () => createJsonDecoderFn<Date>(undefined, {strategy: 'compact'}),
    schemaEncoder: () => createJsonEncoderFn(TF.date()),
    schemaDecoder: () => createJsonDecoderFn(TF.date()),
    // Span whole-second, sub-second ms precision, the Unix epoch (getTime 0),
    // and a pre-1970 (negative epoch) date.
    getTestData: () => ({
      values: [
        new Date('2000-08-06T02:13:00.000Z'),
        new Date('2000-08-06T02:13:00.123Z'),
        new Date(0),
        new Date('1969-12-31T23:59:59.500Z'),
      ],
    }),
  },

  instant: {
    title: 'Temporal.Instant',
    description:
      'Root `Temporal.Instant`, an exact point on the timeline, round-trips through JSON, returning a real Instant on decode.',
    serializeNotes:
      'JSON serializes via `Instant.toJSON()` (UTC instant string) and revives with `Temporal.Instant.from(...)`; equality is canonical-string compare since Instants have no enumerable own keys.',
    mutateEncoder: () => createJsonEncoderFn<Temporal.Instant>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<Temporal.Instant>(undefined, {strategy: 'clone'}),
    compactEncoder: () => createJsonEncoderFn<Temporal.Instant>(undefined, {strategy: 'compact'}),
    cloneDecoder: () => createJsonDecoderFn<Temporal.Instant>(),
    mutateDecoder: () => createJsonDecoderFn<Temporal.Instant>(undefined, {strategy: 'mutate'}),
    compactDecoder: () => createJsonDecoderFn<Temporal.Instant>(undefined, {strategy: 'compact'}),
    schemaEncoder: () => createJsonEncoderFn(TFT.instant()),
    schemaDecoder: () => createJsonDecoderFn(TFT.instant()),
    getTestData: () => ({values: [T.Instant.from('2020-01-15T10:30:00Z'), T.Instant.fromEpochMilliseconds(0)]}),
  },

  zonedDateTime: {
    title: 'Temporal.ZonedDateTime',
    description:
      'Root `Temporal.ZonedDateTime`, an instant plus time zone and calendar, round-trips through JSON, returning a real ZonedDateTime on decode.',
    serializeNotes:
      'JSON serializes via `toJSON()` (a `...[TimeZone]` string carrying the zone) and revives with `Temporal.ZonedDateTime.from(...)`; the time-zone annotation is preserved through the round-trip.',
    mutateEncoder: () => createJsonEncoderFn<Temporal.ZonedDateTime>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<Temporal.ZonedDateTime>(undefined, {strategy: 'clone'}),
    compactEncoder: () => createJsonEncoderFn<Temporal.ZonedDateTime>(undefined, {strategy: 'compact'}),
    cloneDecoder: () => createJsonDecoderFn<Temporal.ZonedDateTime>(),
    mutateDecoder: () => createJsonDecoderFn<Temporal.ZonedDateTime>(undefined, {strategy: 'mutate'}),
    compactDecoder: () => createJsonDecoderFn<Temporal.ZonedDateTime>(undefined, {strategy: 'compact'}),
    schemaEncoder: () => createJsonEncoderFn(TFT.zonedDateTime()),
    schemaDecoder: () => createJsonDecoderFn(TFT.zonedDateTime()),
    getTestData: () => ({values: [T.ZonedDateTime.from('2020-01-15T10:30:00[UTC]')]}),
  },

  plainDate: {
    title: 'Temporal.PlainDate',
    description:
      'Root `Temporal.PlainDate`, a calendar date with no time or zone, round-trips through JSON, returning a real PlainDate on decode.',
    serializeNotes: 'JSON serializes via `toJSON()` (a `YYYY-MM-DD` string) and revives with `Temporal.PlainDate.from(...)`.',
    mutateEncoder: () => createJsonEncoderFn<Temporal.PlainDate>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<Temporal.PlainDate>(undefined, {strategy: 'clone'}),
    compactEncoder: () => createJsonEncoderFn<Temporal.PlainDate>(undefined, {strategy: 'compact'}),
    cloneDecoder: () => createJsonDecoderFn<Temporal.PlainDate>(),
    mutateDecoder: () => createJsonDecoderFn<Temporal.PlainDate>(undefined, {strategy: 'mutate'}),
    compactDecoder: () => createJsonDecoderFn<Temporal.PlainDate>(undefined, {strategy: 'compact'}),
    schemaEncoder: () => createJsonEncoderFn(TFT.plainDate()),
    schemaDecoder: () => createJsonDecoderFn(TFT.plainDate()),
    getTestData: () => ({values: [T.PlainDate.from('2020-08-24'), T.PlainDate.from('1999-01-01')]}),
  },

  plainTime: {
    title: 'Temporal.PlainTime',
    description:
      'Root `Temporal.PlainTime`, a wall-clock time with no date or zone, round-trips through JSON, returning a real PlainTime on decode.',
    serializeNotes: 'JSON serializes via `toJSON()` (an `HH:MM:SS` string) and revives with `Temporal.PlainTime.from(...)`.',
    mutateEncoder: () => createJsonEncoderFn<Temporal.PlainTime>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<Temporal.PlainTime>(undefined, {strategy: 'clone'}),
    compactEncoder: () => createJsonEncoderFn<Temporal.PlainTime>(undefined, {strategy: 'compact'}),
    cloneDecoder: () => createJsonDecoderFn<Temporal.PlainTime>(),
    mutateDecoder: () => createJsonDecoderFn<Temporal.PlainTime>(undefined, {strategy: 'mutate'}),
    compactDecoder: () => createJsonDecoderFn<Temporal.PlainTime>(undefined, {strategy: 'compact'}),
    schemaEncoder: () => createJsonEncoderFn(TFT.plainTime()),
    schemaDecoder: () => createJsonDecoderFn(TFT.plainTime()),
    getTestData: () => ({values: [T.PlainTime.from('19:39:09'), T.PlainTime.from('00:00:00')]}),
  },

  plainDateTime: {
    title: 'Temporal.PlainDateTime',
    description:
      'Root `Temporal.PlainDateTime`, a date and time with no zone, round-trips through JSON, returning a real PlainDateTime on decode.',
    serializeNotes:
      'JSON serializes via `toJSON()` (a `YYYY-MM-DDTHH:MM:SS` string) and revives with `Temporal.PlainDateTime.from(...)`.',
    mutateEncoder: () => createJsonEncoderFn<Temporal.PlainDateTime>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<Temporal.PlainDateTime>(undefined, {strategy: 'clone'}),
    compactEncoder: () => createJsonEncoderFn<Temporal.PlainDateTime>(undefined, {strategy: 'compact'}),
    cloneDecoder: () => createJsonDecoderFn<Temporal.PlainDateTime>(),
    mutateDecoder: () => createJsonDecoderFn<Temporal.PlainDateTime>(undefined, {strategy: 'mutate'}),
    compactDecoder: () => createJsonDecoderFn<Temporal.PlainDateTime>(undefined, {strategy: 'compact'}),
    schemaEncoder: () => createJsonEncoderFn(TFT.plainDateTime()),
    schemaDecoder: () => createJsonDecoderFn(TFT.plainDateTime()),
    getTestData: () => ({values: [T.PlainDateTime.from('1995-12-07T15:00:00')]}),
  },

  plainYearMonth: {
    title: 'Temporal.PlainYearMonth',
    description:
      'Root `Temporal.PlainYearMonth`, a year and month with no day, round-trips through JSON, returning a real PlainYearMonth on decode.',
    serializeNotes: 'JSON serializes via `toJSON()` (a `YYYY-MM` string) and revives with `Temporal.PlainYearMonth.from(...)`.',
    mutateEncoder: () => createJsonEncoderFn<Temporal.PlainYearMonth>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<Temporal.PlainYearMonth>(undefined, {strategy: 'clone'}),
    compactEncoder: () => createJsonEncoderFn<Temporal.PlainYearMonth>(undefined, {strategy: 'compact'}),
    cloneDecoder: () => createJsonDecoderFn<Temporal.PlainYearMonth>(),
    mutateDecoder: () => createJsonDecoderFn<Temporal.PlainYearMonth>(undefined, {strategy: 'mutate'}),
    compactDecoder: () => createJsonDecoderFn<Temporal.PlainYearMonth>(undefined, {strategy: 'compact'}),
    schemaEncoder: () => createJsonEncoderFn(TFT.plainYearMonth()),
    schemaDecoder: () => createJsonDecoderFn(TFT.plainYearMonth()),
    getTestData: () => ({values: [T.PlainYearMonth.from('2020-10')]}),
  },

  plainMonthDay: {
    title: 'Temporal.PlainMonthDay',
    description:
      'Root `Temporal.PlainMonthDay`, a month and day with no year, round-trips through JSON, returning a real PlainMonthDay on decode.',
    serializeNotes: 'JSON serializes via `toJSON()` (an `MM-DD` string) and revives with `Temporal.PlainMonthDay.from(...)`.',
    mutateEncoder: () => createJsonEncoderFn<Temporal.PlainMonthDay>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<Temporal.PlainMonthDay>(undefined, {strategy: 'clone'}),
    compactEncoder: () => createJsonEncoderFn<Temporal.PlainMonthDay>(undefined, {strategy: 'compact'}),
    cloneDecoder: () => createJsonDecoderFn<Temporal.PlainMonthDay>(),
    mutateDecoder: () => createJsonDecoderFn<Temporal.PlainMonthDay>(undefined, {strategy: 'mutate'}),
    compactDecoder: () => createJsonDecoderFn<Temporal.PlainMonthDay>(undefined, {strategy: 'compact'}),
    schemaEncoder: () => createJsonEncoderFn(TFT.plainMonthDay()),
    schemaDecoder: () => createJsonDecoderFn(TFT.plainMonthDay()),
    getTestData: () => ({values: [T.PlainMonthDay.from('07-14')]}),
  },

  duration: {
    title: 'Temporal.Duration',
    description:
      'Root `Temporal.Duration`, a length of time rather than a point, round-trips through JSON, returning a real Duration on decode.',
    serializeNotes:
      'JSON serializes via `toJSON()` (an ISO-8601 `P...` duration string) and revives with `Temporal.Duration.from(...)`; the zero-duration `PT0S` sample confirms the empty case survives.',
    mutateEncoder: () => createJsonEncoderFn<Temporal.Duration>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<Temporal.Duration>(undefined, {strategy: 'clone'}),
    compactEncoder: () => createJsonEncoderFn<Temporal.Duration>(undefined, {strategy: 'compact'}),
    cloneDecoder: () => createJsonDecoderFn<Temporal.Duration>(),
    mutateDecoder: () => createJsonDecoderFn<Temporal.Duration>(undefined, {strategy: 'mutate'}),
    compactDecoder: () => createJsonDecoderFn<Temporal.Duration>(undefined, {strategy: 'compact'}),
    schemaEncoder: () => createJsonEncoderFn(TFT.duration()),
    schemaDecoder: () => createJsonDecoderFn(TFT.duration()),
    getTestData: () => ({values: [T.Duration.from('P1Y2M10DT2H30M'), T.Duration.from('PT0S')]}),
  },
} as const satisfies Record<string, SerializationCase>;
