import * as TF from '@ts-runtypes/core/formats';
import {createBinaryDecoderFn, createBinaryEncoderFn, createJsonDecoderFn, createJsonEncoderFn} from '@ts-runtypes/core';
import * as RT from '@ts-runtypes/core/schema';
import type {SerializationCase} from './types.ts';

export const ATOMIC = {
  string: {
    title: 'string',
    description:
      'Root `string` round-trips identically across JSON and binary; samples cover empty strings and multi-byte UTF-8 (CJK, Arabic, Cyrillic, emoji) to exercise byte-offset handling.',
    serializeNotes: 'Binary encodes UTF-8 with a length prefix, so byte size is variable (no fixed-size assertion).',
    mutateEncoder: () => createJsonEncoderFn<string>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<string>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoderFn<string>(undefined, {strategy: 'direct'}),
    compactEncoder: () => createJsonEncoderFn<string>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoderFn<string>(),
    preserveDecoder: () => createJsonDecoderFn<string>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoderFn<string>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoderFn<string>(),
    binaryDecoder: () => createBinaryDecoderFn<string>(),
    schemaEncoder: () => createJsonEncoderFn(TF.string()),
    schemaDecoder: () => createJsonDecoderFn(TF.string()),
    schemaBinaryEncoder: () => createBinaryEncoderFn(TF.string()),
    schemaBinaryDecoder: () => createBinaryDecoderFn(TF.string()),
    getTestData: () => ({values: ['hello', '', 'world', '', '你好', 'مرحبا', 'Здравствуйте', '🌍🚀✨']}),
  },
  number: {
    title: 'number',
    description:
      'Root `number` round-trips across JSON and binary; samples span integers, negatives, fractions, the 2**31 boundary, and the JS safe-integer / min / max extremes.',
    serializeNotes: 'Binary writes every number as float64, so all values encode to a fixed 8 bytes regardless of magnitude.',
    mutateEncoder: () => createJsonEncoderFn<number>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<number>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoderFn<number>(undefined, {strategy: 'direct'}),
    compactEncoder: () => createJsonEncoderFn<number>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoderFn<number>(),
    preserveDecoder: () => createJsonDecoderFn<number>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoderFn<number>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoderFn<number>(),
    binaryDecoder: () => createBinaryDecoderFn<number>(),
    schemaEncoder: () => createJsonEncoderFn(TF.number()),
    schemaDecoder: () => createJsonDecoderFn(TF.number()),
    schemaBinaryEncoder: () => createBinaryEncoderFn(TF.number()),
    schemaBinaryDecoder: () => createBinaryDecoderFn(TF.number()),
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
    // Locks the "fixed 8 bytes regardless of magnitude" claim: every number
    // encodes as float64, so all 12 samples must be exactly 8 bytes.
    getBinaryByteSizes: () => [8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8],
  },
  // Magnitude-split number cases: the base `number` case above mixes every
  // magnitude into one row, so the page can't show where binary overtakes JSON
  // on the wire. Binary always writes a fixed 8-byte float64; JSON's size is the
  // decimal-string length. These single-value cases isolate each magnitude so the
  // JSON-vs-binary payload crossover is visible per case (small/short = JSON wins,
  // large/high-precision = binary wins).
  number_small: {
    title: 'number (small)',
    description:
      'A small single-digit integer. Its JSON text is far shorter than a binary float64, so JSON is smaller on the wire here.',
    serializeNotes: 'JSON writes "7" as 1 byte; binary writes a fixed 8-byte float64. Small numbers favour JSON on payload.',
    mutateEncoder: () => createJsonEncoderFn<number>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<number>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoderFn<number>(undefined, {strategy: 'direct'}),
    compactEncoder: () => createJsonEncoderFn<number>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoderFn<number>(),
    preserveDecoder: () => createJsonDecoderFn<number>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoderFn<number>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoderFn<number>(),
    binaryDecoder: () => createBinaryDecoderFn<number>(),
    schemaEncoder: () => createJsonEncoderFn(TF.number()),
    schemaDecoder: () => createJsonDecoderFn(TF.number()),
    schemaBinaryEncoder: () => createBinaryEncoderFn(TF.number()),
    schemaBinaryDecoder: () => createBinaryDecoderFn(TF.number()),
    getTestData: () => ({values: [7]}),
    getBinaryByteSizes: () => [8],
  },
  number_medium: {
    title: 'number (medium)',
    description: 'A mid-size six-digit integer, near the point where JSON text and a binary float64 cost about the same.',
    serializeNotes:
      'JSON writes "123456" as 6 bytes; binary writes a fixed 8-byte float64. Around six to eight digits the two are about even.',
    mutateEncoder: () => createJsonEncoderFn<number>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<number>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoderFn<number>(undefined, {strategy: 'direct'}),
    compactEncoder: () => createJsonEncoderFn<number>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoderFn<number>(),
    preserveDecoder: () => createJsonDecoderFn<number>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoderFn<number>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoderFn<number>(),
    binaryDecoder: () => createBinaryDecoderFn<number>(),
    schemaEncoder: () => createJsonEncoderFn(TF.number()),
    schemaDecoder: () => createJsonDecoderFn(TF.number()),
    schemaBinaryEncoder: () => createBinaryEncoderFn(TF.number()),
    schemaBinaryDecoder: () => createBinaryDecoderFn(TF.number()),
    getTestData: () => ({values: [123456]}),
    getBinaryByteSizes: () => [8],
  },
  number_large: {
    title: 'number (large)',
    description:
      'The largest safe integer (16 digits). Its JSON text needs 16 bytes against a fixed 8-byte binary float64, so binary is smaller on the wire.',
    serializeNotes:
      'JSON writes Number.MAX_SAFE_INTEGER as 16 bytes; binary writes a fixed 8-byte float64. Large numbers favour binary on payload.',
    mutateEncoder: () => createJsonEncoderFn<number>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<number>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoderFn<number>(undefined, {strategy: 'direct'}),
    compactEncoder: () => createJsonEncoderFn<number>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoderFn<number>(),
    preserveDecoder: () => createJsonDecoderFn<number>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoderFn<number>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoderFn<number>(),
    binaryDecoder: () => createBinaryDecoderFn<number>(),
    schemaEncoder: () => createJsonEncoderFn(TF.number()),
    schemaDecoder: () => createJsonDecoderFn(TF.number()),
    schemaBinaryEncoder: () => createBinaryEncoderFn(TF.number()),
    schemaBinaryDecoder: () => createBinaryDecoderFn(TF.number()),
    getTestData: () => ({values: [Number.MAX_SAFE_INTEGER]}),
    getBinaryByteSizes: () => [8],
  },
  number_float_short: {
    title: 'number (low-precision float)',
    description:
      'A short decimal with few significant digits. Its JSON text is shorter than a binary float64, so JSON is smaller on the wire.',
    serializeNotes:
      'JSON writes "3.14" as 4 bytes; binary writes a fixed 8-byte float64. Low-precision floats favour JSON on payload.',
    mutateEncoder: () => createJsonEncoderFn<number>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<number>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoderFn<number>(undefined, {strategy: 'direct'}),
    compactEncoder: () => createJsonEncoderFn<number>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoderFn<number>(),
    preserveDecoder: () => createJsonDecoderFn<number>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoderFn<number>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoderFn<number>(),
    binaryDecoder: () => createBinaryDecoderFn<number>(),
    schemaEncoder: () => createJsonEncoderFn(TF.number()),
    schemaDecoder: () => createJsonDecoderFn(TF.number()),
    schemaBinaryEncoder: () => createBinaryEncoderFn(TF.number()),
    schemaBinaryDecoder: () => createBinaryDecoderFn(TF.number()),
    getTestData: () => ({values: [3.14]}),
    getBinaryByteSizes: () => [8],
  },
  number_float_precise: {
    title: 'number (high-precision float)',
    description:
      'A full-precision double with 17 significant digits (pi). Its JSON text needs 17 bytes against a fixed 8-byte binary float64, so binary is smaller on the wire.',
    serializeNotes:
      'JSON writes the 17-digit decimal as 17 bytes; binary writes a fixed 8-byte float64. High-precision floats favour binary on payload.',
    mutateEncoder: () => createJsonEncoderFn<number>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<number>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoderFn<number>(undefined, {strategy: 'direct'}),
    compactEncoder: () => createJsonEncoderFn<number>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoderFn<number>(),
    preserveDecoder: () => createJsonDecoderFn<number>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoderFn<number>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoderFn<number>(),
    binaryDecoder: () => createBinaryDecoderFn<number>(),
    schemaEncoder: () => createJsonEncoderFn(TF.number()),
    schemaDecoder: () => createJsonDecoderFn(TF.number()),
    schemaBinaryEncoder: () => createBinaryEncoderFn(TF.number()),
    schemaBinaryDecoder: () => createBinaryDecoderFn(TF.number()),
    getTestData: () => ({values: [3.141592653589793]}),
    getBinaryByteSizes: () => [8],
  },
  number_not_supported: {
    title: 'number edge cases',
    description: 'Infinity / NaN are not supported by all protocols and do not survive JSON encoding, becoming null on restore.',
    serializeNotes: [
      'JSON.stringify maps Infinity / -Infinity / NaN to null, so the strip / clone / mutate paths restore null.',
      'Binary writes float64, which preserves Infinity / -Infinity / NaN natively, so binary uses a separate test-data override.',
      'Direct path: stringifyJson uses String(v) at root, emitting the literal "Infinity" which JSON.parse rejects — safeAdapterStringifyJsonNotParseable opts into the loose "throw or non-equal" semantic.',
    ],
    mutateEncoder: () => createJsonEncoderFn<number>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<number>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoderFn<number>(undefined, {strategy: 'direct'}),
    compactEncoder: () => createJsonEncoderFn<number>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoderFn<number>(),
    preserveDecoder: () => createJsonDecoderFn<number>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoderFn<number>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoderFn<number>(),
    binaryDecoder: () => createBinaryDecoderFn<number>(),
    schemaEncoder: () => createJsonEncoderFn(TF.number()),
    schemaDecoder: () => createJsonDecoderFn(TF.number()),
    schemaBinaryEncoder: () => createBinaryEncoderFn(TF.number()),
    schemaBinaryDecoder: () => createBinaryDecoderFn(TF.number()),
    // Binary writes float64, which preserves Infinity/NaN natively —
    // no conversion to null like JSON.stringify does.
    getBinaryTestData: () => ({
      values: [Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NaN],
      deserializedValues: [Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NaN],
    }),
    getTestData: () => ({
      values: [Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NaN],
      // After JSON.stringify(Infinity) === 'null', restore yields null.
      deserializedValues: [null, null, null],
    }),
    // Safe-path adapter: stringifyJson at root uses `String(v)`
    // (ref: stringifyJson.ts:97). `String(Infinity) === "Infinity"`
    // which is not valid JSON — JSON.parse throws. The flag opts the
    // safe adapter into the loose "throw OR non-equal" semantic
    // for this case.
    safeAdapterStringifyJsonNotParseable: true,
  },
  regexp: {
    title: 'regexp',
    description:
      'Root `RegExp` round-trips across JSON and binary; samples cover various flag combinations (case-insensitive, global, anchored).',
    serializeNotes:
      'RegExp serializes to a `/source/flags` string on the JSON wire and is rebuilt with `new RegExp(...)` on decode; binary stores source and flags as separate strings.',
    mutateEncoder: () => createJsonEncoderFn<RegExp>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<RegExp>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoderFn<RegExp>(undefined, {strategy: 'direct'}),
    compactEncoder: () => createJsonEncoderFn<RegExp>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoderFn<RegExp>(),
    preserveDecoder: () => createJsonDecoderFn<RegExp>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoderFn<RegExp>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoderFn<RegExp>(),
    binaryDecoder: () => createBinaryDecoderFn<RegExp>(),
    schemaEncoder: () => createJsonEncoderFn(RT.regexp()),
    schemaDecoder: () => createJsonDecoderFn(RT.regexp()),
    schemaBinaryEncoder: () => createBinaryEncoderFn(RT.regexp()),
    schemaBinaryDecoder: () => createBinaryDecoderFn(RT.regexp()),
    getTestData: () => ({values: [/abc/, /xyz/i, /\d+/g, /^[a-z]+$/]}),
  },
  bigint: {
    title: 'bigint',
    description:
      'Root `bigint` round-trips across JSON and binary; bigint is not natively JSON-encodable so a transform applies.',
    serializeNotes: [
      'JSON encodes bigint to a decimal string and rebuilds it with `BigInt(...)` on decode.',
      'Plain `bigint` takes the binary string-fallback path (variable length), so no fixed byte size is asserted; only a 64-bit-fitting bigint format brand would encode to a fixed 8 bytes.',
    ],
    mutateEncoder: () => createJsonEncoderFn<bigint>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<bigint>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoderFn<bigint>(undefined, {strategy: 'direct'}),
    compactEncoder: () => createJsonEncoderFn<bigint>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoderFn<bigint>(),
    preserveDecoder: () => createJsonDecoderFn<bigint>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoderFn<bigint>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoderFn<bigint>(),
    binaryDecoder: () => createBinaryDecoderFn<bigint>(),
    schemaEncoder: () => createJsonEncoderFn(TF.bigInt()),
    schemaDecoder: () => createJsonDecoderFn(TF.bigInt()),
    schemaBinaryEncoder: () => createBinaryEncoderFn(TF.bigInt()),
    schemaBinaryDecoder: () => createBinaryDecoderFn(TF.bigInt()),
    // Span zero, negative, and a value beyond 64 bits / Number.MAX_SAFE_INTEGER
    // to exercise the decimal-string transform across magnitudes and signs.
    getTestData: () => ({values: [1n, 0n, -1n, -123456789012345678901234567890n, 18446744073709551616n]}),
  },
  boolean: {
    title: 'boolean',
    description: 'Root `boolean` round-trips identically across JSON and binary; no transform is needed.',
    mutateEncoder: () => createJsonEncoderFn<boolean>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<boolean>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoderFn<boolean>(undefined, {strategy: 'direct'}),
    compactEncoder: () => createJsonEncoderFn<boolean>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoderFn<boolean>(),
    preserveDecoder: () => createJsonDecoderFn<boolean>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoderFn<boolean>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoderFn<boolean>(),
    binaryDecoder: () => createBinaryDecoderFn<boolean>(),
    schemaEncoder: () => createJsonEncoderFn(RT.boolean()),
    schemaDecoder: () => createJsonDecoderFn(RT.boolean()),
    schemaBinaryEncoder: () => createBinaryEncoderFn(RT.boolean()),
    schemaBinaryDecoder: () => createBinaryDecoderFn(RT.boolean()),
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
    directEncoder: () => createJsonEncoderFn<any>(undefined, {strategy: 'direct'}),
    compactEncoder: () => createJsonEncoderFn<any>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoderFn<any>(),
    preserveDecoder: () => createJsonDecoderFn<any>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoderFn<any>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoderFn<any>(),
    binaryDecoder: () => createBinaryDecoderFn<any>(),
    schemaEncoder: () => createJsonEncoderFn(RT.any()),
    schemaDecoder: () => createJsonDecoderFn(RT.any()),
    schemaBinaryEncoder: () => createBinaryEncoderFn(RT.any()),
    schemaBinaryDecoder: () => createBinaryDecoderFn(RT.any()),
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
    directEncoder: () => createJsonEncoderFn<any>(undefined, {strategy: 'direct'}),
    compactEncoder: () => createJsonEncoderFn<any>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoderFn<any>(),
    preserveDecoder: () => createJsonDecoderFn<any>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoderFn<any>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoderFn<any>(),
    binaryDecoder: () => createBinaryDecoderFn<any>(),
    schemaEncoder: () => createJsonEncoderFn(RT.any()),
    schemaDecoder: () => createJsonDecoderFn(RT.any()),
    schemaBinaryEncoder: () => createBinaryEncoderFn(RT.any()),
    schemaBinaryDecoder: () => createBinaryDecoderFn(RT.any()),
    roundTripBestEffort: true,
    getTestData: () => ({values: [undefined, [undefined, 123, null], new Date('2000-08-06T02:13:00.000Z'), BigInt(1)]}),
  },
  null: {
    title: 'null',
    description: 'Root `null` literal round-trips identically across JSON and binary.',
    mutateEncoder: () => createJsonEncoderFn<null>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<null>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoderFn<null>(undefined, {strategy: 'direct'}),
    compactEncoder: () => createJsonEncoderFn<null>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoderFn<null>(),
    preserveDecoder: () => createJsonDecoderFn<null>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoderFn<null>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoderFn<null>(),
    binaryDecoder: () => createBinaryDecoderFn<null>(),
    schemaEncoder: () => createJsonEncoderFn(RT.literal(null)),
    schemaDecoder: () => createJsonDecoderFn(RT.literal(null)),
    schemaBinaryEncoder: () => createBinaryEncoderFn(RT.literal(null)),
    schemaBinaryDecoder: () => createBinaryDecoderFn(RT.literal(null)),
    getTestData: () => ({values: [null]}),
  },
  undefined: {
    title: 'undefined',
    description: 'Root `undefined` literal round-trips across JSON and binary.',
    serializeNotes:
      'JSON has no undefined, so the parsed value may arrive as null or missing; decode force-rebinds it back to undefined. Binary writes a marker byte and reconstructs undefined directly.',
    mutateEncoder: () => createJsonEncoderFn<undefined>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<undefined>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoderFn<undefined>(undefined, {strategy: 'direct'}),
    compactEncoder: () => createJsonEncoderFn<undefined>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoderFn<undefined>(),
    preserveDecoder: () => createJsonDecoderFn<undefined>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoderFn<undefined>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoderFn<undefined>(),
    binaryDecoder: () => createBinaryDecoderFn<undefined>(),
    schemaEncoder: () => createJsonEncoderFn(RT.literal(undefined)),
    schemaDecoder: () => createJsonDecoderFn(RT.literal(undefined)),
    schemaBinaryEncoder: () => createBinaryEncoderFn(RT.literal(undefined)),
    schemaBinaryDecoder: () => createBinaryDecoderFn(RT.literal(undefined)),
    getTestData: () => ({values: [undefined]}),
  },
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
    // and a pre-1970 (negative epoch) date — all must survive the ISO/float64
    // round-trip without precision loss.
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
  enum_color: {
    title: 'enum',
    description:
      'String enum `Color` round-trips across JSON and binary as its underlying string values; samples encode the `red` / `green` members.',
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
    directEncoder: () => {
      enum Color {
        Red = 'red',
        Green = 'green',
        Blue = 'blue',
      }
      return createJsonEncoderFn<Color>(undefined, {strategy: 'direct'});
    },
    compactEncoder: () => {
      enum Color {
        Red = 'red',
        Green = 'green',
        Blue = 'blue',
      }
      return createJsonEncoderFn<Color>(undefined, {strategy: 'compact'});
    },
    stripDecoder: () => {
      enum Color {
        Red = 'red',
        Green = 'green',
        Blue = 'blue',
      }
      return createJsonDecoderFn<Color>();
    },
    preserveDecoder: () => {
      enum Color {
        Red = 'red',
        Green = 'green',
        Blue = 'blue',
      }
      return createJsonDecoderFn<Color>(undefined, {strategy: 'preserve'});
    },
    compactDecoder: () => {
      enum Color {
        Red = 'red',
        Green = 'green',
        Blue = 'blue',
      }
      return createJsonDecoderFn<Color>(undefined, {strategy: 'compact'});
    },
    binaryEncoder: () => {
      enum Color {
        Red = 'red',
        Green = 'green',
        Blue = 'blue',
      }
      return createBinaryEncoderFn<Color>();
    },
    binaryDecoder: () => {
      enum Color {
        Red = 'red',
        Green = 'green',
        Blue = 'blue',
      }
      return createBinaryDecoderFn<Color>();
    },
    // Value-first enum via the enum-like RECORD form (self-contained per thunk):
    // `RT.enum({...})` carries the value-union, same as the string-literal union.
    schemaEncoder: () => createJsonEncoderFn(RT.enum({Red: 'red', Green: 'green', Blue: 'blue'})),
    schemaDecoder: () => createJsonDecoderFn(RT.enum({Red: 'red', Green: 'green', Blue: 'blue'})),
    schemaBinaryEncoder: () => createBinaryEncoderFn(RT.enum({Red: 'red', Green: 'green', Blue: 'blue'})),
    schemaBinaryDecoder: () => createBinaryDecoderFn(RT.enum({Red: 'red', Green: 'green', Blue: 'blue'})),
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
      'symbol at root is unsupported because identity does not survive JSON or binary round-trips, so the factory is rendered as alwaysThrow.',
    mutateEncoder: () => createJsonEncoderFn<symbol>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<symbol>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoderFn<symbol>(undefined, {strategy: 'direct'}),
    compactEncoder: () => createJsonEncoderFn<symbol>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoderFn<symbol>(),
    preserveDecoder: () => createJsonDecoderFn<symbol>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoderFn<symbol>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoderFn<symbol>(),
    binaryDecoder: () => createBinaryDecoderFn<symbol>(),
    // Bare symbol resolves the same alwaysThrow factory via the value-first path,
    // so each schema thunk throws like the type-first form (factoryThrows below).
    schemaEncoder: () => createJsonEncoderFn(RT.symbol()),
    schemaDecoder: () => createJsonDecoderFn(RT.symbol()),
    schemaBinaryEncoder: () => createBinaryEncoderFn(RT.symbol()),
    schemaBinaryDecoder: () => createBinaryDecoderFn(RT.symbol()),
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
    directEncoder: () => createJsonEncoderFn<object>(undefined, {strategy: 'direct'}),
    compactEncoder: () => createJsonEncoderFn<object>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoderFn<object>(),
    preserveDecoder: () => createJsonDecoderFn<object>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoderFn<object>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoderFn<object>(),
    binaryDecoder: () => createBinaryDecoderFn<object>(),
    // No value-first builder for the TS `object` primitive (any non-null
    // non-primitive) — `RT.object(...)` is the shape composer, a different kind.
    schemaEncoder: 'not-supported',
    schemaDecoder: 'not-supported',
    schemaBinaryEncoder: 'not-supported',
    schemaBinaryDecoder: 'not-supported',
    roundTripBestEffort: true,
    getTestData: () => ({values: [{a: 42, b: 'hello'}, null]}),
  },
  void: {
    title: 'void',
    description: 'Root `void` round-trips across JSON and binary with an undefined sample, decoding back to undefined.',
    serializeNotes:
      'JSON has no undefined, so the parsed value may arrive as null or missing and decode force-rebinds it to undefined; binary writes a marker byte and reconstructs undefined.',
    mutateEncoder: () => createJsonEncoderFn<void>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<void>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoderFn<void>(undefined, {strategy: 'direct'}),
    compactEncoder: () => createJsonEncoderFn<void>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoderFn<void>(),
    preserveDecoder: () => createJsonDecoderFn<void>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoderFn<void>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoderFn<void>(),
    binaryDecoder: () => createBinaryDecoderFn<void>(),
    schemaEncoder: () => createJsonEncoderFn(RT.void()),
    schemaDecoder: () => createJsonDecoderFn(RT.void()),
    schemaBinaryEncoder: () => createBinaryEncoderFn(RT.void()),
    schemaBinaryDecoder: () => createBinaryDecoderFn(RT.void()),
    getTestData: () => ({values: [undefined]}),
  },
  never: {
    title: 'never',
    description: 'never type cannot be JSON-encoded or decoded — invoking the factory throws.',
    mutateEncoder: () => createJsonEncoderFn<never>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<never>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoderFn<never>(undefined, {strategy: 'direct'}),
    compactEncoder: () => createJsonEncoderFn<never>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoderFn<never>(),
    preserveDecoder: () => createJsonDecoderFn<never>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoderFn<never>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoderFn<never>(),
    binaryDecoder: () => createBinaryDecoderFn<never>(),
    // never resolves the same alwaysThrow factory via the value-first path.
    schemaEncoder: () => createJsonEncoderFn(RT.never()),
    schemaDecoder: () => createJsonDecoderFn(RT.never()),
    schemaBinaryEncoder: () => createBinaryEncoderFn(RT.never()),
    schemaBinaryDecoder: () => createBinaryDecoderFn(RT.never()),
    factoryThrows: true,
    getTestData: () => ({values: []}),
  },
  literal_string: {
    title: 'string literal',
    description: 'A string-literal type round-trips identically across JSON and binary as a plain string.',
    mutateEncoder: () => createJsonEncoderFn<'hello'>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<'hello'>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoderFn<'hello'>(undefined, {strategy: 'direct'}),
    compactEncoder: () => createJsonEncoderFn<'hello'>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoderFn<'hello'>(),
    preserveDecoder: () => createJsonDecoderFn<'hello'>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoderFn<'hello'>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoderFn<'hello'>(),
    binaryDecoder: () => createBinaryDecoderFn<'hello'>(),
    schemaEncoder: () => createJsonEncoderFn(RT.literal('hello')),
    schemaDecoder: () => createJsonDecoderFn(RT.literal('hello')),
    schemaBinaryEncoder: () => createBinaryEncoderFn(RT.literal('hello')),
    schemaBinaryDecoder: () => createBinaryDecoderFn(RT.literal('hello')),
    getTestData: () => ({values: ['hello']}),
  },
  literal_number: {
    title: 'number literal',
    description: 'A number-literal type round-trips identically across JSON and binary as a plain number.',
    mutateEncoder: () => createJsonEncoderFn<42>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<42>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoderFn<42>(undefined, {strategy: 'direct'}),
    compactEncoder: () => createJsonEncoderFn<42>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoderFn<42>(),
    preserveDecoder: () => createJsonDecoderFn<42>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoderFn<42>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoderFn<42>(),
    binaryDecoder: () => createBinaryDecoderFn<42>(),
    schemaEncoder: () => createJsonEncoderFn(RT.literal(42)),
    schemaDecoder: () => createJsonDecoderFn(RT.literal(42)),
    schemaBinaryEncoder: () => createBinaryEncoderFn(RT.literal(42)),
    schemaBinaryDecoder: () => createBinaryDecoderFn(RT.literal(42)),
    getTestData: () => ({values: [42]}),
  },
  literal_boolean: {
    title: 'boolean literal',
    description: 'A boolean-literal type round-trips identically across JSON and binary as a plain boolean.',
    mutateEncoder: () => createJsonEncoderFn<true>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<true>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoderFn<true>(undefined, {strategy: 'direct'}),
    compactEncoder: () => createJsonEncoderFn<true>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoderFn<true>(),
    preserveDecoder: () => createJsonDecoderFn<true>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoderFn<true>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoderFn<true>(),
    binaryDecoder: () => createBinaryDecoderFn<true>(),
    schemaEncoder: () => createJsonEncoderFn(RT.literal(true)),
    schemaDecoder: () => createJsonDecoderFn(RT.literal(true)),
    schemaBinaryEncoder: () => createBinaryEncoderFn(RT.literal(true)),
    schemaBinaryDecoder: () => createBinaryDecoderFn(RT.literal(true)),
    getTestData: () => ({values: [true]}),
  },
} as const satisfies Record<string, SerializationCase>;
