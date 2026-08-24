// cloning / Iterables — Map and Set are mutable containers and are ALWAYS
// fresh instances: `new Map(v)` / `new Set(v)` when the entries are
// immutable, per-entry exact-shape clones when they have shape (object
// values, object KEYS, and nested containers all rebuild fresh).

import {createCloneExactShapeFn} from '@ts-runtypes/core';
import type {CloningCase} from './types.ts';

interface SmallObject {
  prop1: string;
  prop2: number;
  prop3: boolean;
  prop4?: Date;
  prop5?: bigint;
}

type Set1 = Set<{s: string; arr: number[]}>;

interface DeepWithSet {
  a: string;
  b: Set1;
  c: Set1;
}

interface DeepWithMap {
  a: string;
  b: Map<string, {sm: {s: string; arr: number[]}}>;
}

interface Row {
  id: number;
  tags: string[];
}

export const ITERABLES = {
  set_string: {
    title: 'Set<string>',
    description: 'Immutable string elements make the constructor copy (`new Set(v)`) a complete deep clone.',
    clone: () => createCloneExactShapeFn<Set<string>>(),
    getTestData: () => ({values: [new Set<string>(['one', 'two', 'three'])]}),
  },
  set_nullable: {
    title: 'Set<number | null>',
    description: 'The `null` element passes by value inside the fresh Set — nullable atomics need no per-element rebuild.',
    clone: () => createCloneExactShapeFn<Set<number | null>>(),
    getTestData: () => ({values: [new Set<number | null>([1, null, 2])]}),
  },
  set_void: {
    title: 'Set<void>',
    description: 'The `undefined` element passes by value inside the fresh Set.',
    clone: () => createCloneExactShapeFn<Set<void>>(),
    getTestData: () => ({values: [new Set<void>([undefined])]}),
  },
  set_small_object: {
    title: 'Set<SmallObject>',
    description:
      'Shaped elements rebuild per entry with fresh identities, re-wrapping each optional `Date` and passing `bigint` by value.',
    clone: () => createCloneExactShapeFn<Set<SmallObject>>(),
    getTestData: () => ({
      values: [
        new Set<SmallObject>([
          {prop1: 'value1', prop2: 1, prop3: true},
          {prop1: 'value2', prop2: 2, prop3: false, prop4: new Date('2000-08-06T02:13:00.000Z')},
          {prop1: 'value3', prop2: 3, prop3: true, prop5: BigInt(100)},
        ]),
      ],
    }),
  },
  objects_with_nested_sets: {
    title: 'Nested sets',
    description:
      'Each nested Set property rebuilds as a fresh Set of per-element object clones — no reference shared with the input.',
    clone: () => createCloneExactShapeFn<DeepWithSet>(),
    getTestData: () => {
      const setB = new Set([
        {s: 'a', arr: [1, 2, 3]},
        {s: 'b', arr: [4, 5, 6]},
      ]);
      const setC = new Set([
        {s: 'a', arr: [1, 2, 3]},
        {s: 'b', arr: [4, 5, 6]},
      ]);
      return {values: [{a: 'a', b: setB, c: setC}]};
    },
  },
  map_string_number: {
    title: 'Map<string, number>',
    description: 'Immutable keys and values make the constructor copy (`new Map(v)`) a complete deep clone.',
    clone: () => createCloneExactShapeFn<Map<string, number>>(),
    getTestData: () => ({
      values: [
        new Map<string, number>([
          ['one', 1],
          ['two', 2],
          ['three', 3],
        ]),
      ],
    }),
  },
  map_string_small_object: {
    title: 'Map<string, SmallObject>',
    description:
      'Shaped values rebuild per entry with fresh identities, re-wrapping each optional `Date` and passing `bigint` by value.',
    clone: () => createCloneExactShapeFn<Map<string, SmallObject>>(),
    getTestData: () => ({
      values: [
        new Map<string, SmallObject>([
          ['key1', {prop1: 'value1', prop2: 1, prop3: true}],
          ['key2', {prop1: 'value2', prop2: 2, prop3: false, prop4: new Date('2000-08-06T02:13:00.000Z')}],
          ['key3', {prop1: 'value3', prop2: 3, prop3: true, prop5: BigInt(100)}],
        ]),
      ],
    }),
  },
  map_small_object_number: {
    title: 'Map<SmallObject, number>',
    description:
      'Object keys clone fresh too — each entry rebuilds its key object (optional `Date`/`bigint` fields included) inside the fresh Map.',
    clone: () => createCloneExactShapeFn<Map<SmallObject, number>>(),
    getTestData: () => ({
      values: [
        new Map<SmallObject, number>([
          [{prop1: 'value1', prop2: 1, prop3: true}, 1],
          [{prop1: 'value2', prop2: 2, prop3: false, prop4: new Date('2000-08-06T02:13:00.000Z')}, 2],
          [{prop1: 'value3', prop2: 3, prop3: true, prop5: BigInt(100)}, 3],
        ]),
      ],
    }),
  },
  objects_with_nested_maps: {
    title: 'Nested maps',
    description: 'The nested Map property rebuilds as a fresh Map whose shaped values clone fresh at every level.',
    clone: () => createCloneExactShapeFn<DeepWithMap>(),
    getTestData: () => ({
      values: [
        {
          a: 'a',
          b: new Map([
            ['key1', {sm: {s: 's', arr: [1, 2, 3]}}],
            ['key2', {sm: {s: 's', arr: [1, 2, 3]}}],
          ]),
        },
      ],
    }),
  },
  map_with_bigint_keys: {
    title: 'Bigint keys',
    description: 'Primitive bigint keys and number values make the constructor copy (`new Map(v)`) a complete deep clone.',
    clone: () => createCloneExactShapeFn<Map<bigint, number>>(),
    getTestData: () => ({
      values: [
        new Map<bigint, number>([
          [1n, 1],
          [2n, 2],
          [3n, 3],
        ]),
      ],
    }),
  },
  map_with_date_values: {
    title: 'Date values',
    description:
      'Each Date value re-wraps into a fresh instance inside the fresh Map — mutating a cloned Date never touches the input.',
    clone: () => createCloneExactShapeFn<Map<string, Date>>(),
    getTestData: () => ({
      values: [
        new Map<string, Date>([
          ['date1', new Date('2000-08-06T02:13:00.000Z')],
          ['date2', new Date('2001-09-07T03:14:00.000Z')],
        ]),
      ],
    }),
  },
  mapAtomic: {
    title: 'Map of atomics',
    description: 'Immutable entries make the constructor copy (`new Map(v)`) a complete deep clone.',
    clone: () => createCloneExactShapeFn<Map<string, number>>(),
    getTestData: () => ({values: [new Map([['k', 1]]), new Map()]}),
  },
  mapObjectValues: {
    title: 'Map with object values',
    description: 'Shaped values rebuild per entry with fresh identities; value extras drop.',
    clone: () => createCloneExactShapeFn<Map<string, {a: string}>>(),
    getTestData: () => ({
      values: [new Map([['k1', {a: 'x', extra: 'gone'} as {a: string}]])],
      expected: [new Map([['k1', {a: 'x'}]])],
    }),
  },
  setAtomic: {
    title: 'Set of atomics',
    description: 'Immutable items make the constructor copy (`new Set(v)`) a complete deep clone.',
    clone: () => createCloneExactShapeFn<Set<string>>(),
    getTestData: () => ({values: [new Set(['a', 'b'])]}),
  },
  setObjects: {
    title: 'Set of objects',
    description: 'Shaped items rebuild per element with fresh identities; item extras drop.',
    clone: () => createCloneExactShapeFn<Set<{a: string}>>(),
    getTestData: () => ({
      values: [new Set([{a: 'x', extra: 'gone'} as {a: string}])],
      expected: [new Set([{a: 'x'}])],
    }),
  },
  deepComposition: {
    title: 'Map of object arrays',
    description: 'Containers compose: the Map, each array, each row, and each row array are all fresh; row extras drop.',
    clone: () => createCloneExactShapeFn<Map<string, Row[]>>(),
    getTestData: () => ({
      values: [new Map([['r', [{id: 1, tags: ['a'], extra: true} as unknown as Row]]])],
      expected: [new Map([['r', [{id: 1, tags: ['a']}]]])],
    }),
  },
} satisfies Record<string, CloningCase>;
