// cloning / Arrays — arrays are mutable containers and are ALWAYS fresh:
// `.slice()` when the element type is immutable (a slice IS a deep clone
// then), `.map(clone)` when elements have shape. Opaque elements (symbols)
// pass through by reference INSIDE the fresh container, and circular
// element types clone recursively.

import {createCloneExactShapeFn} from '@ts-runtypes/core';
import type {CloningCase} from './types.ts';

// Module-level consts so both getTestData() calls return the SAME references
// (symbols pass through by reference; a per-call Symbol() would break the
// untouched-twin comparison).
const symbolA = Symbol('a');
const symbolB = Symbol('b');

export const ARRAYS = {
  array: {
    title: 'Array',
    description: 'Root `string[]` clones to a fresh array; the immutable string elements are shared by value.',
    clone: () => createCloneExactShapeFn<string[]>(),
    getTestData: () => ({values: [['hello', 'world'], []]}),
  },
  array_date: {
    title: 'Date array',
    description: '`Date[]` rebuilds element-wise — a fresh outer array holding a fresh Date instance per element.',
    clone: () => createCloneExactShapeFn<Date[]>(),
    getTestData: () => ({
      values: [[new Date('2000-08-06T02:13:00.000Z'), new Date('2001-09-07T03:14:00.000Z')], []],
    }),
  },
  undefined_in_array: {
    title: 'Undefined array elements',
    description: '`undefined[]` slots stay `undefined` in the fresh array — a value-level clone has no JSON `null` projection.',
    clone: () => createCloneExactShapeFn<undefined[]>(),
    getTestData: () => ({values: [[undefined, undefined]]}),
  },
  null_in_array: {
    title: 'Null array elements',
    description: '`null[]` elements pass through as `null` inside a fresh array.',
    clone: () => createCloneExactShapeFn<null[]>(),
    getTestData: () => ({values: [[null, null], []]}),
  },
  nullable_number_array: {
    title: 'Nullable number array',
    description: '`(number | null)[]` copies numbers and nulls by value into a fresh array.',
    clone: () => createCloneExactShapeFn<(number | null)[]>(),
    getTestData: () => ({values: [[1, null, 2], [null], []]}),
  },
  void_in_array: {
    title: 'Void array elements',
    description: '`void[]` normalises to undefined elements, which stay `undefined` in the fresh array.',
    clone: () => createCloneExactShapeFn<void[]>(),
    getTestData: () => ({values: [[undefined, undefined]]}),
  },
  multi_dimensional: {
    title: 'Multi-dimensional array',
    description: 'Nested `string[][]` clones fresh at every depth — no inner array is shared, including the empty ones.',
    clone: () => createCloneExactShapeFn<string[][]>(),
    getTestData: () => ({values: [[['hello', 'world'], ['a', 'b'], []], []]}),
  },
  non_serializable_in_array: {
    title: 'Non-serializable array elements',
    description:
      'Unlike serialization, `symbol[]` does not throw — symbols are opaque and pass through by reference inside a fresh array.',
    clone: () => createCloneExactShapeFn<symbol[]>(),
    getTestData: () => ({values: [[symbolA, symbolB], []]}),
  },
  array_circular: {
    title: 'Circular array',
    description: 'Self-referential `type CircularArray = CircularArray[]` clones fresh at every recursion level.',
    clone: () => {
      type CircularArray = CircularArray[];
      return createCloneExactShapeFn<CircularArray>();
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
  atomicElements: {
    title: 'array of atomics',
    description: 'Immutable elements make `.slice()` a complete deep clone — fresh array, shared primitive values.',
    clone: () => createCloneExactShapeFn<string[]>(),
    getTestData: () => ({values: [['a', 'b'], []]}),
  },
  objectElements: {
    title: 'array of objects',
    description: 'Object elements rebuild element-wise with fresh identities; element extras drop.',
    clone: () => createCloneExactShapeFn<Array<{a: string}>>(),
    getTestData: () => ({
      values: [
        [
          {a: 'x', extra: 1},
          {a: 'y', extra: 2},
        ],
      ],
      expected: [[{a: 'x'}, {a: 'y'}]],
    }),
  },
  nestedArrays: {
    title: 'array of arrays',
    description: 'Outer and inner arrays are both fresh (containers are never shared, even when the leaves are atomic).',
    clone: () => createCloneExactShapeFn<string[][]>(),
    getTestData: () => ({values: [[['a'], ['b', 'c']]]}),
  },
  readonly_array: {
    title: 'readonly array',
    description: 'A `readonly` array is a compile-time view — the clone is a fresh mutable array with the same values.',
    clone: () => createCloneExactShapeFn<readonly string[]>(),
    getTestData: () => ({values: [['a', 'b'] as readonly string[]]}),
  },
} satisfies Record<string, CloningCase>;
