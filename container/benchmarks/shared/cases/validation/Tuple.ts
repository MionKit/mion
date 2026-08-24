import type {SharedCase} from '../types.ts';

export const TUPLE = {
  string_number_pair: {
    title: 'Two-element tuple (string plus number)',
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
  },
  full_mion_tuple: {
    title: 'Six-element heterogeneous tuple (reference fixture)',
    description: 'tuple.spec.ts "validate tuple"',
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
  },
  tuple_with_optional: {
    title: 'Tuple with trailing optional elements',
    description: 'tuple.spec.ts "validate tuple with optional parameters"',
    getSamples: () => ({
      valid: [[3, undefined, true, 4], [3], [3, 1n], [3, 1n, false]],
      invalid: [[], [3, 'not bigint'], [3, 1n, false, 4, 'extra'], 'not array', null, undefined, [NaN], ['not number']],
    }),
  },
  nested_tuple_in_array: {
    title: 'Tuple as array element (tuple inside array dependency call)',
    description: 'array of tuples — exercises tuple inside array dependency call',
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
  },
  tuple_rest: {
    title: 'Tuple with a trailing rest segment',
    description:
      "tuple.spec.ts 'validate tuple with rest parameter'. Rest TupleMembers (Flags=['rest']) emit a for-loop starting at the member's Position and iterating to v.length, validating every element against the wrapped type. The tuple's length-bound check is skipped (rest absorbs extras).",
    getSamples: () => ({
      valid: [[3], [3, 'a'], [3, 'a', 'b', 'c']],
      invalid: [[3, 'a', 4], ['not number'], [], 'not array', [3, 1], null, undefined, [NaN, 'a'], [3, null]],
    }),
  },
  tuple_circular: {
    title: 'Self-referential tuple via trailing optional self-ref',
    description:
      'tuple.spec.ts circular tuple. Same mechanism as circular array — Tuple is always non-inlined, the self-recursive dependency call closes the cycle via the isSelf branch.',
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
  },
  tuple_multiple_trailing_optionals: {
    title: 'Tuple with multiple trailing optional slots',
    description:
      "Multiple trailing optionals — TS grammar requires optionals to come after required elements (`[A, B?, C]` is a TS error), so the canonical 'optional middle' form is a chain of trailing optionals. Each TupleMember.Optional flag fires its own `(v[i] === undefined || childCheck)` wrap independently.",
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
  },
  tuple_named_labels: {
    title: 'Tuple with named element labels (labels erased at runtime)',
    description:
      "Named tuple labels — `[name: string, age: number]` is the same shape as `[string, number]` at runtime (labels are TS-only metadata, erased at emit). Carried as a regression check that label syntax doesn't affect the validator shape.",
    getSamples: () => ({
      valid: [
        ['Alice', 30],
        ['', 0],
      ],
      invalid: [[], ['Alice'], ['Alice', '30'], [30, 'Alice'], null, 'not array', undefined, ['Alice', NaN], [null, 30]],
    }),
  },
  tuple_with_non_serializable: {
    title: 'Tuple with a function slot (must be undefined)',
    description:
      "the serialization-suite TUPLES.tuple_with_non_serializable. Function-typed tuple members emit `v[i] === undefined` per the non-serializable handling. The function slot must be absent or explicitly undefined; any other value (a real function, a string, …) fails.",
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
  },
  empty_tuple: {
    title: 'Empty tuple `[]` (only the empty array passes)',
    description:
      "Zero-length tuple — the validator accepts only `[]` (Array.isArray + length === 0). Edge case for the tuple emit; mirrors the `children.length === 0` branch.",
    getSamples: () => ({
      valid: [[]],
      invalid: [['extra'], [1], null, undefined, {}, 'not array', [null]],
    }),
  },
  single_element_tuple: {
    title: 'Single-element tuple `[T]`',
    description:
      'One-slot tuple — corner case for the length-bound check (length must be exactly 1 modulo optional / rest). Exercises the same emit shape as multi-element tuples but with a single member.',
    getSamples: () => ({
      valid: [['hello'], ['']],
      invalid: [[], [42], ['hello', 'extra'], null, undefined, [null], 'not array'],
    }),
  },
  readonly_tuple: {
    title: 'Readonly tuple (readonly [T, U])',
    description:
      '`readonly [T, U]` — readonly modifier on a tuple type. As with arrays, the readonly bit is TS-only and erased at runtime; the validator is identical to the bare `[T, U]` shape.',
    getSamples: () => ({
      valid: [
        ['x', 1],
        ['', 0],
      ],
      invalid: [[], ['x'], [1, 'x'], null, undefined, 'not array', ['x', 1, 'extra']],
    }),
  },
} as const satisfies Record<string, SharedCase>;
