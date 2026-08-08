import {createValidateFn} from '@ts-runtypes/core';
import {runTypeFromJsonSchema, type FromJsonSchema, type JsonSchemaInput} from '@ts-runtypes/core/json-schema';

// Already have a JSON Schema? Hand it over as-is (draft 2020-12).
const userSchema = {
  type: 'object',
  properties: {
    id: {type: 'number'},
    name: {type: 'string'},
    email: {type: 'string', format: 'email'},
    roles: {type: 'array', items: {enum: ['admin', 'user']}},
  },
  required: ['id', 'name', 'email', 'roles'],
} as const satisfies JsonSchemaInput;

// Same validator, same result. Your call.
const isUser = createValidateFn(runTypeFromJsonSchema(userSchema));

// The TypeScript type comes back out of the schema, so nothing drifts.
type User = FromJsonSchema<typeof userSchema>;

export {isUser};
export type {User};
