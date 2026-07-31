import * as TF from '@ts-runtypes/core/formats';
import {createBinaryDecoderFn, createBinaryEncoderFn, createJsonDecoderFn, createJsonEncoderFn} from '@ts-runtypes/core';
import * as RT from '@ts-runtypes/core/schema';
import type {SerializationCase} from './types.ts';

export const RECORDS = {
  index_property: {
    title: 'Index property',
    description:
      'Root `{[key: string]: string}` dynamic-key record of string values where JSON and binary round-trip every key/value pair (and empty objects) as a plain object with no per-value transform on the atomic string values.',
    serializeNotes:
      'The index signature admits every key, so strip and preserve decode identically — there are no undeclared keys to drop.',
    mutateEncoder: () => createJsonEncoderFn<{[key: string]: string}>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<{[key: string]: string}>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoderFn<{[key: string]: string}>(undefined, {strategy: 'direct'}),
    compactEncoder: () => createJsonEncoderFn<{[key: string]: string}>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoderFn<{[key: string]: string}>(),
    preserveDecoder: () => createJsonDecoderFn<{[key: string]: string}>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoderFn<{[key: string]: string}>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoderFn<{[key: string]: string}>(),
    binaryDecoder: () => createBinaryDecoderFn<{[key: string]: string}>(),
    schemaEncoder: () => createJsonEncoderFn(RT.record(TF.string())),
    schemaDecoder: () => createJsonDecoderFn(RT.record(TF.string())),
    schemaBinaryEncoder: () => createBinaryEncoderFn(RT.record(TF.string())),
    schemaBinaryDecoder: () => createBinaryDecoderFn(RT.record(TF.string())),
    getTestData: () => ({values: [{key1: 'value1', key2: 'value2'}, {}]}),
  },
  index_property_and_prop: {
    title: 'Property and index',
    description:
      'Root `{a: string; [key: string]: string}` with a declared `a` plus a string-valued index signature where JSON and binary round-trip the declared property alongside any number of dynamic string keys, with samples covering the `a`-only shape and one with an extra `b` key.',
    serializeNotes:
      'The index signature admits every key, so strip and preserve decode identically — dynamic keys are never treated as undeclared.',
    mutateEncoder: () => createJsonEncoderFn<{a: string; [key: string]: string}>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<{a: string; [key: string]: string}>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoderFn<{a: string; [key: string]: string}>(undefined, {strategy: 'direct'}),
    compactEncoder: () => createJsonEncoderFn<{a: string; [key: string]: string}>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoderFn<{a: string; [key: string]: string}>(),
    preserveDecoder: () => createJsonDecoderFn<{a: string; [key: string]: string}>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoderFn<{a: string; [key: string]: string}>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoderFn<{a: string; [key: string]: string}>(),
    binaryDecoder: () => createBinaryDecoderFn<{a: string; [key: string]: string}>(),
    schemaEncoder: () => createJsonEncoderFn(RT.intersection(RT.record(TF.string()), RT.object({a: TF.string()}))),
    schemaDecoder: () => createJsonDecoderFn(RT.intersection(RT.record(TF.string()), RT.object({a: TF.string()}))),
    schemaBinaryEncoder: () => createBinaryEncoderFn(RT.intersection(RT.record(TF.string()), RT.object({a: TF.string()}))),
    schemaBinaryDecoder: () => createBinaryDecoderFn(RT.intersection(RT.record(TF.string()), RT.object({a: TF.string()}))),
    getTestData: () => ({values: [{a: 'helloA'}, {a: 'helloA', b: 'helloB'}]}),
  },
  index_property_extra: {
    title: 'Index with unions',
    description:
      'Root `{a: string; b: number; [key: string]: string | number}` with declared `a`/`b` plus a `string | number` index signature where JSON and binary round-trip the declared props alongside dynamic keys whose per-value union is resolved structurally on encode and decode.',
    serializeNotes:
      'The index signature admits every key, so strip and preserve decode identically — dynamic string-or-number keys are never dropped.',
    mutateEncoder: () =>
      createJsonEncoderFn<{a: string; b: number; [key: string]: string | number}>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () =>
      createJsonEncoderFn<{a: string; b: number; [key: string]: string | number}>(undefined, {strategy: 'clone'}),
    directEncoder: () =>
      createJsonEncoderFn<{a: string; b: number; [key: string]: string | number}>(undefined, {strategy: 'direct'}),
    compactEncoder: () =>
      createJsonEncoderFn<{a: string; b: number; [key: string]: string | number}>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoderFn<{a: string; b: number; [key: string]: string | number}>(),
    preserveDecoder: () =>
      createJsonDecoderFn<{a: string; b: number; [key: string]: string | number}>(undefined, {strategy: 'preserve'}),
    compactDecoder: () =>
      createJsonDecoderFn<{a: string; b: number; [key: string]: string | number}>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoderFn<{a: string; b: number; [key: string]: string | number}>(),
    binaryDecoder: () => createBinaryDecoderFn<{a: string; b: number; [key: string]: string | number}>(),
    schemaEncoder: () =>
      createJsonEncoderFn(
        RT.intersection(RT.record(RT.union([TF.string(), TF.number()])), RT.object({a: TF.string(), b: TF.number()}))
      ),
    schemaDecoder: () =>
      createJsonDecoderFn(
        RT.intersection(RT.record(RT.union([TF.string(), TF.number()])), RT.object({a: TF.string(), b: TF.number()}))
      ),
    schemaBinaryEncoder: () =>
      createBinaryEncoderFn(
        RT.intersection(RT.record(RT.union([TF.string(), TF.number()])), RT.object({a: TF.string(), b: TF.number()}))
      ),
    schemaBinaryDecoder: () =>
      createBinaryDecoderFn(
        RT.intersection(RT.record(RT.union([TF.string(), TF.number()])), RT.object({a: TF.string(), b: TF.number()}))
      ),
    getTestData: () => ({values: [{key1: 'value1', key2: 'value2', a: 'extra1', b: 123}]}),
  },
  multiple_index_props: {
    title: 'Multiple index signatures',
    description:
      'Root `{[key: string]: string; [key: number]: string; [abc: symbol]: Date}` with three heterogeneous index signatures where string and number keys round-trip as object keys while non-serializable symbol-keyed entries are silently dropped, leaving the decoded value with only the string/number keys.',
    serializeNotes: [
      'Symbol-keyed entries are non-serializable: JSON.stringify omits them and the round-trip restores only the string/number keys (deserializedValues reflects the dropped symbol keys).',
      'No value-first schema can express multiple heterogeneous index signatures (RT.record takes a single key/value pair), so the schema variants opt out via not-supported.',
    ],
    mutateEncoder: () =>
      createJsonEncoderFn<{[key: string]: string; [key: number]: string; [abc: symbol]: Date}>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () =>
      createJsonEncoderFn<{[key: string]: string; [key: number]: string; [abc: symbol]: Date}>(undefined, {strategy: 'clone'}),
    directEncoder: () =>
      createJsonEncoderFn<{[key: string]: string; [key: number]: string; [abc: symbol]: Date}>(undefined, {strategy: 'direct'}),
    compactEncoder: () =>
      createJsonEncoderFn<{[key: string]: string; [key: number]: string; [abc: symbol]: Date}>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoderFn<{[key: string]: string; [key: number]: string; [abc: symbol]: Date}>(),
    preserveDecoder: () =>
      createJsonDecoderFn<{[key: string]: string; [key: number]: string; [abc: symbol]: Date}>(undefined, {strategy: 'preserve'}),
    compactDecoder: () =>
      createJsonDecoderFn<{[key: string]: string; [key: number]: string; [abc: symbol]: Date}>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoderFn<{[key: string]: string; [key: number]: string; [abc: symbol]: Date}>(),
    binaryDecoder: () => createBinaryDecoderFn<{[key: string]: string; [key: number]: string; [abc: symbol]: Date}>(),
    // No value-first builder can express MULTIPLE heterogeneous index signatures
    // (string + number + symbol keys) in one shape — `RT.record(...)` takes a
    // single key/value pair, so e.g. `RT.record(TF.string())` types as
    // `Record<string, string>`, which does not match the declared multi-index type.
    schemaEncoder: 'not-supported',
    schemaDecoder: 'not-supported',
    schemaBinaryEncoder: 'not-supported',
    schemaBinaryDecoder: 'not-supported',
    getTestData: () => {
      const objWithSymbolKeys = {
        key1: 'value1',
        key2: 'value2',
        [Symbol('key3')]: new Date(),
        [Symbol('key4')]: new Date(),
      };
      // Numeric keys exercise the [key: number] index signature: JS stores them
      // as string property keys, JSON emits them as string keys, and the
      // round-trip restores them as string keys — the headline number-key→string
      // behavior. (`{5: 'five'}` and `{'5': 'five'}` are the same object.)
      const objWithNumericKeys = {0: 'zero', 5: 'five', key1: 'value1'};
      return {
        values: [{key1: 'value1', key2: 'value2'}, objWithSymbolKeys, objWithNumericKeys],
        deserializedValues: [
          {key1: 'value1', key2: 'value2'},
          {key1: 'value1', key2: 'value2'},
          {0: 'zero', 5: 'five', key1: 'value1'},
        ],
      };
    },
  },
  index_property_nested: {
    title: 'Nested index',
    description:
      'Root `{[key: string]: {[key: string]: number}}` record whose values are themselves string-keyed number records, where JSON and binary round-trip both levels of dynamic keys as nested plain objects with no per-value transform on the atomic number values.',
    serializeNotes:
      'Both index signatures admit every key at their level, so strip and preserve decode identically — no key is undeclared.',
    mutateEncoder: () => createJsonEncoderFn<{[key: string]: {[key: string]: number}}>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<{[key: string]: {[key: string]: number}}>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoderFn<{[key: string]: {[key: string]: number}}>(undefined, {strategy: 'direct'}),
    compactEncoder: () => createJsonEncoderFn<{[key: string]: {[key: string]: number}}>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoderFn<{[key: string]: {[key: string]: number}}>(),
    preserveDecoder: () => createJsonDecoderFn<{[key: string]: {[key: string]: number}}>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoderFn<{[key: string]: {[key: string]: number}}>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoderFn<{[key: string]: {[key: string]: number}}>(),
    binaryDecoder: () => createBinaryDecoderFn<{[key: string]: {[key: string]: number}}>(),
    schemaEncoder: () => createJsonEncoderFn(RT.record(RT.record(TF.number()))),
    schemaDecoder: () => createJsonDecoderFn(RT.record(RT.record(TF.number()))),
    schemaBinaryEncoder: () => createBinaryEncoderFn(RT.record(RT.record(TF.number()))),
    schemaBinaryDecoder: () => createBinaryDecoderFn(RT.record(RT.record(TF.number()))),
    getTestData: () => ({values: [{key1: {nestedKey1: 1, nestedKey2: 2}}]}),
  },
  index_property_nested_date: {
    title: 'Nested Date index',
    description:
      'Root `{[key: string]: {[key: string]: Date}}` record of string-keyed records whose innermost values are `Date`, where JSON and binary round-trip both levels of dynamic keys with each `Date` becoming an ISO string on encode and rebuilt via `new Date(...)` on decode.',
    serializeNotes:
      'Innermost Date values serialize via their ISO string and restore with new Date(...); both index signatures admit every key, so strip and preserve decode identically.',
    mutateEncoder: () => createJsonEncoderFn<{[key: string]: {[key: string]: Date}}>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<{[key: string]: {[key: string]: Date}}>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoderFn<{[key: string]: {[key: string]: Date}}>(undefined, {strategy: 'direct'}),
    compactEncoder: () => createJsonEncoderFn<{[key: string]: {[key: string]: Date}}>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoderFn<{[key: string]: {[key: string]: Date}}>(),
    preserveDecoder: () => createJsonDecoderFn<{[key: string]: {[key: string]: Date}}>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoderFn<{[key: string]: {[key: string]: Date}}>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoderFn<{[key: string]: {[key: string]: Date}}>(),
    binaryDecoder: () => createBinaryDecoderFn<{[key: string]: {[key: string]: Date}}>(),
    schemaEncoder: () => createJsonEncoderFn(RT.record(RT.record(TF.date()))),
    schemaDecoder: () => createJsonDecoderFn(RT.record(RT.record(TF.date()))),
    schemaBinaryEncoder: () => createBinaryEncoderFn(RT.record(RT.record(TF.date()))),
    schemaBinaryDecoder: () => createBinaryDecoderFn(RT.record(RT.record(TF.date()))),
    getTestData: () => ({
      values: [
        {
          key1: {
            nestedKey1: new Date('2000-08-06T02:13:00.000Z'),
            nestedKey2: new Date('2000-08-06T02:13:00.000Z'),
          },
        },
      ],
    }),
  },
  index_property_bigint: {
    title: 'Bigint index',
    description:
      'Root `{[key: string]: bigint}` dynamic-key record of bigint values where JSON serializes each value as a decimal string (not natively JSON-encodable) and restores it with `BigInt(...)`, binary encodes the values natively, and keys round-trip as plain object keys.',
    serializeNotes: [
      'bigint values serialize as decimal strings and restore via BigInt(...); JSON cannot encode bigint directly.',
      'The index signature admits every key, so strip and preserve decode identically.',
    ],
    mutateEncoder: () => createJsonEncoderFn<{[key: string]: bigint}>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<{[key: string]: bigint}>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoderFn<{[key: string]: bigint}>(undefined, {strategy: 'direct'}),
    compactEncoder: () => createJsonEncoderFn<{[key: string]: bigint}>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoderFn<{[key: string]: bigint}>(),
    preserveDecoder: () => createJsonDecoderFn<{[key: string]: bigint}>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoderFn<{[key: string]: bigint}>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoderFn<{[key: string]: bigint}>(),
    binaryDecoder: () => createBinaryDecoderFn<{[key: string]: bigint}>(),
    schemaEncoder: () => createJsonEncoderFn(RT.record(TF.bigInt())),
    schemaDecoder: () => createJsonDecoderFn(RT.record(TF.bigInt())),
    schemaBinaryEncoder: () => createBinaryEncoderFn(RT.record(TF.bigInt())),
    schemaBinaryDecoder: () => createBinaryDecoderFn(RT.record(TF.bigInt())),
    getTestData: () => ({
      values: [
        {key1: 1n, key2: 2n},
        {hello: 1n, world: 2n},
      ],
    }),
  },
  index_property_non_root: {
    title: 'Non-root index',
    description:
      'Root object `{b: string; c: {...}}` where the nested `c` carries a declared `a` plus a string-valued index signature, so JSON and binary round-trip the fixed root shape while the nested `c` admits arbitrary dynamic string keys alongside `a`.',
    serializeNotes:
      'Only the nested `c` has an index signature, so its dynamic keys survive strip and preserve identically; the root has a fixed declared shape.',
    mutateEncoder: () => createJsonEncoderFn<{b: string; c: {a: string; [key: string]: string}}>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<{b: string; c: {a: string; [key: string]: string}}>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoderFn<{b: string; c: {a: string; [key: string]: string}}>(undefined, {strategy: 'direct'}),
    compactEncoder: () =>
      createJsonEncoderFn<{b: string; c: {a: string; [key: string]: string}}>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoderFn<{b: string; c: {a: string; [key: string]: string}}>(),
    preserveDecoder: () =>
      createJsonDecoderFn<{b: string; c: {a: string; [key: string]: string}}>(undefined, {strategy: 'preserve'}),
    compactDecoder: () =>
      createJsonDecoderFn<{b: string; c: {a: string; [key: string]: string}}>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoderFn<{b: string; c: {a: string; [key: string]: string}}>(),
    binaryDecoder: () => createBinaryDecoderFn<{b: string; c: {a: string; [key: string]: string}}>(),
    schemaEncoder: () =>
      createJsonEncoderFn(RT.object({b: TF.string(), c: RT.intersection(RT.record(TF.string()), RT.object({a: TF.string()}))})),
    schemaDecoder: () =>
      createJsonDecoderFn(RT.object({b: TF.string(), c: RT.intersection(RT.record(TF.string()), RT.object({a: TF.string()}))})),
    schemaBinaryEncoder: () =>
      createBinaryEncoderFn(RT.object({b: TF.string(), c: RT.intersection(RT.record(TF.string()), RT.object({a: TF.string()}))})),
    schemaBinaryDecoder: () =>
      createBinaryDecoderFn(RT.object({b: TF.string(), c: RT.intersection(RT.record(TF.string()), RT.object({a: TF.string()}))})),
    getTestData: () => ({values: [{b: 'hello', c: {a: 'world', c: 'world'}}]}),
  },
} as const satisfies Record<string, SerializationCase>;
