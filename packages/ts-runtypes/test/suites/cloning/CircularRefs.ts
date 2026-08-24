// cloning / CircularRefs — circular TYPES with TREE values. Dep-call
// recursion rebuilds every level fresh, so self-referential shapes clone
// correctly as long as the value is acyclic: ACTUAL cyclic values (a node
// pointing back at an ancestor) are out of the clone contract — the emitted
// clone would recurse — and every sample below is a finite tree. Mirrors
// the serialization suite's CIRCULAR_REFS keys; circular UNIONS with object
// members are the exception and throw at factory creation (CES001, see
// Unions.ts).

import {createCloneExactShapeFn} from '@ts-runtypes/core';
import type {CloningCase} from './types.ts';

type CircularObject = {name: string; child?: CircularObject};

type CuArray = (CuArray | Date | number | string)[];

interface CircularTuple {
  list: [bigint, CircularTuple?];
}

interface CircularIndex {
  index: {[key: string]: CircularIndex};
}

interface CircularDeep {
  deep1: {deep2: {deep3: {deep4?: CircularDeep}}};
}

type CircularTupleComplex = [bigint, CircularTupleComplex?];

type ObjCircularArr = {a: string; deep?: {b: string; c: number}; d?: ObjCircularArr[]};

export const CIRCULAR_REFS = {
  circular_types: {
    title: 'Circular object',
    description:
      'Self-referential {name; child?} node clones by dep-call recursion — every level rebuilds as a fresh object and the absent optional child bottoms out the tree.',
    clone: () => createCloneExactShapeFn<CircularObject>(),
    getTestData: () => ({values: [{name: 'hello', child: {name: 'world'}}]}),
  },
  circular_union_array: {
    title: 'Circular union array',
    description:
      'Recursive array of (self | Date | number | string) rebuilds fresh at every level — nested arrays and Date elements clone fresh, scalar elements pass by value.',
    cloneNotes:
      'The element union carries no object-literal member (the self arm is an array), so the CES001 object-bearing rule does not fire; the Date instance shared across the sample graphs clones into distinct fresh Dates and deep equality still holds.',
    clone: () => createCloneExactShapeFn<CuArray>(),
    getTestData: () => {
      const date = new Date('2000-08-06T02:13:00.000Z');
      return {
        values: [
          [date, 123, 'hello', ['a', 'b', 'c']],
          [date, 123, 'hello', ['a', 2, 'c'], [date, 123, 'hello', ['a', 'b', 'c']]],
          [],
        ],
      };
    },
  },
  circular_tuple: {
    title: 'Circular tuple',
    description:
      'Object-to-tuple recursion clones each {list: [bigint, self?]} level as a fresh object holding a fresh tuple — bigint slots pass by value, absent optional tails stay absent.',
    clone: () => createCloneExactShapeFn<CircularTuple>(),
    getTestData: () => ({
      values: [{list: [1n, {list: [2n, {list: [3n, {list: [4n]}]}]}]}, {list: [1n, {list: [2n]}]}, {list: [1n]}],
    }),
  },
  circular_index: {
    title: 'Circular index',
    description:
      'Object-to-record recursion rebuilds the `index` record fresh at every level, bottoming out at the empty record.',
    clone: () => createCloneExactShapeFn<CircularIndex>(),
    getTestData: () => ({
      values: [{index: {a: {index: {b: {index: {}}}}}}, {index: {a: {index: {}}}}, {index: {}}],
    }),
  },
  circular_deep: {
    title: 'Circular deep',
    description:
      'The self-reference re-enters only four plain-object levels down behind the optional `deep4` — every intermediate object still rebuilds fresh on each pass.',
    clone: () => createCloneExactShapeFn<CircularDeep>(),
    getTestData: () => ({
      values: [{deep1: {deep2: {deep3: {deep4: {deep1: {deep2: {deep3: {}}}}}}}}, {deep1: {deep2: {deep3: {}}}}],
    }),
  },
  circular_tuple_complex: {
    title: 'Root circular tuple',
    description:
      'ROOT-level recursive tuple [bigint, self?] clones as fresh nested tuples with every bigint slot passing by value.',
    cloneNotes:
      'The serialization suite cannot author this shape value-first (RT.circular over a tuple hits TS2589) and opts its schema thunks out; cloning is type-first only, so no such carve-out is needed here.',
    clone: () => createCloneExactShapeFn<CircularTupleComplex>(),
    getTestData: () => ({values: [[1n, [2n, [3n, [4n]]]], [1n, [2n]], [1n]]}),
  },
  object_with_circular_array: {
    title: 'Object with circular array',
    description:
      'Recursive object with an optional array-of-self clones every node fresh — the plain `deep` object and each `d` element rebuild, scalars pass by value, absent optionals stay absent.',
    clone: () => createCloneExactShapeFn<ObjCircularArr>(),
    getTestData: () => ({
      values: [
        // Base case: leaf with neither the optional `deep` nor the recursive `d`.
        {a: 'leaf'},
        {
          a: 'hello',
          deep: {b: 'world', c: 123},
          d: [{a: 'hello2', deep: {b: 'world2', c: 1234}}],
        },
        // Two levels of array-of-self recursion, with a leaf at the bottom.
        {
          a: 'top',
          d: [
            {a: 'mid', d: [{a: 'bottom'}]},
            {a: 'sibling', deep: {b: 'sd', c: 9}},
          ],
        },
      ],
    }),
  },
} satisfies Record<string, CloningCase>;
