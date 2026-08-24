import type {SharedCase} from '../types.ts';

const T = (globalThis as {Temporal: typeof Temporal}).Temporal;

export const DATETIME = {
  date: {
    title: 'Date instance (rejects Invalid Date)',
    description: 'Invalid Date instances (getTime() === NaN) rejected',
    getSamples: () => ({
      valid: [new Date()],
      invalid: ['hello', new Date('invalid'), new Date(NaN)],
    }),
  },
  instant: {
    title: 'Temporal.Instant',
    getSamples: () => ({
      valid: [T.Instant.from('2020-01-15T10:30:00Z'), T.Instant.fromEpochMilliseconds(0)],
      invalid: ['2020-01-15T10:30:00Z', T.PlainDate.from('2020-08-24')],
    }),
  },
  zonedDateTime: {
    title: 'Temporal.ZonedDateTime',
    getSamples: () => ({
      valid: [T.ZonedDateTime.from('2020-01-15T10:30:00[UTC]')],
      invalid: ['2020-01-15T10:30:00[UTC]', T.Instant.from('2020-01-15T10:30:00Z')],
    }),
  },
  plainDate: {
    title: 'Temporal.PlainDate',
    getSamples: () => ({
      valid: [T.PlainDate.from('2020-08-24'), T.PlainDate.from('1999-01-01')],
      invalid: ['2020-08-24', T.Instant.from('2020-01-15T10:30:00Z')],
    }),
  },
  plainTime: {
    title: 'Temporal.PlainTime',
    getSamples: () => ({
      valid: [T.PlainTime.from('19:39:09'), T.PlainTime.from('00:00:00')],
      invalid: ['19:39:09', T.PlainDate.from('2020-08-24')],
    }),
  },
  plainDateTime: {
    title: 'Temporal.PlainDateTime',
    getSamples: () => ({
      valid: [T.PlainDateTime.from('1995-12-07T15:00:00')],
      invalid: ['1995-12-07T15:00:00', T.PlainDate.from('2020-08-24')],
    }),
  },
  plainYearMonth: {
    title: 'Temporal.PlainYearMonth',
    getSamples: () => ({
      valid: [T.PlainYearMonth.from('2020-10')],
      invalid: ['2020-10', T.PlainDate.from('2020-08-24')],
    }),
  },
  plainMonthDay: {
    title: 'Temporal.PlainMonthDay',
    getSamples: () => ({
      valid: [T.PlainMonthDay.from('07-14')],
      invalid: ['07-14', T.PlainDate.from('2020-08-24')],
    }),
  },
  duration: {
    title: 'Temporal.Duration',
    getSamples: () => ({
      valid: [T.Duration.from('P1Y2M10DT2H30M'), T.Duration.from('PT0S')],
      invalid: ['P1Y2M10DT2H30M', T.PlainDate.from('2020-08-24')],
    }),
  },
} as const satisfies Record<string, SharedCase>;
