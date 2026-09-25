import {createRemoveUnknownKeysFn, createValidateFn} from '@mionjs/run-types';

type User = {id: number; name: string};

// never changes the input, so frozen inputs work
const removeUnknownKeys = createRemoveUnknownKeysFn<User>();

const dirty = {id: 1, name: 'Ada', admin: true, token: 'secret'};
const clean = removeUnknownKeys(dirty as User); // {id: 1, name: 'Ada'}, new object

// validate untrusted data first, then drop its extra keys
const isUser = createValidateFn<User>();
export function parseUser(data: unknown): User {
  if (!isUser(data)) throw new Error('not a User');
  return removeUnknownKeys(data);
}

export {removeUnknownKeys, clean};
