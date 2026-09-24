import {createRemoveUnknownKeysFn, createValidateFn} from '@mionjs/run-types';

type User = {id: number; name: string};

// returns a new value and never changes the input, so frozen inputs work
const removeUnknownKeys = createRemoveUnknownKeysFn<User>();

const dirty = {id: 1, name: 'Ada', admin: true, token: 'secret'};
const clean = removeUnknownKeys(dirty as User); // {id: 1, name: 'Ada'}, new object
// `dirty` still has admin/token; `clean` never did.

// validate untrusted data, then remove unknown keys so nothing undeclared flows downstream
const isUser = createValidateFn<User>();
export function parseUser(data: unknown): User {
  if (!isUser(data)) throw new Error('not a User');
  return removeUnknownKeys(data);
}

export {removeUnknownKeys, clean};
