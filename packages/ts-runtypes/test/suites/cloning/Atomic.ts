// cloning / Atomic — atomic roots, mirroring the serialization suite's case
// keys row-for-row. Most rows are the pass-through categories of the isolation
// contract: primitives compare by value (a "fresh" primitive is meaningless —
// `'a' !== 'a'` cannot be made true), and opaque values the type system gives
// no shape for cannot be rebuilt (copying a resource handle would be wrong,
// not just slow — `overrideCloneExactShape<T>()` is the escape hatch). The
// stateful object atoms are the exception: `Date` and `RegExp` clone fresh.

import {createCloneExactShapeFn} from '@ts-runtypes/core';
import type {AnyCloneFn, CloningCase} from './types.ts';

// Used by the kept `enum` case at the bottom; the mirrored `enum_color` case
// shadows it with the serialization suite's Red/Green/Blue enum in its thunks.
enum Color {
  Red = 'red',
  Blue = 'blue',
}

// Module-level const so both getTestData() calls return the SAME reference
// (functions pass through by reference; a per-call closure would break the
// untouched-twin comparison).
const opaqueFn = () => 1;

// Identity-stable symbols for the pass-through case (fresh Symbol() per
// builder call would break the untouched-twin compare).
const symA = Symbol('cloneA');
const symB = Symbol('cloneB');

