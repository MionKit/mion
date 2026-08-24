// serialization / DateTime — the date/time family grouped together: JS `Date`
// (also kept in Atomic) plus all 8 TC39 `Temporal` types, each through every
// JSON encoder × decoder pairing and the binary round-trip. All serialize via
// the type's own `toJSON()` (string on the wire) and restore via `.from()`;
// binary uses numeric packing where available and a string fallback otherwise.
//
// Temporal is the polyfill global in tests (see test/support/setup.ts); types resolve
// via test/support/temporal-ambient.d.ts. Each thunk spells out the concrete `<T>` at
// the call site so the vite plugin injects the resolved id. By-value equality
// for Temporal instances (no enumerable own keys) is handled in
// util/equalsHelpers.ts (canonical-string compare + immutable pass-through).

import * as TF from '@ts-runtypes/core/formats';
import * as TFT from '@ts-runtypes/core/formats/temporal';
import {createBinaryDecoderFn, createBinaryEncoderFn, createJsonDecoderFn, createJsonEncoderFn} from '@ts-runtypes/core';
import '@ts-runtypes/core/formats';
import type {SerializationCase} from './types.ts';

const T = (globalThis as {Temporal: typeof Temporal}).Temporal;

export const DATETIME = {
  // Duplicated from Atomic.ts so the date/time family reads as one group here too.
  date: {
    title: 'date',
    description: 'Root `Date` round-trips across JSON and binary, returning a real Date instance on decode.',
    serializeNotes:
      'JSON serializes Date to an ISO string and revives it with `new Date(...)`; binary stores the epoch as a fixed 8-byte float64 of `getTime()`.',
    mutateEncoder: () => createJsonEncoderFn<Date>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<Date>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoderFn<Date>(undefined, {strategy: 'direct'}),
    compactEncoder: () => createJsonEncoderFn<Date>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoderFn<Date>(),
    preserveDecoder: () => createJsonDecoderFn<Date>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoderFn<Date>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoderFn<Date>(),
    binaryDecoder: () => createBinaryDecoderFn<Date>(),
    schemaEncoder: () => createJsonEncoderFn(TF.date()),
    schemaDecoder: () => createJsonDecoderFn(TF.date()),
    schemaBinaryEncoder: () => createBinaryEncoderFn(TF.date()),
    schemaBinaryDecoder: () => createBinaryDecoderFn(TF.date()),
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
    // Binary stores every Date as a fixed 8-byte float64 of getTime().
    getBinaryByteSizes: () => [8, 8, 8, 8],
  },

  instant: {
    title: 'Temporal.Instant',
    description:
      'Root `Temporal.Instant`, an exact point on the timeline, round-trips across JSON and binary, returning a real Instant on decode.',
    serializeNotes:
      'JSON serializes via `Instant.toJSON()` (UTC instant string) and revives with `Temporal.Instant.from(...)`; equality is canonical-string compare since Instants have no enumerable own keys.',
    mutateEncoder: () => createJsonEncoderFn<Temporal.Instant>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<Temporal.Instant>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoderFn<Temporal.Instant>(undefined, {strategy: 'direct'}),
    compactEncoder: () => createJsonEncoderFn<Temporal.Instant>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoderFn<Temporal.Instant>(),
    preserveDecoder: () => createJsonDecoderFn<Temporal.Instant>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoderFn<Temporal.Instant>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoderFn<Temporal.Instant>(),
    binaryDecoder: () => createBinaryDecoderFn<Temporal.Instant>(),
    schemaEncoder: () => createJsonEncoderFn(TFT.instant()),
    schemaDecoder: () => createJsonDecoderFn(TFT.instant()),
    schemaBinaryEncoder: () => createBinaryEncoderFn(TFT.instant()),
    schemaBinaryDecoder: () => createBinaryDecoderFn(TFT.instant()),
    getTestData: () => ({values: [T.Instant.from('2020-01-15T10:30:00Z'), T.Instant.fromEpochMilliseconds(0)]}),
  },

  zonedDateTime: {
    title: 'Temporal.ZonedDateTime',
    description:
      'Root `Temporal.ZonedDateTime`, an instant plus time zone and calendar, round-trips across JSON and binary, returning a real ZonedDateTime on decode.',
    serializeNotes:
      'JSON serializes via `toJSON()` (a `...[TimeZone]` string carrying the zone) and revives with `Temporal.ZonedDateTime.from(...)`; the time-zone annotation is preserved through the round-trip.',
    mutateEncoder: () => createJsonEncoderFn<Temporal.ZonedDateTime>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<Temporal.ZonedDateTime>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoderFn<Temporal.ZonedDateTime>(undefined, {strategy: 'direct'}),
    compactEncoder: () => createJsonEncoderFn<Temporal.ZonedDateTime>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoderFn<Temporal.ZonedDateTime>(),
    preserveDecoder: () => createJsonDecoderFn<Temporal.ZonedDateTime>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoderFn<Temporal.ZonedDateTime>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoderFn<Temporal.ZonedDateTime>(),
    binaryDecoder: () => createBinaryDecoderFn<Temporal.ZonedDateTime>(),
    schemaEncoder: () => createJsonEncoderFn(TFT.zonedDateTime()),
    schemaDecoder: () => createJsonDecoderFn(TFT.zonedDateTime()),
    schemaBinaryEncoder: () => createBinaryEncoderFn(TFT.zonedDateTime()),
    schemaBinaryDecoder: () => createBinaryDecoderFn(TFT.zonedDateTime()),
    getTestData: () => ({values: [T.ZonedDateTime.from('2020-01-15T10:30:00[UTC]')]}),
  },

  plainDate: {
    title: 'Temporal.PlainDate',
    description:
      'Root `Temporal.PlainDate`, a calendar date with no time or zone, round-trips across JSON and binary, returning a real PlainDate on decode.',
    serializeNotes: 'JSON serializes via `toJSON()` (a `YYYY-MM-DD` string) and revives with `Temporal.PlainDate.from(...)`.',
    mutateEncoder: () => createJsonEncoderFn<Temporal.PlainDate>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<Temporal.PlainDate>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoderFn<Temporal.PlainDate>(undefined, {strategy: 'direct'}),
    compactEncoder: () => createJsonEncoderFn<Temporal.PlainDate>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoderFn<Temporal.PlainDate>(),
    preserveDecoder: () => createJsonDecoderFn<Temporal.PlainDate>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoderFn<Temporal.PlainDate>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoderFn<Temporal.PlainDate>(),
    binaryDecoder: () => createBinaryDecoderFn<Temporal.PlainDate>(),
    schemaEncoder: () => createJsonEncoderFn(TFT.plainDate()),
    schemaDecoder: () => createJsonDecoderFn(TFT.plainDate()),
    schemaBinaryEncoder: () => createBinaryEncoderFn(TFT.plainDate()),
    schemaBinaryDecoder: () => createBinaryDecoderFn(TFT.plainDate()),
    getTestData: () => ({values: [T.PlainDate.from('2020-08-24'), T.PlainDate.from('1999-01-01')]}),
  },

  plainTime: {
    title: 'Temporal.PlainTime',
    description:
      'Root `Temporal.PlainTime`, a wall-clock time with no date or zone, round-trips across JSON and binary, returning a real PlainTime on decode.',
    serializeNotes: 'JSON serializes via `toJSON()` (an `HH:MM:SS` string) and revives with `Temporal.PlainTime.from(...)`.',
    mutateEncoder: () => createJsonEncoderFn<Temporal.PlainTime>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<Temporal.PlainTime>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoderFn<Temporal.PlainTime>(undefined, {strategy: 'direct'}),
    compactEncoder: () => createJsonEncoderFn<Temporal.PlainTime>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoderFn<Temporal.PlainTime>(),
    preserveDecoder: () => createJsonDecoderFn<Temporal.PlainTime>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoderFn<Temporal.PlainTime>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoderFn<Temporal.PlainTime>(),
    binaryDecoder: () => createBinaryDecoderFn<Temporal.PlainTime>(),
    schemaEncoder: () => createJsonEncoderFn(TFT.plainTime()),
    schemaDecoder: () => createJsonDecoderFn(TFT.plainTime()),
    schemaBinaryEncoder: () => createBinaryEncoderFn(TFT.plainTime()),
    schemaBinaryDecoder: () => createBinaryDecoderFn(TFT.plainTime()),
    getTestData: () => ({values: [T.PlainTime.from('19:39:09'), T.PlainTime.from('00:00:00')]}),
  },

  plainDateTime: {
    title: 'Temporal.PlainDateTime',
    description:
      'Root `Temporal.PlainDateTime`, a date and time with no zone, round-trips across JSON and binary, returning a real PlainDateTime on decode.',
    serializeNotes:
      'JSON serializes via `toJSON()` (a `YYYY-MM-DDTHH:MM:SS` string) and revives with `Temporal.PlainDateTime.from(...)`.',
    mutateEncoder: () => createJsonEncoderFn<Temporal.PlainDateTime>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<Temporal.PlainDateTime>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoderFn<Temporal.PlainDateTime>(undefined, {strategy: 'direct'}),
    compactEncoder: () => createJsonEncoderFn<Temporal.PlainDateTime>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoderFn<Temporal.PlainDateTime>(),
    preserveDecoder: () => createJsonDecoderFn<Temporal.PlainDateTime>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoderFn<Temporal.PlainDateTime>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoderFn<Temporal.PlainDateTime>(),
    binaryDecoder: () => createBinaryDecoderFn<Temporal.PlainDateTime>(),
    schemaEncoder: () => createJsonEncoderFn(TFT.plainDateTime()),
    schemaDecoder: () => createJsonDecoderFn(TFT.plainDateTime()),
    schemaBinaryEncoder: () => createBinaryEncoderFn(TFT.plainDateTime()),
    schemaBinaryDecoder: () => createBinaryDecoderFn(TFT.plainDateTime()),
    getTestData: () => ({values: [T.PlainDateTime.from('1995-12-07T15:00:00')]}),
  },

  plainYearMonth: {
    title: 'Temporal.PlainYearMonth',
    description:
      'Root `Temporal.PlainYearMonth`, a year and month with no day, round-trips across JSON and binary, returning a real PlainYearMonth on decode.',
    serializeNotes: 'JSON serializes via `toJSON()` (a `YYYY-MM` string) and revives with `Temporal.PlainYearMonth.from(...)`.',
    mutateEncoder: () => createJsonEncoderFn<Temporal.PlainYearMonth>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<Temporal.PlainYearMonth>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoderFn<Temporal.PlainYearMonth>(undefined, {strategy: 'direct'}),
    compactEncoder: () => createJsonEncoderFn<Temporal.PlainYearMonth>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoderFn<Temporal.PlainYearMonth>(),
    preserveDecoder: () => createJsonDecoderFn<Temporal.PlainYearMonth>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoderFn<Temporal.PlainYearMonth>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoderFn<Temporal.PlainYearMonth>(),
    binaryDecoder: () => createBinaryDecoderFn<Temporal.PlainYearMonth>(),
    schemaEncoder: () => createJsonEncoderFn(TFT.plainYearMonth()),
    schemaDecoder: () => createJsonDecoderFn(TFT.plainYearMonth()),
    schemaBinaryEncoder: () => createBinaryEncoderFn(TFT.plainYearMonth()),
    schemaBinaryDecoder: () => createBinaryDecoderFn(TFT.plainYearMonth()),
    getTestData: () => ({values: [T.PlainYearMonth.from('2020-10')]}),
  },

  plainMonthDay: {
    title: 'Temporal.PlainMonthDay',
    description:
      'Root `Temporal.PlainMonthDay`, a month and day with no year, round-trips across JSON and binary, returning a real PlainMonthDay on decode.',
    serializeNotes: 'JSON serializes via `toJSON()` (an `MM-DD` string) and revives with `Temporal.PlainMonthDay.from(...)`.',
    mutateEncoder: () => createJsonEncoderFn<Temporal.PlainMonthDay>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<Temporal.PlainMonthDay>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoderFn<Temporal.PlainMonthDay>(undefined, {strategy: 'direct'}),
    compactEncoder: () => createJsonEncoderFn<Temporal.PlainMonthDay>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoderFn<Temporal.PlainMonthDay>(),
    preserveDecoder: () => createJsonDecoderFn<Temporal.PlainMonthDay>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoderFn<Temporal.PlainMonthDay>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoderFn<Temporal.PlainMonthDay>(),
    binaryDecoder: () => createBinaryDecoderFn<Temporal.PlainMonthDay>(),
    schemaEncoder: () => createJsonEncoderFn(TFT.plainMonthDay()),
    schemaDecoder: () => createJsonDecoderFn(TFT.plainMonthDay()),
    schemaBinaryEncoder: () => createBinaryEncoderFn(TFT.plainMonthDay()),
    schemaBinaryDecoder: () => createBinaryDecoderFn(TFT.plainMonthDay()),
    getTestData: () => ({values: [T.PlainMonthDay.from('07-14')]}),
  },

  duration: {
    title: 'Temporal.Duration',
    description:
      'Root `Temporal.Duration`, a length of time rather than a point, round-trips across JSON and binary, returning a real Duration on decode.',
    serializeNotes:
      'JSON serializes via `toJSON()` (an ISO-8601 `P...` duration string) and revives with `Temporal.Duration.from(...)`; the zero-duration `PT0S` sample confirms the empty case survives.',
    mutateEncoder: () => createJsonEncoderFn<Temporal.Duration>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<Temporal.Duration>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoderFn<Temporal.Duration>(undefined, {strategy: 'direct'}),
    compactEncoder: () => createJsonEncoderFn<Temporal.Duration>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoderFn<Temporal.Duration>(),
    preserveDecoder: () => createJsonDecoderFn<Temporal.Duration>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoderFn<Temporal.Duration>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoderFn<Temporal.Duration>(),
    binaryDecoder: () => createBinaryDecoderFn<Temporal.Duration>(),
    schemaEncoder: () => createJsonEncoderFn(TFT.duration()),
    schemaDecoder: () => createJsonDecoderFn(TFT.duration()),
    schemaBinaryEncoder: () => createBinaryEncoderFn(TFT.duration()),
    schemaBinaryDecoder: () => createBinaryDecoderFn(TFT.duration()),
    getTestData: () => ({values: [T.Duration.from('P1Y2M10DT2H30M'), T.Duration.from('PT0S')]}),
  },
} as const satisfies Record<string, SerializationCase>;
