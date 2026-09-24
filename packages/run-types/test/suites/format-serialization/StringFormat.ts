import * as TF from '@mionjs/run-types/formats';
import type {SerializationCase} from './types.ts';
import * as RT from '@mionjs/run-types/builders';
import '@mionjs/run-types/formats';
import {createJsonDecoderFn, createJsonEncoderFn} from '@mionjs/run-types';

const V4 = '9f1b8c2e-3d4a-4b5c-8d6e-1f2a3b4c5d6e';
const V4_B = '00112233-4455-4677-8899-aabbccddeeff';

export const STRING_FORMAT = {
  string_maxLength: {
    title: 'String maxLength',
    description:
      'JSON (de)serialization of TF.String<{maxLength: 5}>, a string branded with a length cap, where the maxLength brand constrains validation only and JSON serializes the plain underlying string.',
    serializeNotes:
      'The maxLength brand never reaches the wire: serialization uses the base string kind, so the value round-trips as a plain string.',
    mutateEncoder: () => createJsonEncoderFn<TF.String<{maxLength: 5}>>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<TF.String<{maxLength: 5}>>(undefined, {strategy: 'clone'}),
    compactEncoder: () => createJsonEncoderFn<TF.String<{maxLength: 5}>>(undefined, {strategy: 'compact'}),
    cloneDecoder: () => createJsonDecoderFn<TF.String<{maxLength: 5}>>(),
    mutateDecoder: () => createJsonDecoderFn<TF.String<{maxLength: 5}>>(undefined, {strategy: 'mutate'}),
    compactDecoder: () => createJsonDecoderFn<TF.String<{maxLength: 5}>>(undefined, {strategy: 'compact'}),
    schemaEncoder: () => createJsonEncoderFn(TF.string({maxLength: 5})),
    schemaDecoder: () => createJsonDecoderFn(TF.string({maxLength: 5})),
    getTestData: () => ({values: ['', 'hello', 'abc']}),
  },
  uuidv4: {
    title: 'UUID v4',
    description:
      'JSON (de)serialization of TF.UUIDv4, a string branded {version:"4"}, where the UUID format is a string subKind so the canonical v4 UUID text round-trips unchanged.',
    serializeNotes: 'The UUID travels as its plain 36-char string form; the version brand is validation-only.',
    mutateEncoder: () => createJsonEncoderFn<TF.UUIDv4>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<TF.UUIDv4>(undefined, {strategy: 'clone'}),
    compactEncoder: () => createJsonEncoderFn<TF.UUIDv4>(undefined, {strategy: 'compact'}),
    cloneDecoder: () => createJsonDecoderFn<TF.UUIDv4>(),
    mutateDecoder: () => createJsonDecoderFn<TF.UUIDv4>(undefined, {strategy: 'mutate'}),
    compactDecoder: () => createJsonDecoderFn<TF.UUIDv4>(undefined, {strategy: 'compact'}),
    schemaEncoder: () => createJsonEncoderFn(TF.uuidv4()),
    schemaDecoder: () => createJsonDecoderFn(TF.uuidv4()),
    getTestData: () => ({values: [V4, V4_B]}),
  },
  date: {
    title: 'String date',
    description:
      'JSON (de)serialization of TF.StringDate, a STRING date such as "2024-02-29" rather than a native Date object, where the value stays an ISO date string on the wire and round-trips unchanged.',
    serializeNotes:
      'String-on-wire date: unlike the native TF.Date (DateTime.ts), the value is already a string, so there is no toJSON/.from conversion — JSON carries the plain date string. Samples cover a leap day and the 0001 lower edge.',
    mutateEncoder: () => createJsonEncoderFn<TF.StringDate>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<TF.StringDate>(undefined, {strategy: 'clone'}),
    compactEncoder: () => createJsonEncoderFn<TF.StringDate>(undefined, {strategy: 'compact'}),
    cloneDecoder: () => createJsonDecoderFn<TF.StringDate>(),
    mutateDecoder: () => createJsonDecoderFn<TF.StringDate>(undefined, {strategy: 'mutate'}),
    compactDecoder: () => createJsonDecoderFn<TF.StringDate>(undefined, {strategy: 'compact'}),
    schemaEncoder: () => createJsonEncoderFn(TF.stringDate()),
    schemaDecoder: () => createJsonDecoderFn(TF.stringDate()),
    getTestData: () => ({values: ['2024-02-29', '2026-05-28', '0001-01-01']}),
  },
  time: {
    title: 'String time ISO',
    description:
      'JSON (de)serialization of TF.StringTime, a STRING time-of-day such as "12:30:45Z" rather than a native Date or Temporal instance, where the value stays an ISO time string on the wire and round-trips unchanged.',
    serializeNotes:
      'String-on-wire time: the value is already a string, so there is no toJSON/.from conversion — JSON carries the plain time string. The tz-aware ISO layout is validation-only, so the offset/millisecond text survives verbatim (no normalization to UTC). Samples cover a bare `Z`, a millisecond form, and a negative offset.',
    mutateEncoder: () => createJsonEncoderFn<TF.StringTime>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<TF.StringTime>(undefined, {strategy: 'clone'}),
    compactEncoder: () => createJsonEncoderFn<TF.StringTime>(undefined, {strategy: 'compact'}),
    cloneDecoder: () => createJsonDecoderFn<TF.StringTime>(),
    mutateDecoder: () => createJsonDecoderFn<TF.StringTime>(undefined, {strategy: 'mutate'}),
    compactDecoder: () => createJsonDecoderFn<TF.StringTime>(undefined, {strategy: 'compact'}),
    schemaEncoder: () => createJsonEncoderFn(TF.stringTime()),
    schemaDecoder: () => createJsonDecoderFn(TF.stringTime()),
    getTestData: () => ({values: ['12:30:45Z', '12:30:45.123Z', '00:00:00-08:00']}),
  },
  dateTime: {
    title: 'String dateTime default',
    description:
      'JSON (de)serialization of TF.StringDateTime, a STRING dateTime such as "2024-02-29T12:30:45Z" rather than a native Date or Temporal instance, where the value stays an ISO dateTime string on the wire and round-trips unchanged.',
    serializeNotes:
      'String-on-wire dateTime: unlike the native TF.Date (DateTime.ts), the value is already a string, so there is no toJSON/.from conversion — JSON carries the plain dateTime string. The nested date/time layouts and the `T` split char are validation-only, so the exact text (offset and milliseconds included) survives verbatim. Samples cover a leap day at `Z` and a millisecond form at a positive offset.',
    mutateEncoder: () => createJsonEncoderFn<TF.StringDateTime>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<TF.StringDateTime>(undefined, {strategy: 'clone'}),
    compactEncoder: () => createJsonEncoderFn<TF.StringDateTime>(undefined, {strategy: 'compact'}),
    cloneDecoder: () => createJsonDecoderFn<TF.StringDateTime>(),
    mutateDecoder: () => createJsonDecoderFn<TF.StringDateTime>(undefined, {strategy: 'mutate'}),
    compactDecoder: () => createJsonDecoderFn<TF.StringDateTime>(undefined, {strategy: 'compact'}),
    schemaEncoder: () => createJsonEncoderFn(TF.stringDateTime()),
    schemaDecoder: () => createJsonDecoderFn(TF.stringDateTime()),
    getTestData: () => ({values: ['2024-02-29T12:30:45Z', '2026-05-28T00:00:00.500+02:00']}),
  },
  email: {
    title: 'Email',
    description:
      'JSON (de)serialization of TF.Email, a string branded with the built-in email pattern and length bounds, where the email string round-trips unchanged.',
    serializeNotes:
      'The email pattern/length brand is validation-only; serialization uses the base string kind (plain variable-length string on the wire).',
    mutateEncoder: () => createJsonEncoderFn<TF.Email>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<TF.Email>(undefined, {strategy: 'clone'}),
    compactEncoder: () => createJsonEncoderFn<TF.Email>(undefined, {strategy: 'compact'}),
    cloneDecoder: () => createJsonDecoderFn<TF.Email>(),
    mutateDecoder: () => createJsonDecoderFn<TF.Email>(undefined, {strategy: 'mutate'}),
    compactDecoder: () => createJsonDecoderFn<TF.Email>(undefined, {strategy: 'compact'}),
    schemaEncoder: () => createJsonEncoderFn(TF.email()),
    schemaDecoder: () => createJsonDecoderFn(TF.email()),
    getTestData: () => ({values: ['john@example.com', 'jane.doe@mion.io']}),
  },
  alpha: {
    title: 'Alpha',
    description:
      'JSON (de)serialization of TF.Alpha, a string branded with the alphabetic-only pattern, where the letters-only string round-trips unchanged.',
    serializeNotes: [
      'The alpha pattern brand is validation-only; serialization uses the base string kind (plain variable-length string on the wire).',
    ],
    mutateEncoder: () => createJsonEncoderFn<TF.Alpha>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<TF.Alpha>(undefined, {strategy: 'clone'}),
    compactEncoder: () => createJsonEncoderFn<TF.Alpha>(undefined, {strategy: 'compact'}),
    cloneDecoder: () => createJsonDecoderFn<TF.Alpha>(),
    mutateDecoder: () => createJsonDecoderFn<TF.Alpha>(undefined, {strategy: 'mutate'}),
    compactDecoder: () => createJsonDecoderFn<TF.Alpha>(undefined, {strategy: 'compact'}),
    schemaEncoder: () => createJsonEncoderFn(TF.alpha()),
    schemaDecoder: () => createJsonDecoderFn(TF.alpha()),
    getTestData: () => ({values: ['Hello', 'abcXYZ']}),
  },
  object_with_formats: {
    title: 'Format-branded object',
    description:
      'JSON (de)serialization of an object whose fields are format-branded strings ({id: TF.UUIDv4; name: TF.String<{maxLength: 20}>}), proving format brands compose under an objectLiteral where each field serializes as its base string.',
    serializeNotes: 'Format brands are validation-only at each property; the wire shape is a plain object of strings.',
    mutateEncoder: () => createJsonEncoderFn<{id: TF.UUIDv4; name: TF.String<{maxLength: 20}>}>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<{id: TF.UUIDv4; name: TF.String<{maxLength: 20}>}>(undefined, {strategy: 'clone'}),
    compactEncoder: () =>
      createJsonEncoderFn<{id: TF.UUIDv4; name: TF.String<{maxLength: 20}>}>(undefined, {strategy: 'compact'}),
    cloneDecoder: () => createJsonDecoderFn<{id: TF.UUIDv4; name: TF.String<{maxLength: 20}>}>(),
    mutateDecoder: () => createJsonDecoderFn<{id: TF.UUIDv4; name: TF.String<{maxLength: 20}>}>(undefined, {strategy: 'mutate'}),
    compactDecoder: () =>
      createJsonDecoderFn<{id: TF.UUIDv4; name: TF.String<{maxLength: 20}>}>(undefined, {strategy: 'compact'}),
    schemaEncoder: () => createJsonEncoderFn(RT.object({id: TF.uuidv4(), name: TF.string({maxLength: 20})})),
    schemaDecoder: () => createJsonDecoderFn(RT.object({id: TF.uuidv4(), name: TF.string({maxLength: 20})})),
    getTestData: () => ({
      values: [
        {id: V4, name: 'alice'},
        {id: V4_B, name: ''},
        {id: V4, name: 'a'.repeat(20)},
      ],
    }),
  },
  email_array: {
    title: 'Email array',
    description:
      'JSON (de)serialization of TF.Email[], an array whose element is a format-branded string, proving format brands propagate through the array element kind where each element serializes as its base string.',
    serializeNotes: 'The element email brand is validation-only; the wire shape is a plain array of strings.',
    mutateEncoder: () => createJsonEncoderFn<TF.Email[]>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<TF.Email[]>(undefined, {strategy: 'clone'}),
    compactEncoder: () => createJsonEncoderFn<TF.Email[]>(undefined, {strategy: 'compact'}),
    cloneDecoder: () => createJsonDecoderFn<TF.Email[]>(),
    mutateDecoder: () => createJsonDecoderFn<TF.Email[]>(undefined, {strategy: 'mutate'}),
    compactDecoder: () => createJsonDecoderFn<TF.Email[]>(undefined, {strategy: 'compact'}),
    schemaEncoder: () => createJsonEncoderFn(RT.array(TF.email())),
    schemaDecoder: () => createJsonDecoderFn(RT.array(TF.email())),
    getTestData: () => ({
      values: [['john@example.com', 'jane.doe@mion.io'], [], ['solo@example.org']],
    }),
  },
} as const satisfies Record<string, SerializationCase>;
