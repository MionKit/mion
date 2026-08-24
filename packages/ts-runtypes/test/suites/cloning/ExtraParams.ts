// cloning / ExtraParams — undeclared keys on the input, the clone's bread
// and butter. Extras are dropped BY CONSTRUCTION: the clone is built from
// the declared type (never `{...v}`), so there is no strip pass and no
// per-key decision — extras that would round-trip (strings), throw
// (bigint), or silently vanish (symbol, function) under JSON.stringify all
// behave identically here, because the clone simply never visits them.

import {createCloneExactShapeFn} from '@ts-runtypes/core';
import type {CloningCase} from './types.ts';

// Module-level consts so both getTestData() calls return the SAME references
// (symbols and functions compare by identity; per-call instances would break
// the untouched-twin comparison).
const extraSymbol = Symbol('extra');
const extraFn = () => 0;

export const EXTRA_PARAMS = {
  extras_passthrough_compatible: {
    title: 'JSON-compatible extra',
    description:
      'Extra `extra: "hello"` never reaches the clone — the fresh object is built from the declared keys alone, so the extra is dropped by construction while the input keeps it.',
    clone: () => createCloneExactShapeFn<{declared: string}>(),
    getTestData: () => ({
      values: [{declared: 'x', extra: 'hello'}],
      expected: [{declared: 'x'}],
    }),
  },
  extras_throws_bigint: {
    title: 'Bigint extra',
    description:
      'Extra `extra: 123n` would throw in JSON.stringify but is a non-event for the clone — built from the type, it never visits the bigint and drops it by construction.',
    clone: () => createCloneExactShapeFn<{declared: string}>(),
    getTestData: () => ({
      values: [{declared: 'x', extra: 123n}],
      expected: [{declared: 'x'}],
    }),
  },
  extras_dropped_symbol: {
    title: 'Symbol-valued extra',
    description:
      'Extra `sym: Symbol("extra")` is dropped by construction — no ECMAScript stringify special-casing involved, the undeclared key is simply never copied.',
    clone: () => createCloneExactShapeFn<{declared: string}>(),
    getTestData: () => ({
      values: [{declared: 'x', sym: extraSymbol}],
      expected: [{declared: 'x'}],
    }),
  },
  extras_dropped_function: {
    title: 'Function-valued extra',
    description:
      'Extra `fn: () => 0` is dropped by construction — the clone assigns declared keys only, so the function-valued extra never makes it across.',
    clone: () => createCloneExactShapeFn<{declared: string}>(),
    getTestData: () => ({
      values: [{declared: 'x', fn: extraFn}],
      expected: [{declared: 'x'}],
    }),
  },
  nested_extras_in_declared_child: {
    title: 'Nested extra',
    description:
      'Extra `outer.extra` inside a declared `outer: {declared: string}` composite drops at every level — the rebuild recurses through declared children only, never spreading the input.',
    clone: () => createCloneExactShapeFn<{outer: {declared: string}}>(),
    getTestData: () => ({
      values: [{outer: {declared: 'x', extra: 'y'}}],
      expected: [{outer: {declared: 'x'}}],
    }),
  },
} satisfies Record<string, CloningCase>;
