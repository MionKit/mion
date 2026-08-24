// cloning / Tuples — tuples ride arrays (mutable), so always fresh:
// `.slice()` when every slot is immutable, positional rebuild when a slot
// carries shape. Optional slots preserve `undefined` (no JSON `null`
// placeholder — this is a value-level clone), opaque function slots pass
// through by reference inside the fresh tuple, and circular tuples clone
// recursively.

import {createCloneExactShapeFn} from '@ts-runtypes/core';
import type {CloningCase} from './types.ts';

// Module-level const so both getTestData() calls return the SAME reference
// (functions pass through by reference; a per-call closure would break the
// untouched-twin comparison).
const opaqueFn = () => 1;

export const TUPLES = {
  tuple: {
    title: 'tuple',
    description:
      'Fixed-length mixed tuple [Date, number, string, null, string[], bigint] rebuilds positionally — the Date and string[] slots clone fresh, while number, string, null and bigint copy by value.',
    clone: () => createCloneExactShapeFn<[Date, number, string, null, string[], bigint]>(),
    getTestData: () => ({
      values: [[new Date('2000-08-06T02:13:00.000Z'), 123, 'hello', null, ['a', 'b', 'c'], BigInt(123)]],
    }),
  },
  tuple_with_optional: {
    title: 'tuple with optionals',
    description:
      'Tuple [number, bigint?, boolean?, number?] clones fresh with optional slots kept value-level: present values copy and `undefined` slots stay `undefined` (no JSON `null` placeholder).',
    clone: () => createCloneExactShapeFn<[number, bigint?, boolean?, number?]>(),
    getTestData: () => ({
      values: [
        [3, undefined, true, 4],
        [446, undefined, undefined, undefined],
        [7, 9007199254740993n, false, 2],
      ],
    }),
  },
  tuple_rest_parameter: {
    title: 'tuple rest',
    description:
      'Tuple [number, ...bigint[]] clones the fixed slot and every rest bigint by value into a fresh array, covering the rest segment populated and empty.',
    clone: () => createCloneExactShapeFn<[number, ...bigint[]]>(),
    getTestData: () => ({values: [[34567, 1n, 2n, 3n], [3]]}),
  },
  tuple_with_non_serializable: {
    title: 'tuple non-serializable slot',
    description:
      'Unlike serialization, a function-typed tuple slot does not throw — the function is opaque and passes through by reference inside the fresh tuple.',
    clone: () => createCloneExactShapeFn<[number, () => any]>(),
    getTestData: () => ({values: [[123, opaqueFn]]}),
  },
  tuple_circular: {
    title: 'tuple circular',
    description:
      'Self-referential tuple [Date, number, string, null, string[], bigint, TupleCircular?] clones recursively — fresh containers at every level, with the terminating optional slot staying `undefined`.',
    clone: () => {
      type TupleCircular = [Date, number, string, null, string[], bigint, TupleCircular?];
      return createCloneExactShapeFn<TupleCircular>();
    },
    getTestData: () => {
      type TupleCircular = [Date, number, string, null, string[], bigint, TupleCircular?];
      const tDeep: TupleCircular = [
        new Date('2000-08-06T02:13:00.000Z'),
        456,
        'world',
        null,
        ['x', 'y', 'z'],
        BigInt(456),
        undefined,
      ];
      const typeValue: TupleCircular = [
        new Date('2000-08-06T02:13:00.000Z'),
        123,
        'hello',
        null,
        ['a', 'b', 'c'],
        BigInt(123),
        tDeep,
      ];
      return {values: [typeValue]};
    },
  },
  interface_circular_tuple: {
    title: 'interface circular tuple',
    description:
      'Recursive interface whose optional `parent` is a [string, ICircularTuple] tuple clones the object-to-tuple cycle with fresh objects and tuples at every level.',
    clone: () => {
      interface ICircularTuple {
        name: string;
        parent?: [string, ICircularTuple];
      }
      return createCloneExactShapeFn<ICircularTuple>();
    },
    getTestData: () => {
      interface ICircularTuple {
        name: string;
        parent?: [string, ICircularTuple];
      }
      const obj1: ICircularTuple = {name: 'hello', parent: ['world', {name: 'world'}]};
      const obj2: ICircularTuple = {name: 'hello', parent: ['world', {name: 'world', parent: ['hello', obj1]}]};
      return {values: [obj1, obj2]};
    },
  },
  atomicSlots: {
    title: 'tuple of atomics',
    description: 'All-immutable slots copy via `.slice()` — fresh array, same values.',
    clone: () => createCloneExactShapeFn<[string, number]>(),
    getTestData: () => ({values: [['x', 1]]}),
  },
  objectSlot: {
    title: 'tuple with an object slot',
    description: 'A shaped slot forces the positional rebuild; the slot clones fresh and its extras drop.',
    clone: () => createCloneExactShapeFn<[string, {a: number}]>(),
    getTestData: () => ({
      values: [['x', {a: 1, extra: 9}]],
      expected: [['x', {a: 1}]],
    }),
  },
} satisfies Record<string, CloningCase>;
