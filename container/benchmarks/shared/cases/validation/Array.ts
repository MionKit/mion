import type {SharedCase} from '../types.ts';

export const ARRAY = {
  string_array: {
    title: 'Array of strings',
    getSamples: () => ({
      valid: [[], ['hello', 'world']],
      // The mixed-types invalid `['hello', 'world', {hello: 'world'}]`
      // is the carry-over from the "simple array hasUnknownKeys on
      // array with non objects" block — the object element fails the
      // string check, so the whole array fails validate.
      invalid: ['hello', ['hello', 2], ['hello', 'world', {hello: 'world'}], null, undefined, [42], [null]],
    }),
  },
  number_array: {
    title: 'Array of numbers (rejects Infinity / NaN per element)',
    description: 'Infinity / -Infinity / NaN rejected per atomic-number port',
    getSamples: () => ({
      valid: [[], [1, 2, 3], [42]],
      invalid: [[1, '2'], 'not-array', [Infinity], [-Infinity], [NaN], null, undefined, [null], [BigInt(1)]],
    }),
  },
  boolean_array: {
    title: 'Array of booleans',
    getSamples: () => ({
      valid: [[], [true, false]],
      invalid: [[true, 42], 'nope', null, undefined, [0], [1], [null]],
    }),
  },
  bigint_array: {
    title: 'Array of bigints',
    getSamples: () => ({
      valid: [[], [1n, 2n]],
      invalid: [[1n, 2], 'nope', null, undefined, [null], [Infinity]],
    }),
  },
  date_array: {
    title: 'Array of Dates (rejects Invalid Date per element)',
    description: 'from the serialization-suite ARRAYS.array_date',
    getSamples: () => ({
      valid: [[], [new Date('2000-08-06T02:13:00.000Z'), new Date('2001-09-07T03:14:00.000Z')]],
      invalid: [['2024'], [42], [new Date('invalid')], null, undefined],
    }),
  },
  regexp_array: {
    title: 'Array of RegExps',
    getSamples: () => ({
      valid: [[], [/abc/, new RegExp('abc')]],
      invalid: [['/abc/'], [42], null, undefined, [null], [{}]],
    }),
  },
  undefined_array: {
    title: 'Array of undefined values',
    description: 'from the serialization-suite ARRAYS.undefined_in_array',
    getSamples: () => ({
      valid: [[], [undefined, undefined]],
      invalid: [[null], [42], null, undefined, [0], [''], [false]],
    }),
  },
  null_array: {
    title: 'Array of nulls',
    getSamples: () => ({
      valid: [[], [null]],
      invalid: [[undefined], [42], null, undefined, [0], [''], [false]],
    }),
  },
  array_generic: {
    title: 'Generic Array<T> form (same emit as T[])',
    description: 'TypeScript sugar — resolves identically to string[]; carried as a regression check on canonical-id collapse',
    getSamples: () => ({
      valid: [[], ['hello']],
      invalid: ['hello', [42], null, undefined],
    }),
  },
  string_array_2d: {
    title: 'Two-dimensional string array (multi-level dependency call)',
    description:
      'first multi-level test — exercises the Go-side dependency-call layer (outer array invokes pre-compiled inner via utl.getRT(...).fn(v[i0]))',
    getSamples: () => ({
      valid: [
        [],
        [[]],
        [
          ['hello', 'world'],
          ['a', 'b'],
        ],
      ],
      // Block 5 path-error samples: top-level array-of-string
      // fails validate when the type is string[][], same for plain
      // string. `['hello']` is "first element is `'hello'` which is
      // not an array".
      invalid: [[['hello', 2]], ['hello'], ['hello', 'world'], 'hello', null, undefined, [[null]], [[42]]],
    }),
  },
  string_array_3d: {
    title: 'Three-dimensional string array (depth stress)',
    description: 'depth stress for the dependency-call layer',
    getSamples: () => ({
      valid: [[], [[[]]], [[['a', 'b'], ['c']]]],
      invalid: [[[['a', 2]]], [['a']], ['a'], null, undefined, [[[null]]], [[[42]]]],
    }),
  },
  string_array_noIsArrayCheck: {
    title: 'Array with noIsArrayCheck (Array.isArray guard stripped)',
    description:
      'noIsArrayCheck strips the Array.isArray guard; hashes distinctly from plain string_array — same samples, different validator',
    getSamples: () => ({
      valid: [[], ['hello']],
      // Without the guard, non-array inputs may not be rejected by
      // the validator (the documented trade-off — the caller has
      // pre-verified arrayness). Only sample inputs that the loop
      // itself catches.
      invalid: [[42]],
    }),
  },
  object_array: {
    title: 'Array of object literals',
    description:
      "array.spec.ts 'test array strict modes' — array of objects. Extra keys on object elements still pass validate (unknown-key handling is a different adapter).",
    getSamples: () => ({
      valid: [[], [{a: 'hello'}, {a: 'world'}], [{a: 'hello', extraA: 'extraA'}, {a: 'world'}]],
      invalid: ['not-an-array', [{a: 42}], [{}], [null], null, undefined, [{a: null}], [{a: undefined}]],
    }),
  },
  union_array: {
    title: 'Array of unions (OR-chain per element)',
    description: 'array of union — each element validates against the union OR-chain.',
    getSamples: () => ({
      valid: [[], ['a', 1, 'b', 2], [1], ['a']],
      invalid: [[true], 'a', [null], ['a', true], null, undefined, [BigInt(1)], [Infinity]],
    }),
  },
  tuple_array: {
    title: 'Array of tuples',
    description: 'array of tuples — exercises tuple under array dependency call.',
    getSamples: () => ({
      valid: [
        [],
        [
          ['a', 1],
          ['b', 2],
        ],
      ],
      invalid: [[['a']], [['a', 'b']], 'not-array', [[1, 'a']], null, undefined, [['a', 1, 'extra']]],
    }),
  },
  circular_array: {
    title: 'Self-referential array (CircularArray = CircularArray[])',
    description:
      "array.spec.ts 'Array circular ref'. Self-referential array — handled via the always-non-inlined KindArray policy plus the isSelf branch in EmitDependencyCall (emits the inner-function-name directly, no .fn).",
    getSamples: () => {
      // type CircularArray = CircularArray[]; const arr: CircularArray = [[[[]]], [[]], []];
      const arrA: any = [];
      arrA.push([[[]]], [[]], []);
      return {
        valid: [[], arrA],
        invalid: [[[[]], 'A'], 'not array', null, undefined, [42], [[42]]],
      };
    },
  },
  circular_object_with_array: {
    title: 'Recursive object whose cycle closes via an array property',
    description:
      'type ObjectType = {a: string; deep?: {b: string; c: number}; d?: ObjectType[]} — same dependency-call mechanism as the basic circular interface; the array property d?: ObjectType[] closes the cycle via Array → Object.',
    getSamples: () => ({
      valid: [
        {a: 'hello'},
        {a: 'hello', deep: {b: 'world', c: 123}},
        {a: 'hello', d: [{a: 'world'}]},
        {a: 'hello', d: [{a: 'world', d: [{a: 'deep'}]}]},
      ],
      invalid: [
        {a: 42},
        'not-an-object',
        {a: 'hello', deep: {b: 1, c: 1}},
        {a: 'hello', d: 'not-array'},
        null,
        undefined,
        {a: 'hello', d: [null]},
        {a: 'hello', d: [{a: 42}]},
      ],
    }),
  },
  symbol_array: {
    title: 'Array of symbols (non-serializable — factory throws)',
    description:
      'ARRAYS.non_serializable_in_array — `Arrays can not have non serializable types` (ref: nodes/member/array.ts:148): throws at RT-compile. The CodeNS propagates from the symbol element to the root, rendering an alwaysThrow factory (T3), so createValidateFn<symbol[]>() / createGetValidationErrorsFn<symbol[]>() throw on first call — consistent with the unified rule (non-property positions throw). As a *property* child a non-serializable array drops the property instead.',
    factoryThrows: true,
    getSamples: () => ({valid: [], invalid: []}),
  },
  readonly_string_array: {
    title: 'Readonly array (ReadonlyArray<T> / readonly T[])',
    description:
      '`readonly T[]` and `ReadonlyArray<T>` are the same type at runtime — the readonly bit is a TS-only modifier erased at emit. Regression check that both forms produce the same validator as the bare `T[]` shape.',
    getSamples: () => ({
      valid: [[], ['hello'], ['a', 'b', 'c']],
      invalid: ['not array', null, undefined, [42], [null]],
    }),
  },
} as const satisfies Record<string, SharedCase>;
