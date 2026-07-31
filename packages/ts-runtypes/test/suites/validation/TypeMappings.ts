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

export const TYPE_MAPPINGS = {
  key_prefix_rename: {
    title: 'Key prefix rename',
    description:
      'TS 4.1+ key remapping `{[K in keyof T as `prefix_${K & string}`]: T[K]}` resolves to a fully concrete object literal with template-literal renamed keys, carrying each value type over unchanged, as in DB column-name prefixing (`user_id`, `user_name`).',
    validateNotes:
      'The validator checks the RENAMED keys — a value carrying the original un-prefixed keys (`{id, name}`) fails because the required `user_id` / `user_name` are absent.',
    validate: () => {
      interface Source {
        id: number;
        name: string;
      }
      type Prefixed<T> = {[K in keyof T as `user_${K & string}`]: T[K]};
      return createValidateFn<Prefixed<Source>>();
    },
    standardSchema: () => {
      interface Source {
        id: number;
        name: string;
      }
      type Prefixed<T> = {[K in keyof T as `user_${K & string}`]: T[K]};
      return createStandardSchema<Prefixed<Source>>();
    },
    // One hand-authored Standard Schema expectation per file. Every other case
    // derives its expected issues from getExpectedErrors via runTypeErrorsToIssues
    // (the same mapping the factory uses), so this single case pins the real
    // consumer-facing {message, path} output independently: it trips if error
    // generation or the issue mapping changes. One case per file covers this
    // file's shapes without the ~265x maintenance of authoring every case.
    getExpectedStandardErrors: () => [
      [
        {message: 'Expected number', path: ['user_id'], expected: 'number'},
        {message: 'Expected string', path: ['user_name'], expected: 'string'},
      ],
      [{message: 'Expected number', path: ['user_id'], expected: 'number'}],
      [{message: 'Expected string', path: ['user_name'], expected: 'string'}],
      [{message: 'Expected objectLiteral', path: [], expected: 'objectLiteral'}],
      [{message: 'Expected objectLiteral', path: [], expected: 'objectLiteral'}],
    ],
    validateDataOnly: () => {
      interface Source {
        id: number;
        name: string;
      }
      type Prefixed<T> = {[K in keyof T as `user_${K & string}`]: T[K]};
      return createValidateFn<DataOnly<Prefixed<Source>>>();
    },
    validateSchema: () => createValidateFn(RT.object({user_id: TF.number(), user_name: TF.string()})),
    deserializeValidate: () => {
      interface Source {
        id: number;
        name: string;
      }
      type Prefixed<T> = {[K in keyof T as `user_${K & string}`]: T[K]};
      return deserializeValidate<Prefixed<Source>>();
    },
    validateReflect: () => {
      interface Source {
        id: number;
        name: string;
      }
      type Prefixed<T> = {[K in keyof T as `user_${K & string}`]: T[K]};
      const v: Prefixed<Source> = {user_id: 1, user_name: 'x'};
      return createValidateFn(v);
    },
    deserializeValidateReflect: () => {
      interface Source {
        id: number;
        name: string;
      }
      type Prefixed<T> = {[K in keyof T as `user_${K & string}`]: T[K]};
      const v: Prefixed<Source> = {user_id: 1, user_name: 'x'};
      return deserializeValidate(v);
    },
    getValidationErrors: () => {
      interface Source {
        id: number;
        name: string;
      }
      type Prefixed<T> = {[K in keyof T as `user_${K & string}`]: T[K]};
      return createGetValidationErrorsFn<Prefixed<Source>>();
    },
    getValidationErrorsDataOnly: () => {
      interface Source {
        id: number;
        name: string;
      }
      type Prefixed<T> = {[K in keyof T as `user_${K & string}`]: T[K]};
      return createGetValidationErrorsFn<DataOnly<Prefixed<Source>>>();
    },
    getValidationErrorsSchema: () => createGetValidationErrorsFn(RT.object({user_id: TF.number(), user_name: TF.string()})),
    deserializeGetValidationErrors: () => {
      interface Source {
        id: number;
        name: string;
      }
      type Prefixed<T> = {[K in keyof T as `user_${K & string}`]: T[K]};
      return deserializeGetValidationErrors<Prefixed<Source>>();
    },
    getValidationErrorsReflect: () => {
      interface Source {
        id: number;
        name: string;
      }
      type Prefixed<T> = {[K in keyof T as `user_${K & string}`]: T[K]};
      const v: Prefixed<Source> = {user_id: 1, user_name: 'x'};
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      interface Source {
        id: number;
        name: string;
      }
      type Prefixed<T> = {[K in keyof T as `user_${K & string}`]: T[K]};
      const v: Prefixed<Source> = {user_id: 1, user_name: 'x'};
      return deserializeGetValidationErrors(v);
    },
    mockType: () => {
      interface Source {
        id: number;
        name: string;
      }
      type Prefixed<T> = {[K in keyof T as `user_${K & string}`]: T[K]};
      return createMockDataFn<Prefixed<Source>>();
    },
    mockTypeReflect: () => {
      interface Source {
        id: number;
        name: string;
      }
      type Prefixed<T> = {[K in keyof T as `user_${K & string}`]: T[K]};
      const v: Prefixed<Source> = {user_id: 1, user_name: 'x'};
      return createMockDataFn(v);
    },
    getSamples: () => ({
      valid: [
        {user_id: 1, user_name: 'x'},
        {user_id: 0, user_name: ''},
      ],
      invalid: [
        {id: 1, name: 'x'}, // original (un-prefixed) keys — both required prefixed keys missing
        {user_id: 'not number', user_name: 'x'},
        {user_id: 1}, // missing user_name
        null,
        undefined,
      ],
    }),
    getExpectedErrors: () => [
      [
        {path: ['user_id'], expected: 'number'},
        {path: ['user_name'], expected: 'string'},
      ],
      [{path: ['user_id'], expected: 'number'}],
      [{path: ['user_name'], expected: 'string'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
    ],
  },

  key_conditional_rename: {
    title: 'Conditional key rename',
    description:
      '`{[K in keyof T as K extends "id" ? "_id" : K]: T[K]}` swaps a single specific key (`id` to `_id`, Mongo-style) while the rest pass through unchanged.',
    validateNotes:
      'Only `id` is renamed; the resolved shape requires `_id` and ignores the original `id`, so a value with `id` (and no `_id`) fails while the pass-through keys (`name`, `createdAt`) are still required.',
    validate: () => {
      interface Source {
        id: number;
        name: string;
        createdAt: Date;
      }
      type MongoForm<T> = {[K in keyof T as K extends 'id' ? '_id' : K]: T[K]};
      return createValidateFn<MongoForm<Source>>();
    },
    standardSchema: () => {
      interface Source {
        id: number;
        name: string;
        createdAt: Date;
      }
      type MongoForm<T> = {[K in keyof T as K extends 'id' ? '_id' : K]: T[K]};
      return createStandardSchema<MongoForm<Source>>();
    },
    validateDataOnly: () => {
      interface Source {
        id: number;
        name: string;
        createdAt: Date;
      }
      type MongoForm<T> = {[K in keyof T as K extends 'id' ? '_id' : K]: T[K]};
      return createValidateFn<DataOnly<MongoForm<Source>>>();
    },
    validateSchema: () => createValidateFn(RT.object({_id: TF.number(), name: TF.string(), createdAt: TF.date()})),
    deserializeValidate: () => {
      interface Source {
        id: number;
        name: string;
        createdAt: Date;
      }
      type MongoForm<T> = {[K in keyof T as K extends 'id' ? '_id' : K]: T[K]};
      return deserializeValidate<MongoForm<Source>>();
    },
    validateReflect: () => {
      interface Source {
        id: number;
        name: string;
        createdAt: Date;
      }
      type MongoForm<T> = {[K in keyof T as K extends 'id' ? '_id' : K]: T[K]};
      const v: MongoForm<Source> = {_id: 1, name: 'x', createdAt: new Date()};
      return createValidateFn(v);
    },
    deserializeValidateReflect: () => {
      interface Source {
        id: number;
        name: string;
        createdAt: Date;
      }
      type MongoForm<T> = {[K in keyof T as K extends 'id' ? '_id' : K]: T[K]};
      const v: MongoForm<Source> = {_id: 1, name: 'x', createdAt: new Date()};
      return deserializeValidate(v);
    },
    getValidationErrors: () => {
      interface Source {
        id: number;
        name: string;
        createdAt: Date;
      }
      type MongoForm<T> = {[K in keyof T as K extends 'id' ? '_id' : K]: T[K]};
      return createGetValidationErrorsFn<MongoForm<Source>>();
    },
    getValidationErrorsDataOnly: () => {
      interface Source {
        id: number;
        name: string;
        createdAt: Date;
      }
      type MongoForm<T> = {[K in keyof T as K extends 'id' ? '_id' : K]: T[K]};
      return createGetValidationErrorsFn<DataOnly<MongoForm<Source>>>();
    },
    getValidationErrorsSchema: () =>
      createGetValidationErrorsFn(RT.object({_id: TF.number(), name: TF.string(), createdAt: TF.date()})),
    deserializeGetValidationErrors: () => {
      interface Source {
        id: number;
        name: string;
        createdAt: Date;
      }
      type MongoForm<T> = {[K in keyof T as K extends 'id' ? '_id' : K]: T[K]};
      return deserializeGetValidationErrors<MongoForm<Source>>();
    },
    getValidationErrorsReflect: () => {
      interface Source {
        id: number;
        name: string;
        createdAt: Date;
      }
      type MongoForm<T> = {[K in keyof T as K extends 'id' ? '_id' : K]: T[K]};
      const v: MongoForm<Source> = {_id: 1, name: 'x', createdAt: new Date()};
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      interface Source {
        id: number;
        name: string;
        createdAt: Date;
      }
      type MongoForm<T> = {[K in keyof T as K extends 'id' ? '_id' : K]: T[K]};
      const v: MongoForm<Source> = {_id: 1, name: 'x', createdAt: new Date()};
      return deserializeGetValidationErrors(v);
    },
    mockType: () => {
      interface Source {
        id: number;
        name: string;
        createdAt: Date;
      }
      type MongoForm<T> = {[K in keyof T as K extends 'id' ? '_id' : K]: T[K]};
      return createMockDataFn<MongoForm<Source>>();
    },
    mockTypeReflect: () => {
      interface Source {
        id: number;
        name: string;
        createdAt: Date;
      }
      type MongoForm<T> = {[K in keyof T as K extends 'id' ? '_id' : K]: T[K]};
      const v: MongoForm<Source> = {_id: 1, name: 'x', createdAt: new Date()};
      return createMockDataFn(v);
    },
    getSamples: () => ({
      valid: [{_id: 1, name: 'x', createdAt: new Date()}],
      invalid: [
        // Original `id` key — renamed away, so `_id` is missing.
        {id: 1, name: 'x', createdAt: new Date()},
        // Wrong type at renamed slot.
        {_id: 'not number', name: 'x', createdAt: new Date()},
        // Missing the non-renamed `createdAt`.
        {_id: 1, name: 'x'},
        null,
        undefined,
      ],
    }),
    getExpectedErrors: () => [
      [{path: ['_id'], expected: 'number'}],
      [{path: ['_id'], expected: 'number'}],
      [{path: ['createdAt'], expected: 'date'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
    ],
  },

  key_filter_via_never: {
    title: 'Filter keys via never',
    description:
      '`{[K in keyof T as K extends "secret" ? never : K]: T[K]}` maps a key to `never` to drop it from the resulting shape entirely (TS 4.1+ semantic), stripping internal-only or secret fields when exposing a wire shape.',
    validateNotes:
      'Dropped keys are NOT present in the resolved type. The validator does NOT check whether the dropped key is absent — structural typing allows extra props, so a value carrying the dropped key still passes (the key is simply ignored).',
    validate: () => {
      interface Source {
        id: number;
        name: string;
        secret: string;
      }
      type Public<T> = {[K in keyof T as K extends 'secret' ? never : K]: T[K]};
      return createValidateFn<Public<Source>>();
    },
    standardSchema: () => {
      interface Source {
        id: number;
        name: string;
        secret: string;
      }
      type Public<T> = {[K in keyof T as K extends 'secret' ? never : K]: T[K]};
      return createStandardSchema<Public<Source>>();
    },
    validateDataOnly: () => {
      interface Source {
        id: number;
        name: string;
        secret: string;
      }
      type Public<T> = {[K in keyof T as K extends 'secret' ? never : K]: T[K]};
      return createValidateFn<DataOnly<Public<Source>>>();
    },
    validateSchema: () => createValidateFn(RT.object({id: TF.number(), name: TF.string()})),
    deserializeValidate: () => {
      interface Source {
        id: number;
        name: string;
        secret: string;
      }
      type Public<T> = {[K in keyof T as K extends 'secret' ? never : K]: T[K]};
      return deserializeValidate<Public<Source>>();
    },
    validateReflect: () => {
      interface Source {
        id: number;
        name: string;
        secret: string;
      }
      type Public<T> = {[K in keyof T as K extends 'secret' ? never : K]: T[K]};
      const v: Public<Source> = {id: 1, name: 'x'};
      return createValidateFn(v);
    },
    deserializeValidateReflect: () => {
      interface Source {
        id: number;
        name: string;
        secret: string;
      }
      type Public<T> = {[K in keyof T as K extends 'secret' ? never : K]: T[K]};
      const v: Public<Source> = {id: 1, name: 'x'};
      return deserializeValidate(v);
    },
    getValidationErrors: () => {
      interface Source {
        id: number;
        name: string;
        secret: string;
      }
      type Public<T> = {[K in keyof T as K extends 'secret' ? never : K]: T[K]};
      return createGetValidationErrorsFn<Public<Source>>();
    },
    getValidationErrorsDataOnly: () => {
      interface Source {
        id: number;
        name: string;
        secret: string;
      }
      type Public<T> = {[K in keyof T as K extends 'secret' ? never : K]: T[K]};
      return createGetValidationErrorsFn<DataOnly<Public<Source>>>();
    },
    getValidationErrorsSchema: () => createGetValidationErrorsFn(RT.object({id: TF.number(), name: TF.string()})),
    deserializeGetValidationErrors: () => {
      interface Source {
        id: number;
        name: string;
        secret: string;
      }
      type Public<T> = {[K in keyof T as K extends 'secret' ? never : K]: T[K]};
      return deserializeGetValidationErrors<Public<Source>>();
    },
    getValidationErrorsReflect: () => {
      interface Source {
        id: number;
        name: string;
        secret: string;
      }
      type Public<T> = {[K in keyof T as K extends 'secret' ? never : K]: T[K]};
      const v: Public<Source> = {id: 1, name: 'x'};
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      interface Source {
        id: number;
        name: string;
        secret: string;
      }
      type Public<T> = {[K in keyof T as K extends 'secret' ? never : K]: T[K]};
      const v: Public<Source> = {id: 1, name: 'x'};
      return deserializeGetValidationErrors(v);
    },
    mockType: () => {
      interface Source {
        id: number;
        name: string;
        secret: string;
      }
      type Public<T> = {[K in keyof T as K extends 'secret' ? never : K]: T[K]};
      return createMockDataFn<Public<Source>>();
    },
    mockTypeReflect: () => {
      interface Source {
        id: number;
        name: string;
        secret: string;
      }
      type Public<T> = {[K in keyof T as K extends 'secret' ? never : K]: T[K]};
      const v: Public<Source> = {id: 1, name: 'x'};
      return createMockDataFn(v);
    },
    getSamples: () => ({
      valid: [
        {id: 1, name: 'x'},
        // Extra `secret` prop passes (structural typing — the
        // resolved shape doesn't know about it).
        {id: 1, name: 'x', secret: 'oops'},
      ],
      invalid: [
        {id: 1}, // missing name
        {name: 'x'}, // missing id
        {id: 'not number', name: 'x'},
        null,
        undefined,
      ],
    }),
    getExpectedErrors: () => [
      [{path: ['name'], expected: 'string'}],
      [{path: ['id'], expected: 'number'}],
      [{path: ['id'], expected: 'number'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
    ],
  },
} as const satisfies Record<string, ValidationCase>;