export const ATOMIC = {
  string: {
    title: 'string',
    description: 'Root `string` passes through by value — primitives have no identity to refresh.',
    cloneNotes: 'Primitives compare by value; `clone(x) === x` is the correct and only possible result.',
    clone: () => createCloneExactShapeFn<string>(),
    getTestData: () => ({values: ['hello', '', 'world', '', '你好', 'مرحبا', 'Здравствуйте', '🌍🚀✨']}),
    passThrough: true,
  },
  number: {
    title: 'number',
    description: 'Root `number` passes through by value; samples span integers, fractions, and the JS extremes.',
    clone: () => createCloneExactShapeFn<number>(),
    getTestData: () => ({
      values: [
        0,
        99,
        -1,
        1.1,
        -1.1,
        1988,
        2045,
        2 ** 31,
        Number.MAX_SAFE_INTEGER,
        Number.MIN_SAFE_INTEGER,
        Number.MIN_VALUE,
        Number.MAX_VALUE,
      ],
    }),
    passThrough: true,
  },
  // Magnitude-split number cases: in the serialization suite these isolate
  // where binary overtakes JSON on the wire. A value-level clone has no wire,
  // so every magnitude behaves identically — keys and values are mirrored
  // anyway to keep the two suites row-for-row comparable.
  number_small: {
    title: 'number (small)',
    description: 'A small single-digit integer passes through by value — magnitude is irrelevant to a clone.',
    clone: () => createCloneExactShapeFn<number>(),
    getTestData: () => ({values: [7]}),
    passThrough: true,
  },
  number_medium: {
    title: 'number (medium)',
    description: 'A mid-size six-digit integer passes through by value.',
    clone: () => createCloneExactShapeFn<number>(),
    getTestData: () => ({values: [123456]}),
    passThrough: true,
  },
  number_large: {
    title: 'number (large)',
    description: 'The largest safe integer passes through by value.',
    clone: () => createCloneExactShapeFn<number>(),
    getTestData: () => ({values: [Number.MAX_SAFE_INTEGER]}),
    passThrough: true,
  },
  number_float_short: {
    title: 'number (low-precision float)',
    description: 'A short low-precision decimal passes through by value.',
    clone: () => createCloneExactShapeFn<number>(),
    getTestData: () => ({values: [3.14]}),
    passThrough: true,
  },
  number_float_precise: {
    title: 'number (high-precision float)',
    description: 'A full-precision 17-digit double passes through by value — no text projection, no precision loss.',
    clone: () => createCloneExactShapeFn<number>(),
    getTestData: () => ({values: [3.141592653589793]}),
    passThrough: true,
  },
  number_not_supported: {
    title: 'number edge cases',
    description: 'Infinity / -Infinity / NaN pass through unchanged — unlike JSON serialization, which nulls them.',
    cloneNotes: 'Pass-through equality uses Object.is semantics, so the NaN sample compares fine.',
    clone: () => createCloneExactShapeFn<number>(),
    getTestData: () => ({values: [Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NaN]}),
    passThrough: true,
  },
  regexp: {
    title: 'regexp',
    description: 'Root `RegExp` does not pass through: the clone is re-compiled fresh with flags and `lastIndex` carried over.',
    cloneNotes: 'Stateful atom: a shared reference would leak `lastIndex` between graphs, so the clone re-compiles.',
    clone: () => createCloneExactShapeFn<RegExp>(),
    getTestData: () => ({values: [/abc/, /xyz/i, /\d+/g, /^[a-z]+$/]}),
  },
  bigint: {
    title: 'bigint',
    description: 'Root `bigint` passes through by value (no JSON-style string projection — this is a value-level clone).',
    clone: () => createCloneExactShapeFn<bigint>(),
    getTestData: () => ({values: [1n, 0n, -1n, -123456789012345678901234567890n, 18446744073709551616n]}),
    passThrough: true,
  },
  boolean: {
    title: 'boolean',
    description: 'Root `boolean` passes through by value.',
    clone: () => createCloneExactShapeFn<boolean>(),
    getTestData: () => ({values: [true, false]}),
    passThrough: true,
  },
  any: {
    title: 'any',
    description: '`any` declares no shape, so the value passes through by reference — even the object and array samples.',
    cloneNotes: 'Opaque pass-through: with nothing declared there is nothing to rebuild; declare a shape to get a fresh graph.',
    clone: () => createCloneExactShapeFn<any>(),
    getTestData: () => ({values: [42, 'hello', true, null, 0, -1, 1.1, {a: 1, b: 2}, [1, 2, 3, null]]}),
    passThrough: true,
  },
  not_supported_any: {
    title: 'any edge cases',
    description: 'undefined / Date / bigint break JSON under `any`, but a clone has no wire — they pass through untouched.',
    clone: () => createCloneExactShapeFn<any>(),
    getTestData: () => ({values: [undefined, [undefined, 123, null], new Date('2000-08-06T02:13:00.000Z'), BigInt(1)]}),
    passThrough: true,
  },
  null: {
    title: 'null',
    description: 'Root `null` passes through.',
    clone: () => createCloneExactShapeFn<null>(),
    getTestData: () => ({values: [null]}),
    passThrough: true,
  },
  undefined: {
    title: 'undefined',
    description: 'Root `undefined` passes through — nothing to rebuild, and no wire format to lose it in.',
    clone: () => createCloneExactShapeFn<undefined>(),
    getTestData: () => ({values: [undefined]}),
    passThrough: true,
  },
  date: {
    title: 'date',
    description: 'Root `Date` clones fresh — a new instance rebuilt from `getTime()`, deep-equal to the input.',
    cloneNotes: 'Object-typed atom, so not pass-through: `setTime` on the clone must never touch the input.',
    clone: () => createCloneExactShapeFn<Date>(),
    getTestData: () => ({
      values: [
        new Date('2000-08-06T02:13:00.000Z'),
        new Date('2000-08-06T02:13:00.123Z'),
        new Date(0),
        new Date('1969-12-31T23:59:59.500Z'),
      ],
    }),
  },
  // Mirrors the serialization suite's enum case. The local enum intentionally
  // shadows the module-level `Color` (used by the kept `enum` case below) so
  // each thunk stays self-contained, as in the serialization suite.
  enum_color: {
    title: 'enum',
    description: 'String enum members are plain strings at runtime and pass through by value.',
    clone: () => {
      enum Color {
        Red = 'red',
        Green = 'green',
        Blue = 'blue',
      }
      return createCloneExactShapeFn<Color>();
    },
    getTestData: () => {
      enum Color {
        Red = 'red',
        Green = 'green',
        Blue = 'blue',
      }
      return {values: [Color.Red, Color.Green]};
    },
    passThrough: true,
  },
  symbol: {
    title: 'symbol',
    description: 'Root `symbol` passes through by reference — immutable, so identity is the correct clone.',
    cloneNotes: [
      'Serializers render root symbol as alwaysThrow — identity cannot survive a wire round-trip.',
      'A value-level clone has no such limit: symbols are opaque immutable values that pass through.',
    ],
    clone: () => createCloneExactShapeFn<symbol>(),
    getTestData: () => ({values: [symA, symB]}),
    passThrough: true,
  },
  object: {
    title: 'object',
    description: 'The TS `object` primitive declares no shape — nothing to rebuild, so the value passes through by reference.',
    cloneNotes: 'Same category as `unknown`; the mirrored sample set includes `null`, which also passes through.',
    clone: () => createCloneExactShapeFn<object>(),
    getTestData: () => ({values: [{a: 42, b: 'hello'}, null]}),
    passThrough: true,
  },
  void: {
    title: 'void',
    description: 'Root `void` holds `undefined` at runtime and passes through by value.',
    clone: () => createCloneExactShapeFn<void>(),
    getTestData: () => ({values: [undefined]}),
    passThrough: true,
  },
  never: {
    title: 'never',
    description: 'Root `never` has no inhabitants; the clone factory still builds an identity pass-through instead of throwing.',
    cloneNotes: [
      'Serializers render root `never` as alwaysThrow; the value-level clone treats it as opaque pass-through.',
      'With no possible values, the mirrored empty sample set is definitionally complete.',
    ],
    // `never` is the one type parameter contravariance can't absorb (`any` is
    // not assignable to `never`) — erase it at the case boundary.
    clone: () => createCloneExactShapeFn<never>() as unknown as AnyCloneFn,
    getTestData: () => ({values: []}),
    passThrough: true,
  },
  literal_string: {
    title: 'string literal',
    description: 'A string-literal type passes through by value.',
    clone: () => createCloneExactShapeFn<'hello'>(),
    getTestData: () => ({values: ['hello']}),
    passThrough: true,
  },
  literal_number: {
    title: 'number literal',
    description: 'A number-literal type passes through by value.',
    clone: () => createCloneExactShapeFn<42>(),
    getTestData: () => ({values: [42]}),
    passThrough: true,
  },
  literal_boolean: {
    title: 'boolean literal',
    description: 'A boolean-literal type passes through by value.',
    clone: () => createCloneExactShapeFn<true>(),
    getTestData: () => ({values: [true]}),
    passThrough: true,
  },
  // Target-only cases below: keys with no counterpart in the serialization
  // suite's atomic map, kept as-is.
  function: {
    title: 'function (opaque)',
    description: 'A function-typed root passes through by reference — functions have no declared data shape to rebuild.',
    cloneNotes: 'Opaque pass-through: copying a function (or any resource handle) would be wrong, not just slow.',
    clone: () => createCloneExactShapeFn<() => number>(),
    getTestData: () => ({values: [opaqueFn]}),
    passThrough: true,
  },
  unknown: {
    title: 'unknown (unshaped)',
    description: '`unknown` gives the emitter no declared shape — the value passes through by reference.',
    clone: () => createCloneExactShapeFn<unknown>(),
    getTestData: () => ({values: [{anything: 1}]}),
    passThrough: true,
  },
} satisfies Record<string, CloningCase>;
