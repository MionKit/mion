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

export const TUPLE = {
  string_number_pair: {
    title: 'String number pair',
    description:
      'A two-element tuple that checks `Array.isArray(v)`, exact length 2, then validates slot 0 as `string` and slot 1 as `number` (member/tuple).',
    validateNotes: [
      'Tuples enforce exact length — both fewer (missing required) and more (excess) elements fail.',
      'Each slot runs the atomic check for its declared type.',
    ],
    validate: () => createValidateFn<[string, number]>(),
    standardSchema: () => createStandardSchema<[string, number]>(),
    // One hand-authored Standard Schema expectation per file. Every other case
    // derives its expected issues from getExpectedErrors via runTypeErrorsToIssues
    // (the same mapping the factory uses), so this single case pins the real
    // consumer-facing {message, path} output independently: it trips if error
    // generation or the issue mapping changes. One case per file covers this
    // file's shapes without the ~265x maintenance of authoring every case.
    getExpectedStandardErrors: () => [
      [
        {message: 'Expected string', path: [0], expected: 'string'},
        {message: 'Expected number', path: [1], expected: 'number'},
      ],
      [{message: 'Expected number', path: [1], expected: 'number'}],
      [{message: 'Expected tuple', path: [], expected: 'tuple'}],
      [
        {message: 'Expected string', path: [0], expected: 'string'},
        {message: 'Expected number', path: [1], expected: 'number'},
      ],
      [{message: 'Expected tuple', path: [], expected: 'tuple'}],
      [{message: 'Expected tuple', path: [], expected: 'tuple'}],
      [{message: 'Expected tuple', path: [], expected: 'tuple'}],
      [{message: 'Expected number', path: [1], expected: 'number'}],
      [{message: 'Expected string', path: [0], expected: 'string'}],
      [{message: 'Expected number', path: [1], expected: 'number'}],
    ],
    validateDataOnly: () => createValidateFn<DataOnly<[string, number]>>(),
    validateSchema: () => createValidateFn(RT.tuple([TF.string(), TF.number()])),
    deserializeValidate: () => deserializeValidate<[string, number]>(),
    validateReflect: () => {
      const v: [string, number] = ['hello', 1];
      return createValidateFn(v);
    },
    deserializeValidateReflect: () => {
      const v: [string, number] = ['hello', 1];
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrorsFn<[string, number]>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<[string, number]>>(),
    getValidationErrorsSchema: () => createGetValidationErrorsFn(RT.tuple([TF.string(), TF.number()])),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<[string, number]>(),
    getValidationErrorsReflect: () => {
      const v: [string, number] = ['hello', 1];
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: [string, number] = ['hello', 1];
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockDataFn<[string, number]>(),
    mockTypeReflect: () => {
      const v: [string, number] = ['hello', 1];
      return createMockDataFn(v);
    },
    getSamples: () => ({
      valid: [
        ['hello', 1],
        ['', 0],
      ],
      invalid: [
        [],
        ['hello'],
        ['hello', 1, 'extra'],
        [1, 'hello'],
        'not array',
        null,
        undefined,
        ['hello', NaN], // NaN fails Number.isFinite
        [null, 1],
        ['hello', null],
      ],
    }),
    getExpectedErrors: () => [
      // [] — falls into else (length 0 ≤ 2); both slots are
      // undefined → both fail their atomic checks.
      [
        {path: [0], expected: 'string'},
        {path: [1], expected: 'number'},
      ],
      // ['hello'] — slot 0 OK; slot 1 undefined → number check fails.
      [{path: [1], expected: 'number'}],
      // ['hello', 1, 'extra'] — length > 2 fails outer tuple check.
      [{path: [], expected: 'tuple'}],
      // [1, 'hello'] — both slots wrong type.
      [
        {path: [0], expected: 'string'},
        {path: [1], expected: 'number'},
      ],
      [{path: [], expected: 'tuple'}],
      [{path: [], expected: 'tuple'}],
      [{path: [], expected: 'tuple'}],
      [{path: [1], expected: 'number'}],
      [{path: [0], expected: 'string'}],
      [{path: [1], expected: 'number'}],
    ],
  },

  full_mion_tuple: {
    title: 'Heterogeneous tuple',
    description:
      'A six-element heterogeneous tuple where each slot runs its declared atomic check (tuple.spec.ts "validate tuple").',
    validateNotes:
      'Each slot runs its declared atomic check: an Invalid Date at slot 0, `NaN` at slot 1, or `undefined` at the `null`-literal slot 3 all fail (`undefined` is not `null`).',
    validate: () => createValidateFn<[Date, number, string, null, string[], bigint]>(),
    standardSchema: () => createStandardSchema<[Date, number, string, null, string[], bigint]>(),
    validateDataOnly: () => createValidateFn<DataOnly<[Date, number, string, null, string[], bigint]>>(),
    validateSchema: () =>
      createValidateFn(RT.tuple([TF.date(), TF.number(), TF.string(), RT.literal(null), RT.array(TF.string()), TF.bigInt()])),
    deserializeValidate: () => deserializeValidate<[Date, number, string, null, string[], bigint]>(),
    validateReflect: () => {
      const v: [Date, number, string, null, string[], bigint] = [new Date(), 123, 'hello', null, ['a'], 1n];
      return createValidateFn(v);
    },
    deserializeValidateReflect: () => {
      const v: [Date, number, string, null, string[], bigint] = [new Date(), 123, 'hello', null, ['a'], 1n];
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrorsFn<[Date, number, string, null, string[], bigint]>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<[Date, number, string, null, string[], bigint]>>(),
    getValidationErrorsSchema: () =>
      createGetValidationErrorsFn(
        RT.tuple([TF.date(), TF.number(), TF.string(), RT.literal(null), RT.array(TF.string()), TF.bigInt()])
      ),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<[Date, number, string, null, string[], bigint]>(),
    getValidationErrorsReflect: () => {
      const v: [Date, number, string, null, string[], bigint] = [new Date(), 123, 'hello', null, ['a'], 1n];
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: [Date, number, string, null, string[], bigint] = [new Date(), 123, 'hello', null, ['a'], 1n];
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockDataFn<[Date, number, string, null, string[], bigint]>(),
    mockTypeReflect: () => {
      const v: [Date, number, string, null, string[], bigint] = [new Date(), 123, 'hello', null, ['a'], 1n];
      return createMockDataFn(v);
    },
    getSamples: () => ({
      valid: [[new Date(), 123, 'hello', null, ['a', 'b', 'c'], BigInt(123)]],
      invalid: [
        [new Date(), 123, 'hello', null, ['a', 'b', 'c']], // missing 6th elem
        [new Date(), 123, 'hello', null, ['a', 'b', 'c'], BigInt(123), 34], // extra
        [new Date(), 123, 'hello', null, ['a', 'b', 'c'], 'not bigint'],
        null,
        undefined,
        [new Date('invalid'), 123, 'hello', null, ['a'], 1n], // Invalid Date
        [new Date(), NaN, 'hello', null, ['a'], 1n], // NaN
        [new Date(), 123, 'hello', undefined, ['a'], 1n], // undefined ≠ null literal
      ],
    }),
    // NB: a too-SHORT (5-element) array for this required 6-slot tuple does NOT
    // raise a root-level `tuple` arity error — there is no min-length guard. Each
    // declared slot runs its own check against the (missing-as-`undefined`) value,
    // so the absent 6th element fails its `bigint` check at path [5]. The root
    // `tuple` token only appears for non-arrays and too-LONG (excess-element) inputs.
    getExpectedErrors: () => [
      [{path: [5], expected: 'bigint'}],
      [{path: [], expected: 'tuple'}],
      [{path: [5], expected: 'bigint'}],
      [{path: [], expected: 'tuple'}],
      [{path: [], expected: 'tuple'}],
      [{path: [0], expected: 'date'}],
      [{path: [1], expected: 'number'}],
      [{path: [3], expected: 'null'}],
    ],
  },

  tuple_with_optional: {
    title: 'Tuple with optionals',
    description:
      'A tuple with trailing optional elements that may each be absent or explicitly undefined (tuple.spec.ts "validate tuple with optional parameters").',
    validateNotes:
      'Optional tuple slots may be absent OR explicitly `undefined`. Trailing-only — TS grammar disallows `[A, B?, C]` (required after optional).',
    validate: () => createValidateFn<[number, bigint?, boolean?, number?]>(),
    standardSchema: () => createStandardSchema<[number, bigint?, boolean?, number?]>(),
    validateDataOnly: () => createValidateFn<DataOnly<[number, bigint?, boolean?, number?]>>(),
    validateSchema: () => createValidateFn(RT.tuple([TF.number()], [TF.bigInt(), RT.boolean(), TF.number()])),
    deserializeValidate: () => deserializeValidate<[number, bigint?, boolean?, number?]>(),
    validateReflect: () => {
      const v: [number, bigint?, boolean?, number?] = [3];
      return createValidateFn(v);
    },
    deserializeValidateReflect: () => {
      const v: [number, bigint?, boolean?, number?] = [3];
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrorsFn<[number, bigint?, boolean?, number?]>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<[number, bigint?, boolean?, number?]>>(),
    getValidationErrorsSchema: () =>
      createGetValidationErrorsFn(RT.tuple([TF.number()], [TF.bigInt(), RT.boolean(), TF.number()])),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<[number, bigint?, boolean?, number?]>(),
    getValidationErrorsReflect: () => {
      const v: [number, bigint?, boolean?, number?] = [3];
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: [number, bigint?, boolean?, number?] = [3];
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockDataFn<[number, bigint?, boolean?, number?]>(),
    mockTypeReflect: () => {
      const v: [number, bigint?, boolean?, number?] = [3];
      return createMockDataFn(v);
    },
    getSamples: () => ({
      valid: [[3, undefined, true, 4], [3], [3, 1n], [3, 1n, false]],
      invalid: [[], [3, 'not bigint'], [3, 1n, false, 4, 'extra'], 'not array', null, undefined, [NaN], ['not number']],
    }),
    getExpectedErrors: () => [
      // [] — slot 0 (required number) undefined → fails.
      [{path: [0], expected: 'number'}],
      // [3, 'not bigint'] — slot 1 is non-undefined non-bigint.
      [{path: [1], expected: 'bigint'}],
      // [3, 1n, false, 4, 'extra'] — length 5 > 4.
      [{path: [], expected: 'tuple'}],
      [{path: [], expected: 'tuple'}],
      [{path: [], expected: 'tuple'}],
      [{path: [], expected: 'tuple'}],
      [{path: [0], expected: 'number'}],
      [{path: [0], expected: 'number'}],
    ],
  },

  nested_tuple_in_array: {
    title: 'Tuple in array',
    description: 'An array of fixed-length tuples that exercises a tuple inside an array dependency call.',
    validateNotes:
      'Each element is a fixed-length tuple, so a non-array element (e.g. `"not tuple"`) fails with `expected: "tuple"` while element-level failures report the nested `[index, slot]` path.',
    validate: () => createValidateFn<[string, number][]>(),
    standardSchema: () => createStandardSchema<[string, number][]>(),
    validateDataOnly: () => createValidateFn<DataOnly<[string, number][]>>(),
    validateSchema: () => createValidateFn(RT.array(RT.tuple([TF.string(), TF.number()]))),
    deserializeValidate: () => deserializeValidate<[string, number][]>(),
    validateReflect: () => {
      const v: [string, number][] = [];
      return createValidateFn(v);
    },
    deserializeValidateReflect: () => {
      const v: [string, number][] = [];
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrorsFn<[string, number][]>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<[string, number][]>>(),
    getValidationErrorsSchema: () => createGetValidationErrorsFn(RT.array(RT.tuple([TF.string(), TF.number()]))),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<[string, number][]>(),
    getValidationErrorsReflect: () => {
      const v: [string, number][] = [];
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: [string, number][] = [];
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockDataFn<[string, number][]>(),
    mockTypeReflect: () => {
      const v: [string, number][] = [];
      return createMockDataFn(v);
    },
    getSamples: () => ({
      valid: [
        [],
        [['a', 1]],
        [
          ['a', 1],
          ['b', 2],
        ],
      ],
      invalid: [[['a', 'b']], [['a']], ['not tuple'], null, undefined, [['a', NaN]], [[null, 1]]],
    }),
    getExpectedErrors: () => [
      // [['a', 'b']] — outer array, inner [a, b]: slot 1 'b' not number.
      [{path: [0, 1], expected: 'number'}],
      // [['a']] — outer array, inner ['a']: slot 0 OK, slot 1 undefined fails number.
      [{path: [0, 1], expected: 'number'}],
      // ['not tuple'] — element 0 'not tuple' fails tuple check.
      [{path: [0], expected: 'tuple'}],
      [{path: [], expected: 'array'}],
      [{path: [], expected: 'array'}],
      // [['a', NaN]] — slot 1 NaN fails number.
      [{path: [0, 1], expected: 'number'}],
      // [[null, 1]] — slot 0 null fails string.
      [{path: [0, 0], expected: 'string'}],
    ],
  },

  // ---- DEFERRED — features that aren't yet ported ----

  tuple_rest: {
    title: 'Tuple rest',
    // DataOnly's homomorphic tuple mapping can't preserve a trailing rest
    // (`...T[]`) element — the reconstructed shape widens and accepts inputs the
    // emitter rejects.
    dataOnlyDivergent: true,
    description:
      "A tuple with a trailing rest segment that absorbs any number of trailing elements via a for-loop from the member's position to v.length, skipping the length-bound check (tuple.spec.ts 'validate tuple with rest parameter').",
    validateNotes:
      'A trailing rest segment absorbs any number of trailing elements (including zero). Each trailing element must satisfy the rest type.',
    validate: () => createValidateFn<[number, ...string[]]>(),
    standardSchema: () => createStandardSchema<[number, ...string[]]>(),
    validateDataOnly: () => createValidateFn<DataOnly<[number, ...string[]]>>(),
    validateSchema: () => createValidateFn(RT.tuple([TF.number()], TF.string())),
    deserializeValidate: () => deserializeValidate<[number, ...string[]]>(),
    validateReflect: () => {
      const v: [number, ...string[]] = [3];
      return createValidateFn(v);
    },
    deserializeValidateReflect: () => {
      const v: [number, ...string[]] = [3];
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrorsFn<[number, ...string[]]>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<[number, ...string[]]>>(),
    getValidationErrorsSchema: () => createGetValidationErrorsFn(RT.tuple([TF.number()], TF.string())),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<[number, ...string[]]>(),
    getValidationErrorsReflect: () => {
      const v: [number, ...string[]] = [3];
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: [number, ...string[]] = [3];
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockDataFn<[number, ...string[]]>(),
    mockTypeReflect: () => {
      const v: [number, ...string[]] = [3];
      return createMockDataFn(v);
    },
    getSamples: () => ({
      valid: [[3], [3, 'a'], [3, 'a', 'b', 'c']],
      invalid: [[3, 'a', 4], ['not number'], [], 'not array', [3, 1], null, undefined, [NaN, 'a'], [3, null]],
    }),
    getExpectedErrors: () => [
      // [3, 'a', 4] — slot 0 OK; rest at iVar=1 'a' OK; iVar=2 4 fails string.
      [{path: [2], expected: 'string'}],
      // ['not number'] — slot 0 'not number' fails; rest iterates 0 times.
      [{path: [0], expected: 'number'}],
      // [] — slot 0 missing → number check fails on undefined.
      [{path: [0], expected: 'number'}],
      [{path: [], expected: 'tuple'}],
      // [3, 1] — slot 0 OK; rest iVar=1 1 fails string.
      [{path: [1], expected: 'string'}],
      [{path: [], expected: 'tuple'}],
      [{path: [], expected: 'tuple'}],
      // [NaN, 'a'] — slot 0 NaN fails; rest at 1 'a' OK.
      [{path: [0], expected: 'number'}],
      // [3, null] — slot 0 OK; rest iVar=1 null fails string.
      [{path: [1], expected: 'string'}],
    ],
  },

  tuple_circular: {
    title: 'Circular tuple',
    // The self-referential tuple shape doesn't survive DataOnly's recursive
    // homomorphic mapping (the self-ref slot widens), so verdicts diverge.
    dataOnlyDivergent: true,
    description:
      'A self-referential tuple whose cycle closes via a trailing optional self-ref slot, where the always-non-inlined tuple makes a self-recursive dependency call through the isSelf branch (tuple.spec.ts circular tuple).',
    validateNotes:
      'The cycle closes via a trailing OPTIONAL self-ref slot, so a non-recursive value (the first six slots only) is valid; nested tuples recurse to whatever depth the value supplies.',
    validate: () => {
      type TupleCircular = [Date, number, string, null, string[], bigint, TupleCircular?];
      return createValidateFn<TupleCircular>();
    },
    standardSchema: () => {
      type TupleCircular = [Date, number, string, null, string[], bigint, TupleCircular?];
      return createStandardSchema<TupleCircular>();
    },
    validateDataOnly: () => {
      type TupleCircular = [Date, number, string, null, string[], bigint, TupleCircular?];
      return createValidateFn<DataOnly<TupleCircular>>();
    },
    // A ROOT-level recursive tuple can't be authored value-first — `Recursive<[…,
    // Self?]>` hits TS2589 (TS can't build a recursive tuple type via the mapping).
    // Covered type-first here; the object→tuple cycle is covered value-first by
    // CIRCULAR.object_with_tuple_prop.
    validateSchema: 'not-supported',
    getValidationErrorsSchema: 'not-supported',
    deserializeValidate: () => {
      type TupleCircular = [Date, number, string, null, string[], bigint, TupleCircular?];
      return deserializeValidate<TupleCircular>();
    },
    validateReflect: () => {
      type TupleCircular = [Date, number, string, null, string[], bigint, TupleCircular?];
      const v: TupleCircular = [new Date(), 1, 'a', null, [], 1n];
      return createValidateFn(v);
    },
    deserializeValidateReflect: () => {
      type TupleCircular = [Date, number, string, null, string[], bigint, TupleCircular?];
      const v: TupleCircular = [new Date(), 1, 'a', null, [], 1n];
      return deserializeValidate(v);
    },
    getValidationErrors: () => {
      type TupleCircular = [Date, number, string, null, string[], bigint, TupleCircular?];
      return createGetValidationErrorsFn<TupleCircular>();
    },
    getValidationErrorsDataOnly: () => {
      type TupleCircular = [Date, number, string, null, string[], bigint, TupleCircular?];
      return createGetValidationErrorsFn<DataOnly<TupleCircular>>();
    },
    deserializeGetValidationErrors: () => {
      type TupleCircular = [Date, number, string, null, string[], bigint, TupleCircular?];
      return deserializeGetValidationErrors<TupleCircular>();
    },
    getValidationErrorsReflect: () => {
      type TupleCircular = [Date, number, string, null, string[], bigint, TupleCircular?];
      const v: TupleCircular = [new Date(), 1, 'a', null, [], 1n];
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      type TupleCircular = [Date, number, string, null, string[], bigint, TupleCircular?];
      const v: TupleCircular = [new Date(), 1, 'a', null, [], 1n];
      return deserializeGetValidationErrors(v);
    },
    mockType: () => {
      type TupleCircular = [Date, number, string, null, string[], bigint, TupleCircular?];
      return createMockDataFn<TupleCircular>();
    },
    mockTypeReflect: () => {
      type TupleCircular = [Date, number, string, null, string[], bigint, TupleCircular?];
      const v: TupleCircular = [new Date(), 1, 'a', null, [], 1n];
      return createMockDataFn(v);
    },
    getSamples: () => {
      const tc: any = [new Date(), 1, 'a', null, [], 1n];
      const tcRec: any = [new Date(), 1, 'a', null, [], 1n, [new Date(), 1, 'a', null, [], 1n]];
      return {
        valid: [tc, tcRec],
        invalid: [
          [],
          [new Date(), 1, 'a', null, [], 'not bigint'],
          'not array',
          null,
          undefined,
          [new Date('invalid'), 1, 'a', null, [], 1n],
          [new Date(), NaN, 'a', null, [], 1n],
        ],
      };
    },
    getExpectedErrors: () => [
      // [] — every required slot fails atomic check (slot 6 is optional, skipped).
      [
        {path: [0], expected: 'date'},
        {path: [1], expected: 'number'},
        {path: [2], expected: 'string'},
        {path: [3], expected: 'null'},
        {path: [4], expected: 'array'},
        {path: [5], expected: 'bigint'},
      ],
      [{path: [5], expected: 'bigint'}],
      [{path: [], expected: 'tuple'}],
      [{path: [], expected: 'tuple'}],
      [{path: [], expected: 'tuple'}],
      [{path: [0], expected: 'date'}],
      [{path: [1], expected: 'number'}],
    ],
  },

  tuple_multiple_trailing_optionals: {
    title: 'Multiple trailing optionals',
    description:
      'A chain of trailing optional slots (TS grammar bars optionals before required elements) where each TupleMember.Optional flag fires its own `(v[i] === undefined || childCheck)` wrap independently.',
    validateNotes:
      'An optional slot may be absent or explicitly `undefined`. The optional strips the redundant `undefined` and keeps the inner type atomic (`boolean?` stays `boolean`, not a `undefined | true | false` union), so a wrong value there reports the bare atomic token (`expected: "boolean"`).',
    validate: () => createValidateFn<[number, bigint?, boolean?, number?]>(),
    standardSchema: () => createStandardSchema<[number, bigint?, boolean?, number?]>(),
    validateDataOnly: () => createValidateFn<DataOnly<[number, bigint?, boolean?, number?]>>(),
    validateSchema: () => createValidateFn(RT.tuple([TF.number()], [TF.bigInt(), RT.boolean(), TF.number()])),
    deserializeValidate: () => deserializeValidate<[number, bigint?, boolean?, number?]>(),
    validateReflect: () => {
      const v: [number, bigint?, boolean?, number?] = [3];
      return createValidateFn(v);
    },
    deserializeValidateReflect: () => {
      const v: [number, bigint?, boolean?, number?] = [3];
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrorsFn<[number, bigint?, boolean?, number?]>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<[number, bigint?, boolean?, number?]>>(),
    getValidationErrorsSchema: () =>
      createGetValidationErrorsFn(RT.tuple([TF.number()], [TF.bigInt(), RT.boolean(), TF.number()])),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<[number, bigint?, boolean?, number?]>(),
    getValidationErrorsReflect: () => {
      const v: [number, bigint?, boolean?, number?] = [3];
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: [number, bigint?, boolean?, number?] = [3];
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockDataFn<[number, bigint?, boolean?, number?]>(),
    mockTypeReflect: () => {
      const v: [number, bigint?, boolean?, number?] = [3];
      return createMockDataFn(v);
    },
    getSamples: () => ({
      valid: [
        [3],
        [3, 1n],
        [3, 1n, true],
        [3, 1n, true, 4],
        [3, undefined, true, 4], // explicit undefined in the middle
        [3, 1n, undefined, 4],
        [3, undefined, undefined, 4],
      ],
      invalid: [
        [], // missing required first
        [3, 'not bigint'], // wrong type at optional slot
        [3, 1n, true, 4, 'extra'], // excess args
        'not array',
        null,
        undefined,
        [NaN], // NaN at required first
        [3, 1n, 'not boolean'], // wrong type at second optional
      ],
    }),
    getExpectedErrors: () => [
      [{path: [0], expected: 'number'}],
      // [3, 'not bigint'] — slot 1 (bigint?) is non-undefined non-bigint.
      // `bigint` is an atomic kind, so `bigint?` stays atomic at the slot and the
      // error is the bare `bigint` token (NOT `union`). Contrast with the boolean?
      // slot below — the asymmetry is intentional, not a token bug.
      [{path: [1], expected: 'bigint'}],
      [{path: [], expected: 'tuple'}],
      [{path: [], expected: 'tuple'}],
      [{path: [], expected: 'tuple'}],
      [{path: [], expected: 'tuple'}],
      [{path: [0], expected: 'number'}],
      // [3, 1n, 'not boolean'] — slot 2 (boolean?) is non-undefined
      // non-boolean. The optional strips the redundant `undefined` and restores
      // the `boolean` atomic (not a `undefined | true | false` union), so the
      // error is the bare 'boolean' token.
      [{path: [2], expected: 'boolean'}],
    ],
  },

  tuple_named_labels: {
    title: 'Named labels',
    description:
      "A tuple with named element labels, so `[name: string, age: number]` validates identically to `[string, number]` (a regression check that label syntax doesn't affect validator BEHAVIOR).",
    validateNotes:
      'Element labels never affect validation behaviour — only positional types are checked. Labels ARE id-relevant reflection data though (`children[].name` must be per-site reliable), so this labeled tuple is a different cache entry than the unlabelled `[string, number]`.',
    // Labels fold into the structural id (canonical nodes carry children[].name,
    // so same-shape/different-labels must not share a node — see
    // docs/done/tuple-labels-unreliable-on-canonical-nodes.md). The value-first
    // RT.tuple builder models the UNLABELED shape, so the two forms are
    // different types informationally and cannot converge on one id.
    idDivergent: true,
    validate: () => createValidateFn<[name: string, age: number]>(),
    standardSchema: () => createStandardSchema<[name: string, age: number]>(),
    validateDataOnly: () => createValidateFn<DataOnly<[name: string, age: number]>>(),
    validateSchema: () => createValidateFn(RT.tuple([TF.string(), TF.number()])),
    deserializeValidate: () => deserializeValidate<[name: string, age: number]>(),
    validateReflect: () => {
      const v: [name: string, age: number] = ['Alice', 30];
      return createValidateFn(v);
    },
    deserializeValidateReflect: () => {
      const v: [name: string, age: number] = ['Alice', 30];
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrorsFn<[name: string, age: number]>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<[name: string, age: number]>>(),
    getValidationErrorsSchema: () => createGetValidationErrorsFn(RT.tuple([TF.string(), TF.number()])),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<[name: string, age: number]>(),
    getValidationErrorsReflect: () => {
      const v: [name: string, age: number] = ['Alice', 30];
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: [name: string, age: number] = ['Alice', 30];
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockDataFn<[name: string, age: number]>(),
    mockTypeReflect: () => {
      const v: [name: string, age: number] = ['Alice', 30];
      return createMockDataFn(v);
    },
    getSamples: () => ({
      valid: [
        ['Alice', 30],
        ['', 0],
      ],
      // `['Alice', 30, 'extra']` is a too-LONG (over-arity) input for this fixed
      // 2-tuple — the canonical tuple weak spot. It must raise a root `tuple` error
      // (excess element), NOT pass because both declared slots happen to be valid.
      invalid: [
        [],
        ['Alice'],
        ['Alice', '30'],
        [30, 'Alice'],
        null,
        'not array',
        undefined,
        ['Alice', NaN],
        [null, 30],
        ['Alice', 30, 'extra'],
      ],
    }),
    getExpectedErrors: () => [
      [
        {path: [0], expected: 'string'},
        {path: [1], expected: 'number'},
      ],
      [{path: [1], expected: 'number'}],
      [{path: [1], expected: 'number'}],
      [
        {path: [0], expected: 'string'},
        {path: [1], expected: 'number'},
      ],
      [{path: [], expected: 'tuple'}],
      [{path: [], expected: 'tuple'}],
      [{path: [], expected: 'tuple'}],
      [{path: [1], expected: 'number'}],
      [{path: [0], expected: 'string'}],
      [{path: [], expected: 'tuple'}],
    ],
  },

  tuple_with_non_serializable: {
    title: 'Function slot',
    // The emitter keeps a function tuple slot as a `notSupported` node that
    // validates `undefined`; DataOnly maps the slot to `never`, so the projected
    // tuple `[string, never]` rejects the valid `[..., undefined]` samples.
    dataOnlyDivergent: true,
    description:
      'A tuple whose function-typed slot emits `v[i] === undefined`, so it must be absent or explicitly undefined and any other value (a real function, a string) fails (the serialization-suite TUPLES.tuple_with_non_serializable).',
    validateNotes: [
      'TS DIVERGENCE: A function-typed tuple slot must be MISSING or explicitly `undefined`. A real function FAILS the check.',
      'This is the opposite of the object-property case (where function-typed props are skipped entirely): tuples enforce `=== undefined` because tuple position is structural.',
    ],
    validate: () => createValidateFn<[number, () => any]>(),
    standardSchema: () => createStandardSchema<[number, () => any]>(),
    validateDataOnly: () => createValidateFn<DataOnly<[number, () => any]>>(),
    validateSchema: () => createValidateFn(RT.tuple([TF.number(), RT.func([], RT.any())])),
    deserializeValidate: () => deserializeValidate<[number, () => any]>(),
    validateReflect: () => {
      const v: [number, () => any] = [3, () => null];
      return createValidateFn(v);
    },
    deserializeValidateReflect: () => {
      const v: [number, () => any] = [3, () => null];
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrorsFn<[number, () => any]>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<[number, () => any]>>(),
    getValidationErrorsSchema: () => createGetValidationErrorsFn(RT.tuple([TF.number(), RT.func([], RT.any())])),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<[number, () => any]>(),
    getValidationErrorsReflect: () => {
      const v: [number, () => any] = [3, () => null];
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: [number, () => any] = [3, () => null];
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockDataFn<[number, () => any]>(),
    mockTypeReflect: () => {
      const v: [number, () => any] = [3, () => null];
      return createMockDataFn(v);
    },
    getSamples: () => ({
      // `[3]` is valid — v[1] is undefined which satisfies the
      // `v[1] === undefined` check the function slot emits.
      valid: [[3, undefined], [3]],
      invalid: [
        [3, () => null],
        [3, 42],
        ['not number'],
        'not array',
        null,
        undefined,
        [3, null], // null is NOT undefined — strict `=== undefined` check
        [NaN, undefined],
      ],
    }),
    getExpectedErrors: () => [
      [{path: [1], expected: 'undefined'}],
      [{path: [1], expected: 'undefined'}],
      [{path: [0], expected: 'number'}],
      [{path: [], expected: 'tuple'}],
      [{path: [], expected: 'tuple'}],
      [{path: [], expected: 'tuple'}],
      [{path: [1], expected: 'undefined'}],
      [{path: [0], expected: 'number'}],
    ],
  },

  empty_tuple: {
    title: 'Empty tuple',
    description:
      'A zero-length tuple whose validator accepts only `[]` via Array.isArray plus length === 0, mirroring the `children.length === 0` branch.',
    validateNotes:
      'Only the empty array `[]` passes — any element at all (even `[null]`) fails the exact length-0 check; a plain object `{}` is also rejected.',
    validate: () => createValidateFn<[]>(),
    standardSchema: () => createStandardSchema<[]>(),
    validateDataOnly: () => createValidateFn<DataOnly<[]>>(),
    validateSchema: () => createValidateFn(RT.tuple([])),
    deserializeValidate: () => deserializeValidate<[]>(),
    validateReflect: () => {
      const v: [] = [];
      return createValidateFn(v);
    },
    deserializeValidateReflect: () => {
      const v: [] = [];
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrorsFn<[]>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<[]>>(),
    getValidationErrorsSchema: () => createGetValidationErrorsFn(RT.tuple([])),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<[]>(),
    getValidationErrorsReflect: () => {
      const v: [] = [];
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: [] = [];
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockDataFn<[]>(),
    mockTypeReflect: () => {
      const v: [] = [];
      return createMockDataFn(v);
    },
    getSamples: () => ({
      valid: [[]],
      invalid: [['extra'], [1], null, undefined, {}, 'not array', [null]],
    }),
    getExpectedErrors: () => [
      [{path: [], expected: 'tuple'}],
      [{path: [], expected: 'tuple'}],
      [{path: [], expected: 'tuple'}],
      [{path: [], expected: 'tuple'}],
      [{path: [], expected: 'tuple'}],
      [{path: [], expected: 'tuple'}],
      [{path: [], expected: 'tuple'}],
    ],
  },

  single_element_tuple: {
    title: 'Single element tuple',
    description:
      'A one-slot tuple that exercises the length-bound corner case (length must be exactly 1 modulo optional/rest) using the same emit shape as multi-element tuples.',
    validateNotes:
      'Length must be exactly 1 — both an empty array `[]` and an over-length `["hello", "extra"]` fail; the single slot runs the atomic check for its declared type.',
    validate: () => createValidateFn<[string]>(),
    standardSchema: () => createStandardSchema<[string]>(),
    validateDataOnly: () => createValidateFn<DataOnly<[string]>>(),
    validateSchema: () => createValidateFn(RT.tuple([TF.string()])),
    deserializeValidate: () => deserializeValidate<[string]>(),
    validateReflect: () => {
      const v: [string] = ['x'];
      return createValidateFn(v);
    },
    deserializeValidateReflect: () => {
      const v: [string] = ['x'];
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrorsFn<[string]>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<[string]>>(),
    getValidationErrorsSchema: () => createGetValidationErrorsFn(RT.tuple([TF.string()])),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<[string]>(),
    getValidationErrorsReflect: () => {
      const v: [string] = ['x'];
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: [string] = ['x'];
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockDataFn<[string]>(),
    mockTypeReflect: () => {
      const v: [string] = ['x'];
      return createMockDataFn(v);
    },
    getSamples: () => ({
      valid: [['hello'], ['']],
      invalid: [[], [42], ['hello', 'extra'], null, undefined, [null], 'not array'],
    }),
    getExpectedErrors: () => [
      // [] — length 0, falls into else; slot 0 (undefined) fails string.
      [{path: [0], expected: 'string'}],
      // [42] — slot 0 wrong type.
      [{path: [0], expected: 'string'}],
      // ['hello', 'extra'] — length 2 > 1.
      [{path: [], expected: 'tuple'}],
      [{path: [], expected: 'tuple'}],
      [{path: [], expected: 'tuple'}],
      [{path: [0], expected: 'string'}],
      [{path: [], expected: 'tuple'}],
    ],
  },

  readonly_tuple: {
    title: 'Readonly tuple',
    description:
      'A `readonly [T, U]` tuple whose readonly bit is TS-only and erased at runtime, so the validator is identical to the bare `[T, U]` shape.',
    validateNotes:
      'The `readonly` modifier has NO runtime impact — the validator is identical to the mutable `[string, number]`; the compiler enforces readonly at write sites only.',
    validate: () => createValidateFn<readonly [string, number]>(),
    standardSchema: () => createStandardSchema<readonly [string, number]>(),
    validateDataOnly: () => createValidateFn<DataOnly<readonly [string, number]>>(),
    validateSchema: () => createValidateFn(RT.tuple([TF.string(), TF.number()])),
    deserializeValidate: () => deserializeValidate<readonly [string, number]>(),
    validateReflect: () => {
      const v: readonly [string, number] = ['x', 1];
      return createValidateFn(v);
    },
    deserializeValidateReflect: () => {
      const v: readonly [string, number] = ['x', 1];
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrorsFn<readonly [string, number]>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<readonly [string, number]>>(),
    getValidationErrorsSchema: () => createGetValidationErrorsFn(RT.tuple([TF.string(), TF.number()])),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<readonly [string, number]>(),
    getValidationErrorsReflect: () => {
      const v: readonly [string, number] = ['x', 1];
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: readonly [string, number] = ['x', 1];
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockDataFn<readonly [string, number]>(),
    mockTypeReflect: () => {
      const v: readonly [string, number] = ['x', 1];
      return createMockDataFn(v);
    },
    getSamples: () => ({
      valid: [
        ['x', 1],
        ['', 0],
      ],
      invalid: [[], ['x'], [1, 'x'], null, undefined, 'not array', ['x', 1, 'extra']],
    }),
    getExpectedErrors: () => [
      [
        {path: [0], expected: 'string'},
        {path: [1], expected: 'number'},
      ],
      [{path: [1], expected: 'number'}],
      [
        {path: [0], expected: 'string'},
        {path: [1], expected: 'number'},
      ],
      [{path: [], expected: 'tuple'}],
      [{path: [], expected: 'tuple'}],
      [{path: [], expected: 'tuple'}],
      [{path: [], expected: 'tuple'}],
    ],
  },
} as const satisfies Record<string, ValidationCase>;
