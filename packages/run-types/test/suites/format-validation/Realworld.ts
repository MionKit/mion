// Real-world DTOs whose fields carry type-formats — the everyday case for the
// format machinery: a uuid id and an email, on a user and an order. Each thunk is
// SELF-DECLARING: the `interface` (with its branded format fields) is written inside
// the thunk body, exactly how a caller would model it. Each invalid sample breaks
// one field; the format-payload asserts only need the format NAME (uuid / email) to
// surface, so the expectations stay robust against incidental envelope fields.
//
// The doc-gen's synthetic compile re-exports the real format brand aliases into the
// probe (see FORMATS_MODULE in scripts/export-*-suite.mjs), so the generated-code hover
// shows the actual format handling (uuid / email checks here), matching the runtime
// validator. `pureType` shows the real branded interface and `schema` the RT builder.
import * as TF from '@mionjs/run-types/formats';
import type {FormatValidationCase} from './types.ts';
import '@mionjs/run-types/formats';
import {
  createValidateFn,
  createGetValidationErrorsFn,
  createMockDataFn,
  createStandardSchema,
  type DataOnly,
} from '@mionjs/run-types';
import {deserializeValidate, deserializeGetValidationErrors} from '../../util/deserializeRTFunctions.ts';
import * as RT from '@mionjs/run-types/builders';

