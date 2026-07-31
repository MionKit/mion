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

export const ATOMIC = {
  any: {
    title: 'Any',
    description: 'The `any` keyword produces a no-op validator that accepts every value.',
    validateNotes: 'No-op validator — every value passes. Equivalent to `() => true`.',
    validate: () => createValidateFn<any>(),
    standardSchema: () => createStandardSchema<any>(),
    validateDataOnly: () => createValidateFn<DataOnly<any>>(),
    validateSchema: () => createValidateFn(RT.any()),
    deserializeValidate: () => deserializeValidate<any>(),
    validateReflect: () => {
      const v: any = null;
      return createValidateFn(v);
    },
    deserializeValidateReflect: () => {
      const v: any = null;
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrorsFn<any>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<any>>(),
    getValidationErrorsSchema: () => createGetValidationErrorsFn(RT.any()),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<any>(),
    getValidationErrorsReflect: () => {
      const v: any = null;
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: any = null;
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockDataFn<any>(),
    mockTypeReflect: () => {
      const v: any = null;
      return createMockDataFn(v);
    },
    getSamples: () => ({
      valid: [null, undefined, 42, 'hello'],
      invalid: [],
    }),
    getExpectedErrors: () => [],
  },

  bigint: {
    title: 'BigInt',
    description:
      'The `bigint` primitive uses a strict typeof gate, so plain numbers including Infinity and -Infinity are rejected.',
    validateNotes:
      'Strict `typeof === "bigint"`. Plain `number` values (including `Infinity` / `-Infinity`) are rejected — `42` is not `42n`.',
    validate: () => createValidateFn<bigint>(),
    standardSchema: () => createStandardSchema<bigint>(),
    // One hand-authored Standard Schema expectation per file. Every other case
    // derives its expected issues from getExpectedErrors via runTypeErrorsToIssues
    // (the same mapping the factory uses), so this single case pins the real
    // consumer-facing {message, path} output independently: it trips if error
    // generation or the issue mapping changes. One case per file covers this
    // file's shapes without the ~265x maintenance of authoring every case.
    getExpectedStandardErrors: () => [
      [{message: 'Expected bigint', path: [], expected: 'bigint'}],
      [{message: 'Expected bigint', path: [], expected: 'bigint'}],
      [{message: 'Expected bigint', path: [], expected: 'bigint'}],
      [{message: 'Expected bigint', path: [], expected: 'bigint'}],
      [{message: 'Expected bigint', path: [], expected: 'bigint'}],
      [{message: 'Expected bigint', path: [], expected: 'bigint'}],
      [{message: 'Expected bigint', path: [], expected: 'bigint'}],
    ],
    validateDataOnly: () => createValidateFn<DataOnly<bigint>>(),
    validateSchema: () => createValidateFn(TF.bigInt()),
    deserializeValidate: () => deserializeValidate<bigint>(),
    validateReflect: () => {
      const v: bigint = 1n;
      return createValidateFn(v);
    },
    deserializeValidateReflect: () => {
      const v: bigint = 1n;
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrorsFn<bigint>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<bigint>>(),
    getValidationErrorsSchema: () => createGetValidationErrorsFn(TF.bigInt()),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<bigint>(),
    getValidationErrorsReflect: () => {
      const v: bigint = 1n;
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: bigint = 1n;
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockDataFn<bigint>(),
    mockTypeReflect: () => {
      const v: bigint = 1n;
      return createMockDataFn(v);
    },
    getSamples: () => ({
      valid: [1n, BigInt(42)],
      invalid: [42, Infinity, -Infinity, 'hello', null, undefined, true],
    }),
    getExpectedErrors: () => [
      [{path: [], expected: 'bigint'}],
      [{path: [], expected: 'bigint'}],
      [{path: [], expected: 'bigint'}],
      [{path: [], expected: 'bigint'}],
      [{path: [], expected: 'bigint'}],
      [{path: [], expected: 'bigint'}],
      [{path: [], expected: 'bigint'}],
    ],
  },

  boolean: {
    title: 'Boolean',
    description: 'The `boolean` primitive uses strict `typeof === "boolean"`.',
    validateNotes:
      'Strict typeof === "boolean". Truthy/falsy values that are not actual booleans (e.g., 0, 1, "", "true") are rejected.',
    validate: () => createValidateFn<boolean>(),
    standardSchema: () => createStandardSchema<boolean>(),
    validateDataOnly: () => createValidateFn<DataOnly<boolean>>(),
    validateSchema: () => createValidateFn(RT.boolean()),
    deserializeValidate: () => deserializeValidate<boolean>(),
    validateReflect: () => {
      const v: boolean = true;
      return createValidateFn(v);
    },
    deserializeValidateReflect: () => {
      const v: boolean = true;
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrorsFn<boolean>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<boolean>>(),
    getValidationErrorsSchema: () => createGetValidationErrorsFn(RT.boolean()),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<boolean>(),
    getValidationErrorsReflect: () => {
      const v: boolean = true;
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: boolean = true;
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockDataFn<boolean>(),
    mockTypeReflect: () => {
      const v: boolean = true;
      return createMockDataFn(v);
    },
    getSamples: () => ({
      valid: [true, false],
      invalid: [42, 'hello', 0, 1, null, undefined],
    }),
    getExpectedErrors: () => [
      [{path: [], expected: 'boolean'}],
      [{path: [], expected: 'boolean'}],
      [{path: [], expected: 'boolean'}],
      [{path: [], expected: 'boolean'}],
      [{path: [], expected: 'boolean'}],
      [{path: [], expected: 'boolean'}],
    ],
  },

  date: {
    title: 'Date',
    description: 'A `Date` instance is required, and Invalid Date instances whose `getTime()` is NaN are rejected.',
    validateNotes: [
      'Must be an actual Date instance (instanceof Date).',
      'Invalid Date instances are rejected — e.g., `new Date("not-a-date")` or `new Date(NaN)`, whose `.getTime()` returns NaN.',
    ],
    validate: () => createValidateFn<Date>(),
    standardSchema: () => createStandardSchema<Date>(),
    validateDataOnly: () => createValidateFn<DataOnly<Date>>(),
    validateSchema: () => createValidateFn(TF.date()),
    deserializeValidate: () => deserializeValidate<Date>(),
    validateReflect: () => {
      const v: Date = new Date();
      return createValidateFn(v);
    },
    deserializeValidateReflect: () => {
      const v: Date = new Date();
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrorsFn<Date>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<Date>>(),
    getValidationErrorsSchema: () => createGetValidationErrorsFn(TF.date()),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<Date>(),
    getValidationErrorsReflect: () => {
      const v: Date = new Date();
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: Date = new Date();
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockDataFn<Date>(),
    mockTypeReflect: () => {
      const v: Date = new Date();
      return createMockDataFn(v);
    },
    getSamples: () => ({
      valid: [new Date()],
      invalid: ['hello', new Date('invalid'), new Date(NaN)],
    }),
    getExpectedErrors: () => [[{path: [], expected: 'date'}], [{path: [], expected: 'date'}], [{path: [], expected: 'date'}]],
  },

  enum_mixed: {
    title: 'Mixed enum',
    description:
      'An `enum Color {Red, Green="green", Blue=2}` validates its underlying numeric and string values, not the member names.',
    validateNotes: [
      'Validator accepts the underlying enum VALUES (0, "green", 2 for Color {Red, Green="green", Blue=2}).',
      'Enum member NAMES as strings ("Red", "Green", "Blue") are NOT accepted — these are TS-only handles, not runtime values.',
    ],
    // The value-first `RT.enum(Color)` carries the enum's value-UNION (kind union),
    // while the type-first `createValidateFn<Color>()` is the named `KindEnum`: they
    // validate identically but are structurally distinct by design (a value-first
    // builder can't reconstruct the nominal enum's member-name metadata). See the
    // enum builder doc in src/schema/atomic.ts.
    idDivergent: true,
    validate: () => {
      enum Color {
        Red,
        Green = 'green',
        Blue = 2,
      }
      return createValidateFn<Color>();
    },
    standardSchema: () => {
      enum Color {
        Red,
        Green = 'green',
        Blue = 2,
      }
      return createStandardSchema<Color>();
    },
    validateDataOnly: () => {
      enum Color {
        Red,
        Green = 'green',
        Blue = 2,
      }
      return createValidateFn<DataOnly<Color>>();
    },
    validateSchema: () => {
      enum Color {
        Red,
        Green = 'green',
        Blue = 2,
      }
      return createValidateFn(RT.enum(Color));
    },
    deserializeValidate: () => {
      enum Color {
        Red,
        Green = 'green',
        Blue = 2,
      }
      return deserializeValidate<Color>();
    },
    validateReflect: () => {
      enum Color {
        Red,
        Green = 'green',
        Blue = 2,
      }
      const v: Color = Color.Red;
      return createValidateFn(v);
    },
    deserializeValidateReflect: () => {
      enum Color {
        Red,
        Green = 'green',
        Blue = 2,
      }
      const v: Color = Color.Red;
      return deserializeValidate(v);
    },
    getValidationErrors: () => {
      enum Color {
        Red,
        Green = 'green',
        Blue = 2,
      }
      return createGetValidationErrorsFn<Color>();
    },
    getValidationErrorsDataOnly: () => {
      enum Color {
        Red,
        Green = 'green',
        Blue = 2,
      }
      return createGetValidationErrorsFn<DataOnly<Color>>();
    },
    getValidationErrorsSchema: () => {
      enum Color {
        Red,
        Green = 'green',
        Blue = 2,
      }
      return createGetValidationErrorsFn(RT.enum(Color));
    },
    deserializeGetValidationErrors: () => {
      enum Color {
        Red,
        Green = 'green',
        Blue = 2,
      }
      return deserializeGetValidationErrors<Color>();
    },
    getValidationErrorsReflect: () => {
      enum Color {
        Red,
        Green = 'green',
        Blue = 2,
      }
      const v: Color = Color.Red;
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      enum Color {
        Red,
        Green = 'green',
        Blue = 2,
      }
      const v: Color = Color.Red;
      return deserializeGetValidationErrors(v);
    },
    mockType: () => {
      enum Color {
        Red,
        Green = 'green',
        Blue = 2,
      }
      return createMockDataFn<Color>();
    },
    mockTypeReflect: () => {
      enum Color {
        Red,
        Green = 'green',
        Blue = 2,
      }
      const v: Color = Color.Red;
      return createMockDataFn(v);
    },
    getSamples: () => {
      enum Color {
        Red,
        Green = 'green',
        Blue = 2,
      }
      return {
        valid: [Color.Red, Color.Green, Color.Blue, 0, 'green', 2],
        invalid: ['Red', 'Green', 'Blue', 4, 1, 3, true, null, {}],
      };
    },
    getExpectedErrors: () => [
      [{path: [], expected: 'enum'}],
      [{path: [], expected: 'enum'}],
      [{path: [], expected: 'enum'}],
      [{path: [], expected: 'enum'}],
      [{path: [], expected: 'enum'}],
      [{path: [], expected: 'enum'}],
      [{path: [], expected: 'enum'}],
      [{path: [], expected: 'enum'}],
      [{path: [], expected: 'enum'}],
    ],
  },

  literal_2: {
    title: 'Numeric literal',
    description: 'The numeric literal type `2` is matched by strict `===`, so the string "2" fails.',
    validateNotes: 'Strict === equality with the literal value. The string "2" is not the number 2.',
    validate: () => createValidateFn<2>(),
    standardSchema: () => createStandardSchema<2>(),
    validateDataOnly: () => createValidateFn<DataOnly<2>>(),
    validateSchema: () => createValidateFn(RT.literal(2)),
    deserializeValidate: () => deserializeValidate<2>(),
    validateReflect: () => {
      const v = 2 as const;
      return createValidateFn(v);
    },
    deserializeValidateReflect: () => {
      const v = 2 as const;
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrorsFn<2>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<2>>(),
    getValidationErrorsSchema: () => createGetValidationErrorsFn(RT.literal(2)),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<2>(),
    getValidationErrorsReflect: () => {
      const v = 2 as const;
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v = 2 as const;
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockDataFn<2>(),
    mockTypeReflect: () => {
      const v = 2 as const;
      return createMockDataFn(v);
    },
    getSamples: () => ({valid: [2], invalid: [4, '2', null, undefined]}),
    getExpectedErrors: () => [
      [{path: [], expected: 'literal'}],
      [{path: [], expected: 'literal'}],
      [{path: [], expected: 'literal'}],
      [{path: [], expected: 'literal'}],
    ],
  },

  literal_a: {
    title: 'String literal',
    description: "The string literal type `'a'` is matched by strict, case-sensitive `===`.",
    validateNotes: 'Case-sensitive — "A" does not satisfy the literal "a".',
    validate: () => createValidateFn<'a'>(),
    standardSchema: () => createStandardSchema<'a'>(),
    validateDataOnly: () => createValidateFn<DataOnly<'a'>>(),
    validateSchema: () => createValidateFn(RT.literal('a')),
    deserializeValidate: () => deserializeValidate<'a'>(),
    validateReflect: () => {
      const v = 'a' as const;
      return createValidateFn(v);
    },
    deserializeValidateReflect: () => {
      const v = 'a' as const;
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrorsFn<'a'>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<'a'>>(),
    getValidationErrorsSchema: () => createGetValidationErrorsFn(RT.literal('a')),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<'a'>(),
    getValidationErrorsReflect: () => {
      const v = 'a' as const;
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v = 'a' as const;
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockDataFn<'a'>(),
    mockTypeReflect: () => {
      const v = 'a' as const;
      return createMockDataFn(v);
    },
    getSamples: () => ({valid: ['a'], invalid: ['b', 'A', '', null, undefined]}),
    getExpectedErrors: () => [
      [{path: [], expected: 'literal'}],
      [{path: [], expected: 'literal'}],
      [{path: [], expected: 'literal'}],
      [{path: [], expected: 'literal'}],
      [{path: [], expected: 'literal'}],
    ],
  },

  literal_true: {
    title: 'Boolean literal',
    description: 'The boolean literal type `true` accepts only the value `true` via strict `===`.',
    validateNotes:
      'Strict === equality. Truthy values like 1 or "true" do NOT satisfy the literal `true`; only the boolean true does.',
    validate: () => createValidateFn<true>(),
    standardSchema: () => createStandardSchema<true>(),
    validateDataOnly: () => createValidateFn<DataOnly<true>>(),
    validateSchema: () => createValidateFn(RT.literal(true)),
    deserializeValidate: () => deserializeValidate<true>(),
    validateReflect: () => {
      const v = true as const;
      return createValidateFn(v);
    },
    deserializeValidateReflect: () => {
      const v = true as const;
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrorsFn<true>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<true>>(),
    getValidationErrorsSchema: () => createGetValidationErrorsFn(RT.literal(true)),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<true>(),
    getValidationErrorsReflect: () => {
      const v = true as const;
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v = true as const;
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockDataFn<true>(),
    mockTypeReflect: () => {
      const v = true as const;
      return createMockDataFn(v);
    },
    getSamples: () => ({valid: [true], invalid: [false, 1, 'true', null]}),
    getExpectedErrors: () => [
      [{path: [], expected: 'literal'}],
      [{path: [], expected: 'literal'}],
      [{path: [], expected: 'literal'}],
      [{path: [], expected: 'literal'}],
    ],
  },

  literal_1n: {
    title: 'BigInt literal',
    description: 'The bigint literal type `1n` is matched by strict `===`, so the number 1 fails.',
    validateNotes: 'Strict === equality with the bigint literal. The number 1 and the string "1n" do NOT satisfy 1n.',
    validate: () => createValidateFn<1n>(),
    standardSchema: () => createStandardSchema<1n>(),
    validateDataOnly: () => createValidateFn<DataOnly<1n>>(),
    validateSchema: () => createValidateFn(RT.literal(1n)),
    deserializeValidate: () => deserializeValidate<1n>(),
    validateReflect: () => {
      const v = 1n as const;
      return createValidateFn(v);
    },
    deserializeValidateReflect: () => {
      const v = 1n as const;
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrorsFn<1n>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<1n>>(),
    getValidationErrorsSchema: () => createGetValidationErrorsFn(RT.literal(1n)),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<1n>(),
    getValidationErrorsReflect: () => {
      const v = 1n as const;
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v = 1n as const;
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockDataFn<1n>(),
    mockTypeReflect: () => {
      const v = 1n as const;
      return createMockDataFn(v);
    },
    getSamples: () => ({valid: [1n], invalid: [2n, 1, '1n', 0n, null]}),
    getExpectedErrors: () => [
      [{path: [], expected: 'literal'}],
      [{path: [], expected: 'literal'}],
      [{path: [], expected: 'literal'}],
      [{path: [], expected: 'literal'}],
      [{path: [], expected: 'literal'}],
    ],
  },

  literal_symbol: {
    title: 'Symbol literal',
    // DataOnly<unique symbol> collapses to `never` (symbols are non-data), so
    // createValidateFn<DataOnly<T>>() can't reproduce the symbol validator.
    dataOnlyDivergent: true,
    description:
      'A symbol literal is matched by its `description` rather than unique-symbol identity, per the reference semantics.',
    validateNotes:
      'TS DIVERGENCE: Symbol literal types are matched by `description`, not by unique-symbol identity. A different `Symbol("hello")` instance with the same description WILL satisfy the type. Strict TS treats each `typeof sym` as a unique-symbol referring to that exact value.',
    validate: () => {
      const sym = Symbol('hello');
      return createValidateFn<typeof sym>();
    },
    standardSchema: () => {
      const sym = Symbol('hello');
      return createStandardSchema<typeof sym>();
    },
    validateDataOnly: () => {
      const sym = Symbol('hello');
      return createValidateFn<DataOnly<typeof sym>>();
    },
    // No value-first builder for a unique-symbol literal (matched by description);
    // `RT.symbol()` is the bare-symbol kind, which is unsupported at root anyway.
    validateSchema: 'not-supported',
    deserializeValidate: () => {
      const sym = Symbol('hello');
      return deserializeValidate<typeof sym>();
    },
    validateReflect: () => {
      const sym = Symbol('hello');
      const v: typeof sym = sym;
      return createValidateFn(v);
    },
    deserializeValidateReflect: () => {
      const sym = Symbol('hello');
      const v: typeof sym = sym;
      return deserializeValidate(v);
    },
    getValidationErrors: () => {
      const sym = Symbol('hello');
      return createGetValidationErrorsFn<typeof sym>();
    },
    getValidationErrorsDataOnly: () => {
      const sym = Symbol('hello');
      return createGetValidationErrorsFn<DataOnly<typeof sym>>();
    },
    getValidationErrorsSchema: 'not-supported',
    deserializeGetValidationErrors: () => {
      const sym = Symbol('hello');
      return deserializeGetValidationErrors<typeof sym>();
    },
    getValidationErrorsReflect: () => {
      const sym = Symbol('hello');
      const v: typeof sym = sym;
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const sym = Symbol('hello');
      const v: typeof sym = sym;
      return deserializeGetValidationErrors(v);
    },
    mockType: () => {
      const sym = Symbol('hello');
      return createMockDataFn<typeof sym>();
    },
    mockTypeReflect: () => {
      const sym = Symbol('hello');
      const v: typeof sym = sym;
      return createMockDataFn(v);
    },
    getSamples: () => {
      const sym = Symbol('hello');
      return {
        // identity by description per the reference semantics:
        // emit is `typeof === 'symbol' && v.description === 'hello'`
        valid: [sym, Symbol('hello')],
        invalid: [Symbol('nice'), 'hello', null, undefined],
      };
    },
    getExpectedErrors: () => [
      [{path: [], expected: 'literal'}],
      [{path: [], expected: 'literal'}],
      [{path: [], expected: 'literal'}],
      [{path: [], expected: 'literal'}],
    ],
  },

  never: {
    title: 'Never',
    description: 'The `never` keyword rejects every value, and mockType throws.',
    validateNotes: 'No value satisfies `never`. The validator is hard-coded to return `false` for every input.',
    validate: () => createValidateFn<never>(),
    standardSchema: () => createStandardSchema<never>(),
    validateDataOnly: () => createValidateFn<DataOnly<never>>(),
    validateSchema: () => createValidateFn(RT.never()),
    deserializeValidate: () => deserializeValidate<never>(),
    validateReflect: () => {
      const v: never = null as never;
      return createValidateFn(v);
    },
    deserializeValidateReflect: () => {
      const v: never = null as never;
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrorsFn<never>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<never>>(),
    getValidationErrorsSchema: () => createGetValidationErrorsFn(RT.never()),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<never>(),
    getValidationErrorsReflect: () => {
      const v: never = null as never;
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: never = null as never;
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockDataFn<never>(),
    mockTypeReflect: () => {
      const v: never = null as never;
      return createMockDataFn(v);
    },
    mockTypeExpect: 'throw',
    getSamples: () => ({
      valid: [],
      invalid: [true, false, 1, '3', {}, 'hello', null, undefined, NaN, []],
    }),
    getExpectedErrors: () => [
      [{path: [], expected: 'never'}],
      [{path: [], expected: 'never'}],
      [{path: [], expected: 'never'}],
      [{path: [], expected: 'never'}],
      [{path: [], expected: 'never'}],
      [{path: [], expected: 'never'}],
      [{path: [], expected: 'never'}],
      [{path: [], expected: 'never'}],
      [{path: [], expected: 'never'}],
      [{path: [], expected: 'never'}],
    ],
  },

  null: {
    title: 'Null',
    description: 'A strict `=== null` check treats null as distinct from undefined and other falsy values.',
    validateNotes:
      'Strict === null check. `undefined`, `0`, `""`, `false`, `NaN`, `{}`, `[]` and other "falsy" or "nullish-feeling" values are all rejected.',
    validate: () => createValidateFn<null>(),
    standardSchema: () => createStandardSchema<null>(),
    validateDataOnly: () => createValidateFn<DataOnly<null>>(),
    validateSchema: () => createValidateFn(RT.literal(null)),
    deserializeValidate: () => deserializeValidate<null>(),
    validateReflect: () => {
      const v: null = null;
      return createValidateFn(v);
    },
    deserializeValidateReflect: () => {
      const v: null = null;
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrorsFn<null>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<null>>(),
    getValidationErrorsSchema: () => createGetValidationErrorsFn(RT.literal(null)),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<null>(),
    getValidationErrorsReflect: () => {
      const v: null = null;
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: null = null;
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockDataFn<null>(),
    mockTypeReflect: () => {
      const v: null = null;
      return createMockDataFn(v);
    },
    getSamples: () => ({
      valid: [null],
      invalid: [undefined, 42, 'hello', 0, '', false, NaN, {}, []],
    }),
    getExpectedErrors: () => [
      [{path: [], expected: 'null'}],
      [{path: [], expected: 'null'}],
      [{path: [], expected: 'null'}],
      [{path: [], expected: 'null'}],
      [{path: [], expected: 'null'}],
      [{path: [], expected: 'null'}],
      [{path: [], expected: 'null'}],
      [{path: [], expected: 'null'}],
      [{path: [], expected: 'null'}],
    ],
  },

  number: {
    title: 'Number',
    description: 'The `number` primitive uses `Number.isFinite`, so NaN, Infinity, and -Infinity are rejected.',
    validateNotes: [
      'Uses `Number.isFinite(v)` rather than bare `typeof v === "number"`.',
      '`NaN`, `Infinity`, and `-Infinity` are rejected even though they pass `typeof === "number"`.',
    ],
    validate: () => createValidateFn<number>(),
    standardSchema: () => createStandardSchema<number>(),
    validateDataOnly: () => createValidateFn<DataOnly<number>>(),
    validateSchema: () => createValidateFn(TF.number()),
    deserializeValidate: () => deserializeValidate<number>(),
    validateReflect: () => {
      const v: number = 42;
      return createValidateFn(v);
    },
    deserializeValidateReflect: () => {
      const v: number = 42;
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrorsFn<number>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<number>>(),
    getValidationErrorsSchema: () => createGetValidationErrorsFn(TF.number()),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<number>(),
    getValidationErrorsReflect: () => {
      const v: number = 42;
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: number = 42;
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockDataFn<number>(),
    mockTypeReflect: () => {
      const v: number = 42;
      return createMockDataFn(v);
    },
    getSamples: () => ({
      valid: [42],
      invalid: [Infinity, -Infinity, NaN, 'hello', null, undefined],
    }),
    getExpectedErrors: () => [
      [{path: [], expected: 'number'}],
      [{path: [], expected: 'number'}],
      [{path: [], expected: 'number'}],
      [{path: [], expected: 'number'}],
      [{path: [], expected: 'number'}],
      [{path: [], expected: 'number'}],
    ],
  },

  object: {
    title: 'Object',
    description:
      'The `object` type accepts any non-null non-primitive value, rejecting null despite JS `typeof null === "object"`.',
    validateNotes: [
      'Emit is `typeof v === "object" && v !== null` — strict TS semantics (any non-primitive non-null value).',
      'Arrays, Date instances, RegExp, Map, Set, and class instances all PASS — they are TS-`object` per the spec.',
      '`null` is explicitly rejected (despite `typeof null === "object"` in JavaScript).',
      '`object` here does NOT mean "plain object literal" — if you need that semantic, use a specific object shape or an index-signature type.',
    ],
    validate: () => createValidateFn<object>(),
    standardSchema: () => createStandardSchema<object>(),
    validateDataOnly: () => createValidateFn<DataOnly<object>>(),
    // No value-first builder for the TS `object` primitive (any non-null
    // non-primitive) — `RT.object(...)` is the shape composer, a different kind.
    validateSchema: 'not-supported',
    deserializeValidate: () => deserializeValidate<object>(),
    validateReflect: () => {
      const v: object = {};
      return createValidateFn(v);
    },
    deserializeValidateReflect: () => {
      const v: object = {};
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrorsFn<object>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<object>>(),
    getValidationErrorsSchema: 'not-supported',
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<object>(),
    getValidationErrorsReflect: () => {
      const v: object = {};
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: object = {};
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockDataFn<object>(),
    mockTypeReflect: () => {
      const v: object = {};
      return createMockDataFn(v);
    },
    getSamples: () => ({
      valid: [{}, {a: 42, b: 'hello'}, [], new Date(), /abc/],
      invalid: [null, undefined, 42, 'hello', true, Symbol()],
    }),
    // The bare `object` primitive (protocol.KindObject) reuses the `objectLiteral`
    // emit token — there is NO distinct `object`/`nonNullObject` token. The gate
    // `typeof v === 'object' && v !== null` lives at nodes/atomic/object.ts and the
    // failure surfaces as `objectLiteral` (see internal/cachegen/typefunctions/validationerrors.go
    // KindObject case). Do not "fix" this to `object`.
    getExpectedErrors: () => [
      [{path: [], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
    ],
  },

  regexp: {
    title: 'RegExp',
    description: 'The `RegExp` builtin uses an `instanceof RegExp` check.',
    validateNotes: [
      'Must be an actual RegExp instance (`instanceof RegExp`). A string like `"/abc/"` does NOT satisfy.',
      'The getValidationErrors and mockType REFLECT forms are not supported: a reflect value `const v: RegExp = /abc/` narrows to the literal-regex type `/abc/`, dispatching to the regexp-literal arm — getValidationErrors would then report `expected: "literal"` instead of `"regexp"`, and mockType would resolve a regexp-literal runtype. The validate reflect forms survive because the validator body coincides on the samples; only the kindname-reporting paths diverge.',
    ],
    validate: () => createValidateFn<RegExp>(),
    standardSchema: () => createStandardSchema<RegExp>(),
    validateDataOnly: () => createValidateFn<DataOnly<RegExp>>(),
    validateSchema: () => createValidateFn(RT.regexp()),
    deserializeValidate: () => deserializeValidate<RegExp>(),
    validateReflect: () => {
      const v: RegExp = /abc/;
      return createValidateFn(v);
    },
    deserializeValidateReflect: () => {
      const v: RegExp = /abc/;
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrorsFn<RegExp>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<RegExp>>(),
    getValidationErrorsSchema: () => createGetValidationErrorsFn(RT.regexp()),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<RegExp>(),
    // Reflect forms for the kindname-reporting paths are deliberately opted out
    // (see validateNotes): `const v: RegExp = /abc/` narrows to the literal-regex
    // type and dispatches to the regexp-literal arm, diverging from the static form.
    getValidationErrorsReflect: 'not-supported',
    deserializeGetValidationErrorsReflect: 'not-supported',
    mockType: () => createMockDataFn<RegExp>(),
    mockTypeReflect: 'not-supported',
    getSamples: () => ({
      valid: [/abc/, new RegExp('abc')],
      invalid: [undefined, 42, 'hello', null, '/abc/', {}],
    }),
    getExpectedErrors: () => [
      [{path: [], expected: 'regexp'}],
      [{path: [], expected: 'regexp'}],
      [{path: [], expected: 'regexp'}],
      [{path: [], expected: 'regexp'}],
      [{path: [], expected: 'regexp'}],
      [{path: [], expected: 'regexp'}],
    ],
  },

  string: {
    title: 'String',
    description: 'The `string` primitive uses strict `typeof === "string"`, accepting the empty string.',
    validateNotes: 'Strict typeof === "string". The empty string ("") is accepted.',
    validate: () => createValidateFn<string>(),
    standardSchema: () => createStandardSchema<string>(),
    validateDataOnly: () => createValidateFn<DataOnly<string>>(),
    validateSchema: () => createValidateFn(TF.string()),
    deserializeValidate: () => deserializeValidate<string>(),
    validateReflect: () => {
      const v: string = 'hello';
      return createValidateFn(v);
    },
    deserializeValidateReflect: () => {
      const v: string = 'hello';
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrorsFn<string>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<string>>(),
    getValidationErrorsSchema: () => createGetValidationErrorsFn(TF.string()),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<string>(),
    getValidationErrorsReflect: () => {
      const v: string = 'hello';
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: string = 'hello';
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockDataFn<string>(),
    mockTypeReflect: () => {
      const v: string = 'hello';
      return createMockDataFn(v);
    },
    getSamples: () => ({
      valid: ['hello', ''],
      invalid: [2, null, undefined, true],
    }),
    getExpectedErrors: () => [
      [{path: [], expected: 'string'}],
      [{path: [], expected: 'string'}],
      [{path: [], expected: 'string'}],
      [{path: [], expected: 'string'}],
    ],
  },

  symbol: {
    title: 'Symbol',
    description: 'The bare `symbol` primitive is unsupported at root, so the factory throws on first call.',
    validateNotes:
      'Symbol at root is unsupported — identity does not survive across realms or round-trips, so a `typeof === "symbol"` check would give false confidence. The Go pipeline renders the factory as alwaysThrow (codes VL002 / VE002 / IS002), and the very first `createXxx<symbol>()` call throws. See docs/UNSUPPORTED-KINDS.md.',
    validate: () => createValidateFn<symbol>(),
    standardSchema: () => createStandardSchema<symbol>(),
    validateDataOnly: () => createValidateFn<DataOnly<symbol>>(),
    // Bare symbol is unsupported at root — the value-first `RT.symbol()` resolves
    // the same alwaysThrow factory, so this thunk throws like the type-first form.
    validateSchema: () => createValidateFn(RT.symbol()),
    deserializeValidate: () => deserializeValidate<symbol>(),
    validateReflect: () => {
      const v: symbol = Symbol();
      return createValidateFn(v);
    },
    deserializeValidateReflect: () => {
      const v: symbol = Symbol();
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrorsFn<symbol>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<symbol>>(),
    getValidationErrorsSchema: () => createGetValidationErrorsFn(RT.symbol()),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<symbol>(),
    getValidationErrorsReflect: () => {
      const v: symbol = Symbol();
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: symbol = Symbol();
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockDataFn<symbol>(),
    mockTypeReflect: () => {
      const v: symbol = Symbol();
      return createMockDataFn(v);
    },
    factoryThrows: true,
    getSamples: () => ({valid: [], invalid: []}),
  },

  undefined: {
    title: 'Undefined',
    description: 'A strict `=== undefined` check treats undefined as distinct from null and other falsy values.',
    validateNotes: 'Strict === undefined check. `null`, `0`, `""`, `false`, `{}`, `[]` are all rejected.',
    validate: () => createValidateFn<undefined>(),
    standardSchema: () => createStandardSchema<undefined>(),
    validateDataOnly: () => createValidateFn<DataOnly<undefined>>(),
    validateSchema: () => createValidateFn(RT.literal(undefined)),
    deserializeValidate: () => deserializeValidate<undefined>(),
    validateReflect: () => {
      const v: undefined = undefined;
      return createValidateFn(v);
    },
    deserializeValidateReflect: () => {
      const v: undefined = undefined;
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrorsFn<undefined>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<undefined>>(),
    getValidationErrorsSchema: () => createGetValidationErrorsFn(RT.literal(undefined)),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<undefined>(),
    getValidationErrorsReflect: () => {
      const v: undefined = undefined;
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: undefined = undefined;
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockDataFn<undefined>(),
    mockTypeReflect: () => {
      const v: undefined = undefined;
      return createMockDataFn(v);
    },
    getSamples: () => ({
      valid: [undefined],
      invalid: [null, 42, 'hello', 0, '', false, {}, []],
    }),
    getExpectedErrors: () => [
      [{path: [], expected: 'undefined'}],
      [{path: [], expected: 'undefined'}],
      [{path: [], expected: 'undefined'}],
      [{path: [], expected: 'undefined'}],
      [{path: [], expected: 'undefined'}],
      [{path: [], expected: 'undefined'}],
      [{path: [], expected: 'undefined'}],
      [{path: [], expected: 'undefined'}],
    ],
  },

  void: {
    title: 'Void',
    description: 'The `void` type validates like undefined, accepting undefined and a bare function return but rejecting null.',
    validateNotes:
      'TS DIVERGENCE: `void` validates like `undefined` — it accepts `undefined` (and a bare `(): void => {}` return) but rejects `null`, unlike a `null | undefined` type.',
    validate: () => createValidateFn<void>(),
    standardSchema: () => createStandardSchema<void>(),
    validateDataOnly: () => createValidateFn<DataOnly<void>>(),
    validateSchema: () => createValidateFn(RT.void()),
    deserializeValidate: () => deserializeValidate<void>(),
    validateReflect: () => {
      const v: void = undefined;
      return createValidateFn(v);
    },
    deserializeValidateReflect: () => {
      const v: void = undefined;
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrorsFn<void>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<void>>(),
    getValidationErrorsSchema: () => createGetValidationErrorsFn(RT.void()),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<void>(),
    getValidationErrorsReflect: () => {
      const v: void = undefined;
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: void = undefined;
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockDataFn<void>(),
    mockTypeReflect: () => {
      const v: void = undefined;
      return createMockDataFn(v);
    },
    getSamples: () => {
      function vd(): void {}
      return {
        valid: [undefined, vd()],
        invalid: [null, 42, 'hello'],
      };
    },
    getExpectedErrors: () => [[{path: [], expected: 'void'}], [{path: [], expected: 'void'}], [{path: [], expected: 'void'}]],
  },

  // noLiterals variants — mirror the `noLiterals: true` block in
  // literal.spec.ts. Each literal degrades to its base-type
  // check: the validator accepts any value of the base type instead
  // of only the exact literal. The Go-side resolver swaps the
  // literal type for its base via Checker_getBaseTypeOfLiteralType
  // before assigning the hash (see internal/compiler/resolver/scan.go), so
  // these cases reuse the existing base-kind emit code.

  literal_2_noLiterals: {
    title: 'Numeric literal noLiterals',
    description: 'With `{noLiterals: true}` the numeric literal degrades to `number`, using a `Number.isFinite` check.',
    validateNotes:
      'With `{noLiterals: true}` the literal degrades to its base type (`number`). The exact-literal check is replaced by `Number.isFinite` — same rules as the atomic `number` validator (NaN / Infinity / -Infinity rejected).',
    validate: () => createValidateFn<2>(undefined, {noLiterals: true}),
    standardSchema: () => createStandardSchema<2>(undefined, {noLiterals: true}),
    validateDataOnly: () => createValidateFn<DataOnly<2>>(undefined, {noLiterals: true}),
    // Value-first mirror of the type-first form: the SAME literal id carrying the
    // SAME {noLiterals} option — both resolve the `itNL_<literal-2 id>` variant.
    // (noLiterals keeps the literal's structural id and folds into the variant
    // key; it does NOT degrade to `number`'s id before hashing.)
    validateSchema: () => createValidateFn(RT.literal(2), {noLiterals: true}),
    deserializeValidate: () => deserializeValidate<2>(undefined, {noLiterals: true}),
    validateReflect: () => {
      const v = 2 as const;
      return createValidateFn(v, {noLiterals: true});
    },
    deserializeValidateReflect: () => {
      const v = 2 as const;
      return deserializeValidate(v, {noLiterals: true});
    },
    getValidationErrors: () => createGetValidationErrorsFn<2>(undefined, {noLiterals: true}),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<2>>(undefined, {noLiterals: true}),
    getValidationErrorsSchema: () => createGetValidationErrorsFn(RT.literal(2), {noLiterals: true}),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<2>(undefined, {noLiterals: true}),
    getValidationErrorsReflect: () => {
      const v = 2 as const;
      return createGetValidationErrorsFn(v, {noLiterals: true});
    },
    deserializeGetValidationErrorsReflect: () => {
      const v = 2 as const;
      return deserializeGetValidationErrors(v, {noLiterals: true});
    },
    mockType: () => createMockDataFn<2>(undefined, undefined),
    mockTypeReflect: () => {
      const v = 2 as const;
      return createMockDataFn(v);
    },
    getSamples: () => ({valid: [4, 0, -1], invalid: ['4', Infinity, NaN, null]}),
    getExpectedErrors: () => [
      [{path: [], expected: 'number'}],
      [{path: [], expected: 'number'}],
      [{path: [], expected: 'number'}],
      [{path: [], expected: 'number'}],
    ],
  },

  literal_a_noLiterals: {
    title: 'String literal noLiterals',
    description: 'With `{noLiterals: true}` the string literal degrades to `string`, using a typeof check.',
    validateNotes:
      '`{noLiterals: true}` degrades the literal to its base type `string`. Any string passes, including the empty string.',
    validate: () => createValidateFn<'a'>(undefined, {noLiterals: true}),
    standardSchema: () => createStandardSchema<'a'>(undefined, {noLiterals: true}),
    validateDataOnly: () => createValidateFn<DataOnly<'a'>>(undefined, {noLiterals: true}),
    validateSchema: () => createValidateFn(RT.literal('a'), {noLiterals: true}),
    deserializeValidate: () => deserializeValidate<'a'>(undefined, {noLiterals: true}),
    validateReflect: () => {
      const v = 'a' as const;
      return createValidateFn(v, {noLiterals: true});
    },
    deserializeValidateReflect: () => {
      const v = 'a' as const;
      return deserializeValidate(v, {noLiterals: true});
    },
    getValidationErrors: () => createGetValidationErrorsFn<'a'>(undefined, {noLiterals: true}),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<'a'>>(undefined, {noLiterals: true}),
    getValidationErrorsSchema: () => createGetValidationErrorsFn(RT.literal('a'), {noLiterals: true}),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<'a'>(undefined, {noLiterals: true}),
    getValidationErrorsReflect: () => {
      const v = 'a' as const;
      return createGetValidationErrorsFn(v, {noLiterals: true});
    },
    deserializeGetValidationErrorsReflect: () => {
      const v = 'a' as const;
      return deserializeGetValidationErrors(v, {noLiterals: true});
    },
    mockType: () => createMockDataFn<'a'>(undefined, undefined),
    mockTypeReflect: () => {
      const v = 'a' as const;
      return createMockDataFn(v);
    },
    getSamples: () => ({valid: ['c', ''], invalid: [1, null, undefined, true]}),
    getExpectedErrors: () => [
      [{path: [], expected: 'string'}],
      [{path: [], expected: 'string'}],
      [{path: [], expected: 'string'}],
      [{path: [], expected: 'string'}],
    ],
  },

  literal_regexp_noLiterals: {
    title: 'RegExp literal noLiterals',
    description: 'With `{noLiterals: true}` the RegExp literal degrades to `RegExp`, using an instanceof check.',
    validateNotes:
      '`{noLiterals: true}` degrades the literal to its base type `RegExp`. Any RegExp instance passes (constructor form `new RegExp(...)` included); source + flags are no longer matched.',
    validate: () => {
      const reg = /abc/i;
      return createValidateFn<typeof reg>(undefined, {noLiterals: true});
    },
    standardSchema: () => {
      const reg = /abc/i;
      return createStandardSchema<typeof reg>(undefined, {noLiterals: true});
    },
    validateDataOnly: () => {
      const reg = /abc/i;
      return createValidateFn<DataOnly<typeof reg>>(undefined, {noLiterals: true});
    },
    // Value-first mirror: RegExp base kind + the SAME {noLiterals} option, so both
    // resolve the `itNL_<regexp id>` variant. (No RegExp-literal kind exists since
    // PR #76, so `typeof /abc/i` is plain `RegExp` — `RT.regexp()` is the match.)
    validateSchema: () => createValidateFn(RT.regexp(), {noLiterals: true}),
    deserializeValidate: () => {
      const reg = /abc/i;
      return deserializeValidate<typeof reg>(undefined, {noLiterals: true});
    },
    validateReflect: () => {
      const reg = /abc/i;
      const v: typeof reg = reg;
      return createValidateFn(v, {noLiterals: true});
    },
    deserializeValidateReflect: () => {
      const reg = /abc/i;
      const v: typeof reg = reg;
      return deserializeValidate(v, {noLiterals: true});
    },
    getValidationErrors: () => {
      const reg = /abc/i;
      return createGetValidationErrorsFn<typeof reg>(undefined, {noLiterals: true});
    },
    getValidationErrorsDataOnly: () => {
      const reg = /abc/i;
      return createGetValidationErrorsFn<DataOnly<typeof reg>>(undefined, {noLiterals: true});
    },
    getValidationErrorsSchema: () => createGetValidationErrorsFn(RT.regexp(), {noLiterals: true}),
    deserializeGetValidationErrors: () => {
      const reg = /abc/i;
      return deserializeGetValidationErrors<typeof reg>(undefined, {noLiterals: true});
    },
    getValidationErrorsReflect: () => {
      const reg = /abc/i;
      const v: typeof reg = reg;
      return createGetValidationErrorsFn(v, {noLiterals: true});
    },
    deserializeGetValidationErrorsReflect: () => {
      const reg = /abc/i;
      const v: typeof reg = reg;
      return deserializeGetValidationErrors(v, {noLiterals: true});
    },
    mockType: () => {
      const reg = /abc/i;
      return createMockDataFn<typeof reg>(undefined, undefined);
    },
    mockTypeReflect: () => {
      const reg = /abc/i;
      const v: typeof reg = reg;
      return createMockDataFn(v);
    },
    getSamples: () => ({valid: [/otherReg/, new RegExp('foo')], invalid: ['otherReg', null, undefined, {}]}),
    getExpectedErrors: () => [
      [{path: [], expected: 'regexp'}],
      [{path: [], expected: 'regexp'}],
      [{path: [], expected: 'regexp'}],
      [{path: [], expected: 'regexp'}],
    ],
  },

  literal_true_noLiterals: {
    title: 'Boolean literal noLiterals',
    description: 'With `{noLiterals: true}` the boolean literal degrades to `boolean`, using a typeof check.',
    validateNotes:
      '`{noLiterals: true}` degrades the literal to its base type `boolean`. Either `true` or `false` passes; truthy values like 1 are still rejected.',
    validate: () => createValidateFn<true>(undefined, {noLiterals: true}),
    standardSchema: () => createStandardSchema<true>(undefined, {noLiterals: true}),
    validateDataOnly: () => createValidateFn<DataOnly<true>>(undefined, {noLiterals: true}),
    validateSchema: () => createValidateFn(RT.literal(true), {noLiterals: true}),
    deserializeValidate: () => deserializeValidate<true>(undefined, {noLiterals: true}),
    validateReflect: () => {
      const v = true as const;
      return createValidateFn(v, {noLiterals: true});
    },
    deserializeValidateReflect: () => {
      const v = true as const;
      return deserializeValidate(v, {noLiterals: true});
    },
    getValidationErrors: () => createGetValidationErrorsFn<true>(undefined, {noLiterals: true}),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<true>>(undefined, {noLiterals: true}),
    getValidationErrorsSchema: () => createGetValidationErrorsFn(RT.literal(true), {noLiterals: true}),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<true>(undefined, {noLiterals: true}),
    getValidationErrorsReflect: () => {
      const v = true as const;
      return createGetValidationErrorsFn(v, {noLiterals: true});
    },
    deserializeGetValidationErrorsReflect: () => {
      const v = true as const;
      return deserializeGetValidationErrors(v, {noLiterals: true});
    },
    mockType: () => createMockDataFn<true>(undefined, undefined),
    mockTypeReflect: () => {
      const v = true as const;
      return createMockDataFn(v);
    },
    getSamples: () => ({valid: [false, true], invalid: [1, 0, 'true', null, undefined]}),
    getExpectedErrors: () => [
      [{path: [], expected: 'boolean'}],
      [{path: [], expected: 'boolean'}],
      [{path: [], expected: 'boolean'}],
      [{path: [], expected: 'boolean'}],
      [{path: [], expected: 'boolean'}],
    ],
  },

  literal_1n_noLiterals: {
    title: 'BigInt literal noLiterals',
    description: 'With `{noLiterals: true}` the bigint literal degrades to `bigint`, using a typeof check.',
    validateNotes:
      '`{noLiterals: true}` degrades the literal to its base type `bigint`. Any bigint passes; the number `1` does NOT.',
    validate: () => createValidateFn<1n>(undefined, {noLiterals: true}),
    standardSchema: () => createStandardSchema<1n>(undefined, {noLiterals: true}),
    validateDataOnly: () => createValidateFn<DataOnly<1n>>(undefined, {noLiterals: true}),
    validateSchema: () => createValidateFn(RT.literal(1n), {noLiterals: true}),
    deserializeValidate: () => deserializeValidate<1n>(undefined, {noLiterals: true}),
    validateReflect: () => {
      const v = 1n as const;
      return createValidateFn(v, {noLiterals: true});
    },
    deserializeValidateReflect: () => {
      const v = 1n as const;
      return deserializeValidate(v, {noLiterals: true});
    },
    getValidationErrors: () => createGetValidationErrorsFn<1n>(undefined, {noLiterals: true}),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<1n>>(undefined, {noLiterals: true}),
    getValidationErrorsSchema: () => createGetValidationErrorsFn(RT.literal(1n), {noLiterals: true}),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<1n>(undefined, {noLiterals: true}),
    getValidationErrorsReflect: () => {
      const v = 1n as const;
      return createGetValidationErrorsFn(v, {noLiterals: true});
    },
    deserializeGetValidationErrorsReflect: () => {
      const v = 1n as const;
      return deserializeGetValidationErrors(v, {noLiterals: true});
    },
    mockType: () => createMockDataFn<1n>(undefined, undefined),
    mockTypeReflect: () => {
      const v = 1n as const;
      return createMockDataFn(v);
    },
    getSamples: () => ({valid: [3n, 0n, 1n], invalid: [3, null, undefined, 1, '1n']}),
    getExpectedErrors: () => [
      [{path: [], expected: 'bigint'}],
      [{path: [], expected: 'bigint'}],
      [{path: [], expected: 'bigint'}],
      [{path: [], expected: 'bigint'}],
      [{path: [], expected: 'bigint'}],
    ],
  },

  literal_symbol_noLiterals: {
    title: 'Symbol literal noLiterals',
    description: 'With `{noLiterals: true}` the symbol literal degrades to bare symbol, which is unsupported at root.',
    validateNotes:
      '`{noLiterals: true}` degrades the literal to its base type `symbol`, which is unsupported at root (see the `symbol` case above). The factory is rendered as alwaysThrow; the first `createXxx<typeof sym>()` call throws.',
    validate: () => {
      const sym = Symbol('hello');
      return createValidateFn<typeof sym>(undefined, {noLiterals: true});
    },
    standardSchema: () => {
      const sym = Symbol('hello');
      return createStandardSchema<typeof sym>(undefined, {noLiterals: true});
    },
    validateDataOnly: () => {
      const sym = Symbol('hello');
      return createValidateFn<DataOnly<typeof sym>>(undefined, {noLiterals: true});
    },
    // Degrades to bare symbol (unsupported at root) — `RT.symbol()` resolves the
    // same alwaysThrow factory, so the schema thunk throws like the type-first form.
    validateSchema: () => createValidateFn(RT.symbol(), {noLiterals: true}),
    deserializeValidate: () => {
      const sym = Symbol('hello');
      return deserializeValidate<typeof sym>(undefined, {noLiterals: true});
    },
    validateReflect: () => {
      const sym = Symbol('hello');
      const v: typeof sym = sym;
      return createValidateFn(v, {noLiterals: true});
    },
    deserializeValidateReflect: () => {
      const sym = Symbol('hello');
      const v: typeof sym = sym;
      return deserializeValidate(v, {noLiterals: true});
    },
    getValidationErrors: () => {
      const sym = Symbol('hello');
      return createGetValidationErrorsFn<typeof sym>(undefined, {noLiterals: true});
    },
    getValidationErrorsDataOnly: () => {
      const sym = Symbol('hello');
      return createGetValidationErrorsFn<DataOnly<typeof sym>>(undefined, {noLiterals: true});
    },
    getValidationErrorsSchema: () => createGetValidationErrorsFn(RT.symbol(), {noLiterals: true}),
    deserializeGetValidationErrors: () => {
      const sym = Symbol('hello');
      return deserializeGetValidationErrors<typeof sym>(undefined, {noLiterals: true});
    },
    getValidationErrorsReflect: () => {
      const sym = Symbol('hello');
      const v: typeof sym = sym;
      return createGetValidationErrorsFn(v, {noLiterals: true});
    },
    deserializeGetValidationErrorsReflect: () => {
      const sym = Symbol('hello');
      const v: typeof sym = sym;
      return deserializeGetValidationErrors(v, {noLiterals: true});
    },
    mockType: () => {
      const sym = Symbol('hello');
      return createMockDataFn<typeof sym>(undefined, undefined);
    },
    mockTypeReflect: () => {
      const sym = Symbol('hello');
      const v: typeof sym = sym;
      return createMockDataFn(v);
    },
    factoryThrows: true,
    getSamples: () => ({valid: [], invalid: []}),
  },

  // `unknown` — like `any`, every value passes. The unknown kind
  // reuses the any-kind emit (no validate emit), so both kinds
  // collapse to a noop validator. The reference suite skips this; we
  // include it here for full TS keyword coverage so a regression
  // can't silently change the always-pass semantics.
  unknown: {
    title: 'Unknown',
    description: 'The `unknown` keyword produces a no-op validator that accepts every value, same as `any`.',
    validateNotes: 'No-op validator — `unknown` accepts every value, same as `any`. Equivalent to `() => true`.',
    validate: () => createValidateFn<unknown>(),
    standardSchema: () => createStandardSchema<unknown>(),
    validateDataOnly: () => createValidateFn<DataOnly<unknown>>(),
    validateSchema: () => createValidateFn(RT.unknown()),
    deserializeValidate: () => deserializeValidate<unknown>(),
    validateReflect: () => {
      const v: unknown = null;
      return createValidateFn(v);
    },
    deserializeValidateReflect: () => {
      const v: unknown = null;
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrorsFn<unknown>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<unknown>>(),
    getValidationErrorsSchema: () => createGetValidationErrorsFn(RT.unknown()),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<unknown>(),
    getValidationErrorsReflect: () => {
      const v: unknown = null;
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: unknown = null;
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockDataFn<unknown>(),
    mockTypeReflect: () => {
      const v: unknown = null;
      return createMockDataFn(v);
    },
    getSamples: () => ({
      valid: [null, undefined, 42, 'hello', true, {}, [], Symbol(), () => null, new Date()],
      invalid: [],
    }),
    getExpectedErrors: () => [],
  },
} as const satisfies Record<string, ValidationCase>;
