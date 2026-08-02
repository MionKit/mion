import {createValidateFn, getRunTypeId} from '@ts-runtypes/core';
import {runTypeFromJsonSchema} from '@ts-runtypes/core/json-schema';

export interface User {
  id: number;
  name: string;
  email: string;
  roles: string[];
}

// The marker call shapes the plugin rewrites (CLAUDE.md marker rule): the factory
// createValidateFn<T>(), static getRunTypeId<T>(), AND value-first getRunTypeId(value).
// If the host-platform binary didn't resolve (via @ts-runtypes/bin's optional-dep
// model), spawn, and rewrite these, the transform would fail outright.
export const isUser = createValidateFn<User>();
export const userTypeIdStatic = getRunTypeId<User>();

const sampleUser: User = {id: 1, name: 'Ada', email: 'a@b.c', roles: ['admin']};
export const userTypeIdFromValue = getRunTypeId(sampleUser);

// The builder call form, off the packed json-schema subpath: a schema literal
// denoting the same User shape must land on the same structural id.
export const userTypeIdFromSchema = getRunTypeId(
  runTypeFromJsonSchema({
    type: 'object',
    properties: {
      id: {type: 'number'},
      name: {type: 'string'},
      email: {type: 'string'},
      roles: {type: 'array', items: {type: 'string'}},
    },
    required: ['id', 'name', 'email', 'roles'],
  })
);
