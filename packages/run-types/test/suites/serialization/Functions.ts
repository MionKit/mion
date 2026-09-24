import * as TF from '@mionjs/run-types/formats';
import {createJsonDecoderFn, createJsonEncoderFn} from '@mionjs/run-types';
import * as RT from '@mionjs/run-types/builders';
import type {SerializationCase} from './types.ts';

export const FUNCTIONS = {
  // Function parameter and return-type slicing uses TS utility types
  // (Parameters<typeof fn>, ReturnType<typeof fn>) rather than
  // bespoke createSerializationParamsFn / createSerializationReturnFn
  // helpers. Same type-level slicing, no extra factories.
  parameters: {
    title: 'Function parameters',
    description:
      'Parameters<fn> resolves to the fixed-length tuple [number, boolean, string], and all three scalar slots round-trip identically through JSON.',
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
    compactEncoder: () => {
      function fnNoOptional(a: number, b: boolean, c: string): Date {
        return new Date(a);
      }
      return createJsonEncoderFn<Parameters<typeof fnNoOptional>>(undefined, {strategy: 'compact'});
    },
    cloneDecoder: () => {
      function fnNoOptional(a: number, b: boolean, c: string): Date {
        return new Date(a);
      }
      return createJsonDecoderFn<Parameters<typeof fnNoOptional>>();
    },
    mutateDecoder: () => {
      function fnNoOptional(a: number, b: boolean, c: string): Date {
        return new Date(a);
      }
      return createJsonDecoderFn<Parameters<typeof fnNoOptional>>(undefined, {strategy: 'mutate'});
    },
    compactDecoder: () => {
      function fnNoOptional(a: number, b: boolean, c: string): Date {
        return new Date(a);
      }
      return createJsonDecoderFn<Parameters<typeof fnNoOptional>>(undefined, {strategy: 'compact'});
    },
    // Parameters tuple [number, boolean, string].
    schemaEncoder: () => createJsonEncoderFn(RT.tuple({required: [TF.number(), RT.boolean(), TF.string()]})),
    schemaDecoder: () => createJsonDecoderFn(RT.tuple({required: [TF.number(), RT.boolean(), TF.string()]})),
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
    compactEncoder: () => {
      function fnOptionalParams(a: Date, b?: boolean): bigint {
        void a;
        void b;
        return 1n;
      }
      return createJsonEncoderFn<Parameters<typeof fnOptionalParams>>(undefined, {strategy: 'compact'});
    },
    cloneDecoder: () => {
      function fnOptionalParams(a: Date, b?: boolean): bigint {
        void a;
        void b;
        return 1n;
      }
      return createJsonDecoderFn<Parameters<typeof fnOptionalParams>>();
    },
    mutateDecoder: () => {
      function fnOptionalParams(a: Date, b?: boolean): bigint {
        void a;
        void b;
        return 1n;
      }
      return createJsonDecoderFn<Parameters<typeof fnOptionalParams>>(undefined, {strategy: 'mutate'});
    },
    compactDecoder: () => {
      function fnOptionalParams(a: Date, b?: boolean): bigint {
        void a;
        void b;
        return 1n;
      }
      return createJsonDecoderFn<Parameters<typeof fnOptionalParams>>(undefined, {strategy: 'compact'});
    },
    // Parameters tuple [Date, boolean?] — trailing optional slot.
    schemaEncoder: () => createJsonEncoderFn(RT.tuple({required: [TF.date()], optional: [RT.boolean()]})),
    schemaDecoder: () => createJsonDecoderFn(RT.tuple({required: [TF.date()], optional: [RT.boolean()]})),
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
    compactEncoder: () => {
      function fnOptionalParam(a: number, b: boolean, c?: string): Date {
        void a;
        void b;
        void c;
        return new Date(0);
      }
      return createJsonEncoderFn<ReturnType<typeof fnOptionalParam>>(undefined, {strategy: 'compact'});
    },
    cloneDecoder: () => {
      function fnOptionalParam(a: number, b: boolean, c?: string): Date {
        void a;
        void b;
        void c;
        return new Date(0);
      }
      return createJsonDecoderFn<ReturnType<typeof fnOptionalParam>>();
    },
    mutateDecoder: () => {
      function fnOptionalParam(a: number, b: boolean, c?: string): Date {
        void a;
        void b;
        void c;
        return new Date(0);
      }
      return createJsonDecoderFn<ReturnType<typeof fnOptionalParam>>(undefined, {strategy: 'mutate'});
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
    // Return type is Date.
    schemaEncoder: () => createJsonEncoderFn(TF.date()),
    schemaDecoder: () => createJsonDecoderFn(TF.date()),
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
    compactEncoder: () => {
      function fnRestParams(a: number, b: boolean, ...rest: Date[]): Date {
        void rest;
        void a;
        void b;
        return new Date(0);
      }
      return createJsonEncoderFn<Parameters<typeof fnRestParams>>(undefined, {strategy: 'compact'});
    },
    cloneDecoder: () => {
      function fnRestParams(a: number, b: boolean, ...rest: Date[]): Date {
        void rest;
        void a;
        void b;
        return new Date(0);
      }
      return createJsonDecoderFn<Parameters<typeof fnRestParams>>();
    },
    mutateDecoder: () => {
      function fnRestParams(a: number, b: boolean, ...rest: Date[]): Date {
        void rest;
        void a;
        void b;
        return new Date(0);
      }
      return createJsonDecoderFn<Parameters<typeof fnRestParams>>(undefined, {strategy: 'mutate'});
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
    // Parameters tuple [number, boolean, ...Date[]] — trailing rest segment.
    schemaEncoder: () => createJsonEncoderFn(RT.tuple({required: [TF.number(), RT.boolean()], rest: TF.date()})),
    schemaDecoder: () => createJsonDecoderFn(RT.tuple({required: [TF.number(), RT.boolean()], rest: TF.date()})),
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
    compactEncoder: () => {
      function fnOptionalParams(a: Date, b?: boolean): bigint {
        void a;
        void b;
        return 1n;
      }
      return createJsonEncoderFn<Parameters<typeof fnOptionalParams>>(undefined, {strategy: 'compact'});
    },
    cloneDecoder: () => {
      function fnOptionalParams(a: Date, b?: boolean): bigint {
        void a;
        void b;
        return 1n;
      }
      return createJsonDecoderFn<Parameters<typeof fnOptionalParams>>();
    },
    mutateDecoder: () => {
      function fnOptionalParams(a: Date, b?: boolean): bigint {
        void a;
        void b;
        return 1n;
      }
      return createJsonDecoderFn<Parameters<typeof fnOptionalParams>>(undefined, {strategy: 'mutate'});
    },
    compactDecoder: () => {
      function fnOptionalParams(a: Date, b?: boolean): bigint {
        void a;
        void b;
        return 1n;
      }
      return createJsonDecoderFn<Parameters<typeof fnOptionalParams>>(undefined, {strategy: 'compact'});
    },
    // Parameters tuple [Date, boolean?] — trailing optional slot.
    schemaEncoder: () => createJsonEncoderFn(RT.tuple({required: [TF.date()], optional: [RT.boolean()]})),
    schemaDecoder: () => createJsonDecoderFn(RT.tuple({required: [TF.date()], optional: [RT.boolean()]})),
    getTestData: () => {
      const d = new Date('2000-08-06T02:13:00.000Z');
      return {values: [[d, true], [d]]};
    },
  },
  required_function_return: {
    title: 'Bigint return',
    description:
      'ReturnType<fn> resolves to a root bigint that JSON encodes to a decimal string and rebuilds with BigInt(...) on decode.',
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
    compactEncoder: () => {
      function fnOptionalParams(a: Date, b?: boolean): bigint {
        void a;
        void b;
        return 1n;
      }
      return createJsonEncoderFn<ReturnType<typeof fnOptionalParams>>(undefined, {strategy: 'compact'});
    },
    cloneDecoder: () => {
      function fnOptionalParams(a: Date, b?: boolean): bigint {
        void a;
        void b;
        return 1n;
      }
      return createJsonDecoderFn<ReturnType<typeof fnOptionalParams>>();
    },
    mutateDecoder: () => {
      function fnOptionalParams(a: Date, b?: boolean): bigint {
        void a;
        void b;
        return 1n;
      }
      return createJsonDecoderFn<ReturnType<typeof fnOptionalParams>>(undefined, {strategy: 'mutate'});
    },
    compactDecoder: () => {
      function fnOptionalParams(a: Date, b?: boolean): bigint {
        void a;
        void b;
        return 1n;
      }
      return createJsonDecoderFn<ReturnType<typeof fnOptionalParams>>(undefined, {strategy: 'compact'});
    },
    // Return type is bigint.
    schemaEncoder: () => createJsonEncoderFn(TF.bigInt()),
    schemaDecoder: () => createJsonDecoderFn(TF.bigInt()),
    getTestData: () => ({values: [1n]}),
  },
  function_with_only_rest_parameters: {
    title: 'Rest only parameters',
    description:
      'Parameters<fn> resolves to [...number[]] with no fixed slots, just a number rest segment that round-trips as a plain number array through JSON, including the empty case.',
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
    compactEncoder: () => {
      function fnOnlyRestParams(...rest: number[]): Date {
        void rest;
        return new Date(0);
      }
      return createJsonEncoderFn<Parameters<typeof fnOnlyRestParams>>(undefined, {strategy: 'compact'});
    },
    cloneDecoder: () => {
      function fnOnlyRestParams(...rest: number[]): Date {
        void rest;
        return new Date(0);
      }
      return createJsonDecoderFn<Parameters<typeof fnOnlyRestParams>>();
    },
    mutateDecoder: () => {
      function fnOnlyRestParams(...rest: number[]): Date {
        void rest;
        return new Date(0);
      }
      return createJsonDecoderFn<Parameters<typeof fnOnlyRestParams>>(undefined, {strategy: 'mutate'});
    },
    compactDecoder: () => {
      function fnOnlyRestParams(...rest: number[]): Date {
        void rest;
        return new Date(0);
      }
      return createJsonDecoderFn<Parameters<typeof fnOnlyRestParams>>(undefined, {strategy: 'compact'});
    },
    // Parameters tuple [...number[]] — no fixed slots, rest only.
    schemaEncoder: () => createJsonEncoderFn(RT.tuple({rest: TF.number()})),
    schemaDecoder: () => createJsonDecoderFn(RT.tuple({rest: TF.number()})),
    getTestData: () => ({values: [[3, 2, 1], []]}),
  },
  non_serializable_params: {
    title: 'Function parameter slot',
    description:
      'Parameters<fn> ends in an optional function slot so the tuple is [number, boolean, (() => null)?], and because a function-typed tuple slot is non-serializable at every family the factory renders as alwaysThrow so invoking any encoder or decoder throws.',
    serializeNotes:
      'Function-typed tuple slots were previously dropped silently by JSON; they now render as alwaysThrow, so factoryThrows fires on first lookup and no round-trip runs.',
    mutateEncoder: () => {
      function fnWithCallback(a: number, b: boolean, c?: () => null): Date {
        void a;
        void b;
        void c;
        return new Date(0);
      }
      // @mion-downgrade-error PJ003
      return createJsonEncoderFn<Parameters<typeof fnWithCallback>>(undefined, {strategy: 'mutate'});
    },
    cloneEncoder: () => {
      function fnWithCallback(a: number, b: boolean, c?: () => null): Date {
        void a;
        void b;
        void c;
        return new Date(0);
      }
      // @mion-downgrade-error PJS003
      return createJsonEncoderFn<Parameters<typeof fnWithCallback>>(undefined, {strategy: 'clone'});
    },
    compactEncoder: () => {
      function fnWithCallback(a: number, b: boolean, c?: () => null): Date {
        void a;
        void b;
        void c;
        return new Date(0);
      }
      // @mion-downgrade-error PJS003
      return createJsonEncoderFn<Parameters<typeof fnWithCallback>>(undefined, {strategy: 'compact'});
    },
    cloneDecoder: () => {
      function fnWithCallback(a: number, b: boolean, c?: () => null): Date {
        void a;
        void b;
        void c;
        return new Date(0);
      }
      // @mion-downgrade-error RJ003
      return createJsonDecoderFn<Parameters<typeof fnWithCallback>>();
    },
    mutateDecoder: () => {
      function fnWithCallback(a: number, b: boolean, c?: () => null): Date {
        void a;
        void b;
        void c;
        return new Date(0);
      }
      // @mion-downgrade-error RJ003
      return createJsonDecoderFn<Parameters<typeof fnWithCallback>>(undefined, {strategy: 'mutate'});
    },
    compactDecoder: () => {
      function fnWithCallback(a: number, b: boolean, c?: () => null): Date {
        void a;
        void b;
        void c;
        return new Date(0);
      }
      // @mion-downgrade-error RJ003
      return createJsonDecoderFn<Parameters<typeof fnWithCallback>>(undefined, {strategy: 'compact'});
    },
    // The tuple ends in `() => null`; a function-typed slot renders as alwaysThrow in every family.
    // Function-typed tuple slot is non-serializable; no value-first builder.
    schemaEncoder: 'not-supported',
    schemaDecoder: 'not-supported',
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
      // @mion-downgrade-error PJ002
      return createJsonEncoderFn<ReturnType<typeof fnReturnsPromise>>(undefined, {strategy: 'mutate'});
    },
    cloneEncoder: () => {
      function fnReturnsPromise(a: number, b: boolean, c?: string): Promise<Date> {
        void a;
        void b;
        void c;
        return Promise.resolve(new Date(0));
      }
      // @mion-downgrade-error PJS002
      return createJsonEncoderFn<ReturnType<typeof fnReturnsPromise>>(undefined, {strategy: 'clone'});
    },
    compactEncoder: () => {
      function fnReturnsPromise(a: number, b: boolean, c?: string): Promise<Date> {
        void a;
        void b;
        void c;
        return Promise.resolve(new Date(0));
      }
      // @mion-downgrade-error PJS002
      return createJsonEncoderFn<ReturnType<typeof fnReturnsPromise>>(undefined, {strategy: 'compact'});
    },
    cloneDecoder: () => {
      function fnReturnsPromise(a: number, b: boolean, c?: string): Promise<Date> {
        void a;
        void b;
        void c;
        return Promise.resolve(new Date(0));
      }
      // @mion-downgrade-error RJ002
      return createJsonDecoderFn<ReturnType<typeof fnReturnsPromise>>();
    },
    mutateDecoder: () => {
      function fnReturnsPromise(a: number, b: boolean, c?: string): Promise<Date> {
        void a;
        void b;
        void c;
        return Promise.resolve(new Date(0));
      }
      // @mion-downgrade-error RJ002
      return createJsonDecoderFn<ReturnType<typeof fnReturnsPromise>>(undefined, {strategy: 'mutate'});
    },
    compactDecoder: () => {
      function fnReturnsPromise(a: number, b: boolean, c?: string): Promise<Date> {
        void a;
        void b;
        void c;
        return Promise.resolve(new Date(0));
      }
      // @mion-downgrade-error RJ002
      return createJsonDecoderFn<ReturnType<typeof fnReturnsPromise>>(undefined, {strategy: 'compact'});
    },
    // Promise return type is non-serializable; no value-first builder.
    schemaEncoder: 'not-supported',
    schemaDecoder: 'not-supported',
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
      // @mion-downgrade-error PJ003
      return createJsonEncoderFn<ReturnType<typeof fnReturnsFunction>>(undefined, {strategy: 'mutate'});
    },
    cloneEncoder: () => {
      function fnReturnsFunction(a: number, b: boolean, c?: string): () => Date {
        void a;
        void b;
        void c;
        return () => new Date(0);
      }
      // @mion-downgrade-error PJS003
      return createJsonEncoderFn<ReturnType<typeof fnReturnsFunction>>(undefined, {strategy: 'clone'});
    },
    compactEncoder: () => {
      function fnReturnsFunction(a: number, b: boolean, c?: string): () => Date {
        void a;
        void b;
        void c;
        return () => new Date(0);
      }
      // @mion-downgrade-error PJS003
      return createJsonEncoderFn<ReturnType<typeof fnReturnsFunction>>(undefined, {strategy: 'compact'});
    },
    cloneDecoder: () => {
      function fnReturnsFunction(a: number, b: boolean, c?: string): () => Date {
        void a;
        void b;
        void c;
        return () => new Date(0);
      }
      // @mion-downgrade-error RJ003
      return createJsonDecoderFn<ReturnType<typeof fnReturnsFunction>>();
    },
    mutateDecoder: () => {
      function fnReturnsFunction(a: number, b: boolean, c?: string): () => Date {
        void a;
        void b;
        void c;
        return () => new Date(0);
      }
      // @mion-downgrade-error RJ003
      return createJsonDecoderFn<ReturnType<typeof fnReturnsFunction>>(undefined, {strategy: 'mutate'});
    },
    compactDecoder: () => {
      function fnReturnsFunction(a: number, b: boolean, c?: string): () => Date {
        void a;
        void b;
        void c;
        return () => new Date(0);
      }
      // @mion-downgrade-error RJ003
      return createJsonDecoderFn<ReturnType<typeof fnReturnsFunction>>(undefined, {strategy: 'compact'});
    },
    // Return type is another function — non-serializable; no value-first builder.
    schemaEncoder: 'not-supported',
    schemaDecoder: 'not-supported',
    factoryThrows: true,
    getTestData: () => ({values: []}),
  },
  call_signature_params: {
    title: 'Call signature params',
    description:
      'Parameters of a call-signature interface resolve to the fixed-length tuple [number, boolean], and both scalar slots round-trip identically through JSON.',
    mutateEncoder: () => createJsonEncoderFn<Parameters<{(a: number, b: boolean): string}>>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<Parameters<{(a: number, b: boolean): string}>>(undefined, {strategy: 'clone'}),
    compactEncoder: () => createJsonEncoderFn<Parameters<{(a: number, b: boolean): string}>>(undefined, {strategy: 'compact'}),
    cloneDecoder: () => createJsonDecoderFn<Parameters<{(a: number, b: boolean): string}>>(),
    mutateDecoder: () => createJsonDecoderFn<Parameters<{(a: number, b: boolean): string}>>(undefined, {strategy: 'mutate'}),
    compactDecoder: () => createJsonDecoderFn<Parameters<{(a: number, b: boolean): string}>>(undefined, {strategy: 'compact'}),
    // Call-signature parameters tuple [number, boolean].
    schemaEncoder: () => createJsonEncoderFn(RT.tuple({required: [TF.number(), RT.boolean()]})),
    schemaDecoder: () => createJsonDecoderFn(RT.tuple({required: [TF.number(), RT.boolean()]})),
    getTestData: () => ({values: [[3, true]]}),
  },
  call_signature_return: {
    title: 'Call signature return',
    description:
      'The return type of a call-signature interface resolves to a root string that round-trips identically through JSON.',
    mutateEncoder: () => createJsonEncoderFn<ReturnType<{(a: number, b: boolean): string}>>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<ReturnType<{(a: number, b: boolean): string}>>(undefined, {strategy: 'clone'}),
    compactEncoder: () => createJsonEncoderFn<ReturnType<{(a: number, b: boolean): string}>>(undefined, {strategy: 'compact'}),
    cloneDecoder: () => createJsonDecoderFn<ReturnType<{(a: number, b: boolean): string}>>(),
    mutateDecoder: () => createJsonDecoderFn<ReturnType<{(a: number, b: boolean): string}>>(undefined, {strategy: 'mutate'}),
    compactDecoder: () => createJsonDecoderFn<ReturnType<{(a: number, b: boolean): string}>>(undefined, {strategy: 'compact'}),
    // Call-signature return type is string.
    schemaEncoder: () => createJsonEncoderFn(TF.string()),
    schemaDecoder: () => createJsonDecoderFn(TF.string()),
    getTestData: () => ({values: ['result']}),
  },
} as const satisfies Record<string, SerializationCase>;
