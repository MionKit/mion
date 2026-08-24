// cloning / Records — index-signature shapes. Signature-matched keys ARE
// declared shape: the clone copies every one of them onto a fresh object
// (values exact-shape-cloned), whether the signature stands alone or sits
// beside named properties. Case keys mirror serialization/Records.ts;
// cloning-only cases are appended at the end of the map.

import {createCloneExactShapeFn} from '@ts-runtypes/core';
import type {CloningCase} from './types.ts';

// Identity-stable symbol keys: the twice-called getTestData builder must
// produce the SAME symbol keys both times (a fresh `Symbol('key3')` per call
// would make the untouched-twin comparison non-deterministic).
const key3 = Symbol('key3');
const key4 = Symbol('key4');

export const RECORDS = {
  index_property: {
    title: 'Index property',
    description:
      'Root `{[key: string]: string}` dynamic-key record clones every key/value pair (and the empty object) onto a fresh plain object, the atomic string values passing by value.',
    clone: () => createCloneExactShapeFn<{[key: string]: string}>(),
    getTestData: () => ({values: [{key1: 'value1', key2: 'value2'}, {}]}),
  },
  index_property_and_prop: {
    title: 'Property and index',
    description:
      'Root `{a: string; [key: string]: string}` clones the declared `a` alongside any number of dynamic string keys — named and signature-matched keys are both declared shape.',
    clone: () => createCloneExactShapeFn<{a: string; [key: string]: string}>(),
    getTestData: () => ({values: [{a: 'helloA'}, {a: 'helloA', b: 'helloB'}]}),
  },
  index_property_extra: {
    title: 'Index with unions',
    description:
      'Root `{a: string; b: number; [key: string]: string | number}` clones declared props and dynamic keys alike, the atomic string-or-number values passing by value.',
    cloneNotes:
      'The `string | number` index value is an atomic-only union — it clones fine; only object-bearing unions make the clone factory throw.',
    clone: () => createCloneExactShapeFn<{a: string; b: number; [key: string]: string | number}>(),
    getTestData: () => ({values: [{key1: 'value1', key2: 'value2', a: 'extra1', b: 123}]}),
  },
  multiple_index_props: {
    title: 'Multiple index signatures',
    description:
      'Root `{[key: string]: string; [key: number]: string; [abc: symbol]: Date}` clones string- and number-keyed entries onto the fresh object while symbol-keyed entries fall outside the string-keyed data projection and drop.',
    cloneNotes:
      'Symbol-keyed entries are dropped from the clone (expected reflects it), mirroring how serialization omits them on the wire; numeric keys are stored as string property keys and copy as such.',
    clone: () => createCloneExactShapeFn<{[key: string]: string; [key: number]: string; [abc: symbol]: Date}>(),
    getTestData: () => {
      const objWithSymbolKeys = {
        key1: 'value1',
        key2: 'value2',
        [key3]: new Date('2000-08-06T02:13:00.000Z'),
        [key4]: new Date('2000-08-06T02:13:00.000Z'),
      };
      // Numeric keys exercise the [key: number] index signature: JS stores them
      // as string property keys and the clone copies them as string keys.
      // (`{5: 'five'}` and `{'5': 'five'}` are the same object.)
      const objWithNumericKeys = {0: 'zero', 5: 'five', key1: 'value1'};
      return {
        values: [{key1: 'value1', key2: 'value2'}, objWithSymbolKeys, objWithNumericKeys],
        expected: [
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
      'Root `{[key: string]: {[key: string]: number}}` deep-clones both levels of dynamic keys with a fresh object per level, the atomic number values passing by value.',
    clone: () => createCloneExactShapeFn<{[key: string]: {[key: string]: number}}>(),
    getTestData: () => ({values: [{key1: {nestedKey1: 1, nestedKey2: 2}}]}),
  },
  index_property_nested_date: {
    title: 'Nested Date index',
    description:
      'Root `{[key: string]: {[key: string]: Date}}` deep-clones both levels of dynamic keys and rebuilds each innermost `Date` as a fresh equal instance.',
    clone: () => createCloneExactShapeFn<{[key: string]: {[key: string]: Date}}>(),
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
      'Root `{[key: string]: bigint}` copies every dynamic key onto a fresh object, the bigint primitives passing by value with no decimal-string round-trip.',
    clone: () => createCloneExactShapeFn<{[key: string]: bigint}>(),
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
      'Root `{b: string; c: {...}}` with the index signature only on the nested `c` clones the fixed root shape plus every dynamic nested key beside the declared `a`.',
    clone: () => createCloneExactShapeFn<{b: string; c: {a: string; [key: string]: string}}>(),
    getTestData: () => ({values: [{b: 'hello', c: {a: 'world', c: 'world'}}]}),
  },
  atomicValues: {
    title: 'record of atomics',
    description: 'An index signature over atomic values copies every key onto a fresh object.',
    clone: () => createCloneExactShapeFn<{[key: string]: number}>(),
    getTestData: () => ({values: [{a: 1, b: 2, anyOther: 3}]}),
  },
  objectValues: {
    title: 'record of objects',
    description: 'An index signature over object values copies every key, exact-shape-cloning each value (their extras drop).',
    clone: () => createCloneExactShapeFn<{[key: string]: {a: string}}>(),
    getTestData: () => ({
      values: [{k1: {a: 'x', extra: 1}, k2: {a: 'y'}}],
      expected: [{k1: {a: 'x'}, k2: {a: 'y'}}],
    }),
  },
  mixedNamedAndSig: {
    title: 'named props + index signature',
    description: 'Named properties and signature-matched keys are BOTH declared shape — the clone copies both.',
    cloneNotes:
      'Regression guard: an early emit filtered atomic index signatures as "non-contributing", which silently dropped every signature-matched key from the clone.',
    clone: () => createCloneExactShapeFn<{name: string; [key: string]: string}>(),
    getTestData: () => ({values: [{name: 'ada', role: 'admin', team: 'core'}]}),
  },
} satisfies Record<string, CloningCase>;