export const REALWORLD = {
  user: {
    title: 'User',
    description:
      'A DTO whose id is a `TF.UUID` and whose email is a `TF.EmailAddress`; the plain `name` rides alongside as a normal string.',
    validateNotes: [
      'The `id` must be a UUID (any version) and `email` a valid email — a plain string that is structurally fine still fails the format check.',
      'Structural — extra properties beyond the declared shape PASS.',
    ],
    validate: () => {
      interface User {
        id: TF.UUID;
        name: string;
        email: TF.EmailAddress;
      }
      return createValidateFn<User>();
    },
    standardSchema: () => {
      interface User {
        id: TF.UUID;
        name: string;
        email: TF.EmailAddress;
      }
      return createStandardSchema<User>();
    },
    // One hand-authored Standard Schema expectation per file. Every other case
    // derives its expected issues from getExpectedErrors via runTypeErrorsToIssues
    // (the same mapping the factory uses), so this single case pins the real
    // consumer-facing {message, path} output independently: it trips if error
    // generation or the issue mapping changes. One case per file covers this
    // file's shapes without the ~265x maintenance of authoring every case.
    getExpectedStandardErrors: () => [
      [{message: 'Expected objectLiteral', path: [], expected: 'objectLiteral'}],
      [
        {
          message: 'Failed uuid constraint',
          path: ['id'],
          expected: 'string',
          format: {name: 'uuid', formatPath: ['version'], val: 'any'},
        },
      ],
      [
        {
          // TF.EmailAddress checks the RFC 5321 grammar through the pure-fn
          // engine, so the failing param is `emailRfc`, not a pattern.
          message: 'Failed emailRfc constraint (ascii)',
          path: ['email'],
          expected: 'string',
          format: {name: 'email', formatPath: ['emailRfc'], val: 'ascii', errorType: 'format'},
        },
      ],
      [{message: 'Expected string', path: ['name'], expected: 'string'}],
    ],
    validateDataOnly: () => {
      interface User {
        id: TF.UUID;
        name: string;
        email: TF.EmailAddress;
      }
      return createValidateFn<DataOnly<User>>();
    },
    validateSchema: () => createValidateFn(RT.object({id: TF.uuid(), name: TF.string(), email: TF.emailAddress()})),
    deserializeValidate: () => {
      interface User {
        id: TF.UUID;
        name: string;
        email: TF.EmailAddress;
      }
      return deserializeValidate<User>();
    },
    validateReflect: () => {
      interface User {
        id: TF.UUID;
        name: string;
        email: TF.EmailAddress;
      }
      const v: User = {
        id: '0d8f2b1c-1e2a-4d3b-9f4c-5a6b7c8d9e0f' as TF.UUID,
        name: 'Ada Lovelace',
        email: 'ada@example.com' as TF.EmailAddress,
      };
      return createValidateFn(v);
    },
    deserializeValidateReflect: () => {
      interface User {
        id: TF.UUID;
        name: string;
        email: TF.EmailAddress;
      }
      const v: User = {
        id: '0d8f2b1c-1e2a-4d3b-9f4c-5a6b7c8d9e0f' as TF.UUID,
        name: 'Ada Lovelace',
        email: 'ada@example.com' as TF.EmailAddress,
      };
      return deserializeValidate(v);
    },
    getValidationErrors: () => {
      interface User {
        id: TF.UUID;
        name: string;
        email: TF.EmailAddress;
      }
      return createGetValidationErrorsFn<User>();
    },
    getValidationErrorsDataOnly: () => {
      interface User {
        id: TF.UUID;
        name: string;
        email: TF.EmailAddress;
      }
      return createGetValidationErrorsFn<DataOnly<User>>();
    },
    getValidationErrorsSchema: () =>
      createGetValidationErrorsFn(RT.object({id: TF.uuid(), name: TF.string(), email: TF.emailAddress()})),
    deserializeGetValidationErrors: () => {
      interface User {
        id: TF.UUID;
        name: string;
        email: TF.EmailAddress;
      }
      return deserializeGetValidationErrors<User>();
    },
    getValidationErrorsReflect: () => {
      interface User {
        id: TF.UUID;
        name: string;
        email: TF.EmailAddress;
      }
      const v: User = {
        id: '0d8f2b1c-1e2a-4d3b-9f4c-5a6b7c8d9e0f' as TF.UUID,
        name: 'Ada Lovelace',
        email: 'ada@example.com' as TF.EmailAddress,
      };
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      interface User {
        id: TF.UUID;
        name: string;
        email: TF.EmailAddress;
      }
      const v: User = {
        id: '0d8f2b1c-1e2a-4d3b-9f4c-5a6b7c8d9e0f' as TF.UUID,
        name: 'Ada Lovelace',
        email: 'ada@example.com' as TF.EmailAddress,
      };
      return deserializeGetValidationErrors(v);
    },
    mockType: () => {
      interface User {
        id: TF.UUID;
        name: string;
        email: TF.EmailAddress;
      }
      return createMockDataFn<User>();
    },
    mockTypeReflect: () => {
      interface User {
        id: TF.UUID;
        name: string;
        email: TF.EmailAddress;
      }
      const v: User = {
        id: '0d8f2b1c-1e2a-4d3b-9f4c-5a6b7c8d9e0f' as TF.UUID,
        name: 'Ada Lovelace',
        email: 'ada@example.com' as TF.EmailAddress,
      };
      return createMockDataFn(v);
    },
    getSamples: () => ({
      valid: [
        {id: '0d8f2b1c-1e2a-4d3b-9f4c-5a6b7c8d9e0f', name: 'Ada Lovelace', email: 'ada@example.com'},
        {id: '6f9619ff-8b86-4011-b42d-00cf4fc964ff', name: '', email: 'ab@cd.co'},
      ],
      invalid: [
        null,
        {id: 'not-a-uuid', name: 'Ada', email: 'ada@example.com'},
        {id: '0d8f2b1c-1e2a-4d3b-9f4c-5a6b7c8d9e0f', name: 'Ada', email: 'not-an-email'},
        {id: '0d8f2b1c-1e2a-4d3b-9f4c-5a6b7c8d9e0f', name: 42, email: 'ada@example.com'},
      ],
    }),
    expectedFormatErrors: () => [null, {name: 'uuid'}, {name: 'email'}, null],
  },

  order: {
    title: 'Order',
    description:
      'A DTO mixing two formats (a `TF.UUID` id and a `TF.EmailAddress` contact) with a numeric total and a string-literal status union.',
    validateNotes: 'A malformed email or uuid surfaces its named format error; an out-of-set status fails the union.',
    validate: () => {
      interface Order {
        id: TF.UUID;
        email: TF.EmailAddress;
        total: number;
        status: 'pending' | 'paid' | 'shipped' | 'cancelled';
      }
      return createValidateFn<Order>();
    },
    standardSchema: () => {
      interface Order {
        id: TF.UUID;
        email: TF.EmailAddress;
        total: number;
        status: 'pending' | 'paid' | 'shipped' | 'cancelled';
      }
      return createStandardSchema<Order>();
    },
    validateDataOnly: () => {
      interface Order {
        id: TF.UUID;
        email: TF.EmailAddress;
        total: number;
        status: 'pending' | 'paid' | 'shipped' | 'cancelled';
      }
      return createValidateFn<DataOnly<Order>>();
    },
    validateSchema: () =>
      createValidateFn(
        RT.object({
          id: TF.uuid(),
          email: TF.emailAddress(),
          total: TF.number(),
          status: RT.union([RT.literal('pending'), RT.literal('paid'), RT.literal('shipped'), RT.literal('cancelled')]),
        })
      ),
    deserializeValidate: () => {
      interface Order {
        id: TF.UUID;
        email: TF.EmailAddress;
        total: number;
        status: 'pending' | 'paid' | 'shipped' | 'cancelled';
      }
      return deserializeValidate<Order>();
    },
    validateReflect: () => {
      interface Order {
        id: TF.UUID;
        email: TF.EmailAddress;
        total: number;
        status: 'pending' | 'paid' | 'shipped' | 'cancelled';
      }
      const v: Order = {
        id: '6f9619ff-8b86-4011-b42d-00cf4fc964ff' as TF.UUID,
        email: 'ada@example.com' as TF.EmailAddress,
        total: 78,
        status: 'paid',
      };
      return createValidateFn(v);
    },
    deserializeValidateReflect: () => {
      interface Order {
        id: TF.UUID;
        email: TF.EmailAddress;
        total: number;
        status: 'pending' | 'paid' | 'shipped' | 'cancelled';
      }
      const v: Order = {
        id: '6f9619ff-8b86-4011-b42d-00cf4fc964ff' as TF.UUID,
        email: 'ada@example.com' as TF.EmailAddress,
        total: 78,
        status: 'paid',
      };
      return deserializeValidate(v);
    },
    getValidationErrors: () => {
      interface Order {
        id: TF.UUID;
        email: TF.EmailAddress;
        total: number;
        status: 'pending' | 'paid' | 'shipped' | 'cancelled';
      }
      return createGetValidationErrorsFn<Order>();
    },
    getValidationErrorsDataOnly: () => {
      interface Order {
        id: TF.UUID;
        email: TF.EmailAddress;
        total: number;
        status: 'pending' | 'paid' | 'shipped' | 'cancelled';
      }
      return createGetValidationErrorsFn<DataOnly<Order>>();
    },
    getValidationErrorsSchema: () =>
      createGetValidationErrorsFn(
        RT.object({
          id: TF.uuid(),
          email: TF.emailAddress(),
          total: TF.number(),
          status: RT.union([RT.literal('pending'), RT.literal('paid'), RT.literal('shipped'), RT.literal('cancelled')]),
        })
      ),
    deserializeGetValidationErrors: () => {
      interface Order {
        id: TF.UUID;
        email: TF.EmailAddress;
        total: number;
        status: 'pending' | 'paid' | 'shipped' | 'cancelled';
      }
      return deserializeGetValidationErrors<Order>();
    },
    getValidationErrorsReflect: () => {
      interface Order {
        id: TF.UUID;
        email: TF.EmailAddress;
        total: number;
        status: 'pending' | 'paid' | 'shipped' | 'cancelled';
      }
      const v: Order = {
        id: '6f9619ff-8b86-4011-b42d-00cf4fc964ff' as TF.UUID,
        email: 'ada@example.com' as TF.EmailAddress,
        total: 78,
        status: 'paid',
      };
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      interface Order {
        id: TF.UUID;
        email: TF.EmailAddress;
        total: number;
        status: 'pending' | 'paid' | 'shipped' | 'cancelled';
      }
      const v: Order = {
        id: '6f9619ff-8b86-4011-b42d-00cf4fc964ff' as TF.UUID,
        email: 'ada@example.com' as TF.EmailAddress,
        total: 78,
        status: 'paid',
      };
      return deserializeGetValidationErrors(v);
    },
    mockType: () => {
      interface Order {
        id: TF.UUID;
        email: TF.EmailAddress;
        total: number;
        status: 'pending' | 'paid' | 'shipped' | 'cancelled';
      }
      return createMockDataFn<Order>();
    },
    mockTypeReflect: () => {
      interface Order {
        id: TF.UUID;
        email: TF.EmailAddress;
        total: number;
        status: 'pending' | 'paid' | 'shipped' | 'cancelled';
      }
      const v: Order = {
        id: '6f9619ff-8b86-4011-b42d-00cf4fc964ff' as TF.UUID,
        email: 'ada@example.com' as TF.EmailAddress,
        total: 78,
        status: 'paid',
      };
      return createMockDataFn(v);
    },
    getSamples: () => ({
      valid: [
        {id: '6f9619ff-8b86-4011-b42d-00cf4fc964ff', email: 'ada@example.com', total: 78, status: 'paid'},
        {id: '0d8f2b1c-1e2a-4d3b-9f4c-5a6b7c8d9e0f', email: 'ab@cd.co', total: 0, status: 'pending'},
      ],
      invalid: [
        null,
        {id: 'not-a-uuid', email: 'ada@example.com', total: 78, status: 'paid'},
        {id: '6f9619ff-8b86-4011-b42d-00cf4fc964ff', email: 'not-an-email', total: 78, status: 'paid'},
        {id: '6f9619ff-8b86-4011-b42d-00cf4fc964ff', email: 'ada@example.com', total: 78, status: 'refunded'},
      ],
    }),
    expectedFormatErrors: () => [null, {name: 'uuid'}, {name: 'email'}, null],
  },
} as const satisfies Record<string, FormatValidationCase>;
