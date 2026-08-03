import {createValidateFn} from '@ts-runtypes/core';
import {runTypeFromJsonSchema, type FromJsonSchema, type JsonSchemaInput} from '@ts-runtypes/core/json-schema';

// start-basics
// A draft 2020-12 JSON Schema, exactly as you already have it.
const userSchema = {
  type: 'object',
  properties: {
    id: {type: 'integer'},
    name: {type: 'string'},
    tags: {type: 'array', items: {type: 'string'}},
  },
  required: ['id', 'name'],
} as const satisfies JsonSchemaInput;

// Hand it to any factory. The validator is generated at build time,
// the same way it is for a plain TypeScript type.
const isUser = createValidateFn(runTypeFromJsonSchema(userSchema));

isUser({id: 1, name: 'Ada', tags: ['math']}); // true
isUser({id: 'one', name: 'Ada'}); // false
// end-basics

// start-recover
// The TypeScript type is recovered from the schema, so there is no second
// definition to keep in sync. `tags` is optional here because it is missing
// from `required`.
type User = FromJsonSchema<typeof userSchema>;

const ada: User = {id: 1, name: 'Ada'};
// end-recover

export {isUser, ada};
export type {User};
