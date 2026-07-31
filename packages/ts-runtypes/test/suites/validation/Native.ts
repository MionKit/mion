import * as TF from '@ts-runtypes/core/formats';
import type {ValidationCase} from './types.ts';
import {
  createValidateFn,
  createGetValidationErrorsFn,
  createMockDataFn,
  createStandardSchema,
  type DataOnly,
} from '@ts-runtypes/core';
import * as RT from '@ts-runtypes/core/schema';
import {deserializeValidate, deserializeGetValidationErrors} from '../../util/deserializeRTFunctions.ts';

export const NATIVE = {
  map_string_number: {
    title: 'Map',
    description:
      'A Map with string keys and number values validates via `v instanceof Map` plus iteration over `v.entries()` checking each key and value against K / V.',
    validateNotes: [
      'Must be an actual `Map` instance — a plain object, array, or `Set` is rejected.',
      'The value side reuses the atomic `number` check, so a `NaN` value is rejected (path `{key, failed: "mapValue"}`).',
    ],
    validate: () => createValidateFn<Map<string, number>>(),
    standardSchema: () => createStandardSchema<Map<string, number>>(),
    // One hand-authored Standard Schema expectation per file. Every other case
    // derives its expected issues from getExpectedErrors via runTypeErrorsToIssues
    // (the same mapping the factory uses), so this single case pins the real
    // consumer-facing {message, path} output independently: it trips if error
    // generation or the issue mapping changes. One case per file covers this
    // file's shapes without the ~265x maintenance of authoring every case.
    getExpectedStandardErrors: () => [
      [{message: 'Expected map', path: [], expected: 'map'}],
      [{message: 'Expected map', path: [], expected: 'map'}],
      [{message: 'Expected map', path: [], expected: 'map'}],
      [{message: 'Expected map', path: [], expected: 'map'}],
      [{message: 'Expected string', path: [{key: 0, failed: 'mapKey'}], expected: 'string'}],
      [{message: 'Expected number', path: [{key: 0, failed: 'mapValue'}], expected: 'number'}],
      [{message: 'Expected map', path: [], expected: 'map'}],
      [{message: 'Expected map', path: [], expected: 'map'}],
      [{message: 'Expected number', path: [{key: 0, failed: 'mapValue'}], expected: 'number'}],
      [{message: 'Expected map', path: [], expected: 'map'}],
    ],
    validateDataOnly: () => createValidateFn<DataOnly<Map<string, number>>>(),
    validateSchema: () => createValidateFn(RT.map(TF.string(), TF.number())),
    deserializeValidate: () => deserializeValidate<Map<string, number>>(),
    validateReflect: () => {
      const v: Map<string, number> = new Map();
      return createValidateFn(v);
    },
    deserializeValidateReflect: () => {
      const v: Map<string, number> = new Map();
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrorsFn<Map<string, number>>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<Map<string, number>>>(),
    getValidationErrorsSchema: () => createGetValidationErrorsFn(RT.map(TF.string(), TF.number())),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<Map<string, number>>(),
    getValidationErrorsReflect: () => {
      const v: Map<string, number> = new Map();
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: Map<string, number> = new Map();
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockDataFn<Map<string, number>>(),
    mockTypeReflect: () => {
      const v: Map<string, number> = new Map();
      return createMockDataFn(v);
    },
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
    getExpectedErrors: () => [
      [{path: [], expected: 'map'}],
      [{path: [], expected: 'map'}],
      [{path: [], expected: 'map'}],
      [{path: [], expected: 'map'}],
      // wrongKey: Map with key=1 (number not string). Path is the
      // standard {key, failed} segment object: `key` is the entry's
      // iteration index, `failed` which side of the entry failed.
      [{path: [{key: 0, failed: 'mapKey'}], expected: 'string'}],
      [{path: [{key: 0, failed: 'mapValue'}], expected: 'number'}],
      [{path: [], expected: 'map'}],
      [{path: [], expected: 'map'}],
      [{path: [{key: 0, failed: 'mapValue'}], expected: 'number'}],
      [{path: [], expected: 'map'}],
    ],
  },

  set_string: {
    title: 'Set',
    description: 'A Set of strings validates via `v instanceof Set` plus iteration over `v.values()`.',
    validateNotes:
      'Must be an actual `Set` instance — a plain object, array, or `Map` is rejected; each element is checked against the element type (set path is `{key, failed: "setKey"}`, where `key` is the iteration index).',
    validate: () => createValidateFn<Set<string>>(),
    standardSchema: () => createStandardSchema<Set<string>>(),
    validateDataOnly: () => createValidateFn<DataOnly<Set<string>>>(),
    validateSchema: () => createValidateFn(RT.set(TF.string())),
    deserializeValidate: () => deserializeValidate<Set<string>>(),
    validateReflect: () => {
      const v: Set<string> = new Set();
      return createValidateFn(v);
    },
    deserializeValidateReflect: () => {
      const v: Set<string> = new Set();
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrorsFn<Set<string>>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<Set<string>>>(),
    getValidationErrorsSchema: () => createGetValidationErrorsFn(RT.set(TF.string())),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<Set<string>>(),
    getValidationErrorsReflect: () => {
      const v: Set<string> = new Set();
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: Set<string> = new Set();
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockDataFn<Set<string>>(),
    mockTypeReflect: () => {
      const v: Set<string> = new Set();
      return createMockDataFn(v);
    },
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
    getExpectedErrors: () => [
      [{path: [], expected: 'set'}],
      [{path: [], expected: 'set'}],
      [{path: [], expected: 'set'}],
      [{path: [], expected: 'set'}],
      // wrongType: Set with item 1 (number not string). Set path is
      // {key, failed: 'setKey'} where `key` is the iteration index.
      [{path: [{key: 0, failed: 'setKey'}], expected: 'string'}],
      [{path: [], expected: 'set'}],
      [{path: [], expected: 'set'}],
      [{path: [], expected: 'set'}],
      // nullElement: Set with item null (not string). The item value is
      // never serialised into the path — `key` is just the index (0).
      [{path: [{key: 0, failed: 'setKey'}], expected: 'string'}],
    ],
  },

  promise_string: {
    title: 'Promise',
    // `DataOnly` STRIPS Promise (a thenable is not data — see DataOnly in
    // runtypes/types.ts), so `DataOnly<Promise<string>>` is `never` and the
    // DataOnly validator collapses to an always-throw, diverging from the bare
    // form's thenable check. (The matching emitter change — make `validate` itself
    // drop Promise like symbol/method — is tracked separately; until then the
    // bare `validate` still thenable-validates, so this stays divergent.)
    dataOnlyDivergent: true,
    description:
      "A thenable check (`typeof v === 'object' && v !== null && typeof v.then === 'function'`); the wrapped value can't be validated synchronously.",
    validateNotes: [
      'TS DIVERGENCE: Promise validation is a "thenable" check — any object with a `then: function` PASSES, even if it is not an actual `Promise` instance.',
      'The wrapped type T is NOT validated — the promise has not resolved yet. Use `Awaited<P>` if you have the resolved value and want to validate it.',
    ],
    validate: () => createValidateFn<Promise<string>>(),
    standardSchema: () => createStandardSchema<Promise<string>>(),
    validateDataOnly: () => createValidateFn<DataOnly<Promise<string>>>(),
    validateSchema: () => createValidateFn(RT.promise(TF.string())),
    deserializeValidate: () => deserializeValidate<Promise<string>>(),
    validateReflect: () => {
      const v: Promise<string> = Promise.resolve('x');
      return createValidateFn(v);
    },
    deserializeValidateReflect: () => {
      const v: Promise<string> = Promise.resolve('x');
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrorsFn<Promise<string>>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<Promise<string>>>(),
    getValidationErrorsSchema: () => createGetValidationErrorsFn(RT.promise(TF.string())),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<Promise<string>>(),
    getValidationErrorsReflect: () => {
      const v: Promise<string> = Promise.resolve('x');
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: Promise<string> = Promise.resolve('x');
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockDataFn<Promise<string>>(),
    mockTypeReflect: () => {
      const v: Promise<string> = Promise.resolve('x');
      return createMockDataFn(v);
    },
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
    getExpectedErrors: () => [
      [{path: [], expected: 'promise'}],
      [{path: [], expected: 'promise'}],
      [{path: [], expected: 'promise'}],
      [{path: [], expected: 'promise'}],
      [{path: [], expected: 'promise'}],
      [{path: [], expected: 'promise'}],
      [{path: [], expected: 'promise'}],
      [{path: [], expected: 'promise'}],
    ],
  },

  awaited_promise: {
    title: 'Awaited',
    description:
      "TypeScript's built-in `Awaited<P>` utility resolves to the wrapped type, unwrapping the promise to its resolved type; tsgo resolves it at compile time, so this case lands as plain `string` in our cache and reuses the atomic string emit.",
    validateNotes:
      '`Awaited<P>` is resolved at the type-checker layer to the resolved value type — `Awaited<Promise<string>>` becomes plain `string`. The validator is identical to the atomic-string emit; a real Promise does NOT satisfy it.',
    validate: () => createValidateFn<Awaited<Promise<string>>>(),
    standardSchema: () => createStandardSchema<Awaited<Promise<string>>>(),
    validateDataOnly: () => createValidateFn<DataOnly<Awaited<Promise<string>>>>(),
    validateSchema: () => createValidateFn(TF.string()),
    deserializeValidate: () => deserializeValidate<Awaited<Promise<string>>>(),
    validateReflect: () => {
      const v: Awaited<Promise<string>> = 'hello';
      return createValidateFn(v);
    },
    deserializeValidateReflect: () => {
      const v: Awaited<Promise<string>> = 'hello';
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrorsFn<Awaited<Promise<string>>>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<Awaited<Promise<string>>>>(),
    getValidationErrorsSchema: () => createGetValidationErrorsFn(TF.string()),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<Awaited<Promise<string>>>(),
    getValidationErrorsReflect: () => {
      const v: Awaited<Promise<string>> = 'hello';
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: Awaited<Promise<string>> = 'hello';
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockDataFn<Awaited<Promise<string>>>(),
    mockTypeReflect: () => {
      const v: Awaited<Promise<string>> = 'hello';
      return createMockDataFn(v);
    },
    getSamples: () => ({
      valid: ['hello', ''],
      invalid: [42, null, undefined, Promise.resolve('x'), true, {}, []],
    }),
    getExpectedErrors: () => [
      [{path: [], expected: 'string'}],
      [{path: [], expected: 'string'}],
      [{path: [], expected: 'string'}],
      [{path: [], expected: 'string'}],
      [{path: [], expected: 'string'}],
      [{path: [], expected: 'string'}],
      [{path: [], expected: 'string'}],
    ],
  },
} as const satisfies Record<string, ValidationCase>;
