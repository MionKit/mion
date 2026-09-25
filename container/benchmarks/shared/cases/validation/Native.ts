import type {SharedCase} from '../types.ts';

export const NATIVE = {
  map_string_number: {
    title: 'Map with string keys and number values',
    description:
      'native/map — `v instanceof Map` plus iteration over `v.entries()` checking each key and value against K / V.',
    getSamples: () => {
      const empty = new Map();
      const one = new Map([['a', 1]]);
      const many = new Map([
        ['a', 1],
        ['b', 2],
      ]);
      const wrongKey = new Map<any, number>([[1, 1]]);
      const wrongValue = new Map<string, any>([['a', 'not number']]);
      const nanValue = new Map<string, any>([['a', NaN]]);
      return {
        valid: [empty, one, many],
        invalid: [{}, [], null, 'not map', wrongKey, wrongValue, undefined, new Date(), nanValue, new Set()],
      };
    },
  },
  set_string: {
    title: 'Set of strings',
    description: 'native/set — `v instanceof Set` plus iteration over `v.values()`.',
    getSamples: () => {
      const empty = new Set<string>();
      const one = new Set(['a']);
      const many = new Set(['a', 'b', 'c']);
      const wrongType = new Set<any>([1]);
      const nullElement = new Set<any>([null]);
      return {
        valid: [empty, one, many],
        invalid: [{}, [], null, 'not set', wrongType, undefined, new Date(), new Map(), nullElement],
      };
    },
  },
  promise_string: {
    title: 'Promise — thenable check, wrapped type not validated',
    description:
      "Promise validation is a thenable check — `typeof v === 'object' && v !== null && typeof v.then === 'function'`. The wrapped T cannot be validated synchronously (the promise hasn't resolved); callers use `Awaited<P>` for the resolved-value check (see `awaited_promise` below). prepareForJson/restoreFromJson throw at RT compile (ref: nodes/native/promise.ts).",
    getSamples: () => {
      const realPromise = Promise.resolve('x');
      const thenable = {then: () => null};
      // {then: 'not a function'} — fails the typeof === 'function' check
      const fakeThenable = {then: 'not a function'};
      return {
        valid: [realPromise, thenable],
        invalid: [null, 'string', 42, {}, [], undefined, true, fakeThenable],
      };
    },
  },
  awaited_promise: {
    title: 'Awaited<Promise<T>> — resolves to the wrapped type',
    description:
      "TypeScript's built-in `Awaited<P>` utility unwraps the promise to its resolved type; tsgo resolves it at compile time, so this case lands as plain `string` in our cache and reuses the atomic string emit. The test verifies the utility threads through correctly.",
    getSamples: () => ({
      valid: ['hello', ''],
      invalid: [42, null, undefined, Promise.resolve('x'), true, {}, []],
    }),
  },
} as const satisfies Record<string, SharedCase>;
