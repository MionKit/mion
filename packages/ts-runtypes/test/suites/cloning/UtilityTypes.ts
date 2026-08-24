// cloning / UtilityTypes — mapped/derived types resolve structurally and
// clone like plain objects: Awaited/Required/Partial/Pick/Omit/Record reach
// the emitter as their resolved shapes (fresh containers, re-wrapped Dates,
// absent optionals stay absent). Exclude/Extract keep whatever union they
// resolve to — primitive-member unions pass through by value, object-bearing
// unions throw at factory creation (CES001).

import {createCloneExactShapeFn} from '@ts-runtypes/core';
import type {CloningCase} from './types.ts';

export const UTILITY_TYPES = {
  awaited: {
    title: 'Awaited',
    description:
      '`Awaited<Promise<T>>` unwraps the promise at the type level, so the clone rebuilds the resolved object `{a: string; b: number; c: Date}` fresh, re-wrapping the Date.',
    clone: () => createCloneExactShapeFn<Awaited<Promise<{a: string; b: number; c: Date}>>>(),
    getTestData: () => ({values: [{a: 'hello', b: 1, c: new Date('2000-08-06T02:13:00.000Z')}]}),
  },
  exclude_atomic: {
    title: 'Exclude',
    description:
      "`Exclude<'name' | 'age' | number, 'age'>` resolves to the primitive union `'name' | number`, whose members are all immutable — the value passes through.",
    clone: () => createCloneExactShapeFn<Exclude<'name' | 'age' | number, 'age'>>(),
    getTestData: () => ({values: ['name', 3, 4]}),
    passThrough: true,
  },
  exclude_objects: {
    title: 'Exclude objects',
    description:
      '`Exclude<Shape, Circle>` resolves to the object-bearing union `Square | Triangle`, which the clone factory rejects at creation (CES001) — no runtime arm discrimination.',
    cloneNotes:
      'Narrow to one arm before cloning (one factory per arm), or restructure into a single object with optional props — the same workaround as any object-bearing union.',
    clone: () => {
      type Circle = {kind: 'circle'; radius: number};
      type Square = {kind: 'square'; x: number};
      type Triangle = {kind: 'triangle'; x: number; y: number};
      type Shape = Circle | Square | Triangle;
      return createCloneExactShapeFn<Exclude<Shape, Circle>>();
    },
    getTestData: () => ({values: []}),
    factoryThrows: true,
  },
  required_properties: {
    title: 'Required',
    description:
      '`Required<{name?; age?; createdAt?: Date}>` strips the `?` modifiers, and the resolved all-required object rebuilds fresh with a re-wrapped `createdAt` Date.',
    clone: () => createCloneExactShapeFn<Required<{name?: string; age?: number; createdAt?: Date}>>(),
    getTestData: () => ({
      values: [{name: 'John', age: 30, createdAt: new Date('2000-08-06T02:13:00.000Z')}],
    }),
  },
  extract_atomic: {
    title: 'Extract',
    description:
      "`Extract<'name' | 'age' | 'createdAt', 'name' | 'createdAt'>` resolves to the literal union `'name' | 'createdAt'` — immutable members, so the value passes through.",
    clone: () => createCloneExactShapeFn<Extract<'name' | 'age' | 'createdAt', 'name' | 'createdAt'>>(),
    getTestData: () => ({values: ['name']}),
    passThrough: true,
  },
  extract_objects: {
    title: 'Extract objects',
    description:
      '`Extract<Shape, ToExtract>` resolves to the object-bearing union `Square | Triangle`, which the clone factory rejects at creation (CES001) — no runtime arm discrimination.',
    cloneNotes: 'Narrow to one arm before cloning (one factory per arm) — the same workaround as any object-bearing union.',
    clone: () => {
      type Shape = {kind: 'circle'; radius: number} | {kind: 'square'; x: number} | {kind: 'triangle'; x: number; y: number};
      type ToExtract = {kind: 'square'; x: number} | {kind: 'triangle'; x: number; y: number};
      return createCloneExactShapeFn<Extract<Shape, ToExtract>>();
    },
    getTestData: () => ({values: []}),
    factoryThrows: true,
  },
  partial_properties: {
    title: 'Partial',
    description:
      '`Partial<{name; age; createdAt: Date}>` makes every property optional, and the clone keeps absent optionals ABSENT — no `key: undefined` placeholders — while present props copy fresh.',
    clone: () => createCloneExactShapeFn<Partial<{name: string; age: number; createdAt: Date}>>(),
    getTestData: () => {
      const createdAt = new Date('2000-08-06T02:13:00.000Z');
      return {values: [{name: 'John'}, {age: 30}, {createdAt}, {}]};
    },
  },
  pick_properties: {
    title: 'Pick',
    description:
      "`Pick<{name; age; createdAt: Date; email}, 'name' | 'createdAt'>` resolves to `{name: string; createdAt: Date}`, which rebuilds fresh — the unpicked keys are not part of the declared shape.",
    clone: () =>
      createCloneExactShapeFn<Pick<{name: string; age: number; createdAt: Date; email: string}, 'name' | 'createdAt'>>(),
    getTestData: () => ({values: [{name: 'John', createdAt: new Date('2000-08-06T02:13:00.000Z')}]}),
  },
  omit_properties: {
    title: 'Omit',
    description:
      "`Omit<{name; age; createdAt: Date; email}, 'email'>` resolves to the email-less object, which rebuilds fresh with a re-wrapped `createdAt` Date.",
    clone: () => createCloneExactShapeFn<Omit<{name: string; age: number; createdAt: Date; email: string}, 'email'>>(),
    getTestData: () => ({values: [{name: 'John', age: 30, createdAt: new Date('2000-08-06T02:13:00.000Z')}]}),
  },
  record_type: {
    title: 'Record',
    description:
      '`Record<string, Date>` resolves to a string index signature over Date values — the clone copies every key onto a fresh object and re-wraps each Date, with the empty object as a boundary sample.',
    clone: () => createCloneExactShapeFn<Record<string, Date>>(),
    getTestData: () => ({
      values: [
        {
          key1: new Date('2000-08-06T02:13:00.000Z'),
          key2: new Date('2001-09-07T03:14:00.000Z'),
        },
        {},
      ],
    }),
  },
  intersection: {
    title: 'intersection',
    description: 'An intersection of object types flattens structurally and clones like a plain object — extras drop.',
    clone: () => createCloneExactShapeFn<{a: string} & {b: number}>(),
    getTestData: () => ({
      values: [{a: 'x', b: 1, extra: true}],
      expected: [{a: 'x', b: 1}],
    }),
  },
} satisfies Record<string, CloningCase>;
