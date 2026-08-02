import {createValidateFn, createGetValidationErrorsFn} from '@ts-runtypes/core';
import {runTypeFromJsonSchema} from '@ts-runtypes/core/json-schema';

// start-formats
// Constraint keywords are not annotations here. Each one becomes part of the
// generated validator, so the check is real at run time.
const accountSchema = {
  type: 'object',
  properties: {
    email: {type: 'string', format: 'email'},
    handle: {type: 'string', minLength: 3, maxLength: 20},
    slug: {type: 'string', pattern: '^[a-z][a-z0-9-]*$'},
    age: {type: 'integer', minimum: 0, maximum: 130},
    balance: {type: 'number', multipleOf: 0.01},
    joined: {type: 'string', format: 'date-time'},
  },
  required: ['email', 'handle', 'age'],
} as const;

const isAccount = createValidateFn(runTypeFromJsonSchema(accountSchema));

isAccount({email: 'ada@example.com', handle: 'ada', age: 36}); // true
isAccount({email: 'not-an-email', handle: 'ada', age: 36}); // false
isAccount({email: 'ada@example.com', handle: 'ad', age: 36}); // false, handle too short
isAccount({email: 'ada@example.com', handle: 'ada', age: 200}); // false, age above maximum
// end-formats

// start-errors
// The same schema through the error factory tells you which keyword failed.
const accountErrors = createGetValidationErrorsFn(runTypeFromJsonSchema(accountSchema));

accountErrors({email: 'nope', handle: 'ada', age: 36});
// end-errors

export {isAccount, accountErrors};
