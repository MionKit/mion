// cloning / Others — remaining native shapes. RegExp re-compiles (mutable
// via lastIndex, the sticky/global iteration cursor, which the clone
// carries over). Non-serializable natives (Int8Array, Promise) are opaque
// handles the serializers alwaysThrow on — the value-level clone instead
// passes them through at roots and container slots and drops them from
// object shapes (the DataOnly projection): copying a handle would be
// wrong, not just slow.

import {expect} from 'vitest';
import {createCloneExactShapeFn} from '@ts-runtypes/core';
import type {CloningCase} from './types.ts';

// Identity-stable opaque handles (shared by reference across the twice-called
// builders, like the function consts elsewhere in the suite).
const typedA = new Int8Array([1, 2, 3]);
const typedB = new Int8Array([4, 5]);

// Module-level const so both getTestData() calls return the SAME reference
// (promises pass through by reference; a per-call Promise.resolve() would
// break the untouched-twin comparison).
const rootPromise: Promise<string> = Promise.resolve('done');

function advancedRegExp(): RegExp {
  const re = /ab/g;
  re.exec('abab'); // advance lastIndex to 2
  return re;
}

export const OTHERS = {
  promise_jsonStringify_error: {
    title: 'Root Promise',
    description: 'A root `Promise<string>` is an opaque handle with no data shape to rebuild — it passes through by reference.',
    cloneNotes:
      'Divergence from the serializers: they render a root Promise as an alwaysThrow factory, while the value-level clone shares the handle — copying a pending Promise would be wrong, not just slow.',
    clone: () => createCloneExactShapeFn<Promise<string>>(),
    getTestData: () => ({values: [rootPromise]}),
    passThrough: true,
  },
  non_serializable: {
    title: 'Root Int8Array',
    description: 'A root `Int8Array` is an opaque native handle — it passes through by reference.',
    cloneNotes:
      'Divergence from the serializers: they render a root Int8Array as an alwaysThrow factory, while the value-level clone shares the handle (no declared data shape to rebuild).',
    clone: () => createCloneExactShapeFn<Int8Array>(),
    getTestData: () => ({values: [new Int8Array([1, 2, 3])]}),
    passThrough: true,
  },
  non_serializable_interface: {
    title: 'Int8Array in interface',
    description:
      'A declared `Int8Array`-typed member is KEPT on the clone, shared by reference — opaque handles cannot be rebuilt, and declared members are never dropped.',
    cloneNotes:
      'The build emits a CES015 advisory naming the shared member; writes through the shared handle are visible on both sides (overrideCloneExactShape is the escape hatch).',
    clone: () => createCloneExactShapeFn<{a: Int8Array}>(),
    getTestData: () => ({values: [{a: typedA}]}),
  },
  non_serializable_array: {
    title: 'Int8Array in array',
    description:
      'An `Int8Array[]` root clones to a fresh array (containers are never shared); the opaque elements ride along by reference.',
    cloneNotes:
      'Divergence from the serializers: a non-serializable element position alwaysThrows there, while the clone slices a fresh container and shares the opaque element handles.',
    clone: () => createCloneExactShapeFn<Int8Array[]>(),
    // The isolation walker excludes opaque handles (typed arrays share by
    // contract), so real samples are expressible: fresh outer array, shared
    // Int8Array elements.
    getTestData: () => ({values: [[typedA, typedB], []]}),
  },
  non_serializable_tuple: {
    title: 'Int8Array in tuple',
    description:
      'A tuple with an `Int8Array` slot clones to a fresh array (tuples ride arrays); the opaque slot value rides along by reference.',
    cloneNotes:
      'Divergence from the serializers: a non-serializable tuple slot alwaysThrows there, while the clone slices a fresh container and shares the opaque slot handle.',
    clone: () => createCloneExactShapeFn<[Int8Array]>(),
    getTestData: () => ({values: [[typedA]]}),
  },
  regexp: {
    title: 'RegExp',
    description: 'Re-compiled from source + flags with `lastIndex` carried over — a faithful copy even mid-iteration.',
    clone: () => createCloneExactShapeFn<{re: RegExp}>(),
    getTestData: () => ({values: [{re: advancedRegExp()}]}),
    verifyClone: (out) => {
      const re = (out as {re: RegExp}).re;
      expect(re.source).toBe('ab');
      expect(re.flags).toBe('g');
      expect(re.lastIndex).toBe(2);
    },
  },
  regexpRoot: {
    title: 'RegExp root',
    description: 'A root RegExp clones the same way.',
    clone: () => createCloneExactShapeFn<RegExp>(),
    getTestData: () => ({values: [/xy+z/im]}),
  },
} satisfies Record<string, CloningCase>;
