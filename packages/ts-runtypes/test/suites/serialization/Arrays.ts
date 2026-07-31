import * as TF from '@ts-runtypes/core/formats';
import {createBinaryDecoderFn, createBinaryEncoderFn, createJsonDecoderFn, createJsonEncoderFn} from '@ts-runtypes/core';
import * as RT from '@ts-runtypes/core/schema';
import type {SerializationCase} from './types.ts';

export const ARRAYS = {
  array: {
    title: 'Array',
    description:
      'Root `string[]` round-trips identically across JSON and binary, with samples covering a populated array and the empty case.',
    mutateEncoder: () => createJsonEncoderFn<string[]>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<string[]>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoderFn<string[]>(undefined, {strategy: 'direct'}),
    compactEncoder: () => createJsonEncoderFn<string[]>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoderFn<string[]>(),
    preserveDecoder: () => createJsonDecoderFn<string[]>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoderFn<string[]>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoderFn<string[]>(),
    binaryDecoder: () => createBinaryDecoderFn<string[]>(),
    schemaEncoder: () => createJsonEncoderFn(RT.array(TF.string())),
    schemaDecoder: () => createJsonDecoderFn(RT.array(TF.string())),
    schemaBinaryEncoder: () => createBinaryEncoderFn(RT.array(TF.string())),
    schemaBinaryDecoder: () => createBinaryDecoderFn(RT.array(TF.string())),
    getTestData: () => ({values: [['hello', 'world'], []]}),
  },
  array_date: {
    title: 'Date array',
    description:
      '`Date[]` encodes each element to an ISO string on the JSON wire and restores to a Date, while binary packs each as a fixed 8-byte epoch.',
    serializeNotes:
      'Per-element Date transform applies recursively over the array; the empty-array sample confirms no element work happens when there are no items.',
    mutateEncoder: () => createJsonEncoderFn<Date[]>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<Date[]>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoderFn<Date[]>(undefined, {strategy: 'direct'}),
    compactEncoder: () => createJsonEncoderFn<Date[]>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoderFn<Date[]>(),
    preserveDecoder: () => createJsonDecoderFn<Date[]>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoderFn<Date[]>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoderFn<Date[]>(),
    binaryDecoder: () => createBinaryDecoderFn<Date[]>(),
    schemaEncoder: () => createJsonEncoderFn(RT.array(TF.date())),
    schemaDecoder: () => createJsonDecoderFn(RT.array(TF.date())),
    schemaBinaryEncoder: () => createBinaryEncoderFn(RT.array(TF.date())),
    schemaBinaryDecoder: () => createBinaryDecoderFn(RT.array(TF.date())),
    getTestData: () => ({
      values: [[new Date('2000-08-06T02:13:00.000Z'), new Date('2001-09-07T03:14:00.000Z')], []],
    }),
  },
  undefined_in_array: {
    title: 'Undefined array elements',
    description: '`undefined[]` array slots cannot hold undefined on the JSON wire, so each is serialized as null.',
    serializeNotes:
      'JSON.stringify writes each undefined element as null (array holes/undefined become null, unlike object props which are dropped); decode restores them per the declared literal type.',
    mutateEncoder: () => createJsonEncoderFn<undefined[]>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<undefined[]>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoderFn<undefined[]>(undefined, {strategy: 'direct'}),
    compactEncoder: () => createJsonEncoderFn<undefined[]>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoderFn<undefined[]>(),
    preserveDecoder: () => createJsonDecoderFn<undefined[]>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoderFn<undefined[]>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoderFn<undefined[]>(),
    binaryDecoder: () => createBinaryDecoderFn<undefined[]>(),
    schemaEncoder: () => createJsonEncoderFn(RT.array(RT.literal(undefined))),
    schemaDecoder: () => createJsonDecoderFn(RT.array(RT.literal(undefined))),
    schemaBinaryEncoder: () => createBinaryEncoderFn(RT.array(RT.literal(undefined))),
    schemaBinaryDecoder: () => createBinaryDecoderFn(RT.array(RT.literal(undefined))),
    getTestData: () => ({values: [[undefined, undefined]]}),
  },
  null_in_array: {
    title: 'Null array elements',
    description: '`null[]` array slots serialize as the JSON `null` literal across every strategy.',
    serializeNotes:
      'A null element must emit the literal `null` on the wire: the single-pass `direct` strategy builds the array via `[...].join(",")`, which coerces a bare null to the empty string, so the element is emitted as the constant `"null"` to stay valid JSON.',
    mutateEncoder: () => createJsonEncoderFn<null[]>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<null[]>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoderFn<null[]>(undefined, {strategy: 'direct'}),
    compactEncoder: () => createJsonEncoderFn<null[]>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoderFn<null[]>(),
    preserveDecoder: () => createJsonDecoderFn<null[]>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoderFn<null[]>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoderFn<null[]>(),
    binaryDecoder: () => createBinaryDecoderFn<null[]>(),
    schemaEncoder: () => createJsonEncoderFn(RT.array(RT.literal(null))),
    schemaDecoder: () => createJsonDecoderFn(RT.array(RT.literal(null))),
    schemaBinaryEncoder: () => createBinaryEncoderFn(RT.array(RT.literal(null))),
    schemaBinaryDecoder: () => createBinaryDecoderFn(RT.array(RT.literal(null))),
    getTestData: () => ({values: [[null, null], []]}),
  },
  nullable_number_array: {
    title: 'Nullable number array',
    description: '`(number | null)[]` round-trips a mix of numbers and nulls identically across every strategy.',
    serializeNotes:
      'The common nullable-element case: each null in the array must survive as the JSON `null` literal (it previously corrupted the `direct` wire to `[1,,2]`).',
    mutateEncoder: () => createJsonEncoderFn<(number | null)[]>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<(number | null)[]>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoderFn<(number | null)[]>(undefined, {strategy: 'direct'}),
    compactEncoder: () => createJsonEncoderFn<(number | null)[]>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoderFn<(number | null)[]>(),
    preserveDecoder: () => createJsonDecoderFn<(number | null)[]>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoderFn<(number | null)[]>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoderFn<(number | null)[]>(),
    binaryDecoder: () => createBinaryDecoderFn<(number | null)[]>(),
    schemaEncoder: () => createJsonEncoderFn(RT.array(RT.union([TF.number(), RT.literal(null)]))),
    schemaDecoder: () => createJsonDecoderFn(RT.array(RT.union([TF.number(), RT.literal(null)]))),
    schemaBinaryEncoder: () => createBinaryEncoderFn(RT.array(RT.union([TF.number(), RT.literal(null)]))),
    schemaBinaryDecoder: () => createBinaryDecoderFn(RT.array(RT.union([TF.number(), RT.literal(null)]))),
    getTestData: () => ({values: [[1, null, 2], [null], []]}),
  },
  void_in_array: {
    title: 'Void array elements',
    description: '`void[]` array slots serialize as null across every strategy (same wire as undefined elements).',
    serializeNotes:
      'void normalises to undefined, so a void element follows the undefined rule: emitted as the JSON null literal in an array slot (the single-pass direct strategy must emit the constant "null" so the `.join(",")` array build stays valid JSON).',
    mutateEncoder: () => createJsonEncoderFn<void[]>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<void[]>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoderFn<void[]>(undefined, {strategy: 'direct'}),
    compactEncoder: () => createJsonEncoderFn<void[]>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoderFn<void[]>(),
    preserveDecoder: () => createJsonDecoderFn<void[]>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoderFn<void[]>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoderFn<void[]>(),
    binaryDecoder: () => createBinaryDecoderFn<void[]>(),
    schemaEncoder: () => createJsonEncoderFn(RT.array(RT.void())),
    schemaDecoder: () => createJsonDecoderFn(RT.array(RT.void())),
    schemaBinaryEncoder: () => createBinaryEncoderFn(RT.array(RT.void())),
    schemaBinaryDecoder: () => createBinaryDecoderFn(RT.array(RT.void())),
    getTestData: () => ({values: [[undefined, undefined]]}),
  },
  multi_dimensional: {
    title: 'Multi-dimensional array',
    description:
      'Nested `string[][]` round-trips identically across JSON and binary, with samples mixing ragged inner arrays alongside empty inner and outer arrays.',
    mutateEncoder: () => createJsonEncoderFn<string[][]>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<string[][]>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoderFn<string[][]>(undefined, {strategy: 'direct'}),
    compactEncoder: () => createJsonEncoderFn<string[][]>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoderFn<string[][]>(),
    preserveDecoder: () => createJsonDecoderFn<string[][]>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoderFn<string[][]>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoderFn<string[][]>(),
    binaryDecoder: () => createBinaryDecoderFn<string[][]>(),
    schemaEncoder: () => createJsonEncoderFn(RT.array(RT.array(TF.string()))),
    schemaDecoder: () => createJsonDecoderFn(RT.array(RT.array(TF.string()))),
    schemaBinaryEncoder: () => createBinaryEncoderFn(RT.array(RT.array(TF.string()))),
    schemaBinaryDecoder: () => createBinaryDecoderFn(RT.array(RT.array(TF.string()))),
    getTestData: () => ({values: [[['hello', 'world'], ['a', 'b'], []], []]}),
  },
  non_serializable_in_array: {
    title: 'Non-serializable array elements',
    description:
      '`symbol[]` should throw at RT-compile time per the reference semantics because a non-serializable element propagates to the root.',
    mutateEncoder: () => createJsonEncoderFn<symbol[]>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<symbol[]>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoderFn<symbol[]>(undefined, {strategy: 'direct'}),
    compactEncoder: () => createJsonEncoderFn<symbol[]>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoderFn<symbol[]>(),
    preserveDecoder: () => createJsonDecoderFn<symbol[]>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoderFn<symbol[]>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoderFn<symbol[]>(),
    binaryDecoder: () => createBinaryDecoderFn<symbol[]>(),
    // Non-serializable array element (symbol) propagates to the root → alwaysThrow.
    // `RT.array(RT.symbol())` resolves the same factory, so each schema thunk throws.
    schemaEncoder: () => createJsonEncoderFn(RT.array(RT.symbol())),
    schemaDecoder: () => createJsonDecoderFn(RT.array(RT.symbol())),
    schemaBinaryEncoder: () => createBinaryEncoderFn(RT.array(RT.symbol())),
    schemaBinaryDecoder: () => createBinaryDecoderFn(RT.array(RT.symbol())),
    factoryThrows: true,
    getTestData: () => ({values: []}),
  },
  array_circular: {
    title: 'Circular array',
    description:
      'Self-referential `type CircularArray = CircularArray[]` exercises recursive element walking via the value-first `RT.circular` builder and a deeply nested empty-array sample.',
    mutateEncoder: () => {
      type CircularArray = CircularArray[];
      return createJsonEncoderFn<CircularArray>(undefined, {strategy: 'mutate'});
    },
    cloneEncoder: () => {
      type CircularArray = CircularArray[];
      return createJsonEncoderFn<CircularArray>(undefined, {strategy: 'clone'});
    },
    directEncoder: () => {
      type CircularArray = CircularArray[];
      return createJsonEncoderFn<CircularArray>(undefined, {strategy: 'direct'});
    },
    compactEncoder: () => {
      type CircularArray = CircularArray[];
      return createJsonEncoderFn<CircularArray>(undefined, {strategy: 'compact'});
    },
    stripDecoder: () => {
      type CircularArray = CircularArray[];
      return createJsonDecoderFn<CircularArray>();
    },
    preserveDecoder: () => {
      type CircularArray = CircularArray[];
      return createJsonDecoderFn<CircularArray>(undefined, {strategy: 'preserve'});
    },
    compactDecoder: () => {
      type CircularArray = CircularArray[];
      return createJsonDecoderFn<CircularArray>(undefined, {strategy: 'compact'});
    },
    binaryEncoder: () => {
      type CircularArray = CircularArray[];
      return createBinaryEncoderFn<CircularArray>();
    },
    binaryDecoder: () => {
      type CircularArray = CircularArray[];
      return createBinaryDecoderFn<CircularArray>();
    },
    schemaEncoder: () => {
      const ca = RT.circular(RT.array(RT.self()));
      return createJsonEncoderFn(ca);
    },
    schemaDecoder: () => {
      const ca = RT.circular(RT.array(RT.self()));
      return createJsonDecoderFn(ca);
    },
    schemaBinaryEncoder: () => {
      const ca = RT.circular(RT.array(RT.self()));
      return createBinaryEncoderFn(ca);
    },
    schemaBinaryDecoder: () => {
      const ca = RT.circular(RT.array(RT.self()));
      return createBinaryDecoderFn(ca);
    },
    getTestData: () => {
      type CircularArray = CircularArray[];
      const arr: CircularArray = [];
      arr.push([]);
      arr[0].push([]);
      arr[0][0].push([]);
      return {values: [arr, []]};
    },
  },
} as const satisfies Record<string, SerializationCase>;
