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

export const UTILITY = {
  partial: {
    title: 'Partial',
    description:
      'utility/partial.spec.ts makes all properties optional, resolving to {name?: string; age?: number; createdAt?: Date} and reusing the object emit with the allOptionalCode array-rejection guard.',
    validateNotes:
      'Resolves to an all-optional object shape, so the `allOptionalCode` guard kicks in: arrays, Date, Map, Set, RegExp are rejected at the top level even though `{}` is valid. Present properties still run their atomic checks (Invalid Date in `createdAt` fails).',
    validate: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      return createValidateFn<Partial<Person>>();
    },
    standardSchema: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      return createStandardSchema<Partial<Person>>();
    },
    // One hand-authored Standard Schema expectation per file. Every other case
    // derives its expected issues from getExpectedErrors via runTypeErrorsToIssues
    // (the same mapping the factory uses), so this single case pins the real
    // consumer-facing {message, path} output independently: it trips if error
    // generation or the issue mapping changes. One case per file covers this
    // file's shapes without the ~265x maintenance of authoring every case.
    getExpectedStandardErrors: () => [
      [{message: 'Expected objectLiteral', path: [], expected: 'objectLiteral'}],
      [{message: 'Expected objectLiteral', path: [], expected: 'objectLiteral'}],
      [{message: 'Expected string', path: ['name'], expected: 'string'}],
      [{message: 'Expected date', path: ['createdAt'], expected: 'date'}],
      [{message: 'Expected objectLiteral', path: [], expected: 'objectLiteral'}],
      [{message: 'Expected objectLiteral', path: [], expected: 'objectLiteral'}],
      [{message: 'Expected date', path: ['createdAt'], expected: 'date'}],
      [{message: 'Expected objectLiteral', path: [], expected: 'objectLiteral'}],
      [{message: 'Expected objectLiteral', path: [], expected: 'objectLiteral'}],
      [{message: 'Expected number', path: ['age'], expected: 'number'}],
    ],
    validateDataOnly: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      return createValidateFn<DataOnly<Partial<Person>>>();
    },
    validateSchema: () => createValidateFn(RT.partial(RT.object({name: TF.string(), age: TF.number(), createdAt: TF.date()}))),
    deserializeValidate: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      return deserializeValidate<Partial<Person>>();
    },
    validateReflect: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      const v: Partial<Person> = {};
      return createValidateFn(v);
    },
    deserializeValidateReflect: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      const v: Partial<Person> = {};
      return deserializeValidate(v);
    },
    getValidationErrors: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      return createGetValidationErrorsFn<Partial<Person>>();
    },
    getValidationErrorsDataOnly: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      return createGetValidationErrorsFn<DataOnly<Partial<Person>>>();
    },
    getValidationErrorsSchema: () =>
      createGetValidationErrorsFn(RT.partial(RT.object({name: TF.string(), age: TF.number(), createdAt: TF.date()}))),
    deserializeGetValidationErrors: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      return deserializeGetValidationErrors<Partial<Person>>();
    },
    getValidationErrorsReflect: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      const v: Partial<Person> = {};
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      const v: Partial<Person> = {};
      return deserializeGetValidationErrors(v);
    },
    mockType: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      return createMockDataFn<Partial<Person>>();
    },
    mockTypeReflect: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      const v: Partial<Person> = {};
      return createMockDataFn(v);
    },
    getSamples: () => ({
      valid: [{}, {name: 'John'}, {createdAt: new Date()}, {name: 'John', age: 30, createdAt: new Date()}],
      invalid: [
        [], // allOptionalCode rejects arrays
        new Date(), // allOptionalCode rejects native objects
        {name: 42}, // wrong type when prop is present
        {createdAt: 'not date'},
        null,
        undefined,
        {createdAt: new Date('invalid')}, // Invalid Date in optional prop
        new Map(),
        new Set(),
        {age: NaN}, // NaN at optional number
      ],
    }),
    // allOptionalCode guards the outer check, so non-plain-object
    // inputs (arrays, Date, Map, Set) report 'objectLiteral'.
    // Plain objects with bad prop types pass the outer guard and
    // fall through to per-property error accumulation.
    getExpectedErrors: () => [
      [{path: [], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: ['name'], expected: 'string'}],
      [{path: ['createdAt'], expected: 'date'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: ['createdAt'], expected: 'date'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: ['age'], expected: 'number'}],
    ],
  },

  required: {
    title: 'Required',
    description:
      'utility/required.spec.ts makes all properties required, resolving to a plain object literal and reusing the object emit.',
    validateNotes:
      'Optional props become required, so a value missing any of them now FAILS — `{}` and `{name: "John"}` are rejected (they were valid under the original optional shape).',
    validate: () => {
      interface MaybePerson {
        name?: string;
        age?: number;
        createdAt?: Date;
      }
      return createValidateFn<Required<MaybePerson>>();
    },
    standardSchema: () => {
      interface MaybePerson {
        name?: string;
        age?: number;
        createdAt?: Date;
      }
      return createStandardSchema<Required<MaybePerson>>();
    },
    validateDataOnly: () => {
      interface MaybePerson {
        name?: string;
        age?: number;
        createdAt?: Date;
      }
      return createValidateFn<DataOnly<Required<MaybePerson>>>();
    },
    validateSchema: () =>
      createValidateFn(
        RT.required(RT.object({name: RT.optional(TF.string()), age: RT.optional(TF.number()), createdAt: RT.optional(TF.date())}))
      ),
    deserializeValidate: () => {
      interface MaybePerson {
        name?: string;
        age?: number;
        createdAt?: Date;
      }
      return deserializeValidate<Required<MaybePerson>>();
    },
    validateReflect: () => {
      interface MaybePerson {
        name?: string;
        age?: number;
        createdAt?: Date;
      }
      const v: Required<MaybePerson> = {name: 'John', age: 30, createdAt: new Date()};
      return createValidateFn(v);
    },
    deserializeValidateReflect: () => {
      interface MaybePerson {
        name?: string;
        age?: number;
        createdAt?: Date;
      }
      const v: Required<MaybePerson> = {name: 'John', age: 30, createdAt: new Date()};
      return deserializeValidate(v);
    },
    getValidationErrors: () => {
      interface MaybePerson {
        name?: string;
        age?: number;
        createdAt?: Date;
      }
      return createGetValidationErrorsFn<Required<MaybePerson>>();
    },
    getValidationErrorsDataOnly: () => {
      interface MaybePerson {
        name?: string;
        age?: number;
        createdAt?: Date;
      }
      return createGetValidationErrorsFn<DataOnly<Required<MaybePerson>>>();
    },
    getValidationErrorsSchema: () =>
      createGetValidationErrorsFn(
        RT.required(RT.object({name: RT.optional(TF.string()), age: RT.optional(TF.number()), createdAt: RT.optional(TF.date())}))
      ),
    deserializeGetValidationErrors: () => {
      interface MaybePerson {
        name?: string;
        age?: number;
        createdAt?: Date;
      }
      return deserializeGetValidationErrors<Required<MaybePerson>>();
    },
    getValidationErrorsReflect: () => {
      interface MaybePerson {
        name?: string;
        age?: number;
        createdAt?: Date;
      }
      const v: Required<MaybePerson> = {name: 'John', age: 30, createdAt: new Date()};
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      interface MaybePerson {
        name?: string;
        age?: number;
        createdAt?: Date;
      }
      const v: Required<MaybePerson> = {name: 'John', age: 30, createdAt: new Date()};
      return deserializeGetValidationErrors(v);
    },
    mockType: () => {
      interface MaybePerson {
        name?: string;
        age?: number;
        createdAt?: Date;
      }
      return createMockDataFn<Required<MaybePerson>>();
    },
    mockTypeReflect: () => {
      interface MaybePerson {
        name?: string;
        age?: number;
        createdAt?: Date;
      }
      const v: Required<MaybePerson> = {name: 'John', age: 30, createdAt: new Date()};
      return createMockDataFn(v);
    },
    getSamples: () => ({
      valid: [{name: 'John', age: 30, createdAt: new Date()}],
      invalid: [
        {},
        {name: 'John'}, // missing age + createdAt
        {name: 'John', age: 30}, // missing createdAt
        {name: 'John', age: 30, createdAt: 'not date'}, // wrong type
        null,
        undefined,
        {name: 'John', age: NaN, createdAt: new Date()}, // NaN at age
        {name: 'John', age: 30, createdAt: new Date('invalid')}, // Invalid Date
      ],
    }),
    getExpectedErrors: () => [
      // {} — every required prop missing.
      [
        {path: ['name'], expected: 'string'},
        {path: ['age'], expected: 'number'},
        {path: ['createdAt'], expected: 'date'},
      ],
      [
        {path: ['age'], expected: 'number'},
        {path: ['createdAt'], expected: 'date'},
      ],
      [{path: ['createdAt'], expected: 'date'}],
      [{path: ['createdAt'], expected: 'date'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: ['age'], expected: 'number'}],
      [{path: ['createdAt'], expected: 'date'}],
    ],
  },

  pick: {
    title: 'Pick',
    description: 'utility/pick.spec.ts keeps only the named properties, resolving to {name: string; createdAt: Date}.',
    validateNotes:
      'Resolves to a fixed-property object with only the picked keys. Extra properties on the input still pass (structural typing).',
    validate: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      return createValidateFn<Pick<Person, 'name' | 'createdAt'>>();
    },
    standardSchema: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      return createStandardSchema<Pick<Person, 'name' | 'createdAt'>>();
    },
    validateDataOnly: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      return createValidateFn<DataOnly<Pick<Person, 'name' | 'createdAt'>>>();
    },
    validateSchema: () =>
      createValidateFn(RT.pick(RT.object({name: TF.string(), age: TF.number(), createdAt: TF.date()}), ['name', 'createdAt'])),
    deserializeValidate: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      return deserializeValidate<Pick<Person, 'name' | 'createdAt'>>();
    },
    validateReflect: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      const v: Pick<Person, 'name' | 'createdAt'> = {name: 'John', createdAt: new Date()};
      return createValidateFn(v);
    },
    deserializeValidateReflect: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      const v: Pick<Person, 'name' | 'createdAt'> = {name: 'John', createdAt: new Date()};
      return deserializeValidate(v);
    },
    getValidationErrors: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      return createGetValidationErrorsFn<Pick<Person, 'name' | 'createdAt'>>();
    },
    getValidationErrorsDataOnly: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      return createGetValidationErrorsFn<DataOnly<Pick<Person, 'name' | 'createdAt'>>>();
    },
    getValidationErrorsSchema: () =>
      createGetValidationErrorsFn(
        RT.pick(RT.object({name: TF.string(), age: TF.number(), createdAt: TF.date()}), ['name', 'createdAt'])
      ),
    deserializeGetValidationErrors: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      return deserializeGetValidationErrors<Pick<Person, 'name' | 'createdAt'>>();
    },
    getValidationErrorsReflect: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      const v: Pick<Person, 'name' | 'createdAt'> = {name: 'John', createdAt: new Date()};
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      const v: Pick<Person, 'name' | 'createdAt'> = {name: 'John', createdAt: new Date()};
      return deserializeGetValidationErrors(v);
    },
    mockType: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      return createMockDataFn<Pick<Person, 'name' | 'createdAt'>>();
    },
    mockTypeReflect: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      const v: Pick<Person, 'name' | 'createdAt'> = {name: 'John', createdAt: new Date()};
      return createMockDataFn(v);
    },
    getSamples: () => ({
      valid: [
        {name: 'John', createdAt: new Date()},
        // Extra props pass (Pick doesn't imply strict)
        {name: 'John', age: 30, createdAt: new Date()},
      ],
      invalid: [
        {name: 'John'}, // missing createdAt
        {createdAt: new Date()}, // missing name
        {name: 42, createdAt: new Date()},
        null,
        undefined,
        {name: 'John', createdAt: new Date('invalid')},
      ],
    }),
    getExpectedErrors: () => [
      [{path: ['createdAt'], expected: 'date'}],
      [{path: ['name'], expected: 'string'}],
      [{path: ['name'], expected: 'string'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: ['createdAt'], expected: 'date'}],
    ],
  },

  omit: {
    title: 'Omit',
    description: 'utility/omit.spec.ts drops the named properties, resolving to {name: string; createdAt: Date}.',
    validateNotes:
      'Resolves to the original shape minus the omitted keys. The omitted property can still appear on the input — structural typing accepts extras.',
    validate: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      return createValidateFn<Omit<Person, 'age'>>();
    },
    standardSchema: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      return createStandardSchema<Omit<Person, 'age'>>();
    },
    validateDataOnly: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      return createValidateFn<DataOnly<Omit<Person, 'age'>>>();
    },
    validateSchema: () =>
      createValidateFn(RT.omit(RT.object({name: TF.string(), age: TF.number(), createdAt: TF.date()}), ['age'])),
    deserializeValidate: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      return deserializeValidate<Omit<Person, 'age'>>();
    },
    validateReflect: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      const v: Omit<Person, 'age'> = {name: 'John', createdAt: new Date()};
      return createValidateFn(v);
    },
    deserializeValidateReflect: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      const v: Omit<Person, 'age'> = {name: 'John', createdAt: new Date()};
      return deserializeValidate(v);
    },
    getValidationErrors: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      return createGetValidationErrorsFn<Omit<Person, 'age'>>();
    },
    getValidationErrorsDataOnly: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      return createGetValidationErrorsFn<DataOnly<Omit<Person, 'age'>>>();
    },
    getValidationErrorsSchema: () =>
      createGetValidationErrorsFn(RT.omit(RT.object({name: TF.string(), age: TF.number(), createdAt: TF.date()}), ['age'])),
    deserializeGetValidationErrors: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      return deserializeGetValidationErrors<Omit<Person, 'age'>>();
    },
    getValidationErrorsReflect: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      const v: Omit<Person, 'age'> = {name: 'John', createdAt: new Date()};
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      const v: Omit<Person, 'age'> = {name: 'John', createdAt: new Date()};
      return deserializeGetValidationErrors(v);
    },
    mockType: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      return createMockDataFn<Omit<Person, 'age'>>();
    },
    mockTypeReflect: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      const v: Omit<Person, 'age'> = {name: 'John', createdAt: new Date()};
      return createMockDataFn(v);
    },
    getSamples: () => ({
      valid: [
        {name: 'John', createdAt: new Date()},
        {name: 'John', age: 30, createdAt: new Date()}, // extra prop still passes
      ],
      invalid: [{name: 'John'}, {createdAt: new Date()}, null, undefined, {name: 'John', createdAt: new Date('invalid')}],
    }),
    getExpectedErrors: () => [
      [{path: ['createdAt'], expected: 'date'}],
      [{path: ['name'], expected: 'string'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: ['createdAt'], expected: 'date'}],
    ],
  },

  exclude_atomic: {
    title: 'Exclude',
    description:
      'utility/exclude.spec.ts (atomic case) excludes members of a string-literal union, resolving to "name" | "createdAt".',
    validateNotes: 'Resolves the union down to the two surviving members, so the excluded "age" now FAILS the union check.',
    validate: () => createValidateFn<Exclude<'name' | 'age' | 'createdAt', 'age'>>(),
    standardSchema: () => createStandardSchema<Exclude<'name' | 'age' | 'createdAt', 'age'>>(),
    validateDataOnly: () => createValidateFn<DataOnly<Exclude<'name' | 'age' | 'createdAt', 'age'>>>(),
    validateSchema: () =>
      createValidateFn(RT.exclude(RT.union([RT.literal('name'), RT.literal('age'), RT.literal('createdAt')]), RT.literal('age'))),
    deserializeValidate: () => deserializeValidate<Exclude<'name' | 'age' | 'createdAt', 'age'>>(),
    validateReflect: () => {
      const v: Exclude<'name' | 'age' | 'createdAt', 'age'> = 'name';
      return createValidateFn(v);
    },
    deserializeValidateReflect: () => {
      const v: Exclude<'name' | 'age' | 'createdAt', 'age'> = 'name';
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrorsFn<Exclude<'name' | 'age' | 'createdAt', 'age'>>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<Exclude<'name' | 'age' | 'createdAt', 'age'>>>(),
    getValidationErrorsSchema: () =>
      createGetValidationErrorsFn(
        RT.exclude(RT.union([RT.literal('name'), RT.literal('age'), RT.literal('createdAt')]), RT.literal('age'))
      ),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<Exclude<'name' | 'age' | 'createdAt', 'age'>>(),
    getValidationErrorsReflect: () => {
      const v: Exclude<'name' | 'age' | 'createdAt', 'age'> = 'name';
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: Exclude<'name' | 'age' | 'createdAt', 'age'> = 'name';
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockDataFn<Exclude<'name' | 'age' | 'createdAt', 'age'>>(),
    mockTypeReflect: () => {
      const v: Exclude<'name' | 'age' | 'createdAt', 'age'> = 'name';
      return createMockDataFn(v);
    },
    getSamples: () => ({
      valid: ['name', 'createdAt'],
      invalid: ['age', 'other', 42, null, undefined, true, '', 'Name'],
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

  extract_atomic: {
    title: 'Extract',
    description:
      'utility/extract.spec.ts (atomic case) extracts the matching members of a string-literal union, resolving to "name" | "createdAt".',
    validateNotes: 'Keeps only the members assignable to the filter, so the dropped "age" now FAILS the union check.',
    validate: () => createValidateFn<Extract<'name' | 'age' | 'createdAt', 'name' | 'createdAt'>>(),
    standardSchema: () => createStandardSchema<Extract<'name' | 'age' | 'createdAt', 'name' | 'createdAt'>>(),
    validateDataOnly: () => createValidateFn<DataOnly<Extract<'name' | 'age' | 'createdAt', 'name' | 'createdAt'>>>(),
    validateSchema: () =>
      createValidateFn(
        RT.extract(
          RT.union([RT.literal('name'), RT.literal('age'), RT.literal('createdAt')]),
          RT.union([RT.literal('name'), RT.literal('createdAt')])
        )
      ),
    deserializeValidate: () => deserializeValidate<Extract<'name' | 'age' | 'createdAt', 'name' | 'createdAt'>>(),
    validateReflect: () => {
      const v: Extract<'name' | 'age' | 'createdAt', 'name' | 'createdAt'> = 'name';
      return createValidateFn(v);
    },
    deserializeValidateReflect: () => {
      const v: Extract<'name' | 'age' | 'createdAt', 'name' | 'createdAt'> = 'name';
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrorsFn<Extract<'name' | 'age' | 'createdAt', 'name' | 'createdAt'>>(),
    getValidationErrorsDataOnly: () =>
      createGetValidationErrorsFn<DataOnly<Extract<'name' | 'age' | 'createdAt', 'name' | 'createdAt'>>>(),
    getValidationErrorsSchema: () =>
      createGetValidationErrorsFn(
        RT.extract(
          RT.union([RT.literal('name'), RT.literal('age'), RT.literal('createdAt')]),
          RT.union([RT.literal('name'), RT.literal('createdAt')])
        )
      ),
    deserializeGetValidationErrors: () =>
      deserializeGetValidationErrors<Extract<'name' | 'age' | 'createdAt', 'name' | 'createdAt'>>(),
    getValidationErrorsReflect: () => {
      const v: Extract<'name' | 'age' | 'createdAt', 'name' | 'createdAt'> = 'name';
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: Extract<'name' | 'age' | 'createdAt', 'name' | 'createdAt'> = 'name';
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockDataFn<Extract<'name' | 'age' | 'createdAt', 'name' | 'createdAt'>>(),
    mockTypeReflect: () => {
      const v: Extract<'name' | 'age' | 'createdAt', 'name' | 'createdAt'> = 'name';
      return createMockDataFn(v);
    },
    getSamples: () => ({
      valid: ['name', 'createdAt'],
      invalid: ['age', 'other', null, undefined, true, 42, '', 'Name'],
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

  exclude_from_object_union: {
    title: 'Exclude object union',
    description: 'utility/exclude.spec.ts (object union) excludes object members from a discriminated union.',
    validateNotes:
      'Drops the `circle` arm from the union, so `{kind: "circle", radius: 3}` now FAILS — only the `square` and `triangle` shapes remain valid.',
    validate: () => {
      type Shape =
        | {kind: 'circle'; radius: number}
        | {kind: 'square'; x: number}
        | {kind: 'triangle'; base: number; height: number};
      return createValidateFn<Exclude<Shape, {kind: 'circle'}>>();
    },
    standardSchema: () => {
      type Shape =
        | {kind: 'circle'; radius: number}
        | {kind: 'square'; x: number}
        | {kind: 'triangle'; base: number; height: number};
      return createStandardSchema<Exclude<Shape, {kind: 'circle'}>>();
    },
    validateDataOnly: () => {
      type Shape =
        | {kind: 'circle'; radius: number}
        | {kind: 'square'; x: number}
        | {kind: 'triangle'; base: number; height: number};
      return createValidateFn<DataOnly<Exclude<Shape, {kind: 'circle'}>>>();
    },
    validateSchema: () =>
      createValidateFn(
        RT.exclude(
          RT.union([
            RT.object({kind: RT.literal('circle'), radius: TF.number()}),
            RT.object({kind: RT.literal('square'), x: TF.number()}),
            RT.object({kind: RT.literal('triangle'), base: TF.number(), height: TF.number()}),
          ]),
          RT.object({kind: RT.literal('circle')})
        )
      ),
    deserializeValidate: () => {
      type Shape =
        | {kind: 'circle'; radius: number}
        | {kind: 'square'; x: number}
        | {kind: 'triangle'; base: number; height: number};
      return deserializeValidate<Exclude<Shape, {kind: 'circle'}>>();
    },
    validateReflect: () => {
      type Shape =
        | {kind: 'circle'; radius: number}
        | {kind: 'square'; x: number}
        | {kind: 'triangle'; base: number; height: number};
      const v: Exclude<Shape, {kind: 'circle'}> = {kind: 'square', x: 5};
      return createValidateFn(v);
    },
    deserializeValidateReflect: () => {
      type Shape =
        | {kind: 'circle'; radius: number}
        | {kind: 'square'; x: number}
        | {kind: 'triangle'; base: number; height: number};
      const v: Exclude<Shape, {kind: 'circle'}> = {kind: 'square', x: 5};
      return deserializeValidate(v);
    },
    getValidationErrors: () => {
      type Shape =
        | {kind: 'circle'; radius: number}
        | {kind: 'square'; x: number}
        | {kind: 'triangle'; base: number; height: number};
      return createGetValidationErrorsFn<Exclude<Shape, {kind: 'circle'}>>();
    },
    getValidationErrorsDataOnly: () => {
      type Shape =
        | {kind: 'circle'; radius: number}
        | {kind: 'square'; x: number}
        | {kind: 'triangle'; base: number; height: number};
      return createGetValidationErrorsFn<DataOnly<Exclude<Shape, {kind: 'circle'}>>>();
    },
    getValidationErrorsSchema: () =>
      createGetValidationErrorsFn(
        RT.exclude(
          RT.union([
            RT.object({kind: RT.literal('circle'), radius: TF.number()}),
            RT.object({kind: RT.literal('square'), x: TF.number()}),
            RT.object({kind: RT.literal('triangle'), base: TF.number(), height: TF.number()}),
          ]),
          RT.object({kind: RT.literal('circle')})
        )
      ),
    deserializeGetValidationErrors: () => {
      type Shape =
        | {kind: 'circle'; radius: number}
        | {kind: 'square'; x: number}
        | {kind: 'triangle'; base: number; height: number};
      return deserializeGetValidationErrors<Exclude<Shape, {kind: 'circle'}>>();
    },
    getValidationErrorsReflect: () => {
      type Shape =
        | {kind: 'circle'; radius: number}
        | {kind: 'square'; x: number}
        | {kind: 'triangle'; base: number; height: number};
      const v: Exclude<Shape, {kind: 'circle'}> = {kind: 'square', x: 5};
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      type Shape =
        | {kind: 'circle'; radius: number}
        | {kind: 'square'; x: number}
        | {kind: 'triangle'; base: number; height: number};
      const v: Exclude<Shape, {kind: 'circle'}> = {kind: 'square', x: 5};
      return deserializeGetValidationErrors(v);
    },
    mockType: () => {
      type Shape =
        | {kind: 'circle'; radius: number}
        | {kind: 'square'; x: number}
        | {kind: 'triangle'; base: number; height: number};
      return createMockDataFn<Exclude<Shape, {kind: 'circle'}>>();
    },
    mockTypeReflect: () => {
      type Shape =
        | {kind: 'circle'; radius: number}
        | {kind: 'square'; x: number}
        | {kind: 'triangle'; base: number; height: number};
      const v: Exclude<Shape, {kind: 'circle'}> = {kind: 'square', x: 5};
      return createMockDataFn(v);
    },
    getSamples: () => ({
      valid: [
        {kind: 'square', x: 5},
        {kind: 'triangle', base: 4, height: 3},
      ],
      invalid: [
        {kind: 'circle', radius: 3},
        {},
        null,
        undefined,
        {kind: 'square'}, // missing x
        {kind: 'square', x: NaN}, // NaN at x
        {kind: 'triangle', base: 4}, // missing height
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

  non_nullable: {
    title: 'NonNullable',
    description: 'utility/nonNullable.spec.ts strips null and undefined from a union.',
    validateNotes:
      'Drops `null` and `undefined` from the union, so both now FAIL the union check; only `string` and `number` members pass.',
    validate: () => createValidateFn<NonNullable<string | number | null | undefined>>(),
    standardSchema: () => createStandardSchema<NonNullable<string | number | null | undefined>>(),
    validateDataOnly: () => createValidateFn<DataOnly<NonNullable<string | number | null | undefined>>>(),
    validateSchema: () =>
      createValidateFn(RT.nonNullable(RT.union([TF.string(), TF.number(), RT.literal(null), RT.literal(undefined)]))),
    deserializeValidate: () => deserializeValidate<NonNullable<string | number | null | undefined>>(),
    validateReflect: () => {
      const v: NonNullable<string | number | null | undefined> = 'hello';
      return createValidateFn(v);
    },
    deserializeValidateReflect: () => {
      const v: NonNullable<string | number | null | undefined> = 'hello';
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrorsFn<NonNullable<string | number | null | undefined>>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<NonNullable<string | number | null | undefined>>>(),
    getValidationErrorsSchema: () =>
      createGetValidationErrorsFn(RT.nonNullable(RT.union([TF.string(), TF.number(), RT.literal(null), RT.literal(undefined)]))),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<NonNullable<string | number | null | undefined>>(),
    getValidationErrorsReflect: () => {
      const v: NonNullable<string | number | null | undefined> = 'hello';
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: NonNullable<string | number | null | undefined> = 'hello';
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockDataFn<NonNullable<string | number | null | undefined>>(),
    mockTypeReflect: () => {
      const v: NonNullable<string | number | null | undefined> = 'hello';
      return createMockDataFn(v);
    },
    getSamples: () => ({
      valid: ['hello', 42, 0],
      invalid: [null, undefined, true, {}, [], NaN, Infinity],
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

  return_type: {
    title: 'ReturnType',
    description: "utility/params-return.spec.ts extracts a function's return type, resolving to Date.",
    validateNotes:
      "Resolves to the function's return type (`Date`), so the validator checks for a valid Date instance — NOT a function. Invalid Dates (`new Date(NaN)`) are rejected like any other Date case.",
    validate: () => {
      type Fn = (a: number, b: boolean) => Date;
      return createValidateFn<ReturnType<Fn>>();
    },
    standardSchema: () => {
      type Fn = (a: number, b: boolean) => Date;
      return createStandardSchema<ReturnType<Fn>>();
    },
    validateDataOnly: () => {
      type Fn = (a: number, b: boolean) => Date;
      return createValidateFn<DataOnly<ReturnType<Fn>>>();
    },
    validateSchema: () => createValidateFn(RT.returnType(RT.func([TF.number(), RT.boolean()], TF.date()))),
    deserializeValidate: () => {
      type Fn = (a: number, b: boolean) => Date;
      return deserializeValidate<ReturnType<Fn>>();
    },
    validateReflect: () => {
      type Fn = (a: number, b: boolean) => Date;
      const v: ReturnType<Fn> = new Date();
      return createValidateFn(v);
    },
    deserializeValidateReflect: () => {
      type Fn = (a: number, b: boolean) => Date;
      const v: ReturnType<Fn> = new Date();
      return deserializeValidate(v);
    },
    getValidationErrors: () => {
      type Fn = (a: number, b: boolean) => Date;
      return createGetValidationErrorsFn<ReturnType<Fn>>();
    },
    getValidationErrorsDataOnly: () => {
      type Fn = (a: number, b: boolean) => Date;
      return createGetValidationErrorsFn<DataOnly<ReturnType<Fn>>>();
    },
    getValidationErrorsSchema: () => createGetValidationErrorsFn(RT.returnType(RT.func([TF.number(), RT.boolean()], TF.date()))),
    deserializeGetValidationErrors: () => {
      type Fn = (a: number, b: boolean) => Date;
      return deserializeGetValidationErrors<ReturnType<Fn>>();
    },
    getValidationErrorsReflect: () => {
      type Fn = (a: number, b: boolean) => Date;
      const v: ReturnType<Fn> = new Date();
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      type Fn = (a: number, b: boolean) => Date;
      const v: ReturnType<Fn> = new Date();
      return deserializeGetValidationErrors(v);
    },
    mockType: () => {
      type Fn = (a: number, b: boolean) => Date;
      return createMockDataFn<ReturnType<Fn>>();
    },
    mockTypeReflect: () => {
      type Fn = (a: number, b: boolean) => Date;
      const v: ReturnType<Fn> = new Date();
      return createMockDataFn(v);
    },
    getSamples: () => ({
      valid: [new Date()],
      invalid: ['not date', 42, null, undefined, new Date('invalid'), new Date(NaN), {}, []],
    }),
    getExpectedErrors: () => [
      [{path: [], expected: 'date'}],
      [{path: [], expected: 'date'}],
      [{path: [], expected: 'date'}],
      [{path: [], expected: 'date'}],
      [{path: [], expected: 'date'}],
      [{path: [], expected: 'date'}],
      [{path: [], expected: 'date'}],
      [{path: [], expected: 'date'}],
    ],
  },

  readonly: {
    title: 'Readonly',
    description:
      'Readonly<T> marks properties readonly at the TS layer, but the readonly bit is erased at runtime so the validator behaves identically to the source object (regression check).',
    validate: () => {
      interface Person {
        name: string;
        age: number;
      }
      return createValidateFn<Readonly<Person>>();
    },
    standardSchema: () => {
      interface Person {
        name: string;
        age: number;
      }
      return createStandardSchema<Readonly<Person>>();
    },
    validateDataOnly: () => {
      interface Person {
        name: string;
        age: number;
      }
      return createValidateFn<DataOnly<Readonly<Person>>>();
    },
    validateSchema: () => createValidateFn(RT.readonly(RT.object({name: TF.string(), age: TF.number()}))),
    deserializeValidate: () => {
      interface Person {
        name: string;
        age: number;
      }
      return deserializeValidate<Readonly<Person>>();
    },
    validateReflect: () => {
      interface Person {
        name: string;
        age: number;
      }
      const v: Readonly<Person> = {name: 'John', age: 30};
      return createValidateFn(v);
    },
    deserializeValidateReflect: () => {
      interface Person {
        name: string;
        age: number;
      }
      const v: Readonly<Person> = {name: 'John', age: 30};
      return deserializeValidate(v);
    },
    getValidationErrors: () => {
      interface Person {
        name: string;
        age: number;
      }
      return createGetValidationErrorsFn<Readonly<Person>>();
    },
    getValidationErrorsDataOnly: () => {
      interface Person {
        name: string;
        age: number;
      }
      return createGetValidationErrorsFn<DataOnly<Readonly<Person>>>();
    },
    getValidationErrorsSchema: () => createGetValidationErrorsFn(RT.readonly(RT.object({name: TF.string(), age: TF.number()}))),
    deserializeGetValidationErrors: () => {
      interface Person {
        name: string;
        age: number;
      }
      return deserializeGetValidationErrors<Readonly<Person>>();
    },
    getValidationErrorsReflect: () => {
      interface Person {
        name: string;
        age: number;
      }
      const v: Readonly<Person> = {name: 'John', age: 30};
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      interface Person {
        name: string;
        age: number;
      }
      const v: Readonly<Person> = {name: 'John', age: 30};
      return deserializeGetValidationErrors(v);
    },
    mockType: () => {
      interface Person {
        name: string;
        age: number;
      }
      return createMockDataFn<Readonly<Person>>();
    },
    mockTypeReflect: () => {
      interface Person {
        name: string;
        age: number;
      }
      const v: Readonly<Person> = {name: 'John', age: 30};
      return createMockDataFn(v);
    },
    getSamples: () => ({
      valid: [
        {name: 'John', age: 30},
        {name: '', age: 0},
      ],
      invalid: [{name: 'John'}, {age: 30}, null, undefined, {name: 1, age: 30}, {name: 'John', age: NaN}],
    }),
    getExpectedErrors: () => [
      [{path: ['age'], expected: 'number'}],
      [{path: ['name'], expected: 'string'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: ['name'], expected: 'string'}],
      [{path: ['age'], expected: 'number'}],
    ],
  },

  // String-mapping utilities (Uppercase / Lowercase / Capitalize /
  // Uncapitalize) are intentionally not covered here. They work as
  // pure type-system literal mappings (`Uppercase<'foo'>` resolves
  // to `'FOO'` and validates via the existing literal-equality
  // check) but the CONSTRAINT form — "is this any uppercase
  // string" — is a value-shape predicate, not a type check, and
  // lives in the future validation-constraints library alongside
  // the number brand types (int / uint8 / Range<a, b> / etc.).
  // The reference utility/string.spec.ts is `.skip()`'d for the
  // same reason.

  intersection_with_required_override: {
    title: 'Intersection override',
    description:
      'An intersection that flips a property\'s optionality — `Partial<Person>` makes all props optional, then `& Required<Pick<Person, "name">>` re-requires only `name`, so tsgo resolves the intersection to {name: string; age?: number; createdAt?: Date} and reuses the object emit.',
    validateNotes:
      "Intersections of utility types resolve at the type-checker layer to a single flat object shape. Use this pattern to flip a specific property's optionality without re-declaring the whole type.",
    validate: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      return createValidateFn<Partial<Person> & Required<Pick<Person, 'name'>>>();
    },
    standardSchema: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      return createStandardSchema<Partial<Person> & Required<Pick<Person, 'name'>>>();
    },
    validateDataOnly: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      return createValidateFn<DataOnly<Partial<Person> & Required<Pick<Person, 'name'>>>>();
    },
    validateSchema: () =>
      createValidateFn(
        RT.intersection(
          RT.partial(RT.object({name: TF.string(), age: TF.number(), createdAt: TF.date()})),
          RT.required(RT.pick(RT.object({name: TF.string(), age: TF.number(), createdAt: TF.date()}), ['name']))
        )
      ),
    deserializeValidate: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      return deserializeValidate<Partial<Person> & Required<Pick<Person, 'name'>>>();
    },
    validateReflect: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      const v: Partial<Person> & Required<Pick<Person, 'name'>> = {name: 'John'};
      return createValidateFn(v);
    },
    deserializeValidateReflect: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      const v: Partial<Person> & Required<Pick<Person, 'name'>> = {name: 'John'};
      return deserializeValidate(v);
    },
    getValidationErrors: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      return createGetValidationErrorsFn<Partial<Person> & Required<Pick<Person, 'name'>>>();
    },
    getValidationErrorsDataOnly: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      return createGetValidationErrorsFn<DataOnly<Partial<Person> & Required<Pick<Person, 'name'>>>>();
    },
    getValidationErrorsSchema: () =>
      createGetValidationErrorsFn(
        RT.intersection(
          RT.partial(RT.object({name: TF.string(), age: TF.number(), createdAt: TF.date()})),
          RT.required(RT.pick(RT.object({name: TF.string(), age: TF.number(), createdAt: TF.date()}), ['name']))
        )
      ),
    deserializeGetValidationErrors: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      return deserializeGetValidationErrors<Partial<Person> & Required<Pick<Person, 'name'>>>();
    },
    getValidationErrorsReflect: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      const v: Partial<Person> & Required<Pick<Person, 'name'>> = {name: 'John'};
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      const v: Partial<Person> & Required<Pick<Person, 'name'>> = {name: 'John'};
      return deserializeGetValidationErrors(v);
    },
    mockType: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      return createMockDataFn<Partial<Person> & Required<Pick<Person, 'name'>>>();
    },
    mockTypeReflect: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      const v: Partial<Person> & Required<Pick<Person, 'name'>> = {name: 'John'};
      return createMockDataFn(v);
    },
    getSamples: () => ({
      valid: [
        {name: 'John'},
        {name: 'John', age: 30},
        {name: 'John', createdAt: new Date()},
        {name: 'John', age: 30, createdAt: new Date()},
      ],
      invalid: [
        {}, // name is required
        {age: 30}, // name still required
        {name: 42}, // wrong type
        {name: 'John', age: '30'}, // wrong type at optional slot
        null,
        undefined,
        {name: 'John', age: NaN}, // NaN at optional
        {name: 'John', createdAt: new Date('invalid')}, // Invalid Date in optional
      ],
    }),
    getExpectedErrors: () => [
      [{path: ['name'], expected: 'string'}],
      [{path: ['name'], expected: 'string'}],
      [{path: ['name'], expected: 'string'}],
      [{path: ['age'], expected: 'number'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: ['age'], expected: 'number'}],
      [{path: ['createdAt'], expected: 'date'}],
    ],
  },

  omit_keeping_optional: {
    title: 'Omit optionality',
    description: 'Omit preserves the optionality of the remaining properties, resolving to {b?: number; c: boolean}.',
    validateNotes:
      '`c` stays required and `b` stays optional after the omit, so a value missing `c` FAILS while a value missing `b` passes.',
    validate: () => createValidateFn<Omit<{a: string; b?: number; c: boolean}, 'a'>>(),
    standardSchema: () => createStandardSchema<Omit<{a: string; b?: number; c: boolean}, 'a'>>(),
    validateDataOnly: () => createValidateFn<DataOnly<Omit<{a: string; b?: number; c: boolean}, 'a'>>>(),
    validateSchema: () =>
      createValidateFn(RT.omit(RT.object({a: TF.string(), b: RT.optional(TF.number()), c: RT.boolean()}), ['a'])),
    deserializeValidate: () => deserializeValidate<Omit<{a: string; b?: number; c: boolean}, 'a'>>(),
    validateReflect: () => {
      const v: Omit<{a: string; b?: number; c: boolean}, 'a'> = {c: true};
      return createValidateFn(v);
    },
    deserializeValidateReflect: () => {
      const v: Omit<{a: string; b?: number; c: boolean}, 'a'> = {c: true};
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrorsFn<Omit<{a: string; b?: number; c: boolean}, 'a'>>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<Omit<{a: string; b?: number; c: boolean}, 'a'>>>(),
    getValidationErrorsSchema: () =>
      createGetValidationErrorsFn(RT.omit(RT.object({a: TF.string(), b: RT.optional(TF.number()), c: RT.boolean()}), ['a'])),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<Omit<{a: string; b?: number; c: boolean}, 'a'>>(),
    getValidationErrorsReflect: () => {
      const v: Omit<{a: string; b?: number; c: boolean}, 'a'> = {c: true};
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: Omit<{a: string; b?: number; c: boolean}, 'a'> = {c: true};
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockDataFn<Omit<{a: string; b?: number; c: boolean}, 'a'>>(),
    mockTypeReflect: () => {
      const v: Omit<{a: string; b?: number; c: boolean}, 'a'> = {c: true};
      return createMockDataFn(v);
    },
    getSamples: () => ({
      valid: [{c: true}, {b: 1, c: false}, {c: true, b: undefined}],
      invalid: [{}, {b: 1}, {c: 'not boolean'}, null, undefined, {c: true, b: NaN}, {c: 0}, {b: 1, c: 1}],
    }),
    // `c` is required, `b` is optional. `c` defaults to undefined when
    // missing → boolean check fails. NaN/non-boolean values at `b` or
    // `c` fall through to their atomic checks.
    getExpectedErrors: () => [
      [{path: ['c'], expected: 'boolean'}],
      [{path: ['c'], expected: 'boolean'}],
      [{path: ['c'], expected: 'boolean'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: ['b'], expected: 'number'}],
      [{path: ['c'], expected: 'boolean'}],
      [{path: ['c'], expected: 'boolean'}],
    ],
  },

  keyof_to_literal_union: {
    title: 'keyof',
    description:
      '`keyof Person`, where Person has `name: string; age: number; createdAt: Date`, resolves to the union `"name" | "age" | "createdAt"`, so the validator is the union of three string literals.',
    validateNotes:
      '`keyof T` is resolved at the type-checker layer to a union of the prop names as literals. Validation is identical to a hand-written string literal union.',
    validate: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      return createValidateFn<keyof Person>();
    },
    standardSchema: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      return createStandardSchema<keyof Person>();
    },
    validateDataOnly: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      return createValidateFn<DataOnly<keyof Person>>();
    },
    validateSchema: () => createValidateFn(RT.union([RT.literal('name'), RT.literal('age'), RT.literal('createdAt')])),
    deserializeValidate: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      return deserializeValidate<keyof Person>();
    },
    validateReflect: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      const v: keyof Person = 'name';
      return createValidateFn(v);
    },
    deserializeValidateReflect: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      const v: keyof Person = 'name';
      return deserializeValidate(v);
    },
    getValidationErrors: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      return createGetValidationErrorsFn<keyof Person>();
    },
    getValidationErrorsDataOnly: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      return createGetValidationErrorsFn<DataOnly<keyof Person>>();
    },
    getValidationErrorsSchema: () =>
      createGetValidationErrorsFn(RT.union([RT.literal('name'), RT.literal('age'), RT.literal('createdAt')])),
    deserializeGetValidationErrors: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      return deserializeGetValidationErrors<keyof Person>();
    },
    getValidationErrorsReflect: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      const v: keyof Person = 'name';
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      const v: keyof Person = 'name';
      return deserializeGetValidationErrors(v);
    },
    mockType: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      return createMockDataFn<keyof Person>();
    },
    mockTypeReflect: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      const v: keyof Person = 'name';
      return createMockDataFn(v);
    },
    getSamples: () => ({
      valid: ['name', 'age', 'createdAt'],
      invalid: ['other', '', 42, null, undefined, true, 'Name'],
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

  typeof_variable_query: {
    title: 'typeof query',
    description:
      "`typeof config`, where `config` is a bound value, resolves to the value's static type — without `as const` the type is widened (`url: string`, `port: number`) and with `as const` it pins to literals, and this case verifies the widened path.",
    validateNotes:
      '`typeof <variable>` reads the declared / inferred type of a value. Validation runs against the resolved shape; the value itself is discarded at type-check time.',
    validate: () => {
      const config = {url: 'http://example.com', port: 8080};
      return createValidateFn<typeof config>();
    },
    standardSchema: () => {
      const config = {url: 'http://example.com', port: 8080};
      return createStandardSchema<typeof config>();
    },
    validateDataOnly: () => {
      const config = {url: 'http://example.com', port: 8080};
      return createValidateFn<DataOnly<typeof config>>();
    },
    validateSchema: () => createValidateFn(RT.object({url: TF.string(), port: TF.number()})),
    deserializeValidate: () => {
      const config = {url: 'http://example.com', port: 8080};
      return deserializeValidate<typeof config>();
    },
    validateReflect: () => {
      const config = {url: 'http://example.com', port: 8080};
      return createValidateFn(config);
    },
    deserializeValidateReflect: () => {
      const config = {url: 'http://example.com', port: 8080};
      return deserializeValidate(config);
    },
    getValidationErrors: () => {
      const config = {url: 'http://example.com', port: 8080};
      return createGetValidationErrorsFn<typeof config>();
    },
    getValidationErrorsDataOnly: () => {
      const config = {url: 'http://example.com', port: 8080};
      return createGetValidationErrorsFn<DataOnly<typeof config>>();
    },
    getValidationErrorsSchema: () => createGetValidationErrorsFn(RT.object({url: TF.string(), port: TF.number()})),
    deserializeGetValidationErrors: () => {
      const config = {url: 'http://example.com', port: 8080};
      return deserializeGetValidationErrors<typeof config>();
    },
    getValidationErrorsReflect: () => {
      const config = {url: 'http://example.com', port: 8080};
      return createGetValidationErrorsFn(config);
    },
    deserializeGetValidationErrorsReflect: () => {
      const config = {url: 'http://example.com', port: 8080};
      return deserializeGetValidationErrors(config);
    },
    mockType: () => {
      const config = {url: 'http://example.com', port: 8080};
      return createMockDataFn<typeof config>();
    },
    mockTypeReflect: () => {
      const config = {url: 'http://example.com', port: 8080};
      return createMockDataFn(config);
    },
    getSamples: () => ({
      valid: [
        {url: 'http://example.com', port: 8080},
        {url: '', port: 0},
      ],
      invalid: [
        {url: 'x'}, // missing port
        {port: 80}, // missing url
        {url: 42, port: 8080}, // wrong type
        null,
        undefined,
      ],
    }),
    getExpectedErrors: () => [
      [{path: ['port'], expected: 'number'}],
      [{path: ['url'], expected: 'string'}],
      [{path: ['url'], expected: 'string'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
    ],
  },

  indexed_access_type: {
    title: 'Indexed access',
    description:
      '`T[K]` reads the value type of a property, so `Person["name"]` resolves to `string` at the type-checker layer and the validator is identical to the atomic `string` shape, pinning the resolution path through the cache.',
    validate: () => {
      interface Person {
        name: string;
        age: number;
      }
      return createValidateFn<Person['name']>();
    },
    standardSchema: () => {
      interface Person {
        name: string;
        age: number;
      }
      return createStandardSchema<Person['name']>();
    },
    validateDataOnly: () => {
      interface Person {
        name: string;
        age: number;
      }
      return createValidateFn<DataOnly<Person['name']>>();
    },
    validateSchema: () => createValidateFn(TF.string()),
    deserializeValidate: () => {
      interface Person {
        name: string;
        age: number;
      }
      return deserializeValidate<Person['name']>();
    },
    validateReflect: () => {
      interface Person {
        name: string;
        age: number;
      }
      const v: Person['name'] = 'x';
      return createValidateFn(v);
    },
    deserializeValidateReflect: () => {
      interface Person {
        name: string;
        age: number;
      }
      const v: Person['name'] = 'x';
      return deserializeValidate(v);
    },
    getValidationErrors: () => {
      interface Person {
        name: string;
        age: number;
      }
      return createGetValidationErrorsFn<Person['name']>();
    },
    getValidationErrorsDataOnly: () => {
      interface Person {
        name: string;
        age: number;
      }
      return createGetValidationErrorsFn<DataOnly<Person['name']>>();
    },
    getValidationErrorsSchema: () => createGetValidationErrorsFn(TF.string()),
    deserializeGetValidationErrors: () => {
      interface Person {
        name: string;
        age: number;
      }
      return deserializeGetValidationErrors<Person['name']>();
    },
    getValidationErrorsReflect: () => {
      interface Person {
        name: string;
        age: number;
      }
      const v: Person['name'] = 'x';
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      interface Person {
        name: string;
        age: number;
      }
      const v: Person['name'] = 'x';
      return deserializeGetValidationErrors(v);
    },
    mockType: () => {
      interface Person {
        name: string;
        age: number;
      }
      return createMockDataFn<Person['name']>();
    },
    mockTypeReflect: () => {
      interface Person {
        name: string;
        age: number;
      }
      const v: Person['name'] = 'x';
      return createMockDataFn(v);
    },
    getSamples: () => ({
      valid: ['hello', ''],
      invalid: [42, null, undefined, true],
    }),
    getExpectedErrors: () => [
      [{path: [], expected: 'string'}],
      [{path: [], expected: 'string'}],
      [{path: [], expected: 'string'}],
      [{path: [], expected: 'string'}],
    ],
  },

  conditional_type_resolved: {
    title: 'Conditional type',
    description:
      '`T extends U ? X : Y` resolves at the type-checker layer to either X or Y depending on T, so `IsString<"hello">` resolves to `boolean` here, and validation pins that the conditional threads through to the resolved shape.',
    validate: () => {
      type IsString<T> = T extends string ? boolean : number;
      return createValidateFn<IsString<'hello'>>();
    },
    standardSchema: () => {
      type IsString<T> = T extends string ? boolean : number;
      return createStandardSchema<IsString<'hello'>>();
    },
    validateDataOnly: () => {
      type IsString<T> = T extends string ? boolean : number;
      return createValidateFn<DataOnly<IsString<'hello'>>>();
    },
    validateSchema: () => createValidateFn(RT.boolean()),
    deserializeValidate: () => {
      type IsString<T> = T extends string ? boolean : number;
      return deserializeValidate<IsString<'hello'>>();
    },
    validateReflect: () => {
      type IsString<T> = T extends string ? boolean : number;
      const v: IsString<'hello'> = true;
      return createValidateFn(v);
    },
    deserializeValidateReflect: () => {
      type IsString<T> = T extends string ? boolean : number;
      const v: IsString<'hello'> = true;
      return deserializeValidate(v);
    },
    getValidationErrors: () => {
      type IsString<T> = T extends string ? boolean : number;
      return createGetValidationErrorsFn<IsString<'hello'>>();
    },
    getValidationErrorsDataOnly: () => {
      type IsString<T> = T extends string ? boolean : number;
      return createGetValidationErrorsFn<DataOnly<IsString<'hello'>>>();
    },
    getValidationErrorsSchema: () => createGetValidationErrorsFn(RT.boolean()),
    deserializeGetValidationErrors: () => {
      type IsString<T> = T extends string ? boolean : number;
      return deserializeGetValidationErrors<IsString<'hello'>>();
    },
    getValidationErrorsReflect: () => {
      type IsString<T> = T extends string ? boolean : number;
      const v: IsString<'hello'> = true;
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      type IsString<T> = T extends string ? boolean : number;
      const v: IsString<'hello'> = true;
      return deserializeGetValidationErrors(v);
    },
    mockType: () => {
      type IsString<T> = T extends string ? boolean : number;
      return createMockDataFn<IsString<'hello'>>();
    },
    mockTypeReflect: () => {
      type IsString<T> = T extends string ? boolean : number;
      const v: IsString<'hello'> = true;
      return createMockDataFn(v);
    },
    getSamples: () => ({
      valid: [true, false],
      invalid: [42, 'x', null, undefined, 0, 1],
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

  mapped_type_custom: {
    title: 'Mapped type',
    description:
      'A user-authored mapped type `{[K in keyof T]: T[K] | null}` augments every prop with `| null`, testing that resolver and emit thread custom mapped types correctly while Partial / Required / Pick etc. exercise the same machinery via the built-in utility paths.',
    validateNotes:
      'Each prop resolves to a `T[K] | null` union, so `null` is accepted at every prop but a missing prop still FAILS — the props remain required (mapping adds `| null`, not optionality).',
    validate: () => {
      interface Source {
        a: string;
        b: number;
      }
      type Nullable<T> = {[K in keyof T]: T[K] | null};
      return createValidateFn<Nullable<Source>>();
    },
    standardSchema: () => {
      interface Source {
        a: string;
        b: number;
      }
      type Nullable<T> = {[K in keyof T]: T[K] | null};
      return createStandardSchema<Nullable<Source>>();
    },
    validateDataOnly: () => {
      interface Source {
        a: string;
        b: number;
      }
      type Nullable<T> = {[K in keyof T]: T[K] | null};
      return createValidateFn<DataOnly<Nullable<Source>>>();
    },
    validateSchema: () =>
      createValidateFn(RT.object({a: RT.union([TF.string(), RT.literal(null)]), b: RT.union([TF.number(), RT.literal(null)])})),
    deserializeValidate: () => {
      interface Source {
        a: string;
        b: number;
      }
      type Nullable<T> = {[K in keyof T]: T[K] | null};
      return deserializeValidate<Nullable<Source>>();
    },
    validateReflect: () => {
      interface Source {
        a: string;
        b: number;
      }
      type Nullable<T> = {[K in keyof T]: T[K] | null};
      const v: Nullable<Source> = {a: 'x', b: 1};
      return createValidateFn(v);
    },
    deserializeValidateReflect: () => {
      interface Source {
        a: string;
        b: number;
      }
      type Nullable<T> = {[K in keyof T]: T[K] | null};
      const v: Nullable<Source> = {a: 'x', b: 1};
      return deserializeValidate(v);
    },
    getValidationErrors: () => {
      interface Source {
        a: string;
        b: number;
      }
      type Nullable<T> = {[K in keyof T]: T[K] | null};
      return createGetValidationErrorsFn<Nullable<Source>>();
    },
    getValidationErrorsDataOnly: () => {
      interface Source {
        a: string;
        b: number;
      }
      type Nullable<T> = {[K in keyof T]: T[K] | null};
      return createGetValidationErrorsFn<DataOnly<Nullable<Source>>>();
    },
    getValidationErrorsSchema: () =>
      createGetValidationErrorsFn(
        RT.object({a: RT.union([TF.string(), RT.literal(null)]), b: RT.union([TF.number(), RT.literal(null)])})
      ),
    deserializeGetValidationErrors: () => {
      interface Source {
        a: string;
        b: number;
      }
      type Nullable<T> = {[K in keyof T]: T[K] | null};
      return deserializeGetValidationErrors<Nullable<Source>>();
    },
    getValidationErrorsReflect: () => {
      interface Source {
        a: string;
        b: number;
      }
      type Nullable<T> = {[K in keyof T]: T[K] | null};
      const v: Nullable<Source> = {a: 'x', b: 1};
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      interface Source {
        a: string;
        b: number;
      }
      type Nullable<T> = {[K in keyof T]: T[K] | null};
      const v: Nullable<Source> = {a: 'x', b: 1};
      return deserializeGetValidationErrors(v);
    },
    mockType: () => {
      interface Source {
        a: string;
        b: number;
      }
      type Nullable<T> = {[K in keyof T]: T[K] | null};
      return createMockDataFn<Nullable<Source>>();
    },
    mockTypeReflect: () => {
      interface Source {
        a: string;
        b: number;
      }
      type Nullable<T> = {[K in keyof T]: T[K] | null};
      const v: Nullable<Source> = {a: 'x', b: 1};
      return createMockDataFn(v);
    },
    getSamples: () => ({
      valid: [
        {a: 'x', b: 1},
        {a: null, b: 1},
        {a: 'x', b: null},
        {a: null, b: null},
      ],
      invalid: [
        {a: 42, b: 1}, // a not string|null
        {a: 'x', b: 'not number'}, // b not number|null
        {b: 1}, // missing a (undefined ∉ string|null)
        null,
        undefined,
      ],
    }),
    // Each prop's value is a union (string|null or number|null), so
    // mismatched values produce union-failure errors at the prop path.
    getExpectedErrors: () => [
      [{path: ['a'], expected: 'union'}],
      [{path: ['b'], expected: 'union'}],
      [{path: ['a'], expected: 'union'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
    ],
  },

  mapped_type_with_conditional_value: {
    title: 'Mapped conditional value',
    description:
      '`{[K in keyof T]: FieldFor<T[K]>}`, where `FieldFor<X>` is a conditional that produces a different object shape per input type, has the resolver evaluate the conditional per prop at the type-checker layer so each prop ends up with its own concrete (and different) validator, stress-testing the "two-different-validations-from-one-mapping" pattern.',
    validateNotes:
      'Each prop ends up with a structurally distinct shape — `name` validates as a text field, `age` as a number field, `admin` as a checkbox. The validator emits independent per-prop checks.',
    validate: () => {
      type FieldFor<T> = T extends string
        ? {kind: 'text'; value: string}
        : T extends number
          ? {kind: 'number'; value: number; min?: number}
          : T extends boolean
            ? {kind: 'checkbox'; value: boolean}
            : never;
      interface User {
        name: string;
        age: number;
        admin: boolean;
      }
      type UserForm = {[K in keyof User]: FieldFor<User[K]>};
      return createValidateFn<UserForm>();
    },
    standardSchema: () => {
      type FieldFor<T> = T extends string
        ? {kind: 'text'; value: string}
        : T extends number
          ? {kind: 'number'; value: number; min?: number}
          : T extends boolean
            ? {kind: 'checkbox'; value: boolean}
            : never;
      interface User {
        name: string;
        age: number;
        admin: boolean;
      }
      type UserForm = {[K in keyof User]: FieldFor<User[K]>};
      return createStandardSchema<UserForm>();
    },
    validateDataOnly: () => {
      type FieldFor<T> = T extends string
        ? {kind: 'text'; value: string}
        : T extends number
          ? {kind: 'number'; value: number; min?: number}
          : T extends boolean
            ? {kind: 'checkbox'; value: boolean}
            : never;
      interface User {
        name: string;
        age: number;
        admin: boolean;
      }
      type UserForm = {[K in keyof User]: FieldFor<User[K]>};
      return createValidateFn<DataOnly<UserForm>>();
    },
    validateSchema: () =>
      createValidateFn(
        RT.object({
          name: RT.object({kind: RT.literal('text'), value: TF.string()}),
          age: RT.object({kind: RT.literal('number'), value: TF.number(), min: RT.optional(TF.number())}),
          admin: RT.object({kind: RT.literal('checkbox'), value: RT.boolean()}),
        })
      ),
    deserializeValidate: () => {
      type FieldFor<T> = T extends string
        ? {kind: 'text'; value: string}
        : T extends number
          ? {kind: 'number'; value: number; min?: number}
          : T extends boolean
            ? {kind: 'checkbox'; value: boolean}
            : never;
      interface User {
        name: string;
        age: number;
        admin: boolean;
      }
      type UserForm = {[K in keyof User]: FieldFor<User[K]>};
      return deserializeValidate<UserForm>();
    },
    validateReflect: () => {
      type FieldFor<T> = T extends string
        ? {kind: 'text'; value: string}
        : T extends number
          ? {kind: 'number'; value: number; min?: number}
          : T extends boolean
            ? {kind: 'checkbox'; value: boolean}
            : never;
      interface User {
        name: string;
        age: number;
        admin: boolean;
      }
      type UserForm = {[K in keyof User]: FieldFor<User[K]>};
      const v: UserForm = {
        name: {kind: 'text', value: 'x'},
        age: {kind: 'number', value: 1},
        admin: {kind: 'checkbox', value: true},
      };
      return createValidateFn(v);
    },
    deserializeValidateReflect: () => {
      type FieldFor<T> = T extends string
        ? {kind: 'text'; value: string}
        : T extends number
          ? {kind: 'number'; value: number; min?: number}
          : T extends boolean
            ? {kind: 'checkbox'; value: boolean}
            : never;
      interface User {
        name: string;
        age: number;
        admin: boolean;
      }
      type UserForm = {[K in keyof User]: FieldFor<User[K]>};
      const v: UserForm = {
        name: {kind: 'text', value: 'x'},
        age: {kind: 'number', value: 1},
        admin: {kind: 'checkbox', value: true},
      };
      return deserializeValidate(v);
    },
    getValidationErrors: () => {
      type FieldFor<T> = T extends string
        ? {kind: 'text'; value: string}
        : T extends number
          ? {kind: 'number'; value: number; min?: number}
          : T extends boolean
            ? {kind: 'checkbox'; value: boolean}
            : never;
      interface User {
        name: string;
        age: number;
        admin: boolean;
      }
      type UserForm = {[K in keyof User]: FieldFor<User[K]>};
      return createGetValidationErrorsFn<UserForm>();
    },
    getValidationErrorsDataOnly: () => {
      type FieldFor<T> = T extends string
        ? {kind: 'text'; value: string}
        : T extends number
          ? {kind: 'number'; value: number; min?: number}
          : T extends boolean
            ? {kind: 'checkbox'; value: boolean}
            : never;
      interface User {
        name: string;
        age: number;
        admin: boolean;
      }
      type UserForm = {[K in keyof User]: FieldFor<User[K]>};
      return createGetValidationErrorsFn<DataOnly<UserForm>>();
    },
    getValidationErrorsSchema: () =>
      createGetValidationErrorsFn(
        RT.object({
          name: RT.object({kind: RT.literal('text'), value: TF.string()}),
          age: RT.object({kind: RT.literal('number'), value: TF.number(), min: RT.optional(TF.number())}),
          admin: RT.object({kind: RT.literal('checkbox'), value: RT.boolean()}),
        })
      ),
    deserializeGetValidationErrors: () => {
      type FieldFor<T> = T extends string
        ? {kind: 'text'; value: string}
        : T extends number
          ? {kind: 'number'; value: number; min?: number}
          : T extends boolean
            ? {kind: 'checkbox'; value: boolean}
            : never;
      interface User {
        name: string;
        age: number;
        admin: boolean;
      }
      type UserForm = {[K in keyof User]: FieldFor<User[K]>};
      return deserializeGetValidationErrors<UserForm>();
    },
    getValidationErrorsReflect: () => {
      type FieldFor<T> = T extends string
        ? {kind: 'text'; value: string}
        : T extends number
          ? {kind: 'number'; value: number; min?: number}
          : T extends boolean
            ? {kind: 'checkbox'; value: boolean}
            : never;
      interface User {
        name: string;
        age: number;
        admin: boolean;
      }
      type UserForm = {[K in keyof User]: FieldFor<User[K]>};
      const v: UserForm = {
        name: {kind: 'text', value: 'x'},
        age: {kind: 'number', value: 1},
        admin: {kind: 'checkbox', value: true},
      };
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      type FieldFor<T> = T extends string
        ? {kind: 'text'; value: string}
        : T extends number
          ? {kind: 'number'; value: number; min?: number}
          : T extends boolean
            ? {kind: 'checkbox'; value: boolean}
            : never;
      interface User {
        name: string;
        age: number;
        admin: boolean;
      }
      type UserForm = {[K in keyof User]: FieldFor<User[K]>};
      const v: UserForm = {
        name: {kind: 'text', value: 'x'},
        age: {kind: 'number', value: 1},
        admin: {kind: 'checkbox', value: true},
      };
      return deserializeGetValidationErrors(v);
    },
    mockType: () => {
      type FieldFor<T> = T extends string
        ? {kind: 'text'; value: string}
        : T extends number
          ? {kind: 'number'; value: number; min?: number}
          : T extends boolean
            ? {kind: 'checkbox'; value: boolean}
            : never;
      interface User {
        name: string;
        age: number;
        admin: boolean;
      }
      type UserForm = {[K in keyof User]: FieldFor<User[K]>};
      return createMockDataFn<UserForm>();
    },
    mockTypeReflect: () => {
      type FieldFor<T> = T extends string
        ? {kind: 'text'; value: string}
        : T extends number
          ? {kind: 'number'; value: number; min?: number}
          : T extends boolean
            ? {kind: 'checkbox'; value: boolean}
            : never;
      interface User {
        name: string;
        age: number;
        admin: boolean;
      }
      type UserForm = {[K in keyof User]: FieldFor<User[K]>};
      const v: UserForm = {
        name: {kind: 'text', value: 'x'},
        age: {kind: 'number', value: 1},
        admin: {kind: 'checkbox', value: true},
      };
      return createMockDataFn(v);
    },
    getSamples: () => ({
      valid: [
        {
          name: {kind: 'text', value: 'Alice'},
          age: {kind: 'number', value: 30},
          admin: {kind: 'checkbox', value: true},
        },
        // age.min is optional
        {
          name: {kind: 'text', value: 'B'},
          age: {kind: 'number', value: 1, min: 0},
          admin: {kind: 'checkbox', value: false},
        },
      ],
      invalid: [
        // age.kind wrong literal
        {
          name: {kind: 'text', value: 'x'},
          age: {kind: 'text', value: 1},
          admin: {kind: 'checkbox', value: true},
        },
        // name.value wrong type
        {
          name: {kind: 'text', value: 42},
          age: {kind: 'number', value: 1},
          admin: {kind: 'checkbox', value: true},
        },
        // missing required prop
        {
          name: {kind: 'text', value: 'x'},
          age: {kind: 'number', value: 1},
        },
        null,
        undefined,
      ],
    }),
    getExpectedErrors: () => [
      // age.kind is 'text' but the resolved type for age says it
      // must be 'number' literal.
      [{path: ['age', 'kind'], expected: 'literal'}],
      // name.value wrong type — must be string.
      [{path: ['name', 'value'], expected: 'string'}],
      // missing admin → admin is undefined → object check at ['admin'] fails.
      [{path: ['admin'], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
    ],
  },

  distributive_conditional_over_union: {
    title: 'Distributive conditional',
    description:
      'When a conditional type is applied to a generic union, TS distributes the conditional over each member, producing a union of the per-arm results, so `T extends any ? {w: T} : never` applied to `string | number` resolves to `{w: string} | {w: number}` and the validator dispatches through the union emit.',
    validate: () => {
      type Wrap<T> = T extends any ? {w: T} : never;
      return createValidateFn<Wrap<string | number>>();
    },
    standardSchema: () => {
      type Wrap<T> = T extends any ? {w: T} : never;
      return createStandardSchema<Wrap<string | number>>();
    },
    validateDataOnly: () => {
      type Wrap<T> = T extends any ? {w: T} : never;
      return createValidateFn<DataOnly<Wrap<string | number>>>();
    },
    validateSchema: () => createValidateFn(RT.union([RT.object({w: TF.string()}), RT.object({w: TF.number()})])),
    deserializeValidate: () => {
      type Wrap<T> = T extends any ? {w: T} : never;
      return deserializeValidate<Wrap<string | number>>();
    },
    validateReflect: () => {
      type Wrap<T> = T extends any ? {w: T} : never;
      const v: Wrap<string | number> = {w: 'x'};
      return createValidateFn(v);
    },
    deserializeValidateReflect: () => {
      type Wrap<T> = T extends any ? {w: T} : never;
      const v: Wrap<string | number> = {w: 'x'};
      return deserializeValidate(v);
    },
    getValidationErrors: () => {
      type Wrap<T> = T extends any ? {w: T} : never;
      return createGetValidationErrorsFn<Wrap<string | number>>();
    },
    getValidationErrorsDataOnly: () => {
      type Wrap<T> = T extends any ? {w: T} : never;
      return createGetValidationErrorsFn<DataOnly<Wrap<string | number>>>();
    },
    getValidationErrorsSchema: () =>
      createGetValidationErrorsFn(RT.union([RT.object({w: TF.string()}), RT.object({w: TF.number()})])),
    deserializeGetValidationErrors: () => {
      type Wrap<T> = T extends any ? {w: T} : never;
      return deserializeGetValidationErrors<Wrap<string | number>>();
    },
    getValidationErrorsReflect: () => {
      type Wrap<T> = T extends any ? {w: T} : never;
      const v: Wrap<string | number> = {w: 'x'};
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      type Wrap<T> = T extends any ? {w: T} : never;
      const v: Wrap<string | number> = {w: 'x'};
      return deserializeGetValidationErrors(v);
    },
    mockType: () => {
      type Wrap<T> = T extends any ? {w: T} : never;
      return createMockDataFn<Wrap<string | number>>();
    },
    mockTypeReflect: () => {
      type Wrap<T> = T extends any ? {w: T} : never;
      const v: Wrap<string | number> = {w: 'x'};
      return createMockDataFn(v);
    },
    getSamples: () => ({
      valid: [{w: 'hello'}, {w: 42}],
      invalid: [{w: true}, {w: null}, {}, null, undefined, {w: NaN}],
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

  deep_partial_recursive_mapped: {
    title: 'DeepPartial',
    description:
      '`type DeepPartial<T> = {[K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K]}` recursively makes every nested object-typed property optional, with the resolver evaluating the recursion at the type-checker layer so the validator sees the fully flattened all-optional-deep shape.',
    validateNotes:
      'Every nested object becomes all-optional. The `allOptionalCode` guard fires at every level so non-plain-object inputs (arrays, Date, …) are rejected even though the all-optional shape would otherwise accept them.',
    validate: () => {
      interface Settings {
        display: {theme: 'light' | 'dark'; brightness: number};
        audio: {volume: number; muted: boolean};
      }
      type DeepPartial<T> = {[K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K]};
      return createValidateFn<DeepPartial<Settings>>();
    },
    standardSchema: () => {
      interface Settings {
        display: {theme: 'light' | 'dark'; brightness: number};
        audio: {volume: number; muted: boolean};
      }
      type DeepPartial<T> = {[K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K]};
      return createStandardSchema<DeepPartial<Settings>>();
    },
    validateDataOnly: () => {
      interface Settings {
        display: {theme: 'light' | 'dark'; brightness: number};
        audio: {volume: number; muted: boolean};
      }
      type DeepPartial<T> = {[K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K]};
      return createValidateFn<DataOnly<DeepPartial<Settings>>>();
    },
    validateSchema: () =>
      createValidateFn(
        RT.object({
          display: RT.optional(
            RT.object({
              theme: RT.optional(RT.union([RT.literal('light'), RT.literal('dark')])),
              brightness: RT.optional(TF.number()),
            })
          ),
          audio: RT.optional(RT.object({volume: RT.optional(TF.number()), muted: RT.optional(RT.boolean())})),
        })
      ),
    deserializeValidate: () => {
      interface Settings {
        display: {theme: 'light' | 'dark'; brightness: number};
        audio: {volume: number; muted: boolean};
      }
      type DeepPartial<T> = {[K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K]};
      return deserializeValidate<DeepPartial<Settings>>();
    },
    validateReflect: () => {
      interface Settings {
        display: {theme: 'light' | 'dark'; brightness: number};
        audio: {volume: number; muted: boolean};
      }
      type DeepPartial<T> = {[K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K]};
      const v: DeepPartial<Settings> = {};
      return createValidateFn(v);
    },
    deserializeValidateReflect: () => {
      interface Settings {
        display: {theme: 'light' | 'dark'; brightness: number};
        audio: {volume: number; muted: boolean};
      }
      type DeepPartial<T> = {[K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K]};
      const v: DeepPartial<Settings> = {};
      return deserializeValidate(v);
    },
    getValidationErrors: () => {
      interface Settings {
        display: {theme: 'light' | 'dark'; brightness: number};
        audio: {volume: number; muted: boolean};
      }
      type DeepPartial<T> = {[K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K]};
      return createGetValidationErrorsFn<DeepPartial<Settings>>();
    },
    getValidationErrorsDataOnly: () => {
      interface Settings {
        display: {theme: 'light' | 'dark'; brightness: number};
        audio: {volume: number; muted: boolean};
      }
      type DeepPartial<T> = {[K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K]};
      return createGetValidationErrorsFn<DataOnly<DeepPartial<Settings>>>();
    },
    getValidationErrorsSchema: () =>
      createGetValidationErrorsFn(
        RT.object({
          display: RT.optional(
            RT.object({
              theme: RT.optional(RT.union([RT.literal('light'), RT.literal('dark')])),
              brightness: RT.optional(TF.number()),
            })
          ),
          audio: RT.optional(RT.object({volume: RT.optional(TF.number()), muted: RT.optional(RT.boolean())})),
        })
      ),
    deserializeGetValidationErrors: () => {
      interface Settings {
        display: {theme: 'light' | 'dark'; brightness: number};
        audio: {volume: number; muted: boolean};
      }
      type DeepPartial<T> = {[K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K]};
      return deserializeGetValidationErrors<DeepPartial<Settings>>();
    },
    getValidationErrorsReflect: () => {
      interface Settings {
        display: {theme: 'light' | 'dark'; brightness: number};
        audio: {volume: number; muted: boolean};
      }
      type DeepPartial<T> = {[K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K]};
      const v: DeepPartial<Settings> = {};
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      interface Settings {
        display: {theme: 'light' | 'dark'; brightness: number};
        audio: {volume: number; muted: boolean};
      }
      type DeepPartial<T> = {[K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K]};
      const v: DeepPartial<Settings> = {};
      return deserializeGetValidationErrors(v);
    },
    mockType: () => {
      interface Settings {
        display: {theme: 'light' | 'dark'; brightness: number};
        audio: {volume: number; muted: boolean};
      }
      type DeepPartial<T> = {[K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K]};
      return createMockDataFn<DeepPartial<Settings>>();
    },
    mockTypeReflect: () => {
      interface Settings {
        display: {theme: 'light' | 'dark'; brightness: number};
        audio: {volume: number; muted: boolean};
      }
      type DeepPartial<T> = {[K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K]};
      const v: DeepPartial<Settings> = {};
      return createMockDataFn(v);
    },
    getSamples: () => ({
      valid: [
        {},
        {display: {}},
        {audio: {volume: 1}},
        {display: {theme: 'light'}, audio: {muted: true}},
        {display: {theme: 'dark', brightness: 0.5}, audio: {volume: 1, muted: false}},
      ],
      invalid: [
        [], // allOptionalCode guard rejects arrays at the outer level
        new Date(), // same — Date is not '[object Object]'
        {display: 'not object'}, // nested object expected
        {display: {theme: 'invalid'}}, // literal-union arm fails
        {audio: {volume: NaN}}, // NaN fails number
        null,
        undefined,
      ],
    }),
    getExpectedErrors: () => [
      [{path: [], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: ['display'], expected: 'objectLiteral'}],
      // theme is a literal union 'light'|'dark', 'invalid' fails the
      // union check at ['display', 'theme'].
      [{path: ['display', 'theme'], expected: 'union'}],
      [{path: ['audio', 'volume'], expected: 'number'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
    ],
  },
} as const satisfies Record<string, ValidationCase>;
