// cloning / Functions — the opaque pass-through category exercised at every
// position. Parameters<fn> / ReturnType<fn> slice function types into plain
// data shapes that clone normally; the function VALUES themselves have no
// declared data shape to rebuild, so a function-typed root (and a Promise
// root) passes through by reference and a function-typed tuple slot rides
// shared inside its fresh container — unlike the serializers, which render
// every one of those factories as alwaysThrow.

import {createCloneExactShapeFn} from '@ts-runtypes/core';
import type {CloningCase} from './types.ts';

// Module-level consts so both getTestData() calls return the SAME reference
// (functions and promises pass through by reference; a per-call value would
// break the untouched-twin comparison).
const opaqueNullFn = (): null => null;
const opaqueDateFn = (): Date => new Date(0);
const opaquePromise: Promise<Date> = Promise.resolve(new Date('2000-08-06T02:13:00.000Z'));

export const FUNCTIONS = {
  parameters: {
    title: 'Function parameters',
    description:
      'Parameters<fn> resolves to the fixed-length tuple [number, boolean, string], which clones as a fresh array whose scalar slots copy by value.',
    clone: () => {
      function fnNoOptional(a: number, b: boolean, c: string): Date {
        return new Date(a);
      }
      return createCloneExactShapeFn<Parameters<typeof fnNoOptional>>();
    },
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
      'Parameters<fn> resolves to the tuple [Date, boolean?], where the Date slot clones as a fresh instance and the trailing optional boolean may be absent.',
    clone: () => {
      function fnOptionalParams(a: Date, b?: boolean): bigint {
        void a;
        void b;
        return 1n;
      }
      return createCloneExactShapeFn<Parameters<typeof fnOptionalParams>>();
    },
    getTestData: () => {
      const d = new Date('2000-08-06T02:13:00.000Z');
      return {values: [[d, true], [d]]};
    },
  },
  function_return: {
    title: 'Function return',
    description: 'ReturnType<fn> resolves to a root Date, which always re-wraps into a fresh instance at the same instant.',
    clone: () => {
      function fnOptionalParam(a: number, b: boolean, c?: string): Date {
        void a;
        void b;
        void c;
        return new Date(0);
      }
      return createCloneExactShapeFn<ReturnType<typeof fnOptionalParam>>();
    },
    getTestData: () => ({values: [new Date('2000-08-06T02:13:00.000Z')]}),
  },
  function_with_rest_parameters: {
    title: 'Rest parameters',
    description:
      'Parameters<fn> resolves to [number, boolean, ...Date[]], cloning the fixed scalar slots by value and every rest Date as a fresh instance, including the empty rest segment.',
    clone: () => {
      function fnRestParams(a: number, b: boolean, ...rest: Date[]): Date {
        void rest;
        void a;
        void b;
        return new Date(0);
      }
      return createCloneExactShapeFn<Parameters<typeof fnRestParams>>();
    },
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
      'Parameters<fn> resolves to [Date, boolean?], where the Date slot clones as a fresh instance and the trailing boolean is optional.',
    clone: () => {
      function fnOptionalParams(a: Date, b?: boolean): bigint {
        void a;
        void b;
        return 1n;
      }
      return createCloneExactShapeFn<Parameters<typeof fnOptionalParams>>();
    },
    getTestData: () => {
      const d = new Date('2000-08-06T02:13:00.000Z');
      return {values: [[d, true], [d]]};
    },
  },
  required_function_return: {
    title: 'Bigint return',
    description: 'ReturnType<fn> resolves to a root bigint, a primitive that passes through by value.',
    clone: () => {
      function fnOptionalParams(a: Date, b?: boolean): bigint {
        void a;
        void b;
        return 1n;
      }
      return createCloneExactShapeFn<ReturnType<typeof fnOptionalParams>>();
    },
    getTestData: () => ({values: [1n]}),
    passThrough: true,
  },
  function_with_only_rest_parameters: {
    title: 'Rest only parameters',
    description:
      'Parameters<fn> resolves to [...number[]] with no fixed slots, cloning as a fresh number array including the empty case.',
    clone: () => {
      function fnOnlyRestParams(...rest: number[]): Date {
        void rest;
        return new Date(0);
      }
      return createCloneExactShapeFn<Parameters<typeof fnOnlyRestParams>>();
    },
    getTestData: () => ({values: [[3, 2, 1], []]}),
  },
  non_serializable_params: {
    title: 'Function parameter slot',
    description:
      'Parameters<fn> resolves to [number, boolean, (() => null)?], and unlike serialization the function-typed slot does not throw — the tuple rebuilds fresh with the function shared by reference.',
    cloneNotes:
      'The serializers render this factory as alwaysThrow (factoryThrows); the value-level clone treats the function slot as opaque pass-through inside the fresh container.',
    clone: () => {
      function fnWithCallback(a: number, b: boolean, c?: () => null): Date {
        void a;
        void b;
        void c;
        return new Date(0);
      }
      return createCloneExactShapeFn<Parameters<typeof fnWithCallback>>();
    },
    getTestData: () => ({
      values: [
        [3, true, opaqueNullFn],
        [3, true],
      ],
    }),
  },
  function_promise_return_type: {
    title: 'Promise return',
    description: 'ReturnType<fn> resolves to a root Promise<Date>, an opaque resource handle that passes through by reference.',
    cloneNotes:
      'The serializers render a Promise root as alwaysThrow (factoryThrows); the value-level clone supports it as opaque pass-through — copying a live handle would be wrong, not just slow.',
    clone: () => {
      function fnReturnsPromise(a: number, b: boolean, c?: string): Promise<Date> {
        void a;
        void b;
        void c;
        return Promise.resolve(new Date(0));
      }
      return createCloneExactShapeFn<ReturnType<typeof fnReturnsPromise>>();
    },
    getTestData: () => ({values: [opaquePromise]}),
    passThrough: true,
  },
  function_return_type_is_function: {
    title: 'Function return slot',
    description:
      'ReturnType<fn> resolves to a root () => Date, which passes through by reference — functions have no declared data shape to rebuild.',
    cloneNotes:
      'The serializers render a function root as alwaysThrow (factoryThrows); the clone supports it as opaque pass-through.',
    clone: () => {
      function fnReturnsFunction(a: number, b: boolean, c?: string): () => Date {
        void a;
        void b;
        void c;
        return () => new Date(0);
      }
      return createCloneExactShapeFn<ReturnType<typeof fnReturnsFunction>>();
    },
    getTestData: () => ({values: [opaqueDateFn]}),
    passThrough: true,
  },
  call_signature_params: {
    title: 'Call signature params',
    description:
      'Parameters of a call-signature interface resolve to the fixed-length tuple [number, boolean], which clones as a fresh array of by-value scalars.',
    cloneNotes:
      'Parameters<> slices the callable interface into plain data; the callable interface ITSELF (an object type with a call signature) is function-like and throws at factory creation (CES003).',
    clone: () => createCloneExactShapeFn<Parameters<{(a: number, b: boolean): string}>>(),
    getTestData: () => ({values: [[3, true]]}),
  },
  call_signature_return: {
    title: 'Call signature return',
    description:
      'The return type of a call-signature interface resolves to a root string, a primitive that passes through by value.',
    clone: () => createCloneExactShapeFn<ReturnType<{(a: number, b: boolean): string}>>(),
    getTestData: () => ({values: ['result']}),
    passThrough: true,
  },
} satisfies Record<string, CloningCase>;
