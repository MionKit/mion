import * as TF from '@mionjs/run-types/formats';
import {createJsonDecoderFn, createJsonEncoderFn} from '@mionjs/run-types';
import * as RT from '@mionjs/run-types/builders';
import type {SerializationCase} from './types.ts';

export const ATOMIC = {
  string: {
    title: 'string',
    description:
      'Root `string` round-trips identically through JSON; samples cover empty strings and multi-byte UTF-8 (CJK, Arabic, Cyrillic, emoji) to exercise byte-offset handling.',
    mutateEncoder: () => createJsonEncoderFn<string>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<string>(undefined, {strategy: 'clone'}),
    compactEncoder: () => createJsonEncoderFn<string>(undefined, {strategy: 'compact'}),
    cloneDecoder: () => createJsonDecoderFn<string>(),
    mutateDecoder: () => createJsonDecoderFn<string>(undefined, {strategy: 'mutate'}),
    compactDecoder: () => createJsonDecoderFn<string>(undefined, {strategy: 'compact'}),
    schemaEncoder: () => createJsonEncoderFn(TF.string()),
    schemaDecoder: () => createJsonDecoderFn(TF.string()),
    getTestData: () => ({values: ['hello', '', 'world', '', '你好', 'مرحبا', 'Здравствуйте', '🌍🚀✨']}),
  },
  number: {
    title: 'number',
    description:
      'Root `number` round-trips through JSON; samples span integers, negatives, fractions, the 2**31 boundary, and the JS safe-integer / min / max extremes.',
    mutateEncoder: () => createJsonEncoderFn<number>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<number>(undefined, {strategy: 'clone'}),
    compactEncoder: () => createJsonEncoderFn<number>(undefined, {strategy: 'compact'}),
    cloneDecoder: () => createJsonDecoderFn<number>(),
    mutateDecoder: () => createJsonDecoderFn<number>(undefined, {strategy: 'mutate'}),
    compactDecoder: () => createJsonDecoderFn<number>(undefined, {strategy: 'compact'}),
    schemaEncoder: () => createJsonEncoderFn(TF.number()),
    schemaDecoder: () => createJsonDecoderFn(TF.number()),
    getTestData: () => ({
      values: [
        0,
        99,
        -1,
        1.1,
        -1.1,
        1988,
        2045,
        2 ** 31,
        Number.MAX_SAFE_INTEGER,
        Number.MIN_SAFE_INTEGER,
        Number.MIN_VALUE,
        Number.MAX_VALUE,
      ],
    }),
  },
  // One value per magnitude, since JSON's size is the decimal-string length and the `number` case mixes them.
  number_small: {
    title: 'number (small)',
    description: 'A small single-digit integer.',
    serializeNotes: 'JSON writes "7" as 1 byte.',
    mutateEncoder: () => createJsonEncoderFn<number>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<number>(undefined, {strategy: 'clone'}),
    compactEncoder: () => createJsonEncoderFn<number>(undefined, {strategy: 'compact'}),
    cloneDecoder: () => createJsonDecoderFn<number>(),
    mutateDecoder: () => createJsonDecoderFn<number>(undefined, {strategy: 'mutate'}),
    compactDecoder: () => createJsonDecoderFn<number>(undefined, {strategy: 'compact'}),
    schemaEncoder: () => createJsonEncoderFn(TF.number()),
    schemaDecoder: () => createJsonDecoderFn(TF.number()),
    getTestData: () => ({values: [7]}),
  },
  number_medium: {
    title: 'number (medium)',
    description: 'A mid-size six-digit integer.',
    serializeNotes: 'JSON writes "123456" as 6 bytes.',
    mutateEncoder: () => createJsonEncoderFn<number>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<number>(undefined, {strategy: 'clone'}),
    compactEncoder: () => createJsonEncoderFn<number>(undefined, {strategy: 'compact'}),
    cloneDecoder: () => createJsonDecoderFn<number>(),
    mutateDecoder: () => createJsonDecoderFn<number>(undefined, {strategy: 'mutate'}),
    compactDecoder: () => createJsonDecoderFn<number>(undefined, {strategy: 'compact'}),
    schemaEncoder: () => createJsonEncoderFn(TF.number()),
    schemaDecoder: () => createJsonDecoderFn(TF.number()),
    getTestData: () => ({values: [123456]}),
  },
  number_large: {
    title: 'number (large)',
    description: 'The largest safe integer (16 digits).',
    serializeNotes: 'JSON writes Number.MAX_SAFE_INTEGER as 16 bytes.',
    mutateEncoder: () => createJsonEncoderFn<number>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<number>(undefined, {strategy: 'clone'}),
    compactEncoder: () => createJsonEncoderFn<number>(undefined, {strategy: 'compact'}),
    cloneDecoder: () => createJsonDecoderFn<number>(),
    mutateDecoder: () => createJsonDecoderFn<number>(undefined, {strategy: 'mutate'}),
    compactDecoder: () => createJsonDecoderFn<number>(undefined, {strategy: 'compact'}),
    schemaEncoder: () => createJsonEncoderFn(TF.number()),
    schemaDecoder: () => createJsonDecoderFn(TF.number()),
    getTestData: () => ({values: [Number.MAX_SAFE_INTEGER]}),
  },
  number_float_short: {
    title: 'number (low-precision float)',
    description: 'A short decimal with few significant digits.',
    serializeNotes: 'JSON writes "3.14" as 4 bytes.',
    mutateEncoder: () => createJsonEncoderFn<number>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<number>(undefined, {strategy: 'clone'}),
    compactEncoder: () => createJsonEncoderFn<number>(undefined, {strategy: 'compact'}),
    cloneDecoder: () => createJsonDecoderFn<number>(),
    mutateDecoder: () => createJsonDecoderFn<number>(undefined, {strategy: 'mutate'}),
    compactDecoder: () => createJsonDecoderFn<number>(undefined, {strategy: 'compact'}),
    schemaEncoder: () => createJsonEncoderFn(TF.number()),
    schemaDecoder: () => createJsonDecoderFn(TF.number()),
    getTestData: () => ({values: [3.14]}),
  },
  number_float_precise: {
    title: 'number (high-precision float)',
    description: 'A full-precision double with 17 significant digits (pi).',
    serializeNotes: 'JSON writes the 17-digit decimal as 17 bytes.',
    mutateEncoder: () => createJsonEncoderFn<number>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<number>(undefined, {strategy: 'clone'}),
    compactEncoder: () => createJsonEncoderFn<number>(undefined, {strategy: 'compact'}),
    cloneDecoder: () => createJsonDecoderFn<number>(),
    mutateDecoder: () => createJsonDecoderFn<number>(undefined, {strategy: 'mutate'}),
    compactDecoder: () => createJsonDecoderFn<number>(undefined, {strategy: 'compact'}),
    schemaEncoder: () => createJsonEncoderFn(TF.number()),
    schemaDecoder: () => createJsonDecoderFn(TF.number()),
    getTestData: () => ({values: [3.141592653589793]}),
  },
  number_not_supported: {
    title: 'number edge cases',
    description: 'Infinity / NaN are not supported by all protocols and do not survive JSON encoding, becoming null on restore.',
    serializeNotes: ['JSON.stringify maps Infinity / -Infinity / NaN to null, so the clone / mutate paths restore null.'],
    mutateEncoder: () => createJsonEncoderFn<number>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<number>(undefined, {strategy: 'clone'}),
    compactEncoder: () => createJsonEncoderFn<number>(undefined, {strategy: 'compact'}),
    cloneDecoder: () => createJsonDecoderFn<number>(),
    mutateDecoder: () => createJsonDecoderFn<number>(undefined, {strategy: 'mutate'}),
    compactDecoder: () => createJsonDecoderFn<number>(undefined, {strategy: 'compact'}),
    schemaEncoder: () => createJsonEncoderFn(TF.number()),
    schemaDecoder: () => createJsonDecoderFn(TF.number()),
    getTestData: () => ({
      values: [Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NaN],
      // After JSON.stringify(Infinity) === 'null', restore yields null.
      deserializedValues: [null, null, null],
    }),
  },
  regexp: {
    title: 'regexp',
    description:
      'A RegExp is not data: a pattern is code the receiver would run. At a root position every serialization family renders an alwaysThrow factory (PJ002 and friends), like a function.',
    serializeNotes:
      'A RegExp-valued property is dropped from the wire with the …015 Warning, the same as a function-valued one; only a `pattern` format carries a regex, fixed at build time.',
    // @mion-downgrade-error PJ002
    mutateEncoder: () => createJsonEncoderFn<RegExp>(undefined, {strategy: 'mutate'}),
    // @mion-downgrade-error PJS002
    cloneEncoder: () => createJsonEncoderFn<RegExp>(undefined, {strategy: 'clone'}),
    // @mion-downgrade-error PJS002
    compactEncoder: () => createJsonEncoderFn<RegExp>(undefined, {strategy: 'compact'}),
    // @mion-downgrade-error RJ002
    cloneDecoder: () => createJsonDecoderFn<RegExp>(),
    // @mion-downgrade-error RJ002
    mutateDecoder: () => createJsonDecoderFn<RegExp>(undefined, {strategy: 'mutate'}),
    // @mion-downgrade-error RJ002
    compactDecoder: () => createJsonDecoderFn<RegExp>(undefined, {strategy: 'compact'}),
    // @mion-downgrade-error PJS002
    schemaEncoder: () => createJsonEncoderFn(RT.regexp()),
    // @mion-downgrade-error RJ002
    schemaDecoder: () => createJsonDecoderFn(RT.regexp()),
    factoryThrows: true,
    getTestData: () => ({values: []}),
  },
  bigint: {
    title: 'bigint',
    description: 'Root `bigint` round-trips through JSON; bigint is not natively JSON-encodable so a transform applies.',
    serializeNotes: ['JSON encodes bigint to a decimal string and rebuilds it with `BigInt(...)` on decode.'],
    mutateEncoder: () => createJsonEncoderFn<bigint>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<bigint>(undefined, {strategy: 'clone'}),
    compactEncoder: () => createJsonEncoderFn<bigint>(undefined, {strategy: 'compact'}),
    cloneDecoder: () => createJsonDecoderFn<bigint>(),
    mutateDecoder: () => createJsonDecoderFn<bigint>(undefined, {strategy: 'mutate'}),
    compactDecoder: () => createJsonDecoderFn<bigint>(undefined, {strategy: 'compact'}),
    schemaEncoder: () => createJsonEncoderFn(TF.bigInt()),
    schemaDecoder: () => createJsonDecoderFn(TF.bigInt()),
    // Span zero, negative, and a value beyond 64 bits / Number.MAX_SAFE_INTEGER
    // to exercise the decimal-string transform across magnitudes and signs.
    getTestData: () => ({values: [1n, 0n, -1n, -123456789012345678901234567890n, 18446744073709551616n]}),
  },
  boolean: {
    title: 'boolean',
    description: 'Root `boolean` round-trips identically through JSON; no transform is needed.',
    mutateEncoder: () => createJsonEncoderFn<boolean>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<boolean>(undefined, {strategy: 'clone'}),
    compactEncoder: () => createJsonEncoderFn<boolean>(undefined, {strategy: 'compact'}),
    cloneDecoder: () => createJsonDecoderFn<boolean>(),
    mutateDecoder: () => createJsonDecoderFn<boolean>(undefined, {strategy: 'mutate'}),
    compactDecoder: () => createJsonDecoderFn<boolean>(undefined, {strategy: 'compact'}),
    schemaEncoder: () => createJsonEncoderFn(RT.boolean()),
    schemaDecoder: () => createJsonDecoderFn(RT.boolean()),
    getTestData: () => ({values: [true, false]}),
  },
  any: {
    title: 'any',
    description:
      'Root `any` is serialized best-effort via raw JSON (no per-kind transform); samples are all JSON-natural values (primitives, null, nested object and array).',
    serializeNotes:
      'With no static type, `any` round-trips whatever JSON.stringify produces — the adapter only asserts a non-undefined string, not deep equality.',
    mutateEncoder: () => createJsonEncoderFn<any>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<any>(undefined, {strategy: 'clone'}),
    compactEncoder: () => createJsonEncoderFn<any>(undefined, {strategy: 'compact'}),
    cloneDecoder: () => createJsonDecoderFn<any>(),
    mutateDecoder: () => createJsonDecoderFn<any>(undefined, {strategy: 'mutate'}),
    compactDecoder: () => createJsonDecoderFn<any>(undefined, {strategy: 'compact'}),
    schemaEncoder: () => createJsonEncoderFn(RT.any()),
    schemaDecoder: () => createJsonDecoderFn(RT.any()),
    roundTripBestEffort: true,
    getTestData: () => ({values: [42, 'hello', true, null, 0, -1, 1.1, {a: 1, b: 2}, [1, 2, 3, null]]}),
  },
  not_supported_any: {
    title: 'any edge cases',
    description:
      'undefined / Date / BigInt are not natively JSON-encodable when the type is `any`, since no per-kind transform applies.',
    serializeNotes:
      'Because the static type is `any`, no Date/BigInt transform fires; undefined and bigint do not survive JSON, so the round-trip is best-effort (string-only assertion) rather than deep-equal.',
    mutateEncoder: () => createJsonEncoderFn<any>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<any>(undefined, {strategy: 'clone'}),
    compactEncoder: () => createJsonEncoderFn<any>(undefined, {strategy: 'compact'}),
    cloneDecoder: () => createJsonDecoderFn<any>(),
    mutateDecoder: () => createJsonDecoderFn<any>(undefined, {strategy: 'mutate'}),
    compactDecoder: () => createJsonDecoderFn<any>(undefined, {strategy: 'compact'}),
    schemaEncoder: () => createJsonEncoderFn(RT.any()),
    schemaDecoder: () => createJsonDecoderFn(RT.any()),
    roundTripBestEffort: true,
    getTestData: () => ({values: [undefined, [undefined, 123, null], new Date('2000-08-06T02:13:00.000Z'), BigInt(1)]}),
  },
  null: {
    title: 'null',
    description: 'Root `null` literal round-trips identically through JSON.',
    mutateEncoder: () => createJsonEncoderFn<null>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<null>(undefined, {strategy: 'clone'}),
    compactEncoder: () => createJsonEncoderFn<null>(undefined, {strategy: 'compact'}),
    cloneDecoder: () => createJsonDecoderFn<null>(),
    mutateDecoder: () => createJsonDecoderFn<null>(undefined, {strategy: 'mutate'}),
    compactDecoder: () => createJsonDecoderFn<null>(undefined, {strategy: 'compact'}),
    schemaEncoder: () => createJsonEncoderFn(RT.literal(null)),
    schemaDecoder: () => createJsonDecoderFn(RT.literal(null)),
    getTestData: () => ({values: [null]}),
  },
  undefined: {
    title: 'undefined',
    description: 'Root `undefined` literal round-trips through JSON.',
    serializeNotes:
      'JSON has no undefined, so the parsed value may arrive as null or missing; decode force-rebinds it back to undefined.',
    mutateEncoder: () => createJsonEncoderFn<undefined>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<undefined>(undefined, {strategy: 'clone'}),
    compactEncoder: () => createJsonEncoderFn<undefined>(undefined, {strategy: 'compact'}),
    cloneDecoder: () => createJsonDecoderFn<undefined>(),
    mutateDecoder: () => createJsonDecoderFn<undefined>(undefined, {strategy: 'mutate'}),
    compactDecoder: () => createJsonDecoderFn<undefined>(undefined, {strategy: 'compact'}),
    schemaEncoder: () => createJsonEncoderFn(RT.literal(undefined)),
    schemaDecoder: () => createJsonDecoderFn(RT.literal(undefined)),
    getTestData: () => ({values: [undefined]}),
  },
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
    // Sub-second ms, the Unix epoch and a pre-1970 date must all survive the ISO round-trip without precision loss.
    getTestData: () => ({
      values: [
        new Date('2000-08-06T02:13:00.000Z'),
        new Date('2000-08-06T02:13:00.123Z'),
        new Date(0),
        new Date('1969-12-31T23:59:59.500Z'),
      ],
    }),
  },
  enum_color: {
    title: 'enum',
    description:
      'String enum `Color` round-trips through JSON as its underlying string values; samples encode the `red` / `green` members.',
    serializeNotes:
      'Wire form is the plain enum value (a string), so no enum-specific transform is applied; encode and decode treat it as the value-union of its members.',
    // Value-first `RT.enum(...)` carries the enum's value-UNION; the type-first
    // `<Color>` is the named `KindEnum`. Same wire output, but structurally
    // distinct ids by design — so the serializer id-integrity check is skipped.
    idDivergent: true,
    mutateEncoder: () => {
      enum Color {
        Red = 'red',
        Green = 'green',
        Blue = 'blue',
      }
      return createJsonEncoderFn<Color>(undefined, {strategy: 'mutate'});
    },
    cloneEncoder: () => {
      enum Color {
        Red = 'red',
        Green = 'green',
        Blue = 'blue',
      }
      return createJsonEncoderFn<Color>(undefined, {strategy: 'clone'});
    },
    compactEncoder: () => {
      enum Color {
        Red = 'red',
        Green = 'green',
        Blue = 'blue',
      }
      return createJsonEncoderFn<Color>(undefined, {strategy: 'compact'});
    },
    cloneDecoder: () => {
      enum Color {
        Red = 'red',
        Green = 'green',
        Blue = 'blue',
      }
      return createJsonDecoderFn<Color>();
    },
    mutateDecoder: () => {
      enum Color {
        Red = 'red',
        Green = 'green',
        Blue = 'blue',
      }
      return createJsonDecoderFn<Color>(undefined, {strategy: 'mutate'});
    },
    compactDecoder: () => {
      enum Color {
        Red = 'red',
        Green = 'green',
        Blue = 'blue',
      }
      return createJsonDecoderFn<Color>(undefined, {strategy: 'compact'});
    },
    // Value-first enum via the enum-like RECORD form (self-contained per thunk):
    // `RT.enum({...})` carries the value-union, same as the string-literal union.
    schemaEncoder: () => createJsonEncoderFn(RT.enum({Red: 'red', Green: 'green', Blue: 'blue'})),
    schemaDecoder: () => createJsonDecoderFn(RT.enum({Red: 'red', Green: 'green', Blue: 'blue'})),
    getTestData: () => {
      enum Color {
        Red = 'red',
        Green = 'green',
        Blue = 'blue',
      }
      return {values: [Color.Red, Color.Green]};
    },
  },
  symbol: {
    title: 'symbol',
    description:
      'symbol at root is unsupported because identity does not survive a JSON round-trip, so the factory is rendered as alwaysThrow.',
    // @mion-downgrade-error PJ005
    mutateEncoder: () => createJsonEncoderFn<symbol>(undefined, {strategy: 'mutate'}),
    // @mion-downgrade-error PJS005
    cloneEncoder: () => createJsonEncoderFn<symbol>(undefined, {strategy: 'clone'}),
    // @mion-downgrade-error PJS005
    compactEncoder: () => createJsonEncoderFn<symbol>(undefined, {strategy: 'compact'}),
    // @mion-downgrade-error RJ005
    cloneDecoder: () => createJsonDecoderFn<symbol>(),
    // @mion-downgrade-error RJ005
    mutateDecoder: () => createJsonDecoderFn<symbol>(undefined, {strategy: 'mutate'}),
    // @mion-downgrade-error RJ005
    compactDecoder: () => createJsonDecoderFn<symbol>(undefined, {strategy: 'compact'}),
    // Bare symbol resolves the same alwaysThrow factory via the value-first path,
    // so each schema thunk throws like the type-first form (factoryThrows below).
    // @mion-downgrade-error PJS005
    schemaEncoder: () => createJsonEncoderFn(RT.symbol()),
    // @mion-downgrade-error RJ005
    schemaDecoder: () => createJsonDecoderFn(RT.symbol()),
    factoryThrows: true,
    getTestData: () => ({values: []}),
  },
  object: {
    title: 'object',
    description:
      'The TS `object` primitive (any non-primitive) is serialized best-effort via raw JSON with no per-kind transform; samples cover a plain object and null.',
    serializeNotes: [
      'With no declared shape the round-trip is best-effort — the adapter only asserts JSON.stringify yields a non-undefined string, not deep equality.',
      'No value-first variant: `RT.object(...)` is the shape composer, a different kind from the TS `object` primitive.',
    ],
    mutateEncoder: () => createJsonEncoderFn<object>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<object>(undefined, {strategy: 'clone'}),
    compactEncoder: () => createJsonEncoderFn<object>(undefined, {strategy: 'compact'}),
    cloneDecoder: () => createJsonDecoderFn<object>(),
    mutateDecoder: () => createJsonDecoderFn<object>(undefined, {strategy: 'mutate'}),
    compactDecoder: () => createJsonDecoderFn<object>(undefined, {strategy: 'compact'}),
    // No value-first builder for the TS `object` primitive (any non-null
    // non-primitive) — `RT.object(...)` is the shape composer, a different kind.
    schemaEncoder: 'not-supported',
    schemaDecoder: 'not-supported',
    roundTripBestEffort: true,
    getTestData: () => ({values: [{a: 42, b: 'hello'}, null]}),
  },
  void: {
    title: 'void',
    description: 'Root `void` round-trips through JSON with an undefined sample, decoding back to undefined.',
    serializeNotes:
      'JSON has no undefined, so the parsed value may arrive as null or missing and decode force-rebinds it to undefined.',
    mutateEncoder: () => createJsonEncoderFn<void>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<void>(undefined, {strategy: 'clone'}),
    compactEncoder: () => createJsonEncoderFn<void>(undefined, {strategy: 'compact'}),
    cloneDecoder: () => createJsonDecoderFn<void>(),
    mutateDecoder: () => createJsonDecoderFn<void>(undefined, {strategy: 'mutate'}),
    compactDecoder: () => createJsonDecoderFn<void>(undefined, {strategy: 'compact'}),
    schemaEncoder: () => createJsonEncoderFn(RT.void()),
    schemaDecoder: () => createJsonDecoderFn(RT.void()),
    getTestData: () => ({values: [undefined]}),
  },
  never: {
    title: 'never',
    description: 'never type cannot be JSON-encoded or decoded — invoking the factory throws.',
    // @mion-downgrade-error PJ001
    mutateEncoder: () => createJsonEncoderFn<never>(undefined, {strategy: 'mutate'}),
    // @mion-downgrade-error PJS001
    cloneEncoder: () => createJsonEncoderFn<never>(undefined, {strategy: 'clone'}),
    // @mion-downgrade-error PJS001
    compactEncoder: () => createJsonEncoderFn<never>(undefined, {strategy: 'compact'}),
    // @mion-downgrade-error RJ001
    cloneDecoder: () => createJsonDecoderFn<never>(),
    // @mion-downgrade-error RJ001
    mutateDecoder: () => createJsonDecoderFn<never>(undefined, {strategy: 'mutate'}),
    // @mion-downgrade-error RJ001
    compactDecoder: () => createJsonDecoderFn<never>(undefined, {strategy: 'compact'}),
    // never resolves the same alwaysThrow factory via the value-first path.
    // @mion-downgrade-error PJS001
    schemaEncoder: () => createJsonEncoderFn(RT.never()),
    // @mion-downgrade-error RJ001
    schemaDecoder: () => createJsonDecoderFn(RT.never()),
    // The 2020-12 boolean `false` schema denotes never — same alwaysThrow factory.
    factoryThrows: true,
    getTestData: () => ({values: []}),
  },
  literal_string: {
    title: 'string literal',
    description: 'A string-literal type round-trips identically through JSON as a plain string.',
    mutateEncoder: () => createJsonEncoderFn<'hello'>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<'hello'>(undefined, {strategy: 'clone'}),
    compactEncoder: () => createJsonEncoderFn<'hello'>(undefined, {strategy: 'compact'}),
    cloneDecoder: () => createJsonDecoderFn<'hello'>(),
    mutateDecoder: () => createJsonDecoderFn<'hello'>(undefined, {strategy: 'mutate'}),
    compactDecoder: () => createJsonDecoderFn<'hello'>(undefined, {strategy: 'compact'}),
    schemaEncoder: () => createJsonEncoderFn(RT.literal('hello')),
    schemaDecoder: () => createJsonDecoderFn(RT.literal('hello')),
    getTestData: () => ({values: ['hello']}),
  },
  literal_number: {
    title: 'number literal',
    description: 'A number-literal type round-trips identically through JSON as a plain number.',
    mutateEncoder: () => createJsonEncoderFn<42>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<42>(undefined, {strategy: 'clone'}),
    compactEncoder: () => createJsonEncoderFn<42>(undefined, {strategy: 'compact'}),
    cloneDecoder: () => createJsonDecoderFn<42>(),
    mutateDecoder: () => createJsonDecoderFn<42>(undefined, {strategy: 'mutate'}),
    compactDecoder: () => createJsonDecoderFn<42>(undefined, {strategy: 'compact'}),
    schemaEncoder: () => createJsonEncoderFn(RT.literal(42)),
    schemaDecoder: () => createJsonDecoderFn(RT.literal(42)),
    getTestData: () => ({values: [42]}),
  },
  literal_bigint: {
    title: 'bigint literal',
    description:
      'A bigint-literal type takes the same decimal-string transform a plain `bigint` takes, on every encoder strategy.',
    serializeNotes:
      'The clone strategy used to pass a bigint literal through untouched, so `JSON.stringify` threw on it; the literal now carries the transform its non-literal sibling carries.',
    mutateEncoder: () => createJsonEncoderFn<1n>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<1n>(undefined, {strategy: 'clone'}),
    compactEncoder: () => createJsonEncoderFn<1n>(undefined, {strategy: 'compact'}),
    cloneDecoder: () => createJsonDecoderFn<1n>(),
    mutateDecoder: () => createJsonDecoderFn<1n>(undefined, {strategy: 'mutate'}),
    compactDecoder: () => createJsonDecoderFn<1n>(undefined, {strategy: 'compact'}),
    schemaEncoder: () => createJsonEncoderFn(RT.literal(1n)),
    schemaDecoder: () => createJsonDecoderFn(RT.literal(1n)),
    getTestData: () => ({values: [1n]}),
  },
  literal_boolean: {
    title: 'boolean literal',
    description: 'A boolean-literal type round-trips identically through JSON as a plain boolean.',
    mutateEncoder: () => createJsonEncoderFn<true>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<true>(undefined, {strategy: 'clone'}),
    compactEncoder: () => createJsonEncoderFn<true>(undefined, {strategy: 'compact'}),
    cloneDecoder: () => createJsonDecoderFn<true>(),
    mutateDecoder: () => createJsonDecoderFn<true>(undefined, {strategy: 'mutate'}),
    compactDecoder: () => createJsonDecoderFn<true>(undefined, {strategy: 'compact'}),
    schemaEncoder: () => createJsonEncoderFn(RT.literal(true)),
    schemaDecoder: () => createJsonDecoderFn(RT.literal(true)),
    getTestData: () => ({values: [true]}),
  },
  literal_symbol: {
    title: 'symbol literal',
    description:
      'A symbol literal is refused at a root exactly like a bare `symbol`: the only value a decoder could build is a fresh `Symbol()`, never the symbol the type names.',
    serializeNotes:
      'This used to encode as `Symbol:` plus the description and decode into a new symbol, so the round trip returned a value the validator accepted but `===` did not match.',
    mutateEncoder: () => {
      const sym = Symbol('hello');
      // @mion-downgrade-error PJ005
      return createJsonEncoderFn<typeof sym>(undefined, {strategy: 'mutate'});
    },
    cloneEncoder: () => {
      const sym = Symbol('hello');
      // @mion-downgrade-error PJS005
      return createJsonEncoderFn<typeof sym>(undefined, {strategy: 'clone'});
    },
    compactEncoder: () => {
      const sym = Symbol('hello');
      // @mion-downgrade-error PJS005
      return createJsonEncoderFn<typeof sym>(undefined, {strategy: 'compact'});
    },
    cloneDecoder: () => {
      const sym = Symbol('hello');
      // @mion-downgrade-error RJ005
      return createJsonDecoderFn<typeof sym>();
    },
    mutateDecoder: () => {
      const sym = Symbol('hello');
      // @mion-downgrade-error RJ005
      return createJsonDecoderFn<typeof sym>(undefined, {strategy: 'mutate'});
    },
    compactDecoder: () => {
      const sym = Symbol('hello');
      // @mion-downgrade-error RJ005
      return createJsonDecoderFn<typeof sym>(undefined, {strategy: 'compact'});
    },
    // No value-first builder names a unique symbol; `RT.symbol()` is the bare kind.
    schemaEncoder: 'not-supported',
    schemaDecoder: 'not-supported',
    factoryThrows: true,
    getTestData: () => ({values: []}),
  },
} as const satisfies Record<string, SerializationCase>;
