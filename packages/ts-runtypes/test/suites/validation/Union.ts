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

export const UNION = {
  atomic_union: {
    title: 'Atomic union',
    description: 'union.spec.ts "validate union" Atomic Union suite over common atomic types including Date and bigint.',
    validateNotes: [
      'Validates as an OR-chain — first matching arm wins.',
      'Each arm runs its full atomic check: numbers reject NaN / Infinity, Dates reject Invalid Date, etc.',
    ],
    validate: () => createValidateFn<Date | number | string | null | bigint>(),
    standardSchema: () => createStandardSchema<Date | number | string | null | bigint>(),
    // One hand-authored Standard Schema expectation per file. Every other case
    // derives its expected issues from getExpectedErrors via runTypeErrorsToIssues
    // (the same mapping the factory uses), so this single case pins the real
    // consumer-facing {message, path} output independently: it trips if error
    // generation or the issue mapping changes. One case per file covers this
    // file's shapes without the ~265x maintenance of authoring every case.
    getExpectedStandardErrors: () => [
      [{message: 'Expected union', path: [], expected: 'union'}],
      [{message: 'Expected union', path: [], expected: 'union'}],
      [{message: 'Expected union', path: [], expected: 'union'}],
      [{message: 'Expected union', path: [], expected: 'union'}],
      [{message: 'Expected union', path: [], expected: 'union'}],
      [{message: 'Expected union', path: [], expected: 'union'}],
      [{message: 'Expected union', path: [], expected: 'union'}],
      [{message: 'Expected union', path: [], expected: 'union'}],
    ],
    validateDataOnly: () => createValidateFn<DataOnly<Date | number | string | null | bigint>>(),
    validateSchema: () => createValidateFn(RT.union([TF.date(), TF.number(), TF.string(), RT.literal(null), TF.bigInt()])),
    deserializeValidate: () => deserializeValidate<Date | number | string | null | bigint>(),
    validateReflect: () => {
      const v: Date | number | string | null | bigint = 123;
      return createValidateFn(v);
    },
    deserializeValidateReflect: () => {
      const v: Date | number | string | null | bigint = 123;
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrorsFn<Date | number | string | null | bigint>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<Date | number | string | null | bigint>>(),
    getValidationErrorsSchema: () =>
      createGetValidationErrorsFn(RT.union([TF.date(), TF.number(), TF.string(), RT.literal(null), TF.bigInt()])),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<Date | number | string | null | bigint>(),
    getValidationErrorsReflect: () => {
      const v: Date | number | string | null | bigint = 123;
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: Date | number | string | null | bigint = 123;
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockDataFn<Date | number | string | null | bigint>(),
    mockTypeReflect: () => {
      const v: Date | number | string | null | bigint = 123;
      return createMockDataFn(v);
    },
    getSamples: () => ({
      valid: [new Date(), 123, 'hello', null, 1n],
      invalid: [{}, [], true, undefined, new Date('invalid'), Infinity, Symbol(), () => null],
    }),
    getExpectedErrors: () => [
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
    ],
  },

  string_literal_union: {
    title: 'String literal union',
    description:
      'union.spec.ts "validate union discriminator string" where only the exact, case-sensitive declared strings pass.',
    validateNotes: 'Literal string unions are case-sensitive. Only the exact strings declared in the union pass.',
    validate: () => createValidateFn<'UNO' | 'DOS' | 'TRES'>(),
    standardSchema: () => createStandardSchema<'UNO' | 'DOS' | 'TRES'>(),
    validateDataOnly: () => createValidateFn<DataOnly<'UNO' | 'DOS' | 'TRES'>>(),
    validateSchema: () => createValidateFn(RT.union([RT.literal('UNO'), RT.literal('DOS'), RT.literal('TRES')])),
    deserializeValidate: () => deserializeValidate<'UNO' | 'DOS' | 'TRES'>(),
    validateReflect: () => {
      const v: 'UNO' | 'DOS' | 'TRES' = 'UNO';
      return createValidateFn(v);
    },
    deserializeValidateReflect: () => {
      const v: 'UNO' | 'DOS' | 'TRES' = 'UNO';
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrorsFn<'UNO' | 'DOS' | 'TRES'>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<'UNO' | 'DOS' | 'TRES'>>(),
    getValidationErrorsSchema: () =>
      createGetValidationErrorsFn(RT.union([RT.literal('UNO'), RT.literal('DOS'), RT.literal('TRES')])),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<'UNO' | 'DOS' | 'TRES'>(),
    getValidationErrorsReflect: () => {
      const v: 'UNO' | 'DOS' | 'TRES' = 'UNO';
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: 'UNO' | 'DOS' | 'TRES' = 'UNO';
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockDataFn<'UNO' | 'DOS' | 'TRES'>(),
    mockTypeReflect: () => {
      const v: 'UNO' | 'DOS' | 'TRES' = 'UNO';
      return createMockDataFn(v);
    },
    getSamples: () => ({
      valid: ['UNO', 'DOS', 'TRES'],
      invalid: ['INVALID', 'uno', '', 42, null, undefined, true, 'Uno', {}],
    }),
    getExpectedErrors: () => [
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
    ],
  },

  large_union_eight_arms: {
    title: 'Large union',
    description:
      'Past the 4 positional union() overloads, the value-first builder routes 8 heterogeneous arms (literals, primitives, and a {a}/{a;b} subset+superset pair) through the recursive UnionOf<T> infer fallback, which must both generate a correct validator and converge on the type-first union id while preserving the subset/superset arms with no subtype collapse at depth 8.',
    validateNotes:
      'The `{a}`/`{a; b}` subset pair both stay reachable: a value matching the smaller `{a: string}` arm passes (e.g. `{a: "x"}` is valid), so the superset arm never swallows it. A failing value reports a single `expected: "union"` at the root, not per-arm errors.',
    validate: () => createValidateFn<'a' | 'b' | number | boolean | null | {a: string} | {a: string; b: number} | {c: bigint}>(),
    standardSchema: () =>
      createStandardSchema<'a' | 'b' | number | boolean | null | {a: string} | {a: string; b: number} | {c: bigint}>(),
    validateDataOnly: () =>
      createValidateFn<DataOnly<'a' | 'b' | number | boolean | null | {a: string} | {a: string; b: number} | {c: bigint}>>(),
    validateSchema: () =>
      createValidateFn(
        RT.union([
          RT.literal('a'),
          RT.literal('b'),
          TF.number(),
          RT.boolean(),
          RT.literal(null),
          RT.object({a: TF.string()}),
          RT.object({a: TF.string(), b: TF.number()}),
          RT.object({c: TF.bigInt()}),
        ])
      ),
    deserializeValidate: () =>
      deserializeValidate<'a' | 'b' | number | boolean | null | {a: string} | {a: string; b: number} | {c: bigint}>(),
    validateReflect: () => {
      const v: 'a' | 'b' | number | boolean | null | {a: string} | {a: string; b: number} | {c: bigint} = 'a';
      return createValidateFn(v);
    },
    deserializeValidateReflect: () => {
      const v: 'a' | 'b' | number | boolean | null | {a: string} | {a: string; b: number} | {c: bigint} = 'a';
      return deserializeValidate(v);
    },
    getValidationErrors: () =>
      createGetValidationErrorsFn<'a' | 'b' | number | boolean | null | {a: string} | {a: string; b: number} | {c: bigint}>(),
    getValidationErrorsDataOnly: () =>
      createGetValidationErrorsFn<
        DataOnly<'a' | 'b' | number | boolean | null | {a: string} | {a: string; b: number} | {c: bigint}>
      >(),
    getValidationErrorsSchema: () =>
      createGetValidationErrorsFn(
        RT.union([
          RT.literal('a'),
          RT.literal('b'),
          TF.number(),
          RT.boolean(),
          RT.literal(null),
          RT.object({a: TF.string()}),
          RT.object({a: TF.string(), b: TF.number()}),
          RT.object({c: TF.bigInt()}),
        ])
      ),
    deserializeGetValidationErrors: () =>
      deserializeGetValidationErrors<'a' | 'b' | number | boolean | null | {a: string} | {a: string; b: number} | {c: bigint}>(),
    getValidationErrorsReflect: () => {
      const v: 'a' | 'b' | number | boolean | null | {a: string} | {a: string; b: number} | {c: bigint} = 'a';
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: 'a' | 'b' | number | boolean | null | {a: string} | {a: string; b: number} | {c: bigint} = 'a';
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockDataFn<'a' | 'b' | number | boolean | null | {a: string} | {a: string; b: number} | {c: bigint}>(),
    mockTypeReflect: () => {
      const v: 'a' | 'b' | number | boolean | null | {a: string} | {a: string; b: number} | {c: bigint} = 'a';
      return createMockDataFn(v);
    },
    getSamples: () => ({
      valid: ['a', 'b', 42, true, null, {a: 'x'}, {a: 'x', b: 1}, {c: 10n}],
      invalid: ['z', 'true', undefined, [], {}, {b: 1}, {a: 1}, {c: 'x'}],
    }),
    getExpectedErrors: () => [
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
    ],
  },

  string_or_number: {
    title: 'String or number',
    description: 'The union `string | number`, where a value passes if either the string or number arm matches.',
    validateNotes:
      'The number arm uses `Number.isFinite`, so `NaN` and `Infinity` are rejected even though they pass `typeof === "number"`; `BigInt` is rejected (it satisfies neither arm).',
    validate: () => createValidateFn<string | number>(),
    standardSchema: () => createStandardSchema<string | number>(),
    validateDataOnly: () => createValidateFn<DataOnly<string | number>>(),
    validateSchema: () => createValidateFn(RT.union([TF.string(), TF.number()])),
    deserializeValidate: () => deserializeValidate<string | number>(),
    validateReflect: () => {
      const v: string | number = 'hello';
      return createValidateFn(v);
    },
    deserializeValidateReflect: () => {
      const v: string | number = 'hello';
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrorsFn<string | number>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<string | number>>(),
    getValidationErrorsSchema: () => createGetValidationErrorsFn(RT.union([TF.string(), TF.number()])),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<string | number>(),
    getValidationErrorsReflect: () => {
      const v: string | number = 'hello';
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: string | number = 'hello';
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockDataFn<string | number>(),
    mockTypeReflect: () => {
      const v: string | number = 'hello';
      return createMockDataFn(v);
    },
    getSamples: () => ({
      valid: ['hello', 42, 0, ''],
      invalid: [null, undefined, true, [], {}, NaN, Infinity, BigInt(1)],
    }),
    getExpectedErrors: () => [
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
    ],
  },

  union_of_array_types: {
    title: 'Union of arrays',
    description:
      'union.spec.ts "Union Arr" where the union is over whole array types, dispatched per array rather than per element.',
    validateNotes:
      'Mixed-element arrays (e.g., `["a", 1]`) FAIL — no single arm matches the whole array. The union is over array types, not element types.',
    validate: () => createValidateFn<string[] | number[] | boolean[]>(),
    standardSchema: () => createStandardSchema<string[] | number[] | boolean[]>(),
    validateDataOnly: () => createValidateFn<DataOnly<string[] | number[] | boolean[]>>(),
    validateSchema: () => createValidateFn(RT.union([RT.array(TF.string()), RT.array(TF.number()), RT.array(RT.boolean())])),
    deserializeValidate: () => deserializeValidate<string[] | number[] | boolean[]>(),
    validateReflect: () => {
      const v: string[] | number[] | boolean[] = ['a'];
      return createValidateFn(v);
    },
    deserializeValidateReflect: () => {
      const v: string[] | number[] | boolean[] = ['a'];
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrorsFn<string[] | number[] | boolean[]>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<string[] | number[] | boolean[]>>(),
    getValidationErrorsSchema: () =>
      createGetValidationErrorsFn(RT.union([RT.array(TF.string()), RT.array(TF.number()), RT.array(RT.boolean())])),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<string[] | number[] | boolean[]>(),
    getValidationErrorsReflect: () => {
      const v: string[] | number[] | boolean[] = ['a'];
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: string[] | number[] | boolean[] = ['a'];
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockDataFn<string[] | number[] | boolean[]>(),
    mockTypeReflect: () => {
      const v: string[] | number[] | boolean[] = ['a'];
      return createMockDataFn(v);
    },
    getSamples: () => ({
      valid: [['a'], [1], [true, false], [], ['a', 'b']],
      invalid: [['a', 1], [1, 'a'], 'not array', null, undefined, [Infinity], [null], [BigInt(1)]],
    }),
    getExpectedErrors: () => [
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
    ],
  },

  array_of_union: {
    title: 'Array of union',
    description: 'union.spec.ts "Arr with union of types" where each element independently runs the full union OR-chain.',
    validateNotes:
      'Each element runs the full union OR-chain independently. Mixed-type arrays pass as long as every element matches some arm.',
    validate: () => createValidateFn<(string | bigint | boolean | Date)[]>(),
    standardSchema: () => createStandardSchema<(string | bigint | boolean | Date)[]>(),
    validateDataOnly: () => createValidateFn<DataOnly<(string | bigint | boolean | Date)[]>>(),
    validateSchema: () => createValidateFn(RT.array(RT.union([TF.string(), TF.bigInt(), RT.boolean(), TF.date()]))),
    deserializeValidate: () => deserializeValidate<(string | bigint | boolean | Date)[]>(),
    validateReflect: () => {
      const v: (string | bigint | boolean | Date)[] = [];
      return createValidateFn(v);
    },
    deserializeValidateReflect: () => {
      const v: (string | bigint | boolean | Date)[] = [];
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrorsFn<(string | bigint | boolean | Date)[]>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<(string | bigint | boolean | Date)[]>>(),
    getValidationErrorsSchema: () =>
      createGetValidationErrorsFn(RT.array(RT.union([TF.string(), TF.bigInt(), RT.boolean(), TF.date()]))),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<(string | bigint | boolean | Date)[]>(),
    getValidationErrorsReflect: () => {
      const v: (string | bigint | boolean | Date)[] = [];
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: (string | bigint | boolean | Date)[] = [];
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockDataFn<(string | bigint | boolean | Date)[]>(),
    mockTypeReflect: () => {
      const v: (string | bigint | boolean | Date)[] = [];
      return createMockDataFn(v);
    },
    getSamples: () => ({
      valid: [[1n, 'b', new Date(), true]],
      invalid: [
        ['a', false, 2], // 2 is a number, not bigint
        null,
        undefined,
        [new Date('invalid')], // Invalid Date inside union
        [null], // null not in union
        [{}],
      ],
    }),
    getExpectedErrors: () => [
      // Element at index 2 (the number 2) fails the union check.
      [{path: [2], expected: 'union'}],
      [{path: [], expected: 'array'}],
      [{path: [], expected: 'array'}],
      [{path: [0], expected: 'union'}],
      [{path: [0], expected: 'union'}],
      [{path: [0], expected: 'union'}],
    ],
  },

  // ---- DEFERRED ----

  union_of_object_shapes: {
    title: 'Union of objects',
    description:
      "union.spec.ts 'Union Obj' where disjoint object-typed members go through the dependency-call layer with the shared `typeof === 'object' && !== null` guard lifted out of the OR-chain.",
    validateNotes:
      'An input passes if it satisfies AT LEAST one arm\'s required props; extra props are ignored (structural), so `{a: "x", aa: true, b: 1}` passes via the `{b: number}` arm. A failing value reports a single `expected: "union"` at the root, not per-arm errors.',
    validate: () => createValidateFn<{a: string; aa: boolean} | {b: number} | {c: bigint}>(),
    standardSchema: () => createStandardSchema<{a: string; aa: boolean} | {b: number} | {c: bigint}>(),
    validateDataOnly: () => createValidateFn<DataOnly<{a: string; aa: boolean} | {b: number} | {c: bigint}>>(),
    validateSchema: () =>
      createValidateFn(
        RT.union([RT.object({a: TF.string(), aa: RT.boolean()}), RT.object({b: TF.number()}), RT.object({c: TF.bigInt()})])
      ),
    deserializeValidate: () => deserializeValidate<{a: string; aa: boolean} | {b: number} | {c: bigint}>(),
    validateReflect: () => {
      const v: {a: string; aa: boolean} | {b: number} | {c: bigint} = {b: 1};
      return createValidateFn(v);
    },
    deserializeValidateReflect: () => {
      const v: {a: string; aa: boolean} | {b: number} | {c: bigint} = {b: 1};
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrorsFn<{a: string; aa: boolean} | {b: number} | {c: bigint}>(),
    getValidationErrorsDataOnly: () =>
      createGetValidationErrorsFn<DataOnly<{a: string; aa: boolean} | {b: number} | {c: bigint}>>(),
    getValidationErrorsSchema: () =>
      createGetValidationErrorsFn(
        RT.union([RT.object({a: TF.string(), aa: RT.boolean()}), RT.object({b: TF.number()}), RT.object({c: TF.bigInt()})])
      ),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<{a: string; aa: boolean} | {b: number} | {c: bigint}>(),
    getValidationErrorsReflect: () => {
      const v: {a: string; aa: boolean} | {b: number} | {c: bigint} = {b: 1};
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: {a: string; aa: boolean} | {b: number} | {c: bigint} = {b: 1};
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockDataFn<{a: string; aa: boolean} | {b: number} | {c: bigint}>(),
    mockTypeReflect: () => {
      const v: {a: string; aa: boolean} | {b: number} | {c: bigint} = {b: 1};
      return createMockDataFn(v);
    },
    getSamples: () => ({
      // union.spec.ts uses loose matching — `{a, b, c}` passes
      // because `{b: number}` is satisfied. Our emit accepts any
      // object that satisfies AT LEAST one member's required props.
      valid: [{a: 'x', aa: true}, {b: 1}, {c: 1n}, {a: 'x', aa: true, b: 1}],
      invalid: [{a: 'x'}, {}, 'not object', null, [], 42, undefined, {b: 'not number'}, {c: 1}],
    }),
    getExpectedErrors: () => [
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
    ],
  },

  discriminated_union: {
    title: 'Discriminated union',
    description:
      'union.spec.ts "Union with discriminator property" where arms share a kind literal with different payloads; the OR-chain is semantically correct and the discriminator-aware early-return optimization is a separate emit-shape concern handled later.',
    validateNotes:
      'Each arm is validated in full; the discriminator literal narrows which arm matches. A value passes if it fully satisfies AT LEAST ONE arm.',
    validate: () => createValidateFn<{kind: 'a'; n: number} | {kind: 'b'; s: string}>(),
    standardSchema: () => createStandardSchema<{kind: 'a'; n: number} | {kind: 'b'; s: string}>(),
    validateDataOnly: () => createValidateFn<DataOnly<{kind: 'a'; n: number} | {kind: 'b'; s: string}>>(),
    validateSchema: () =>
      createValidateFn(
        RT.union([RT.object({kind: RT.literal('a'), n: TF.number()}), RT.object({kind: RT.literal('b'), s: TF.string()})])
      ),
    deserializeValidate: () => deserializeValidate<{kind: 'a'; n: number} | {kind: 'b'; s: string}>(),
    validateReflect: () => {
      const v: {kind: 'a'; n: number} | {kind: 'b'; s: string} = {kind: 'a', n: 1};
      return createValidateFn(v);
    },
    deserializeValidateReflect: () => {
      const v: {kind: 'a'; n: number} | {kind: 'b'; s: string} = {kind: 'a', n: 1};
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrorsFn<{kind: 'a'; n: number} | {kind: 'b'; s: string}>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<{kind: 'a'; n: number} | {kind: 'b'; s: string}>>(),
    getValidationErrorsSchema: () =>
      createGetValidationErrorsFn(
        RT.union([RT.object({kind: RT.literal('a'), n: TF.number()}), RT.object({kind: RT.literal('b'), s: TF.string()})])
      ),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<{kind: 'a'; n: number} | {kind: 'b'; s: string}>(),
    getValidationErrorsReflect: () => {
      const v: {kind: 'a'; n: number} | {kind: 'b'; s: string} = {kind: 'a', n: 1};
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: {kind: 'a'; n: number} | {kind: 'b'; s: string} = {kind: 'a', n: 1};
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockDataFn<{kind: 'a'; n: number} | {kind: 'b'; s: string}>(),
    mockTypeReflect: () => {
      const v: {kind: 'a'; n: number} | {kind: 'b'; s: string} = {kind: 'a', n: 1};
      return createMockDataFn(v);
    },
    getSamples: () => ({
      valid: [
        {kind: 'a', n: 1},
        {kind: 'b', s: 'hello'},
      ],
      invalid: [
        {kind: 'c', n: 1},
        {kind: 'a', n: 'not number'},
        {n: 1},
        null,
        'not object',
        undefined,
        {kind: 'a'}, // missing n
        {kind: 'a', n: NaN},
        {kind: 'b'}, // missing s
      ],
    }),
    getExpectedErrors: () => [
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
    ],
  },

  circular_union: {
    title: 'Circular union',
    description:
      'union.spec.ts "Union circular" where a self-referential union via object and array arms is handled by always-non-inlined Union, Object, and Array with no IsCircular detection needed, terminating via the dependency-call layer\'s lazy-init two-phase cache registration.',
    validateNotes: 'Self-recursive unions traverse the cycle until the input value bottoms out at an atomic arm.',
    validateSchema: () => {
      const uc = RT.circular(
        RT.union([
          TF.date(),
          TF.number(),
          TF.string(),
          RT.object({a: RT.optional(RT.self()), b: RT.optional(TF.string())}),
          RT.array(RT.self()),
        ])
      );
      return createValidateFn(uc);
    },
    validate: () => {
      type UnionC = Date | number | string | {a?: UnionC; b?: string} | UnionC[];
      return createValidateFn<UnionC>();
    },
    standardSchema: () => {
      type UnionC = Date | number | string | {a?: UnionC; b?: string} | UnionC[];
      return createStandardSchema<UnionC>();
    },
    validateDataOnly: () => {
      type UnionC = Date | number | string | {a?: UnionC; b?: string} | UnionC[];
      return createValidateFn<DataOnly<UnionC>>();
    },
    deserializeValidate: () => {
      type UnionC = Date | number | string | {a?: UnionC; b?: string} | UnionC[];
      return deserializeValidate<UnionC>();
    },
    validateReflect: () => {
      type UnionC = Date | number | string | {a?: UnionC; b?: string} | UnionC[];
      const v: UnionC = 'hello';
      return createValidateFn(v);
    },
    deserializeValidateReflect: () => {
      type UnionC = Date | number | string | {a?: UnionC; b?: string} | UnionC[];
      const v: UnionC = 'hello';
      return deserializeValidate(v);
    },
    getValidationErrors: () => {
      type UnionC = Date | number | string | {a?: UnionC; b?: string} | UnionC[];
      return createGetValidationErrorsFn<UnionC>();
    },
    getValidationErrorsDataOnly: () => {
      type UnionC = Date | number | string | {a?: UnionC; b?: string} | UnionC[];
      return createGetValidationErrorsFn<DataOnly<UnionC>>();
    },
    getValidationErrorsSchema: () => {
      const uc = RT.circular(
        RT.union([
          TF.date(),
          TF.number(),
          TF.string(),
          RT.object({a: RT.optional(RT.self()), b: RT.optional(TF.string())}),
          RT.array(RT.self()),
        ])
      );
      return createGetValidationErrorsFn(uc);
    },
    deserializeGetValidationErrors: () => {
      type UnionC = Date | number | string | {a?: UnionC; b?: string} | UnionC[];
      return deserializeGetValidationErrors<UnionC>();
    },
    getValidationErrorsReflect: () => {
      type UnionC = Date | number | string | {a?: UnionC; b?: string} | UnionC[];
      const v: UnionC = 'hello';
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      type UnionC = Date | number | string | {a?: UnionC; b?: string} | UnionC[];
      const v: UnionC = 'hello';
      return deserializeGetValidationErrors(v);
    },
    mockType: () => {
      type UnionC = Date | number | string | {a?: UnionC; b?: string} | UnionC[];
      return createMockDataFn<UnionC>();
    },
    mockTypeReflect: () => {
      type UnionC = Date | number | string | {a?: UnionC; b?: string} | UnionC[];
      const v: UnionC = 'hello';
      return createMockDataFn(v);
    },
    getSamples: () => ({
      valid: [new Date(), 123, 'hello', {}, {a: {a: {}}}, {b: 'hello'}, [], [{a: {}}, [123, 'hello']]],
      invalid: [true, null, undefined, {a: true}, [true], new Date('invalid'), Infinity, Symbol()],
    }),
    getExpectedErrors: () => [
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
    ],
  },

  union_with_methods: {
    title: 'Union with methods',
    description:
      'union.spec.ts "Union with objects containing methods" where each arm carries a method that is skipped via the property-emit function-skip rule, so the AND chain inside each object reduces to the data-only props.',
    validateNotes:
      'TS DIVERGENCE: method members (`getName`/`getAge`) are non-serializable and dropped, so each arm checks only its data prop — `{name: "x"}` with no method at all PASSES, and a wrong-typed method would not be caught.',
    validate: () => createValidateFn<{name: string; getName(): string} | {age: number; getAge(): number}>(),
    standardSchema: () => createStandardSchema<{name: string; getName(): string} | {age: number; getAge(): number}>(),
    validateDataOnly: () => createValidateFn<DataOnly<{name: string; getName(): string} | {age: number; getAge(): number}>>(),
    validateSchema: () =>
      createValidateFn(
        RT.union([
          RT.object({name: TF.string(), getName: RT.func([], TF.string())}),
          RT.object({age: TF.number(), getAge: RT.func([], TF.number())}),
        ])
      ),
    deserializeValidate: () => deserializeValidate<{name: string; getName(): string} | {age: number; getAge(): number}>(),
    validateReflect: () => {
      const v: {name: string; getName(): string} | {age: number; getAge(): number} = {
        name: 'x',
        getName: () => 'x',
      };
      return createValidateFn(v);
    },
    deserializeValidateReflect: () => {
      const v: {name: string; getName(): string} | {age: number; getAge(): number} = {
        name: 'x',
        getName: () => 'x',
      };
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrorsFn<{name: string; getName(): string} | {age: number; getAge(): number}>(),
    getValidationErrorsDataOnly: () =>
      createGetValidationErrorsFn<DataOnly<{name: string; getName(): string} | {age: number; getAge(): number}>>(),
    getValidationErrorsSchema: () =>
      createGetValidationErrorsFn(
        RT.union([
          RT.object({name: TF.string(), getName: RT.func([], TF.string())}),
          RT.object({age: TF.number(), getAge: RT.func([], TF.number())}),
        ])
      ),
    deserializeGetValidationErrors: () =>
      deserializeGetValidationErrors<{name: string; getName(): string} | {age: number; getAge(): number}>(),
    getValidationErrorsReflect: () => {
      const v: {name: string; getName(): string} | {age: number; getAge(): number} = {
        name: 'x',
        getName: () => 'x',
      };
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: {name: string; getName(): string} | {age: number; getAge(): number} = {
        name: 'x',
        getName: () => 'x',
      };
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockDataFn<{name: string; getName(): string} | {age: number; getAge(): number}>(),
    mockTypeReflect: () => {
      const v: {name: string; getName(): string} | {age: number; getAge(): number} = {
        name: 'x',
        getName: () => 'x',
      };
      return createMockDataFn(v);
    },
    getSamples: () => ({
      valid: [{name: 'x', getName: () => 'x'}, {age: 1, getAge: () => 1}, {name: 'x'}, {age: 1}],
      invalid: [{}, null, 'not object', [], undefined, true, 42, {name: 1}, {age: 'x'}],
    }),
    getExpectedErrors: () => [
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
    ],
  },

  intersection_to_object: {
    title: 'Object intersection',
    description:
      'intersection.spec.ts where tsgo/deepkit resolves the intersection of object shapes to one merged ObjectLiteral at the type-checker level, so the cache never carries a KindIntersection and runtime behavior matches `{a: string; b: number}` byte-for-byte.',
    validateNotes:
      'Because the intersection collapses to one merged object, getValidationErrors reports PER-PROPERTY paths (e.g. `expected: "number"` at `["b"]`), not a single root `expected: "union"`. Both props are required and `b: NaN` is rejected despite passing `typeof === "number"`.',
    validate: () => createValidateFn<{a: string} & {b: number}>(),
    standardSchema: () => createStandardSchema<{a: string} & {b: number}>(),
    validateDataOnly: () => createValidateFn<DataOnly<{a: string} & {b: number}>>(),
    validateSchema: () => createValidateFn(RT.intersection(RT.object({a: TF.string()}), RT.object({b: TF.number()}))),
    deserializeValidate: () => deserializeValidate<{a: string} & {b: number}>(),
    validateReflect: () => {
      const v: {a: string} & {b: number} = {a: 'x', b: 1};
      return createValidateFn(v);
    },
    deserializeValidateReflect: () => {
      const v: {a: string} & {b: number} = {a: 'x', b: 1};
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrorsFn<{a: string} & {b: number}>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<{a: string} & {b: number}>>(),
    getValidationErrorsSchema: () =>
      createGetValidationErrorsFn(RT.intersection(RT.object({a: TF.string()}), RT.object({b: TF.number()}))),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<{a: string} & {b: number}>(),
    getValidationErrorsReflect: () => {
      const v: {a: string} & {b: number} = {a: 'x', b: 1};
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: {a: string} & {b: number} = {a: 'x', b: 1};
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockDataFn<{a: string} & {b: number}>(),
    mockTypeReflect: () => {
      const v: {a: string} & {b: number} = {a: 'x', b: 1};
      return createMockDataFn(v);
    },
    getSamples: () => ({
      valid: [
        {a: 'x', b: 1},
        {a: '', b: 0},
      ],
      invalid: [{a: 'x'}, {b: 1}, null, {a: 1, b: 1}, {a: 'x', b: 'not number'}, undefined, {a: 'x', b: NaN}, {}],
    }),
    // Intersection resolved to `{a: string; b: number}` — validationErrors
    // is the merged object shape's per-property check.
    getExpectedErrors: () => [
      [{path: ['b'], expected: 'number'}],
      [{path: ['a'], expected: 'string'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: ['a'], expected: 'string'}],
      [{path: ['b'], expected: 'number'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: ['b'], expected: 'number'}],
      [
        {path: ['a'], expected: 'string'},
        {path: ['b'], expected: 'number'},
      ],
    ],
  },

  // ---- additions migrated 1:1 from union.spec.ts ----

  union_with_index_arm: {
    title: 'Union with index arm',
    description:
      "union.spec.ts 'validate an union with index property' where one arm carries a named prop and an index signature, accepting index-typed extras alongside the named prop.",
    validateNotes:
      'The index arm is NOT a catch-all: every extra key must match the index value type, so `{c: 1n, d: 2n}` passes but `{c: 1n, d: "hello"}` fails (string under a `bigint` index). A failing value reports a single `expected: "union"` at the root.',
    validate: () => createValidateFn<{a: string; aa: boolean} | {b: number} | {c: bigint; [key: string]: bigint}>(),
    standardSchema: () => createStandardSchema<{a: string; aa: boolean} | {b: number} | {c: bigint; [key: string]: bigint}>(),
    validateDataOnly: () =>
      createValidateFn<DataOnly<{a: string; aa: boolean} | {b: number} | {c: bigint; [key: string]: bigint}>>(),
    validateSchema: () =>
      createValidateFn(
        RT.union([
          RT.object({a: TF.string(), aa: RT.boolean()}),
          RT.object({b: TF.number()}),
          RT.intersection(RT.record(TF.bigInt()), RT.object({c: TF.bigInt()})),
        ])
      ),
    deserializeValidate: () => deserializeValidate<{a: string; aa: boolean} | {b: number} | {c: bigint; [key: string]: bigint}>(),
    validateReflect: () => {
      const v: {a: string; aa: boolean} | {b: number} | {c: bigint; [key: string]: bigint} = {b: 123};
      return createValidateFn(v);
    },
    deserializeValidateReflect: () => {
      const v: {a: string; aa: boolean} | {b: number} | {c: bigint; [key: string]: bigint} = {b: 123};
      return deserializeValidate(v);
    },
    getValidationErrors: () =>
      createGetValidationErrorsFn<{a: string; aa: boolean} | {b: number} | {c: bigint; [key: string]: bigint}>(),
    getValidationErrorsDataOnly: () =>
      createGetValidationErrorsFn<DataOnly<{a: string; aa: boolean} | {b: number} | {c: bigint; [key: string]: bigint}>>(),
    getValidationErrorsSchema: () =>
      createGetValidationErrorsFn(
        RT.union([
          RT.object({a: TF.string(), aa: RT.boolean()}),
          RT.object({b: TF.number()}),
          RT.intersection(RT.record(TF.bigInt()), RT.object({c: TF.bigInt()})),
        ])
      ),
    deserializeGetValidationErrors: () =>
      deserializeGetValidationErrors<{a: string; aa: boolean} | {b: number} | {c: bigint; [key: string]: bigint}>(),
    getValidationErrorsReflect: () => {
      const v: {a: string; aa: boolean} | {b: number} | {c: bigint; [key: string]: bigint} = {b: 123};
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: {a: string; aa: boolean} | {b: number} | {c: bigint; [key: string]: bigint} = {b: 123};
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockDataFn<{a: string; aa: boolean} | {b: number} | {c: bigint; [key: string]: bigint}>(),
    mockTypeReflect: () => {
      const v: {a: string; aa: boolean} | {b: number} | {c: bigint; [key: string]: bigint} = {b: 123};
      return createMockDataFn(v);
    },
    getSamples: () => ({
      valid: [{a: 'hello', aa: true}, {b: 123}, {c: 1n, d: 2n}],
      invalid: [
        {a: 'hello'}, // missing aa, no b, no c
        {b: 'hello'}, // wrong type for b
        {a: 'hello', d: 'extra'}, // doesn't match any arm
        {c: 1n, d: 'hello'}, // index value wrong type
        null,
        undefined,
        {}, // empty matches no arm
        {b: NaN}, // b is number but NaN fails
      ],
    }),
    getExpectedErrors: () => [
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
    ],
  },

  union_same_prop_different_types: {
    title: 'Same prop different types',
    description:
      "union.spec.ts 'validate union same prop with different types' where one shared prop name (`prop`) carries an arm-dependent value type, gated by the literal-string discriminator.",
    validateNotes:
      'The `type` literal pins which arm applies, so `prop` must match THAT arm\'s type — `{type: "a", prop: 123}` fails even though `123` would satisfy the `type: "b"` arm. A failing value reports a single `expected: "union"` at the root.',
    validate: () => createValidateFn<{type: 'a'; prop: boolean} | {type: 'b'; prop: number} | {type: 'c'; prop: string}>(),
    standardSchema: () =>
      createStandardSchema<{type: 'a'; prop: boolean} | {type: 'b'; prop: number} | {type: 'c'; prop: string}>(),
    validateDataOnly: () =>
      createValidateFn<DataOnly<{type: 'a'; prop: boolean} | {type: 'b'; prop: number} | {type: 'c'; prop: string}>>(),
    validateSchema: () =>
      createValidateFn(
        RT.union([
          RT.object({type: RT.literal('a'), prop: RT.boolean()}),
          RT.object({type: RT.literal('b'), prop: TF.number()}),
          RT.object({type: RT.literal('c'), prop: TF.string()}),
        ])
      ),
    deserializeValidate: () =>
      deserializeValidate<{type: 'a'; prop: boolean} | {type: 'b'; prop: number} | {type: 'c'; prop: string}>(),
    validateReflect: () => {
      const v: {type: 'a'; prop: boolean} | {type: 'b'; prop: number} | {type: 'c'; prop: string} = {
        type: 'a',
        prop: true,
      };
      return createValidateFn(v);
    },
    deserializeValidateReflect: () => {
      const v: {type: 'a'; prop: boolean} | {type: 'b'; prop: number} | {type: 'c'; prop: string} = {
        type: 'a',
        prop: true,
      };
      return deserializeValidate(v);
    },
    getValidationErrors: () =>
      createGetValidationErrorsFn<{type: 'a'; prop: boolean} | {type: 'b'; prop: number} | {type: 'c'; prop: string}>(),
    getValidationErrorsDataOnly: () =>
      createGetValidationErrorsFn<DataOnly<{type: 'a'; prop: boolean} | {type: 'b'; prop: number} | {type: 'c'; prop: string}>>(),
    getValidationErrorsSchema: () =>
      createGetValidationErrorsFn(
        RT.union([
          RT.object({type: RT.literal('a'), prop: RT.boolean()}),
          RT.object({type: RT.literal('b'), prop: TF.number()}),
          RT.object({type: RT.literal('c'), prop: TF.string()}),
        ])
      ),
    deserializeGetValidationErrors: () =>
      deserializeGetValidationErrors<{type: 'a'; prop: boolean} | {type: 'b'; prop: number} | {type: 'c'; prop: string}>(),
    getValidationErrorsReflect: () => {
      const v: {type: 'a'; prop: boolean} | {type: 'b'; prop: number} | {type: 'c'; prop: string} = {
        type: 'a',
        prop: true,
      };
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: {type: 'a'; prop: boolean} | {type: 'b'; prop: number} | {type: 'c'; prop: string} = {
        type: 'a',
        prop: true,
      };
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockDataFn<{type: 'a'; prop: boolean} | {type: 'b'; prop: number} | {type: 'c'; prop: string}>(),
    mockTypeReflect: () => {
      const v: {type: 'a'; prop: boolean} | {type: 'b'; prop: number} | {type: 'c'; prop: string} = {
        type: 'a',
        prop: true,
      };
      return createMockDataFn(v);
    },
    getSamples: () => ({
      valid: [
        {type: 'a', prop: true},
        {type: 'b', prop: 123},
        {type: 'c', prop: 'hello'},
      ],
      invalid: [
        {type: 'a', prop: 123},
        {type: 'b', prop: 'hello'},
        {type: 'c', prop: true},
        null,
        undefined,
        {type: 'a'}, // missing prop
        {prop: true}, // missing type
        {type: 'd', prop: true}, // invalid discriminator
      ],
    }),
    getExpectedErrors: () => [
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
    ],
  },

  union_mixed_arrays_and_objects: {
    title: 'Mixed arrays and objects',
    description:
      "union.spec.ts 'Union Mixed' where array types and object shapes share the same union and the OR-chain dispatches on shape via Array.isArray versus object typeof.",
    validateNotes:
      'Array arms match the WHOLE array, so a mixed array like `[1, "b"]` fails (no single array arm covers it); object arms accept extra props (`{b: 123, c: 123n}` passes via the `{b: number}` arm). A failing value reports a single `expected: "union"` at the root.',
    validate: () =>
      createValidateFn<string[] | number[] | boolean[] | {a: string; aa: boolean} | {b: number} | {c: bigint; aa: 'string'}>(),
    standardSchema: () =>
      createStandardSchema<
        string[] | number[] | boolean[] | {a: string; aa: boolean} | {b: number} | {c: bigint; aa: 'string'}
      >(),
    validateDataOnly: () =>
      createValidateFn<
        DataOnly<string[] | number[] | boolean[] | {a: string; aa: boolean} | {b: number} | {c: bigint; aa: 'string'}>
      >(),
    validateSchema: () =>
      createValidateFn(
        RT.union([
          RT.array(TF.string()),
          RT.array(TF.number()),
          RT.array(RT.boolean()),
          RT.object({a: TF.string(), aa: RT.boolean()}),
          RT.object({b: TF.number()}),
          RT.object({c: TF.bigInt(), aa: RT.literal('string')}),
        ])
      ),
    deserializeValidate: () =>
      deserializeValidate<string[] | number[] | boolean[] | {a: string; aa: boolean} | {b: number} | {c: bigint; aa: 'string'}>(),
    validateReflect: () => {
      const v: string[] | number[] | boolean[] | {a: string; aa: boolean} | {b: number} | {c: bigint; aa: 'string'} = [
        'a',
        'b',
        'c',
      ];
      return createValidateFn(v);
    },
    deserializeValidateReflect: () => {
      const v: string[] | number[] | boolean[] | {a: string; aa: boolean} | {b: number} | {c: bigint; aa: 'string'} = [
        'a',
        'b',
        'c',
      ];
      return deserializeValidate(v);
    },
    getValidationErrors: () =>
      createGetValidationErrorsFn<
        string[] | number[] | boolean[] | {a: string; aa: boolean} | {b: number} | {c: bigint; aa: 'string'}
      >(),
    getValidationErrorsDataOnly: () =>
      createGetValidationErrorsFn<
        DataOnly<string[] | number[] | boolean[] | {a: string; aa: boolean} | {b: number} | {c: bigint; aa: 'string'}>
      >(),
    getValidationErrorsSchema: () =>
      createGetValidationErrorsFn(
        RT.union([
          RT.array(TF.string()),
          RT.array(TF.number()),
          RT.array(RT.boolean()),
          RT.object({a: TF.string(), aa: RT.boolean()}),
          RT.object({b: TF.number()}),
          RT.object({c: TF.bigInt(), aa: RT.literal('string')}),
        ])
      ),
    deserializeGetValidationErrors: () =>
      deserializeGetValidationErrors<
        string[] | number[] | boolean[] | {a: string; aa: boolean} | {b: number} | {c: bigint; aa: 'string'}
      >(),
    getValidationErrorsReflect: () => {
      const v: string[] | number[] | boolean[] | {a: string; aa: boolean} | {b: number} | {c: bigint; aa: 'string'} = [
        'a',
        'b',
        'c',
      ];
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: string[] | number[] | boolean[] | {a: string; aa: boolean} | {b: number} | {c: bigint; aa: 'string'} = [
        'a',
        'b',
        'c',
      ];
      return deserializeGetValidationErrors(v);
    },
    mockType: () =>
      createMockDataFn<string[] | number[] | boolean[] | {a: string; aa: boolean} | {b: number} | {c: bigint; aa: 'string'}>(),
    mockTypeReflect: () => {
      const v: string[] | number[] | boolean[] | {a: string; aa: boolean} | {b: number} | {c: bigint; aa: 'string'} = [
        'a',
        'b',
        'c',
      ];
      return createMockDataFn(v);
    },
    getSamples: () => ({
      valid: [
        ['a', 'b', 'c'],
        [1, 2, 3],
        [true, false],
        {a: 'hello', aa: true},
        {b: 123, c: 123n}, // matches {b: number}, extra c allowed
      ],
      invalid: [
        [1, 'b'], // mixed-type array — no array arm matches
        {}, // empty object
        {a: 'hello', d: 'world'}, // missing aa, no other match
        null,
        undefined,
        [null],
        'not in any arm',
      ],
    }),
    getExpectedErrors: () => [
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
    ],
  },

  union_merged_property: {
    title: 'Merged property',
    description:
      "union.spec.ts 'validate union with merged properties' where a single shared prop carries different value types, so `a` accepts boolean or number.",
    validateNotes:
      'Effectively `{a: boolean | number}`, but the number arm still runs `Number.isFinite`, so `{a: NaN}` is rejected. A failing value reports a single `expected: "union"` at the root.',
    validate: () => createValidateFn<{a: boolean} | {a: number}>(),
    standardSchema: () => createStandardSchema<{a: boolean} | {a: number}>(),
    validateDataOnly: () => createValidateFn<DataOnly<{a: boolean} | {a: number}>>(),
    validateSchema: () => createValidateFn(RT.union([RT.object({a: RT.boolean()}), RT.object({a: TF.number()})])),
    deserializeValidate: () => deserializeValidate<{a: boolean} | {a: number}>(),
    validateReflect: () => {
      const v: {a: boolean} | {a: number} = {a: true};
      return createValidateFn(v);
    },
    deserializeValidateReflect: () => {
      const v: {a: boolean} | {a: number} = {a: true};
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrorsFn<{a: boolean} | {a: number}>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<{a: boolean} | {a: number}>>(),
    getValidationErrorsSchema: () =>
      createGetValidationErrorsFn(RT.union([RT.object({a: RT.boolean()}), RT.object({a: TF.number()})])),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<{a: boolean} | {a: number}>(),
    getValidationErrorsReflect: () => {
      const v: {a: boolean} | {a: number} = {a: true};
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: {a: boolean} | {a: number} = {a: true};
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockDataFn<{a: boolean} | {a: number}>(),
    mockTypeReflect: () => {
      const v: {a: boolean} | {a: number} = {a: true};
      return createMockDataFn(v);
    },
    getSamples: () => ({
      valid: [{a: true}, {a: false}, {a: 123}, {a: 0}],
      invalid: [{a: 'hello'}, {}, null, undefined, {a: 'string not boolean or number'}, {a: null}, {a: NaN}],
    }),
    getExpectedErrors: () => [
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
    ],
  },

  union_mixed_with_index: {
    title: 'Mixed with index',
    description:
      "union.spec.ts 'Union mixed with index property' where arrays and plain objects share the same union as objects carrying index signatures.",
    validateNotes:
      'Each index arm constrains ALL extra keys to its value type, so `{a: "hello", b: 123n}` fails every arm (the string-index arm rejects the `bigint` `b`, the bigint-index arm rejects the string `a`). A failing value reports a single `expected: "union"` at the root.',
    validate: () =>
      createValidateFn<
        | string[]
        | {a: string; aa: boolean}
        | {b: number}
        | {a: string; [key: string]: string}
        | {[key: string]: bigint; b: bigint}
      >(),
    standardSchema: () =>
      createStandardSchema<
        | string[]
        | {a: string; aa: boolean}
        | {b: number}
        | {a: string; [key: string]: string}
        | {[key: string]: bigint; b: bigint}
      >(),
    validateDataOnly: () =>
      createValidateFn<
        DataOnly<
          | string[]
          | {a: string; aa: boolean}
          | {b: number}
          | {a: string; [key: string]: string}
          | {[key: string]: bigint; b: bigint}
        >
      >(),
    validateSchema: () =>
      createValidateFn(
        RT.union([
          RT.array(TF.string()),
          RT.object({a: TF.string(), aa: RT.boolean()}),
          RT.object({b: TF.number()}),
          RT.intersection(RT.record(TF.string()), RT.object({a: TF.string()})),
          RT.intersection(RT.record(TF.bigInt()), RT.object({b: TF.bigInt()})),
        ])
      ),
    deserializeValidate: () =>
      deserializeValidate<
        | string[]
        | {a: string; aa: boolean}
        | {b: number}
        | {a: string; [key: string]: string}
        | {[key: string]: bigint; b: bigint}
      >(),
    validateReflect: () => {
      const v:
        | string[]
        | {a: string; aa: boolean}
        | {b: number}
        | {a: string; [key: string]: string}
        | {[key: string]: bigint; b: bigint} = ['a'];
      return createValidateFn(v);
    },
    deserializeValidateReflect: () => {
      const v:
        | string[]
        | {a: string; aa: boolean}
        | {b: number}
        | {a: string; [key: string]: string}
        | {[key: string]: bigint; b: bigint} = ['a'];
      return deserializeValidate(v);
    },
    getValidationErrors: () =>
      createGetValidationErrorsFn<
        | string[]
        | {a: string; aa: boolean}
        | {b: number}
        | {a: string; [key: string]: string}
        | {[key: string]: bigint; b: bigint}
      >(),
    getValidationErrorsDataOnly: () =>
      createGetValidationErrorsFn<
        DataOnly<
          | string[]
          | {a: string; aa: boolean}
          | {b: number}
          | {a: string; [key: string]: string}
          | {[key: string]: bigint; b: bigint}
        >
      >(),
    getValidationErrorsSchema: () =>
      createGetValidationErrorsFn(
        RT.union([
          RT.array(TF.string()),
          RT.object({a: TF.string(), aa: RT.boolean()}),
          RT.object({b: TF.number()}),
          RT.intersection(RT.record(TF.string()), RT.object({a: TF.string()})),
          RT.intersection(RT.record(TF.bigInt()), RT.object({b: TF.bigInt()})),
        ])
      ),
    deserializeGetValidationErrors: () =>
      deserializeGetValidationErrors<
        | string[]
        | {a: string; aa: boolean}
        | {b: number}
        | {a: string; [key: string]: string}
        | {[key: string]: bigint; b: bigint}
      >(),
    getValidationErrorsReflect: () => {
      const v:
        | string[]
        | {a: string; aa: boolean}
        | {b: number}
        | {a: string; [key: string]: string}
        | {[key: string]: bigint; b: bigint} = ['a'];
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v:
        | string[]
        | {a: string; aa: boolean}
        | {b: number}
        | {a: string; [key: string]: string}
        | {[key: string]: bigint; b: bigint} = ['a'];
      return deserializeGetValidationErrors(v);
    },
    mockType: () =>
      createMockDataFn<
        | string[]
        | {a: string; aa: boolean}
        | {b: number}
        | {a: string; [key: string]: string}
        | {[key: string]: bigint; b: bigint}
      >(),
    mockTypeReflect: () => {
      const v:
        | string[]
        | {a: string; aa: boolean}
        | {b: number}
        | {a: string; [key: string]: string}
        | {[key: string]: bigint; b: bigint} = ['a'];
      return createMockDataFn(v);
    },
    getSamples: () => ({
      valid: [
        ['a', 'b', 'c'],
        {a: 'hello', aa: true},
        {b: 123, a: 'world'}, // matches {b: number}
        {b: 1n, c: 2n}, // matches {[k]: bigint; b: bigint}
        {a: 'hello', aa: true, j: 'extra'},
      ],
      invalid: [[1, 'b'], {}, {a: 'hello', b: 123n}, null, undefined, [null]],
    }),
    getExpectedErrors: () => [
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
    ],
  },

  union_with_any_fallback: {
    title: 'Any fallback',
    description:
      "union.spec.ts 'support union with any type' where tsgo collapses `T | any` to `any`, so every value passes and the validator is effectively a no-op true.",
    validateNotes:
      '`T | any` collapses to `any` at the type-checker layer — the validator becomes a no-op that always returns true. `T | unknown` behaves the same way. If you want a real fallback that still narrows, use a concrete sibling type.',
    validate: () => createValidateFn<string | any>(),
    standardSchema: () => createStandardSchema<string | any>(),
    validateDataOnly: () => createValidateFn<DataOnly<string | any>>(),
    validateSchema: () => createValidateFn(RT.any()),
    deserializeValidate: () => deserializeValidate<string | any>(),
    validateReflect: () => {
      const v: string | any = 'hello';
      return createValidateFn(v);
    },
    deserializeValidateReflect: () => {
      const v: string | any = 'hello';
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrorsFn<string | any>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<string | any>>(),
    getValidationErrorsSchema: () => createGetValidationErrorsFn(RT.any()),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<string | any>(),
    getValidationErrorsReflect: () => {
      const v: string | any = 'hello';
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: string | any = 'hello';
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockDataFn<string | any>(),
    mockTypeReflect: () => {
      const v: string | any = 'hello';
      return createMockDataFn(v);
    },
    getSamples: () => ({
      valid: ['hello', 123, {foo: 'bar'}, null, undefined, true, []],
      invalid: [],
    }),
    // `T | any` collapses to `any` — no errors are emitted for any input.
    getExpectedErrors: () => [],
  },

  union_with_unknown_fallback: {
    title: 'Unknown fallback',
    description:
      "union.spec.ts 'support union with unknown type' where tsgo collapses `T | unknown` to `unknown`, so every value passes.",
    validateNotes:
      'The `unknown` arm is fully absorbing: `T | unknown` collapses to `unknown` at the type-checker layer, so the validator is a no-op that returns true for EVERY input (no sample can be invalid).',
    validate: () => createValidateFn<string | unknown>(),
    standardSchema: () => createStandardSchema<string | unknown>(),
    validateDataOnly: () => createValidateFn<DataOnly<string | unknown>>(),
    validateSchema: () => createValidateFn(RT.unknown()),
    deserializeValidate: () => deserializeValidate<string | unknown>(),
    validateReflect: () => {
      const v: string | unknown = 'hello';
      return createValidateFn(v);
    },
    deserializeValidateReflect: () => {
      const v: string | unknown = 'hello';
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrorsFn<string | unknown>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<string | unknown>>(),
    getValidationErrorsSchema: () => createGetValidationErrorsFn(RT.unknown()),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<string | unknown>(),
    getValidationErrorsReflect: () => {
      const v: string | unknown = 'hello';
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: string | unknown = 'hello';
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockDataFn<string | unknown>(),
    mockTypeReflect: () => {
      const v: string | unknown = 'hello';
      return createMockDataFn(v);
    },
    getSamples: () => ({
      valid: ['hello', 123, {foo: 'bar'}, null, undefined, true, []],
      invalid: [],
    }),
    getExpectedErrors: () => [],
  },

  union_subset_small_first: {
    title: 'Subset small first',
    description:
      "union.spec.ts 'sortUnreachableTypes' where `{a}` is declared before its superset `{a; b}` and both arms must stay reachable so matching SmallObj does not swallow LargeObj-shaped inputs, pinning the regression even though either arm matching returns true.",
    validateNotes:
      'When one arm is a subset of another (e.g., `{a}` and `{a; b}`), any value satisfying the smaller arm passes — even if extra props would also satisfy the larger arm. Order in the type union does not affect the result.',
    validate: () => {
      interface SmallObj {
        a: string;
      }
      interface LargeObj {
        a: string;
        b: number;
      }
      return createValidateFn<SmallObj | LargeObj>();
    },
    standardSchema: () => {
      interface SmallObj {
        a: string;
      }
      interface LargeObj {
        a: string;
        b: number;
      }
      return createStandardSchema<SmallObj | LargeObj>();
    },
    validateDataOnly: () => {
      interface SmallObj {
        a: string;
      }
      interface LargeObj {
        a: string;
        b: number;
      }
      return createValidateFn<DataOnly<SmallObj | LargeObj>>();
    },
    validateSchema: () => createValidateFn(RT.union([RT.object({a: TF.string()}), RT.object({a: TF.string(), b: TF.number()})])),
    deserializeValidate: () => {
      interface SmallObj {
        a: string;
      }
      interface LargeObj {
        a: string;
        b: number;
      }
      return deserializeValidate<SmallObj | LargeObj>();
    },
    validateReflect: () => {
      interface SmallObj {
        a: string;
      }
      interface LargeObj {
        a: string;
        b: number;
      }
      const v: SmallObj | LargeObj = {a: 'hello'};
      return createValidateFn(v);
    },
    deserializeValidateReflect: () => {
      interface SmallObj {
        a: string;
      }
      interface LargeObj {
        a: string;
        b: number;
      }
      const v: SmallObj | LargeObj = {a: 'hello'};
      return deserializeValidate(v);
    },
    getValidationErrors: () => {
      interface SmallObj {
        a: string;
      }
      interface LargeObj {
        a: string;
        b: number;
      }
      return createGetValidationErrorsFn<SmallObj | LargeObj>();
    },
    getValidationErrorsDataOnly: () => {
      interface SmallObj {
        a: string;
      }
      interface LargeObj {
        a: string;
        b: number;
      }
      return createGetValidationErrorsFn<DataOnly<SmallObj | LargeObj>>();
    },
    getValidationErrorsSchema: () =>
      createGetValidationErrorsFn(RT.union([RT.object({a: TF.string()}), RT.object({a: TF.string(), b: TF.number()})])),
    deserializeGetValidationErrors: () => {
      interface SmallObj {
        a: string;
      }
      interface LargeObj {
        a: string;
        b: number;
      }
      return deserializeGetValidationErrors<SmallObj | LargeObj>();
    },
    getValidationErrorsReflect: () => {
      interface SmallObj {
        a: string;
      }
      interface LargeObj {
        a: string;
        b: number;
      }
      const v: SmallObj | LargeObj = {a: 'hello'};
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      interface SmallObj {
        a: string;
      }
      interface LargeObj {
        a: string;
        b: number;
      }
      const v: SmallObj | LargeObj = {a: 'hello'};
      return deserializeGetValidationErrors(v);
    },
    mockType: () => {
      interface SmallObj {
        a: string;
      }
      interface LargeObj {
        a: string;
        b: number;
      }
      return createMockDataFn<SmallObj | LargeObj>();
    },
    mockTypeReflect: () => {
      interface SmallObj {
        a: string;
      }
      interface LargeObj {
        a: string;
        b: number;
      }
      const v: SmallObj | LargeObj = {a: 'hello'};
      return createMockDataFn(v);
    },
    getSamples: () => ({
      valid: [{a: 'hello'}, {a: 'hello', b: 123}],
      // Note: `{a: 'hello', b: <anything>}` passes the SmallObj arm
      // (structural typing — extra props allowed). Only samples that
      // miss BOTH arms' required-prop sets belong here.
      invalid: [{b: 123}, {a: 123}, {}, null, undefined],
    }),
    getExpectedErrors: () => [
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
    ],
  },

  union_subset_nested_levels: {
    title: 'Subset nested levels',
    description:
      "union.spec.ts 'multiple levels of subset relationships' with three arms, each a strict superset of the previous.",
    validateNotes:
      'The smallest arm `{x: string}` swallows the whole chain: any value with a valid `x` passes regardless of `y`/`z` (structural typing allows extra props), so only inputs missing `x` (or with a wrong-typed `x`) reach the invalid set. A failing value reports a single `expected: "union"` at the root.',
    validate: () => {
      interface Tiny {
        x: string;
      }
      interface Medium {
        x: string;
        y: number;
      }
      interface Large {
        x: string;
        y: number;
        z: boolean;
      }
      return createValidateFn<Tiny | Medium | Large>();
    },
    standardSchema: () => {
      interface Tiny {
        x: string;
      }
      interface Medium {
        x: string;
        y: number;
      }
      interface Large {
        x: string;
        y: number;
        z: boolean;
      }
      return createStandardSchema<Tiny | Medium | Large>();
    },
    validateDataOnly: () => {
      interface Tiny {
        x: string;
      }
      interface Medium {
        x: string;
        y: number;
      }
      interface Large {
        x: string;
        y: number;
        z: boolean;
      }
      return createValidateFn<DataOnly<Tiny | Medium | Large>>();
    },
    validateSchema: () =>
      createValidateFn(
        RT.union([
          RT.object({x: TF.string()}),
          RT.object({x: TF.string(), y: TF.number()}),
          RT.object({x: TF.string(), y: TF.number(), z: RT.boolean()}),
        ])
      ),
    deserializeValidate: () => {
      interface Tiny {
        x: string;
      }
      interface Medium {
        x: string;
        y: number;
      }
      interface Large {
        x: string;
        y: number;
        z: boolean;
      }
      return deserializeValidate<Tiny | Medium | Large>();
    },
    validateReflect: () => {
      interface Tiny {
        x: string;
      }
      interface Medium {
        x: string;
        y: number;
      }
      interface Large {
        x: string;
        y: number;
        z: boolean;
      }
      const v: Tiny | Medium | Large = {x: 'hello'};
      return createValidateFn(v);
    },
    deserializeValidateReflect: () => {
      interface Tiny {
        x: string;
      }
      interface Medium {
        x: string;
        y: number;
      }
      interface Large {
        x: string;
        y: number;
        z: boolean;
      }
      const v: Tiny | Medium | Large = {x: 'hello'};
      return deserializeValidate(v);
    },
    getValidationErrors: () => {
      interface Tiny {
        x: string;
      }
      interface Medium {
        x: string;
        y: number;
      }
      interface Large {
        x: string;
        y: number;
        z: boolean;
      }
      return createGetValidationErrorsFn<Tiny | Medium | Large>();
    },
    getValidationErrorsDataOnly: () => {
      interface Tiny {
        x: string;
      }
      interface Medium {
        x: string;
        y: number;
      }
      interface Large {
        x: string;
        y: number;
        z: boolean;
      }
      return createGetValidationErrorsFn<DataOnly<Tiny | Medium | Large>>();
    },
    getValidationErrorsSchema: () =>
      createGetValidationErrorsFn(
        RT.union([
          RT.object({x: TF.string()}),
          RT.object({x: TF.string(), y: TF.number()}),
          RT.object({x: TF.string(), y: TF.number(), z: RT.boolean()}),
        ])
      ),
    deserializeGetValidationErrors: () => {
      interface Tiny {
        x: string;
      }
      interface Medium {
        x: string;
        y: number;
      }
      interface Large {
        x: string;
        y: number;
        z: boolean;
      }
      return deserializeGetValidationErrors<Tiny | Medium | Large>();
    },
    getValidationErrorsReflect: () => {
      interface Tiny {
        x: string;
      }
      interface Medium {
        x: string;
        y: number;
      }
      interface Large {
        x: string;
        y: number;
        z: boolean;
      }
      const v: Tiny | Medium | Large = {x: 'hello'};
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      interface Tiny {
        x: string;
      }
      interface Medium {
        x: string;
        y: number;
      }
      interface Large {
        x: string;
        y: number;
        z: boolean;
      }
      const v: Tiny | Medium | Large = {x: 'hello'};
      return deserializeGetValidationErrors(v);
    },
    mockType: () => {
      interface Tiny {
        x: string;
      }
      interface Medium {
        x: string;
        y: number;
      }
      interface Large {
        x: string;
        y: number;
        z: boolean;
      }
      return createMockDataFn<Tiny | Medium | Large>();
    },
    mockTypeReflect: () => {
      interface Tiny {
        x: string;
      }
      interface Medium {
        x: string;
        y: number;
      }
      interface Large {
        x: string;
        y: number;
        z: boolean;
      }
      const v: Tiny | Medium | Large = {x: 'hello'};
      return createMockDataFn(v);
    },
    getSamples: () => ({
      valid: [{x: 'hello'}, {x: 'hello', y: 123}, {x: 'hello', y: 123, z: true}],
      // Note: `{x: 'hello', ...}` passes the Tiny arm regardless of
      // y/z values (structural typing — extra props allowed). Only
      // samples that miss EVERY arm's required-prop set belong here.
      invalid: [{}, {y: 123}, {z: true}, {x: 1}, null, undefined],
    }),
    getExpectedErrors: () => [
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
    ],
  },

  union_subset_mixed_related_unrelated: {
    title: 'Subset mixed related unrelated',
    description:
      "union.spec.ts 'mixed related and unrelated types' where Base and Extended are subset-related while Unrelated is disjoint.",
    validateNotes:
      'The subset pair means any value with a valid `id` passes via the Base arm (extra props ignored), while the disjoint `{value: number}` arm matches independently. The number arm runs `Number.isFinite`, so `{value: NaN}` is rejected despite passing `typeof === "number"`; a failing value reports a single `expected: "union"` at the root.',
    validate: () => {
      interface Base {
        id: string;
      }
      interface Extended {
        id: string;
        name: string;
      }
      interface Unrelated {
        value: number;
      }
      return createValidateFn<Base | Extended | Unrelated>();
    },
    standardSchema: () => {
      interface Base {
        id: string;
      }
      interface Extended {
        id: string;
        name: string;
      }
      interface Unrelated {
        value: number;
      }
      return createStandardSchema<Base | Extended | Unrelated>();
    },
    validateDataOnly: () => {
      interface Base {
        id: string;
      }
      interface Extended {
        id: string;
        name: string;
      }
      interface Unrelated {
        value: number;
      }
      return createValidateFn<DataOnly<Base | Extended | Unrelated>>();
    },
    validateSchema: () =>
      createValidateFn(
        RT.union([RT.object({id: TF.string()}), RT.object({id: TF.string(), name: TF.string()}), RT.object({value: TF.number()})])
      ),
    deserializeValidate: () => {
      interface Base {
        id: string;
      }
      interface Extended {
        id: string;
        name: string;
      }
      interface Unrelated {
        value: number;
      }
      return deserializeValidate<Base | Extended | Unrelated>();
    },
    validateReflect: () => {
      interface Base {
        id: string;
      }
      interface Extended {
        id: string;
        name: string;
      }
      interface Unrelated {
        value: number;
      }
      const v: Base | Extended | Unrelated = {id: '123'};
      return createValidateFn(v);
    },
    deserializeValidateReflect: () => {
      interface Base {
        id: string;
      }
      interface Extended {
        id: string;
        name: string;
      }
      interface Unrelated {
        value: number;
      }
      const v: Base | Extended | Unrelated = {id: '123'};
      return deserializeValidate(v);
    },
    getValidationErrors: () => {
      interface Base {
        id: string;
      }
      interface Extended {
        id: string;
        name: string;
      }
      interface Unrelated {
        value: number;
      }
      return createGetValidationErrorsFn<Base | Extended | Unrelated>();
    },
    getValidationErrorsDataOnly: () => {
      interface Base {
        id: string;
      }
      interface Extended {
        id: string;
        name: string;
      }
      interface Unrelated {
        value: number;
      }
      return createGetValidationErrorsFn<DataOnly<Base | Extended | Unrelated>>();
    },
    getValidationErrorsSchema: () =>
      createGetValidationErrorsFn(
        RT.union([RT.object({id: TF.string()}), RT.object({id: TF.string(), name: TF.string()}), RT.object({value: TF.number()})])
      ),
    deserializeGetValidationErrors: () => {
      interface Base {
        id: string;
      }
      interface Extended {
        id: string;
        name: string;
      }
      interface Unrelated {
        value: number;
      }
      return deserializeGetValidationErrors<Base | Extended | Unrelated>();
    },
    getValidationErrorsReflect: () => {
      interface Base {
        id: string;
      }
      interface Extended {
        id: string;
        name: string;
      }
      interface Unrelated {
        value: number;
      }
      const v: Base | Extended | Unrelated = {id: '123'};
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      interface Base {
        id: string;
      }
      interface Extended {
        id: string;
        name: string;
      }
      interface Unrelated {
        value: number;
      }
      const v: Base | Extended | Unrelated = {id: '123'};
      return deserializeGetValidationErrors(v);
    },
    mockType: () => {
      interface Base {
        id: string;
      }
      interface Extended {
        id: string;
        name: string;
      }
      interface Unrelated {
        value: number;
      }
      return createMockDataFn<Base | Extended | Unrelated>();
    },
    mockTypeReflect: () => {
      interface Base {
        id: string;
      }
      interface Extended {
        id: string;
        name: string;
      }
      interface Unrelated {
        value: number;
      }
      const v: Base | Extended | Unrelated = {id: '123'};
      return createMockDataFn(v);
    },
    getSamples: () => ({
      valid: [{id: '123'}, {id: '123', name: 'test'}, {value: 42}],
      invalid: [{}, {name: 'test'}, {id: 123}, {value: 'not number'}, null, undefined, {value: NaN}],
    }),
    getExpectedErrors: () => [
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
    ],
  },
} as const satisfies Record<string, ValidationCase>;
