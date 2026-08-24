// cloning / DateTime — Date plus all 8 TC39 Temporal types. Every one comes
// back as a FRESH instance (`clone(x) !== x`): Date re-wraps via
// `new Date(v.getTime())`; Temporal types — immutable, but identity
// freshness wins — re-materialize via their static `from()`
// (`globalThis.Temporal.<T>.from(v)`). The generic asserts pin freshness,
// prototype preservation, and value equality (vitest deep-equals Temporal
// instances structurally).
//
// Temporal is the runtime global (Node >= 26); types resolve from the
// TS lib as in the validation / serialization DateTime groups.

import {createCloneExactShapeFn} from '@ts-runtypes/core';
import type {CloningCase} from './types.ts';

const T = (globalThis as {Temporal: typeof Temporal}).Temporal;

export const DATETIME = {
  date: {
    title: 'Date',
    description: 'Dates are mutable (setTime & friends) — the clone always re-wraps: fresh instance, same instant.',
    clone: () => createCloneExactShapeFn<Date>(),
    // Span whole-second, sub-second ms precision, the Unix epoch (getTime 0),
    // and a pre-1970 (negative epoch) date.
    getTestData: () => ({
      values: [
        new Date('2021-05-06T07:08:09.000Z'),
        new Date(0),
        new Date('2000-08-06T02:13:00.123Z'),
        new Date('1969-12-31T23:59:59.500Z'),
      ],
    }),
  },
  dateInObject: {
    title: 'Date property',
    description: 'A Date inside a rebuilt object is itself re-wrapped — mutating `clone.at` never touches the input.',
    clone: () => createCloneExactShapeFn<{at: Date; note: string}>(),
    getTestData: () => ({
      values: [{at: new Date('2021-05-06T07:08:09.000Z'), note: 'n', extra: 1}],
      expected: [{at: new Date('2021-05-06T07:08:09.000Z'), note: 'n'}],
    }),
  },
  temporalInstant: {
    title: 'Temporal.Instant',
    description: 'Re-materialized via `Temporal.Instant.from(v)` — fresh identity, same exact point on the timeline.',
    cloneNotes:
      'Temporal objects are immutable, so sharing would be safe — but `clone(x) !== x` holds everywhere so identity-based test assertions never surprise.',
    clone: () => createCloneExactShapeFn<Temporal.Instant>(),
    getTestData: () => ({values: [T.Instant.from('2020-01-15T10:30:00Z'), T.Instant.fromEpochMilliseconds(0)]}),
  },
  temporalZonedDateTime: {
    title: 'Temporal.ZonedDateTime',
    description: 'Re-materialized via `Temporal.ZonedDateTime.from(v)`, time zone and calendar preserved.',
    clone: () => createCloneExactShapeFn<Temporal.ZonedDateTime>(),
    getTestData: () => ({
      values: [
        T.ZonedDateTime.from('2020-01-15T10:30:00+01:00[Europe/Madrid]'),
        T.ZonedDateTime.from('2020-01-15T10:30:00[UTC]'),
      ],
    }),
  },
  temporalPlainDate: {
    title: 'Temporal.PlainDate',
    description: 'Re-materialized via `Temporal.PlainDate.from(v)`.',
    clone: () => createCloneExactShapeFn<Temporal.PlainDate>(),
    getTestData: () => ({values: [T.PlainDate.from('2021-05-06'), T.PlainDate.from('1999-01-01')]}),
  },
  temporalPlainDateTime: {
    title: 'Temporal.PlainDateTime',
    description: 'Re-materialized via `Temporal.PlainDateTime.from(v)`.',
    clone: () => createCloneExactShapeFn<Temporal.PlainDateTime>(),
    getTestData: () => ({values: [T.PlainDateTime.from('2021-05-06T07:08:09')]}),
  },
  temporalPlainTime: {
    title: 'Temporal.PlainTime',
    description: 'Re-materialized via `Temporal.PlainTime.from(v)`.',
    clone: () => createCloneExactShapeFn<Temporal.PlainTime>(),
    getTestData: () => ({values: [T.PlainTime.from('07:08:09'), T.PlainTime.from('00:00:00')]}),
  },
  temporalPlainYearMonth: {
    title: 'Temporal.PlainYearMonth',
    description: 'Re-materialized via `Temporal.PlainYearMonth.from(v)`.',
    clone: () => createCloneExactShapeFn<Temporal.PlainYearMonth>(),
    getTestData: () => ({values: [T.PlainYearMonth.from('2021-05')]}),
  },
  temporalPlainMonthDay: {
    title: 'Temporal.PlainMonthDay',
    description: 'Re-materialized via `Temporal.PlainMonthDay.from(v)`.',
    clone: () => createCloneExactShapeFn<Temporal.PlainMonthDay>(),
    getTestData: () => ({values: [T.PlainMonthDay.from('05-06')]}),
  },
  temporalDuration: {
    title: 'Temporal.Duration',
    description: 'Re-materialized via `Temporal.Duration.from(v)`.',
    clone: () => createCloneExactShapeFn<Temporal.Duration>(),
    getTestData: () => ({
      values: [T.Duration.from({hours: 2, minutes: 30}), T.Duration.from('P1Y2M10DT2H30M'), T.Duration.from('PT0S')],
    }),
  },
} satisfies Record<string, CloningCase>;
