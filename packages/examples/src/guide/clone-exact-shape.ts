import {createCloneExactShapeFn, createValidateFn} from '@mionjs/run-types';

type User = {id: number; name: string};

// never mutates the input, so frozen inputs work
const cloneUser = createCloneExactShapeFn<User>();

const dirty = {id: 1, name: 'Ada', admin: true, token: 'secret'};
const clean = cloneUser(dirty as User); // {id: 1, name: 'Ada'}, fresh object
// `dirty` still has admin/token; `clean` never did.

// validate untrusted data, then clone so nothing undeclared flows downstream
const isUser = createValidateFn<User>();
export function parseUser(data: unknown): User {
  if (!isUser(data)) throw new Error('not a User');
  return cloneUser(data);
}

export {cloneUser};
