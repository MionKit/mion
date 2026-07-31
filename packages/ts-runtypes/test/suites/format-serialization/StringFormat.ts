import * as TF from '@ts-runtypes/core/formats';
import type {SerializationCase} from './types.ts';
import * as RT from '@ts-runtypes/core/schema';
import '@ts-runtypes/core/formats';
import {createBinaryDecoderFn, createBinaryEncoderFn, createJsonDecoderFn, createJsonEncoderFn} from '@ts-runtypes/core';

const V4 = '9f1b8c2e-3d4a-4b5c-8d6e-1f2a3b4c5d6e';
const V4_B = '00112233-4455-4677-8899-aabbccddeeff';

export const STRING_FORMAT = {
  string_maxLength: {
    title: 'String maxLength',
    description:
      'JSON and binary (de)serialization of TF.String<{maxLength: 5}>, a string branded with a length cap, where the maxLength brand constrains validation only and both formats serialize the plain underlying string.',
    serializeNotes:
      'The maxLength brand never reaches the wire: serialization uses the base string kind, so the value round-trips as a plain variable-length string in JSON and binary (no fixed byte size).',
    mutateEncoder: () => createJsonEncoderFn<TF.String<{maxLength: 5}>>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<TF.String<{maxLength: 5}>>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoderFn<TF.String<{maxLength: 5}>>(undefined, {strategy: 'direct'}),
    compactEncoder: () => createJsonEncoderFn<TF.String<{maxLength: 5}>>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoderFn<TF.String<{maxLength: 5}>>(),
    preserveDecoder: () => createJsonDecoderFn<TF.String<{maxLength: 5}>>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoderFn<TF.String<{maxLength: 5}>>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoderFn<TF.String<{maxLength: 5}>>(),
    binaryDecoder: () => createBinaryDecoderFn<TF.String<{maxLength: 5}>>(),
    schemaEncoder: () => createJsonEncoderFn(TF.string({maxLength: 5})),
    schemaDecoder: () => createJsonDecoderFn(TF.string({maxLength: 5})),
    schemaBinaryEncoder: () => createBinaryEncoderFn(TF.string({maxLength: 5})),
    schemaBinaryDecoder: () => createBinaryDecoderFn(TF.string({maxLength: 5})),
    getTestData: () => ({values: ['', 'hello', 'abc']}),
  },
  uuidv4: {
    title: 'UUID v4',
    description:
      'JSON and binary (de)serialization of TF.UUIDv4, a string branded {version:"4"}, where the UUID format is a string subKind so the canonical v4 UUID text round-trips unchanged in both formats.',
    serializeNotes:
      'No compact 16-byte UUID packing — binary serializes the UUID as its plain 36-char string form (variable-length, like any branded string); the version brand is validation-only.',
    mutateEncoder: () => createJsonEncoderFn<TF.UUIDv4>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<TF.UUIDv4>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoderFn<TF.UUIDv4>(undefined, {strategy: 'direct'}),
    compactEncoder: () => createJsonEncoderFn<TF.UUIDv4>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoderFn<TF.UUIDv4>(),
    preserveDecoder: () => createJsonDecoderFn<TF.UUIDv4>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoderFn<TF.UUIDv4>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoderFn<TF.UUIDv4>(),
    binaryDecoder: () => createBinaryDecoderFn<TF.UUIDv4>(),
    schemaEncoder: () => createJsonEncoderFn(TF.uuidv4()),
    schemaDecoder: () => createJsonDecoderFn(TF.uuidv4()),
    schemaBinaryEncoder: () => createBinaryEncoderFn(TF.uuidv4()),
    schemaBinaryDecoder: () => createBinaryDecoderFn(TF.uuidv4()),
    getTestData: () => ({values: [V4, V4_B]}),
  },
  date: {
    title: 'String date',
    description:
      'JSON and binary (de)serialization of TF.StringDate, a STRING date such as "2024-02-29" rather than a native Date object, where the value stays an ISO date string on the wire and round-trips unchanged in both formats.',
    serializeNotes:
      'String-on-wire date: unlike the native TF.Date (DateTime.ts), the value is already a string, so there is no toJSON/.from conversion — JSON and binary both carry the plain date string. Samples cover a leap day and the 0001 lower edge.',
    mutateEncoder: () => createJsonEncoderFn<TF.StringDate>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<TF.StringDate>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoderFn<TF.StringDate>(undefined, {strategy: 'direct'}),
    compactEncoder: () => createJsonEncoderFn<TF.StringDate>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoderFn<TF.StringDate>(),
    preserveDecoder: () => createJsonDecoderFn<TF.StringDate>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoderFn<TF.StringDate>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoderFn<TF.StringDate>(),
    binaryDecoder: () => createBinaryDecoderFn<TF.StringDate>(),
    schemaEncoder: () => createJsonEncoderFn(TF.stringDate()),
    schemaDecoder: () => createJsonDecoderFn(TF.stringDate()),
    schemaBinaryEncoder: () => createBinaryEncoderFn(TF.stringDate()),
    schemaBinaryDecoder: () => createBinaryDecoderFn(TF.stringDate()),
    getTestData: () => ({values: ['2024-02-29', '2026-05-28', '0001-01-01']}),
  },
  email: {
    title: 'Email',
    description:
      'JSON and binary (de)serialization of TF.Email, a string branded with the built-in email pattern and length bounds, where the email string round-trips unchanged in both formats.',
    serializeNotes:
      'The email pattern/length brand is validation-only; serialization uses the base string kind (plain variable-length string on the wire).',
    mutateEncoder: () => createJsonEncoderFn<TF.Email>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<TF.Email>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoderFn<TF.Email>(undefined, {strategy: 'direct'}),
    compactEncoder: () => createJsonEncoderFn<TF.Email>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoderFn<TF.Email>(),
    preserveDecoder: () => createJsonDecoderFn<TF.Email>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoderFn<TF.Email>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoderFn<TF.Email>(),
    binaryDecoder: () => createBinaryDecoderFn<TF.Email>(),
    schemaEncoder: () => createJsonEncoderFn(TF.email()),
    schemaDecoder: () => createJsonDecoderFn(TF.email()),
    schemaBinaryEncoder: () => createBinaryEncoderFn(TF.email()),
    schemaBinaryDecoder: () => createBinaryDecoderFn(TF.email()),
    getTestData: () => ({values: ['john@example.com', 'jane.doe@mion.io']}),
  },
  alpha: {
    title: 'Alpha',
    description:
      'JSON and binary (de)serialization of TF.Alpha, a string branded with the alphabetic-only pattern, where the letters-only string round-trips unchanged in both formats.',
    serializeNotes:
      'The alpha pattern brand is validation-only; serialization uses the base string kind (plain variable-length string on the wire).',
    mutateEncoder: () => createJsonEncoderFn<TF.Alpha>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<TF.Alpha>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoderFn<TF.Alpha>(undefined, {strategy: 'direct'}),
    compactEncoder: () => createJsonEncoderFn<TF.Alpha>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoderFn<TF.Alpha>(),
    preserveDecoder: () => createJsonDecoderFn<TF.Alpha>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoderFn<TF.Alpha>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoderFn<TF.Alpha>(),
    binaryDecoder: () => createBinaryDecoderFn<TF.Alpha>(),
    schemaEncoder: () => createJsonEncoderFn(TF.alpha()),
    schemaDecoder: () => createJsonDecoderFn(TF.alpha()),
    schemaBinaryEncoder: () => createBinaryEncoderFn(TF.alpha()),
    schemaBinaryDecoder: () => createBinaryDecoderFn(TF.alpha()),
    getTestData: () => ({values: ['Hello', 'abcXYZ']}),
  },
  object_with_formats: {
    title: 'Format-branded object',
    description:
      'JSON and binary (de)serialization of an object whose fields are format-branded strings ({id: TF.UUIDv4; name: TF.String<{maxLength: 20}>}), proving format brands compose under an objectLiteral where each field serializes as its base string.',
    serializeNotes:
      'Format brands are validation-only at each property; the wire shape is a plain object of strings (binary writes each field as a variable-length string, no UUID/length packing).',
    mutateEncoder: () => createJsonEncoderFn<{id: TF.UUIDv4; name: TF.String<{maxLength: 20}>}>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<{id: TF.UUIDv4; name: TF.String<{maxLength: 20}>}>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoderFn<{id: TF.UUIDv4; name: TF.String<{maxLength: 20}>}>(undefined, {strategy: 'direct'}),
    compactEncoder: () =>
      createJsonEncoderFn<{id: TF.UUIDv4; name: TF.String<{maxLength: 20}>}>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoderFn<{id: TF.UUIDv4; name: TF.String<{maxLength: 20}>}>(),
    preserveDecoder: () =>
      createJsonDecoderFn<{id: TF.UUIDv4; name: TF.String<{maxLength: 20}>}>(undefined, {strategy: 'preserve'}),
    compactDecoder: () =>
      createJsonDecoderFn<{id: TF.UUIDv4; name: TF.String<{maxLength: 20}>}>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoderFn<{id: TF.UUIDv4; name: TF.String<{maxLength: 20}>}>(),
    binaryDecoder: () => createBinaryDecoderFn<{id: TF.UUIDv4; name: TF.String<{maxLength: 20}>}>(),
    schemaEncoder: () => createJsonEncoderFn(RT.object({id: TF.uuidv4(), name: TF.string({maxLength: 20})})),
    schemaDecoder: () => createJsonDecoderFn(RT.object({id: TF.uuidv4(), name: TF.string({maxLength: 20})})),
    schemaBinaryEncoder: () => createBinaryEncoderFn(RT.object({id: TF.uuidv4(), name: TF.string({maxLength: 20})})),
    schemaBinaryDecoder: () => createBinaryDecoderFn(RT.object({id: TF.uuidv4(), name: TF.string({maxLength: 20})})),
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
      'JSON and binary (de)serialization of TF.Email[], an array whose element is a format-branded string, proving format brands propagate through the array element kind where each element serializes as its base string.',
    serializeNotes:
      'The element email brand is validation-only; the wire shape is a plain array of strings (binary writes a length-prefixed sequence of variable-length strings).',
    mutateEncoder: () => createJsonEncoderFn<TF.Email[]>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<TF.Email[]>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoderFn<TF.Email[]>(undefined, {strategy: 'direct'}),
    compactEncoder: () => createJsonEncoderFn<TF.Email[]>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoderFn<TF.Email[]>(),
    preserveDecoder: () => createJsonDecoderFn<TF.Email[]>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoderFn<TF.Email[]>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoderFn<TF.Email[]>(),
    binaryDecoder: () => createBinaryDecoderFn<TF.Email[]>(),
    schemaEncoder: () => createJsonEncoderFn(RT.array(TF.email())),
    schemaDecoder: () => createJsonDecoderFn(RT.array(TF.email())),
    schemaBinaryEncoder: () => createBinaryEncoderFn(RT.array(TF.email())),
    schemaBinaryDecoder: () => createBinaryDecoderFn(RT.array(TF.email())),
    getTestData: () => ({
      values: [['john@example.com', 'jane.doe@mion.io'], [], ['solo@example.org']],
    }),
  },
} as const satisfies Record<string, SerializationCase>;
