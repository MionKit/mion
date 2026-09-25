import type {SharedCase} from '../types.ts';

export const ATOMIC = {
  any: {
    title: 'Any type — every value passes',
    getSamples: () => ({
      valid: [null, undefined, 42, 'hello'],
      invalid: [],
    }),
  },
  bigint: {
    title: 'BigInt primitive',
    description: 'Infinity and -Infinity rejected (typeof gate)',
    getSamples: () => ({
      valid: [1n, BigInt(42)],
      invalid: [42, Infinity, -Infinity, 'hello', null, undefined, true],
    }),
  },
  boolean: {
    title: 'Boolean primitive (strict typeof)',
    getSamples: () => ({
      valid: [true, false],
      invalid: [42, 'hello', 0, 1, null, undefined],
    }),
  },
  date: {
    title: 'Date instance (rejects Invalid Date)',
    description: 'Invalid Date instances (getTime() === NaN) rejected',
    getSamples: () => ({
      valid: [new Date()],
      invalid: ['hello', new Date('invalid'), new Date(NaN)],
    }),
  },
  enum_mixed: {
    title: 'Enum with mixed numeric and string members',
    description: 'enum Color {Red, Green="green", Blue=2} — numeric reverse-mapping + string values',
    // Values inlined (Color.Red=0, Green='green', Blue=2) so the shared corpus
    // stays type-strippable on Node >= 25 (which dropped
    // --experimental-transform-types): a runtime enum here makes the whole sample
    // import throw ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX, and typecost then loses
    // value-forcing for every case. The type side keeps a real enum per competitor.
    getSamples: () => ({
      valid: [0, 'green', 2, 0, 'green', 2],
      invalid: ['Red', 'Green', 'Blue', 4, 1, 3, true, null, {}],
    }),
  },
  literal_2: {
    title: 'Numeric literal type (strict equality)',
    getSamples: () => ({valid: [2], invalid: [4, '2', null, undefined]}),
  },
  literal_a: {
    title: 'String literal type (case-sensitive)',
    getSamples: () => ({valid: ['a'], invalid: ['b', 'A', '', null, undefined]}),
  },
  literal_true: {
    title: 'Boolean literal type (only true)',
    getSamples: () => ({valid: [true], invalid: [false, 1, 'true', null]}),
  },
  literal_1n: {
    title: 'BigInt literal type (only 1n)',
    getSamples: () => ({valid: [1n], invalid: [2n, 1, '1n', 0n, null]}),
  },
  never: {
    title: 'Never — no value passes',
    getSamples: () => ({
      valid: [],
      invalid: [true, false, 1, '3', {}, 'hello', null, undefined, NaN, []],
    }),
  },
  null: {
    title: 'Null primitive (distinct from undefined)',
    description: 'null and undefined are distinct',
    getSamples: () => ({
      valid: [null],
      invalid: [undefined, 42, 'hello', 0, '', false, NaN, {}, []],
    }),
  },
  number: {
    title: 'Number primitive (rejects NaN and Infinity)',
    description: 'Infinity and -Infinity rejected (Number.isFinite)',
    getSamples: () => ({
      valid: [42],
      invalid: [Infinity, -Infinity, NaN, 'hello', null, undefined],
    }),
  },
  object: {
    title: 'Object type — any non-null non-primitive value',
    description: 'null rejected despite JS typeof null === "object"',
    getSamples: () => ({
      valid: [{}, {a: 42, b: 'hello'}, [], new Date(), /abc/],
      invalid: [null, undefined, 42, 'hello', true, Symbol()],
    }),
  },
  string: {
    title: 'String primitive',
    getSamples: () => ({
      valid: ['hello', ''],
      invalid: [2, null, undefined, true],
    }),
  },
  symbol: {
    title: 'Symbol primitive',
    factoryThrows: true,
    getSamples: () => ({valid: [], invalid: []}),
  },
  undefined: {
    title: 'Undefined primitive (distinct from null)',
    description: 'undefined and null are distinct',
    getSamples: () => ({
      valid: [undefined],
      invalid: [null, 42, 'hello', 0, '', false, {}, []],
    }),
  },
  void: {
    title: 'Void — accepts undefined, rejects null',
    description: 'void accepts undefined (and bare function return); rejects null',
    getSamples: () => {
      function vd(): void {}
      return {
        valid: [undefined, vd()],
        invalid: [null, 42, 'hello'],
      };
    },
  },
  unknown: {
    title: 'Unknown type — every value passes',
    getSamples: () => ({
      valid: [null, undefined, 42, 'hello', true, {}, [], Symbol(), () => null, new Date()],
      invalid: [],
    }),
  },
} as const satisfies Record<string, SharedCase>;
