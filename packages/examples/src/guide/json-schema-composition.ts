import * as RT from '@ts-runtypes/core/builders';
import {createValidateFn} from '@ts-runtypes/core';
import {runTypeFromJsonSchema, type JsonSchemaInput} from '@ts-runtypes/core/json-schema';

// start-utilities
const employeeSchema = {
  type: 'object',
  properties: {
    id: {type: 'integer'},
    name: {type: 'string'},
    email: {type: 'string', format: 'email'},
    manager: {type: 'string'},
  },
  required: ['id', 'name', 'email', 'manager'],
} as const satisfies JsonSchemaInput;

const employee = runTypeFromJsonSchema(employeeSchema);

// The schema builders compose over a JSON Schema result exactly as they do over
// an RT.* one, because both are the same kind of value.
const isPatch = createValidateFn(RT.partial(employee));
const isPublic = createValidateFn(RT.omit(employee, ['email', 'manager']));
const isContact = createValidateFn(RT.pick(employee, ['name', 'email']));

isPatch({name: 'Ada'}); // true, every field optional
isPublic({id: 1, name: 'Ada'}); // true
isContact({name: 'Ada', email: 'ada@example.com'}); // true
// end-utilities

// start-recursion
// $defs and $ref work too, including a self reference, so a recursive schema
// recovers a recursive type.
const categorySchema = {
  $defs: {
    node: {
      type: 'object',
      properties: {
        name: {type: 'string'},
        children: {type: 'array', items: {$ref: '#/$defs/node'}},
      },
      required: ['name', 'children'],
    },
  },
  $ref: '#/$defs/node',
} as const satisfies JsonSchemaInput;

const isCategory = createValidateFn(runTypeFromJsonSchema(categorySchema));

isCategory({name: 'root', children: [{name: 'leaf', children: []}]}); // true
// end-recursion

export {isPatch, isPublic, isContact, isCategory};
