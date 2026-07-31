import * as TF from '@ts-runtypes/core/formats';
import {createBinaryDecoderFn, createBinaryEncoderFn, createJsonDecoderFn, createJsonEncoderFn} from '@ts-runtypes/core';
import * as RT from '@ts-runtypes/core/schema';
import type {SerializationCase} from './types.ts';

export const FUNCTIONS = {
  // Function parameter and return-type slicing uses TS utility types
  // (Parameters<typeof fn>, ReturnType<typeof fn>) rather than
  // bespoke createSerializationParamsFn / createSerializationReturnFn
  // helpers. Same type-level slicing, no extra factories.
  parameters: {
    title: 'Function parameters',
    description:
      'Parameters<fn> resolves to the fixed-length tuple [number, boolean, string], and all three scalar slots round-trip identically across JSON and binary.',
    mutateEncoder: () => {
      function fnNoOptional(a: number, b: boolean, c: string): Date {
        return new Date(a);
      }
      return createJsonEncoderFn<Parameters<typeof fnNoOptional>>(undefined, {strategy: 'mutate'});
    },
    cloneEncoder: () => {
      function fnNoOptional(a: number, b: boolean, c: string): Date {
        return new Date(a);
      }
      return createJsonEncoderFn<Parameters<typeof fnNoOptional>>(undefined, {strategy: 'clone'});
    },
    directEncoder: () => {
      function fnNoOptional(a: number, b: boolean, c: string): Date {
        return new Date(a);
      }
      return createJsonEncoderFn<Parameters<typeof fnNoOptional>>(undefined, {strategy: 'direct'});
    },
    compactEncoder: () => {
      function fnNoOptional(a: number, b: boolean, c: string): Date {
        return new Date(a);
      }
      return createJsonEncoderFn<Parameters<typeof fnNoOptional>>(undefined, {strategy: 'compact'});
    },
    stripDecoder: () => {
      function fnNoOptional(a: number, b: boolean, c: string): Date {
        return new Date(a);
      }
      return createJsonDecoderFn<Parameters<typeof fnNoOptional>>();
    },
    preserveDecoder: () => {
      function fnNoOptional(a: number, b: boolean, c: string): Date {
        return new Date(a);
      }
      return createJsonDecoderFn<Parameters<typeof fnNoOptional>>(undefined, {strategy: 'preserve'});
    },
    compactDecoder: () => {
      function fnNoOptional(a: number, b: boolean, c: string): Date {
        return new Date(a);
      }
      return createJsonDecoderFn<Parameters<typeof fnNoOptional>>(undefined, {strategy: 'compact'});
    },
    binaryEncoder: () => {
      function fnNoOptional(a: number, b: boolean, c: string): Date {
        return new Date(a);
      }
      return createBinaryEncoderFn<Parameters<typeof fnNoOptional>>();
    },
    binaryDecoder: () => {
      function fnNoOptional(a: number, b: boolean, c: string): Date {
        return new Date(a);
      }
      return createBinaryDecoderFn<Parameters<typeof fnNoOptional>>();
    },
    // Parameters tuple [number, boolean, string].
    schemaEncoder: () => createJsonEncoderFn(RT.tuple([TF.number(), RT.boolean(), TF.string()])),
    schemaDecoder: () => createJsonDecoderFn(RT.tuple([TF.number(), RT.boolean(), TF.string()])),
    schemaBinaryEncoder: () => createBinaryEncoderFn(RT.tuple([TF.number(), RT.boolean(), TF.string()])),
    schemaBinaryDecoder: () => createBinaryDecoderFn(RT.tuple([TF.number(), RT.boolean(), TF.string()])),
    getTestData: () => ({
      values: [
        [3, true, 'hello'],
        [3, true, 'world'],
      ],
    }),
  },
  optional_params: {
    title: 'Optional parameters',
    description:
      'Parameters<fn> resolves to the tuple [Date, boolean?] where the Date slot encodes to an ISO string and restores to a Date and the trailing optional boolean may be absent.',
    serializeNotes:
      'The Date slot serializes to an ISO string on the JSON wire and is rebuilt to a Date on decode; samples cover the optional boolean both present and absent.',
    mutateEncoder: () => {
      function fnOptionalParams(a: Date, b?: boolean): bigint {
        void a;
        void b;
        return 1n;
      }
      return createJsonEncoderFn<Parameters<typeof fnOptionalParams>>(undefined, {strategy: 'mutate'});
    },
    cloneEncoder: () => {
      function fnOptionalParams(a: Date, b?: boolean): bigint {
        void a;
        void b;
        return 1n;
      }
      return createJsonEncoderFn<Parameters<typeof fnOptionalParams>>(undefined, {strategy: 'clone'});
    },
    directEncoder: () => {
      function fnOptionalParams(a: Date, b?: boolean): bigint {
        void a;
        void b;
        return 1n;
      }
      return createJsonEncoderFn<Parameters<typeof fnOptionalParams>>(undefined, {strategy: 'direct'});
    },
    compactEncoder: () => {
      function fnOptionalParams(a: Date, b?: boolean): bigint {
        void a;
        void b;
        return 1n;
      }
      return createJsonEncoderFn<Parameters<typeof fnOptionalParams>>(undefined, {strategy: 'compact'});
    },
    stripDecoder: () => {
      function fnOptionalParams(a: Date, b?: boolean): bigint {
        void a;
        void b;
        return 1n;
      }
      return createJsonDecoderFn<Parameters<typeof fnOptionalParams>>();
    },
    preserveDecoder: () => {
      function fnOptionalParams(a: Date, b?: boolean): bigint {
        void a;
        void b;
        return 1n;
      }
      return createJsonDecoderFn<Parameters<typeof fnOptionalParams>>(undefined, {strategy: 'preserve'});
    },
    compactDecoder: () => {
      function fnOptionalParams(a: Date, b?: boolean): bigint {
        void a;
        void b;
        return 1n;
      }
      return createJsonDecoderFn<Parameters<typeof fnOptionalParams>>(undefined, {strategy: 'compact'});
    },
    binaryEncoder: () => {
      function fnOptionalParams(a: Date, b?: boolean): bigint {
        void a;
        void b;
        return 1n;
      }
      return createBinaryEncoderFn<Parameters<typeof fnOptionalParams>>();
    },
    binaryDecoder: () => {
      function fnOptionalParams(a: Date, b?: boolean): bigint {
        void a;
        void b;
        return 1n;
      }
      return createBinaryDecoderFn<Parameters<typeof fnOptionalParams>>();
    },
    // Parameters tuple [Date, boolean?] — trailing optional slot.
    schemaEncoder: () => createJsonEncoderFn(RT.tuple([TF.date()], [RT.boolean()])),
    schemaDecoder: () => createJsonDecoderFn(RT.tuple([TF.date()], [RT.boolean()])),
    schemaBinaryEncoder: () => createBinaryEncoderFn(RT.tuple([TF.date()], [RT.boolean()])),
    schemaBinaryDecoder: () => createBinaryDecoderFn(RT.tuple([TF.date()], [RT.boolean()])),
    getTestData: () => {
      const d = new Date('2000-08-06T02:13:00.000Z');
      return {values: [[d, true], [d]]};
    },
  },
  function_return: {
    title: 'Function return',
    description:
      'ReturnType<fn> resolves to a root Date that encodes to an ISO string on the JSON wire and is rebuilt to a Date on decode.',
    mutateEncoder: () => {
      function fnOptionalParam(a: number, b: boolean, c?: string): Date {
        void a;
        void b;
        void c;
        return new Date(0);
      }
      return createJsonEncoderFn<ReturnType<typeof fnOptionalParam>>(undefined, {strategy: 'mutate'});
    },
    cloneEncoder: () => {
      function fnOptionalParam(a: number, b: boolean, c?: string): Date {
        void a;
        void b;
        void c;
        return new Date(0);
      }
      return createJsonEncoderFn<ReturnType<typeof fnOptionalParam>>(undefined, {strategy: 'clone'});
    },
    directEncoder: () => {
      function fnOptionalParam(a: number, b: boolean, c?: string): Date {
        void a;
        void b;
        void c;
        return new Date(0);
      }
      return createJsonEncoderFn<ReturnType<typeof fnOptionalParam>>(undefined, {strategy: 'direct'});
    },
    compactEncoder: () => {
      function fnOptionalParam(a: number, b: boolean, c?: string): Date {
        void a;
        void b;
        void c;
        return new Date(0);
      }
      return createJsonEncoderFn<ReturnType<typeof fnOptionalParam>>(undefined, {strategy: 'compact'});
    },
    stripDecoder: () => {
      function fnOptionalParam(a: number, b: boolean, c?: string): Date {
        void a;
        void b;
        void c;
        return new Date(0);
      }
      return createJsonDecoderFn<ReturnType<typeof fnOptionalParam>>();
    },
    preserveDecoder: () => {
      function fnOptionalParam(a: number, b: boolean, c?: string): Date {
        void a;
        void b;
        void c;
        return new Date(0);
      }
      return createJsonDecoderFn<ReturnType<typeof fnOptionalParam>>(undefined, {strategy: 'preserve'});
    },
    compactDecoder: () => {
      function fnOptionalParam(a: number, b: boolean, c?: string): Date {
        void a;
        void b;
        void c;
        return new Date(0);
      }
      return createJsonDecoderFn<ReturnType<typeof fnOptionalParam>>(undefined, {strategy: 'compact'});
    },
    binaryEncoder: () => {
      function fnOptionalParam(a: number, b: boolean, c?: string): Date {
        void a;
        void b;
        void c;
        return new Date(0);
      }
      return createBinaryEncoderFn<ReturnType<typeof fnOptionalParam>>();
    },
    binaryDecoder: () => {
      function fnOptionalParam(a: number, b: boolean, c?: string): Date {
        void a;
        void b;
        void c;
        return new Date(0);
      }
      return createBinaryDecoderFn<ReturnType<typeof fnOptionalParam>>();
    },
    // Return type is Date.
    schemaEncoder: () => createJsonEncoderFn(TF.date()),
    schemaDecoder: () => createJsonDecoderFn(TF.date()),
    schemaBinaryEncoder: () => createBinaryEncoderFn(TF.date()),
    schemaBinaryDecoder: () => createBinaryDecoderFn(TF.date()),
    getTestData: () => ({values: [new Date('2000-08-06T02:13:00.000Z')]}),
  },
  function_with_rest_parameters: {
    title: 'Rest parameters',
    description:
      'Parameters<fn> resolves to [number, boolean, ...Date[]] with two fixed slots and a trailing Date rest segment, where each rest Date encodes to an ISO string and restores to a Date and the rest segment may be empty.',
    serializeNotes:
      'Rest Date elements serialize to ISO strings on the JSON wire and rebuild to Dates on decode; samples cover the rest segment populated and empty.',
    mutateEncoder: () => {
      function fnRestParams(a: number, b: boolean, ...rest: Date[]): Date {
        void rest;
        void a;
        void b;
        return new Date(0);
      }
      return createJsonEncoderFn<Parameters<typeof fnRestParams>>(undefined, {strategy: 'mutate'});
    },
    cloneEncoder: () => {
      function fnRestParams(a: number, b: boolean, ...rest: Date[]): Date {
        void rest;
        void a;
        void b;
        return new Date(0);
      }
      return createJsonEncoderFn<Parameters<typeof fnRestParams>>(undefined, {strategy: 'clone'});
    },
    directEncoder: () => {
      function fnRestParams(a: number, b: boolean, ...rest: Date[]): Date {
        void rest;
        void a;
        void b;
        return new Date(0);
      }
      return createJsonEncoderFn<Parameters<typeof fnRestParams>>(undefined, {strategy: 'direct'});
    },
    compactEncoder: () => {
      function fnRestParams(a: number, b: boolean, ...rest: Date[]): Date {
        void rest;
        void a;
        void b;
        return new Date(0);
      }
      return createJsonEncoderFn<Parameters<typeof fnRestParams>>(undefined, {strategy: 'compact'});
    },
    stripDecoder: () => {
      function fnRestParams(a: number, b: boolean, ...rest: Date[]): Date {
        void rest;
        void a;
        void b;
        return new Date(0);
      }
      return createJsonDecoderFn<Parameters<typeof fnRestParams>>();
    },
    preserveDecoder: () => {
      function fnRestParams(a: number, b: boolean, ...rest: Date[]): Date {
        void rest;
        void a;
        void b;
        return new Date(0);
      }
      return createJsonDecoderFn<Parameters<typeof fnRestParams>>(undefined, {strategy: 'preserve'});
    },
    compactDecoder: () => {
      function fnRestParams(a: number, b: boolean, ...rest: Date[]): Date {
        void rest;
        void a;
        void b;
        return new Date(0);
      }
      return createJsonDecoderFn<Parameters<typeof fnRestParams>>(undefined, {strategy: 'compact'});
    },
    binaryEncoder: () => {
      function fnRestParams(a: number, b: boolean, ...rest: Date[]): Date {
        void rest;
        void a;
        void b;
        return new Date(0);
      }
      return createBinaryEncoderFn<Parameters<typeof fnRestParams>>();
    },
    binaryDecoder: () => {
      function fnRestParams(a: number, b: boolean, ...rest: Date[]): Date {
        void rest;
        void a;
        void b;
        return new Date(0);
      }
      return createBinaryDecoderFn<Parameters<typeof fnRestParams>>();
    },
    // Parameters tuple [number, boolean, ...Date[]] — trailing rest segment.
    schemaEncoder: () => createJsonEncoderFn(RT.tuple([TF.number(), RT.boolean()], TF.date())),
    schemaDecoder: () => createJsonDecoderFn(RT.tuple([TF.number(), RT.boolean()], TF.date())),
    schemaBinaryEncoder: () => createBinaryEncoderFn(RT.tuple([TF.number(), RT.boolean()], TF.date())),
    schemaBinaryDecoder: () => createBinaryDecoderFn(RT.tuple([TF.number(), RT.boolean()], TF.date())),
    getTestData: () => ({
      values: [
        [3, true, new Date('2000-08-06T02:13:00.000Z'), new Date('2000-08-06T02:13:00.000Z')],
        [3, true],
      ],
    }),
  },
  function_with_date_parameters: {
    title: 'Date parameters',
    description:
      'Parameters<fn> resolves to [Date, boolean?] where the Date slot encodes to an ISO string and restores to a Date and the trailing boolean is optional.',
    serializeNotes: 'The Date slot serializes to an ISO string on the JSON wire and is rebuilt to a Date on decode.',
    mutateEncoder: () => {
      function fnOptionalParams(a: Date, b?: boolean): bigint {
        void a;
        void b;
        return 1n;
      }
      return createJsonEncoderFn<Parameters<typeof fnOptionalParams>>(undefined, {strategy: 'mutate'});
    },
    cloneEncoder: () => {
      function fnOptionalParams(a: Date, b?: boolean): bigint {
        void a;
        void b;
        return 1n;
      }
      return createJsonEncoderFn<Parameters<typeof fnOptionalParams>>(undefined, {strategy: 'clone'});
    },
    directEncoder: () => {
      function fnOptionalParams(a: Date, b?: boolean): bigint {
        void a;
        void b;
        return 1n;
      }
      return createJsonEncoderFn<Parameters<typeof fnOptionalParams>>(undefined, {strategy: 'direct'});
    },
    compactEncoder: () => {
      function fnOptionalParams(a: Date, b?: boolean): bigint {
        void a;
        void b;
        return 1n;
      }
      return createJsonEncoderFn<Parameters<typeof fnOptionalParams>>(undefined, {strategy: 'compact'});
    },
    stripDecoder: () => {
      function fnOptionalParams(a: Date, b?: boolean): bigint {
        void a;
        void b;
        return 1n;
      }
      return createJsonDecoderFn<Parameters<typeof fnOptionalParams>>();
    },
    preserveDecoder: () => {
      function fnOptionalParams(a: Date, b?: boolean): bigint {
        void a;
        void b;
        return 1n;
      }
      return createJsonDecoderFn<Parameters<typeof fnOptionalParams>>(undefined, {strategy: 'preserve'});
    },
    compactDecoder: () => {
      function fnOptionalParams(a: Date, b?: boolean): bigint {
        void a;
        void b;
        return 1n;
      }
      return createJsonDecoderFn<Parameters<typeof fnOptionalParams>>(undefined, {strategy: 'compact'});
    },
    binaryEncoder: () => {
      function fnOptionalParams(a: Date, b?: boolean): bigint {
        void a;
        void b;
        return 1n;
      }
      return createBinaryEncoderFn<Parameters<typeof fnOptionalParams>>();
    },
    binaryDecoder: () => {
      function fnOptionalParams(a: Date, b?: boolean): bigint {
        void a;
        void b;
        return 1n;
      }
      return createBinaryDecoderFn<Parameters<typeof fnOptionalParams>>();
    },
    // Parameters tuple [Date, boolean?] — trailing optional slot.
    schemaEncoder: () => createJsonEncoderFn(RT.tuple([TF.date()], [RT.boolean()])),
    schemaDecoder: () => createJsonDecoderFn(RT.tuple([TF.date()], [RT.boolean()])),
    schemaBinaryEncoder: () => createBinaryEncoderFn(RT.tuple([TF.date()], [RT.boolean()])),
    schemaBinaryDecoder: () => createBinaryDecoderFn(RT.tuple([TF.date()], [RT.boolean()])),
    getTestData: () => {
      const d = new Date('2000-08-06T02:13:00.000Z');
      return {values: [[d, true], [d]]};
    },
  },
  required_function_return: {
    title: 'Bigint return',
    description:
      'ReturnType<fn> resolves to a root bigint that JSON encodes to a decimal string and rebuilds with BigInt(...) on decode.',
    serializeNotes: 'Plain bigint takes the binary string-fallback path (variable length), so no fixed byte size is asserted.',
    mutateEncoder: () => {
      function fnOptionalParams(a: Date, b?: boolean): bigint {
        void a;
        void b;
        return 1n;
      }
      return createJsonEncoderFn<ReturnType<typeof fnOptionalParams>>(undefined, {strategy: 'mutate'});
    },
    cloneEncoder: () => {
      function fnOptionalParams(a: Date, b?: boolean): bigint {
        void a;
        void b;
        return 1n;
      }
      return createJsonEncoderFn<ReturnType<typeof fnOptionalParams>>(undefined, {strategy: 'clone'});
    },
    directEncoder: () => {
      function fnOptionalParams(a: Date, b?: boolean): bigint {
        void a;
        void b;
        return 1n;
      }
      return createJsonEncoderFn<ReturnType<typeof fnOptionalParams>>(undefined, {strategy: 'direct'});
    },
    compactEncoder: () => {
      function fnOptionalParams(a: Date, b?: boolean): bigint {
        void a;
        void b;
        return 1n;
      }
      return createJsonEncoderFn<ReturnType<typeof fnOptionalParams>>(undefined, {strategy: 'compact'});
    },
    stripDecoder: () => {
      function fnOptionalParams(a: Date, b?: boolean): bigint {
        void a;
        void b;
        return 1n;
      }
      return createJsonDecoderFn<ReturnType<typeof fnOptionalParams>>();
    },
    preserveDecoder: () => {
      function fnOptionalParams(a: Date, b?: boolean): bigint {
        void a;
        void b;
        return 1n;
      }
      return createJsonDecoderFn<ReturnType<typeof fnOptionalParams>>(undefined, {strategy: 'preserve'});
    },
    compactDecoder: () => {
      function fnOptionalParams(a: Date, b?: boolean): bigint {
        void a;
        void b;
        return 1n;
      }
      return createJsonDecoderFn<ReturnType<typeof fnOptionalParams>>(undefined, {strategy: 'compact'});
    },
    binaryEncoder: () => {
      function fnOptionalParams(a: Date, b?: boolean): bigint {
        void a;
        void b;
        return 1n;
      }
      return createBinaryEncoderFn<ReturnType<typeof fnOptionalParams>>();
    },
    binaryDecoder: () => {
      function fnOptionalParams(a: Date, b?: boolean): bigint {
        void a;
        void b;
        return 1n;
      }
      return createBinaryDecoderFn<ReturnType<typeof fnOptionalParams>>();
    },
    // Return type is bigint.
    schemaEncoder: () => createJsonEncoderFn(TF.bigInt()),
    schemaDecoder: () => createJsonDecoderFn(TF.bigInt()),
    schemaBinaryEncoder: () => createBinaryEncoderFn(TF.bigInt()),
    schemaBinaryDecoder: () => createBinaryDecoderFn(TF.bigInt()),
    getTestData: () => ({values: [1n]}),
  },
  function_with_only_rest_parameters: {
    title: 'Rest only parameters',
    description:
      'Parameters<fn> resolves to [...number[]] with no fixed slots, just a number rest segment that round-trips as a plain number array across JSON and binary, including the empty case.',
    mutateEncoder: () => {
      function fnOnlyRestParams(...rest: number[]): Date {
        void rest;
        return new Date(0);
      }
      return createJsonEncoderFn<Parameters<typeof fnOnlyRestParams>>(undefined, {strategy: 'mutate'});
    },
    cloneEncoder: () => {
      function fnOnlyRestParams(...rest: number[]): Date {
        void rest;
        return new Date(0);
      }
      return createJsonEncoderFn<Parameters<typeof fnOnlyRestParams>>(undefined, {strategy: 'clone'});
    },
    directEncoder: () => {
      function fnOnlyRestParams(...rest: number[]): Date {
        void rest;
        return new Date(0);
      }
      return createJsonEncoderFn<Parameters<typeof fnOnlyRestParams>>(undefined, {strategy: 'direct'});
    },
    compactEncoder: () => {
      function fnOnlyRestParams(...rest: number[]): Date {
        void rest;
        return new Date(0);
      }
      return createJsonEncoderFn<Parameters<typeof fnOnlyRestParams>>(undefined, {strategy: 'compact'});
    },
    stripDecoder: () => {
      function fnOnlyRestParams(...rest: number[]): Date {
        void rest;
        return new Date(0);
      }
      return createJsonDecoderFn<Parameters<typeof fnOnlyRestParams>>();
    },
    preserveDecoder: () => {
      function fnOnlyRestParams(...rest: number[]): Date {
        void rest;
        return new Date(0);
      }
      return createJsonDecoderFn<Parameters<typeof fnOnlyRestParams>>(undefined, {strategy: 'preserve'});
    },
    compactDecoder: () => {
      function fnOnlyRestParams(...rest: number[]): Date {
        void rest;
        return new Date(0);
      }
      return createJsonDecoderFn<Parameters<typeof fnOnlyRestParams>>(undefined, {strategy: 'compact'});
    },
    binaryEncoder: () => {
      function fnOnlyRestParams(...rest: number[]): Date {
        void rest;
        return new Date(0);
      }
      return createBinaryEncoderFn<Parameters<typeof fnOnlyRestParams>>();
    },
    binaryDecoder: () => {
      function fnOnlyRestParams(...rest: number[]): Date {
        void rest;
        return new Date(0);
      }
      return createBinaryDecoderFn<Parameters<typeof fnOnlyRestParams>>();
    },
    // Parameters tuple [...number[]] — no fixed slots, rest only.
    schemaEncoder: () => createJsonEncoderFn(RT.tuple([], TF.number())),
    schemaDecoder: () => createJsonDecoderFn(RT.tuple([], TF.number())),
    schemaBinaryEncoder: () => createBinaryEncoderFn(RT.tuple([], TF.number())),
    schemaBinaryDecoder: () => createBinaryDecoderFn(RT.tuple([], TF.number())),
    getTestData: () => ({values: [[3, 2, 1], []]}),
  },
  non_serializable_params: {
    title: 'Function parameter slot',
    description:
      'Parameters<fn> ends in an optional function slot so the tuple is [number, boolean, (() => null)?], and because a function-typed tuple slot is non-serializable at every family the factory renders as alwaysThrow so invoking any encoder or decoder throws.',
    serializeNotes:
      'Function-typed tuple slots were previously dropped silently (JSON) or rejected (binary); both paths now render as alwaysThrow, so factoryThrows fires on first lookup and no round-trip runs.',
    mutateEncoder: () => {
      function fnWithCallback(a: number, b: boolean, c?: () => null): Date {
        void a;
        void b;
        void c;
        return new Date(0);
      }
      return createJsonEncoderFn<Parameters<typeof fnWithCallback>>(undefined, {strategy: 'mutate'});
    },
    cloneEncoder: () => {
      function fnWithCallback(a: number, b: boolean, c?: () => null): Date {
        void a;
        void b;
        void c;
        return new Date(0);
      }
      return createJsonEncoderFn<Parameters<typeof fnWithCallback>>(undefined, {strategy: 'clone'});
    },
    directEncoder: () => {
      function fnWithCallback(a: number, b: boolean, c?: () => null): Date {
        void a;
        void b;
        void c;
        return new Date(0);
      }
      return createJsonEncoderFn<Parameters<typeof fnWithCallback>>(undefined, {strategy: 'direct'});
    },
    compactEncoder: () => {
      function fnWithCallback(a: number, b: boolean, c?: () => null): Date {
        void a;
        void b;
        void c;
        return new Date(0);
      }
      return createJsonEncoderFn<Parameters<typeof fnWithCallback>>(undefined, {strategy: 'compact'});
    },
    stripDecoder: () => {
      function fnWithCallback(a: number, b: boolean, c?: () => null): Date {
        void a;
        void b;
        void c;
        return new Date(0);
      }
      return createJsonDecoderFn<Parameters<typeof fnWithCallback>>();
    },
    preserveDecoder: () => {
      function fnWithCallback(a: number, b: boolean, c?: () => null): Date {
        void a;
        void b;
        void c;
        return new Date(0);
      }
      return createJsonDecoderFn<Parameters<typeof fnWithCallback>>(undefined, {strategy: 'preserve'});
    },
    compactDecoder: () => {
      function fnWithCallback(a: number, b: boolean, c?: () => null): Date {
        void a;
        void b;
        void c;
        return new Date(0);
      }
      return createJsonDecoderFn<Parameters<typeof fnWithCallback>>(undefined, {strategy: 'compact'});
    },
    binaryEncoder: () => {
      function fnWithCallback(a: number, b: boolean, c?: () => null): Date {
        void a;
        void b;
        void c;
        return new Date(0);
      }
      return createBinaryEncoderFn<Parameters<typeof fnWithCallback>>();
    },
    binaryDecoder: () => {
      function fnWithCallback(a: number, b: boolean, c?: () => null): Date {
        void a;
        void b;
        void c;
        return new Date(0);
      }
      return createBinaryDecoderFn<Parameters<typeof fnWithCallback>>();
    },
    // Parameters<typeof fnWithCallback> resolves to a tuple ending
    // in `() => null`. Function-typed tuple slots are unsupported in
    // every family now (previously JSON silently dropped them, binary
    // threw); both paths render as alwaysThrow.
    // Function-typed tuple slot is non-serializable; no value-first builder.
    schemaEncoder: 'not-supported',
    schemaDecoder: 'not-supported',
    schemaBinaryEncoder: 'not-supported',
    schemaBinaryDecoder: 'not-supported',
    factoryThrows: true,
    getTestData: () => ({values: []}),
  },
  function_promise_return_type: {
    title: 'Promise return',
    description: 'A Promise<T> return type is non-serializable at root, so every family renders the factory as alwaysThrow.',
    serializeNotes:
      'A Promise return type is non-serializable at root, so every family renders the factory as alwaysThrow (factoryThrows); no value-first builder can express it.',
    mutateEncoder: () => {
      function fnReturnsPromise(a: number, b: boolean, c?: string): Promise<Date> {
        void a;
        void b;
        void c;
        return Promise.resolve(new Date(0));
      }
      return createJsonEncoderFn<ReturnType<typeof fnReturnsPromise>>(undefined, {strategy: 'mutate'});
    },
    cloneEncoder: () => {
      function fnReturnsPromise(a: number, b: boolean, c?: string): Promise<Date> {
        void a;
        void b;
        void c;
        return Promise.resolve(new Date(0));
      }
      return createJsonEncoderFn<ReturnType<typeof fnReturnsPromise>>(undefined, {strategy: 'clone'});
    },
    directEncoder: () => {
      function fnReturnsPromise(a: number, b: boolean, c?: string): Promise<Date> {
        void a;
        void b;
        void c;
        return Promise.resolve(new Date(0));
      }
      return createJsonEncoderFn<ReturnType<typeof fnReturnsPromise>>(undefined, {strategy: 'direct'});
    },
    compactEncoder: () => {
      function fnReturnsPromise(a: number, b: boolean, c?: string): Promise<Date> {
        void a;
        void b;
        void c;
        return Promise.resolve(new Date(0));
      }
      return createJsonEncoderFn<ReturnType<typeof fnReturnsPromise>>(undefined, {strategy: 'compact'});
    },
    stripDecoder: () => {
      function fnReturnsPromise(a: number, b: boolean, c?: string): Promise<Date> {
        void a;
        void b;
        void c;
        return Promise.resolve(new Date(0));
      }
      return createJsonDecoderFn<ReturnType<typeof fnReturnsPromise>>();
    },
    preserveDecoder: () => {
      function fnReturnsPromise(a: number, b: boolean, c?: string): Promise<Date> {
        void a;
        void b;
        void c;
        return Promise.resolve(new Date(0));
      }
      return createJsonDecoderFn<ReturnType<typeof fnReturnsPromise>>(undefined, {strategy: 'preserve'});
    },
    compactDecoder: () => {
      function fnReturnsPromise(a: number, b: boolean, c?: string): Promise<Date> {
        void a;
        void b;
        void c;
        return Promise.resolve(new Date(0));
      }
      return createJsonDecoderFn<ReturnType<typeof fnReturnsPromise>>(undefined, {strategy: 'compact'});
    },
    binaryEncoder: () => {
      function fnReturnsPromise(a: number, b: boolean, c?: string): Promise<Date> {
        void a;
        void b;
        void c;
        return Promise.resolve(new Date(0));
      }
      return createBinaryEncoderFn<ReturnType<typeof fnReturnsPromise>>();
    },
    binaryDecoder: () => {
      function fnReturnsPromise(a: number, b: boolean, c?: string): Promise<Date> {
        void a;
        void b;
        void c;
        return Promise.resolve(new Date(0));
      }
      return createBinaryDecoderFn<ReturnType<typeof fnReturnsPromise>>();
    },
    // Promise return type is non-serializable; no value-first builder.
    schemaEncoder: 'not-supported',
    schemaDecoder: 'not-supported',
    schemaBinaryEncoder: 'not-supported',
    schemaBinaryDecoder: 'not-supported',
    factoryThrows: true,
    getTestData: () => ({values: []}),
  },
  function_return_type_is_function: {
    title: 'Function return slot',
    description:
      'A function that returns another function is non-serializable at root, so every family renders the factory as alwaysThrow.',
    serializeNotes:
      'A function-typed return is non-serializable at root, so every family renders the factory as alwaysThrow (factoryThrows); no value-first builder can express it.',
    mutateEncoder: () => {
      function fnReturnsFunction(a: number, b: boolean, c?: string): () => Date {
        void a;
        void b;
        void c;
        return () => new Date(0);
      }
      return createJsonEncoderFn<ReturnType<typeof fnReturnsFunction>>(undefined, {strategy: 'mutate'});
    },
    cloneEncoder: () => {
      function fnReturnsFunction(a: number, b: boolean, c?: string): () => Date {
        void a;
        void b;
        void c;
        return () => new Date(0);
      }
      return createJsonEncoderFn<ReturnType<typeof fnReturnsFunction>>(undefined, {strategy: 'clone'});
    },
    directEncoder: () => {
      function fnReturnsFunction(a: number, b: boolean, c?: string): () => Date {
        void a;
        void b;
        void c;
        return () => new Date(0);
      }
      return createJsonEncoderFn<ReturnType<typeof fnReturnsFunction>>(undefined, {strategy: 'direct'});
    },
    compactEncoder: () => {
      function fnReturnsFunction(a: number, b: boolean, c?: string): () => Date {
        void a;
        void b;
        void c;
        return () => new Date(0);
      }
      return createJsonEncoderFn<ReturnType<typeof fnReturnsFunction>>(undefined, {strategy: 'compact'});
    },
    stripDecoder: () => {
      function fnReturnsFunction(a: number, b: boolean, c?: string): () => Date {
        void a;
        void b;
        void c;
        return () => new Date(0);
      }
      return createJsonDecoderFn<ReturnType<typeof fnReturnsFunction>>();
    },
    preserveDecoder: () => {
      function fnReturnsFunction(a: number, b: boolean, c?: string): () => Date {
        void a;
        void b;
        void c;
        return () => new Date(0);
      }
      return createJsonDecoderFn<ReturnType<typeof fnReturnsFunction>>(undefined, {strategy: 'preserve'});
    },
    compactDecoder: () => {
      function fnReturnsFunction(a: number, b: boolean, c?: string): () => Date {
        void a;
        void b;
        void c;
        return () => new Date(0);
      }
      return createJsonDecoderFn<ReturnType<typeof fnReturnsFunction>>(undefined, {strategy: 'compact'});
    },
    binaryEncoder: () => {
      function fnReturnsFunction(a: number, b: boolean, c?: string): () => Date {
        void a;
        void b;
        void c;
        return () => new Date(0);
      }
      return createBinaryEncoderFn<ReturnType<typeof fnReturnsFunction>>();
    },
    binaryDecoder: () => {
      function fnReturnsFunction(a: number, b: boolean, c?: string): () => Date {
        void a;
        void b;
        void c;
        return () => new Date(0);
      }
      return createBinaryDecoderFn<ReturnType<typeof fnReturnsFunction>>();
    },
    // Return type is another function — non-serializable; no value-first builder.
    schemaEncoder: 'not-supported',
    schemaDecoder: 'not-supported',
    schemaBinaryEncoder: 'not-supported',
    schemaBinaryDecoder: 'not-supported',
    factoryThrows: true,
    getTestData: () => ({values: []}),
  },
  call_signature_params: {
    title: 'Call signature params',
    description:
      'Parameters of a call-signature interface resolve to the fixed-length tuple [number, boolean], and both scalar slots round-trip identically across JSON and binary.',
    mutateEncoder: () => createJsonEncoderFn<Parameters<{(a: number, b: boolean): string}>>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<Parameters<{(a: number, b: boolean): string}>>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoderFn<Parameters<{(a: number, b: boolean): string}>>(undefined, {strategy: 'direct'}),
    compactEncoder: () => createJsonEncoderFn<Parameters<{(a: number, b: boolean): string}>>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoderFn<Parameters<{(a: number, b: boolean): string}>>(),
    preserveDecoder: () => createJsonDecoderFn<Parameters<{(a: number, b: boolean): string}>>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoderFn<Parameters<{(a: number, b: boolean): string}>>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoderFn<Parameters<{(a: number, b: boolean): string}>>(),
    binaryDecoder: () => createBinaryDecoderFn<Parameters<{(a: number, b: boolean): string}>>(),
    // Call-signature parameters tuple [number, boolean].
    schemaEncoder: () => createJsonEncoderFn(RT.tuple([TF.number(), RT.boolean()])),
    schemaDecoder: () => createJsonDecoderFn(RT.tuple([TF.number(), RT.boolean()])),
    schemaBinaryEncoder: () => createBinaryEncoderFn(RT.tuple([TF.number(), RT.boolean()])),
    schemaBinaryDecoder: () => createBinaryDecoderFn(RT.tuple([TF.number(), RT.boolean()])),
    getTestData: () => ({values: [[3, true]]}),
  },
  call_signature_return: {
    title: 'Call signature return',
    description:
      'The return type of a call-signature interface resolves to a root string that round-trips identically across JSON and binary.',
    mutateEncoder: () => createJsonEncoderFn<ReturnType<{(a: number, b: boolean): string}>>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<ReturnType<{(a: number, b: boolean): string}>>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoderFn<ReturnType<{(a: number, b: boolean): string}>>(undefined, {strategy: 'direct'}),
    compactEncoder: () => createJsonEncoderFn<ReturnType<{(a: number, b: boolean): string}>>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoderFn<ReturnType<{(a: number, b: boolean): string}>>(),
    preserveDecoder: () => createJsonDecoderFn<ReturnType<{(a: number, b: boolean): string}>>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoderFn<ReturnType<{(a: number, b: boolean): string}>>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoderFn<ReturnType<{(a: number, b: boolean): string}>>(),
    binaryDecoder: () => createBinaryDecoderFn<ReturnType<{(a: number, b: boolean): string}>>(),
    // Call-signature return type is string.
    schemaEncoder: () => createJsonEncoderFn(TF.string()),
    schemaDecoder: () => createJsonDecoderFn(TF.string()),
    schemaBinaryEncoder: () => createBinaryEncoderFn(TF.string()),
    schemaBinaryDecoder: () => createBinaryDecoderFn(TF.string()),
    getTestData: () => ({values: ['result']}),
  },
} as const satisfies Record<string, SerializationCase>;
