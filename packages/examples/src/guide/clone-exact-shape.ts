import {createCloneExactShapeFn, createValidateFn} from '@ts-runtypes/core';

type User = {id: number; name: string};

// createCloneExactShapeFn -> a NEW value of exactly the declared shape.
// Undeclared keys are dropped by construction (the clone is built FROM the
// type, never `{...v}`); the input is never mutated: frozen inputs work.
const cloneUser = createCloneExactShapeFn<User>();

const dirty = {id: 1, name: 'Ada', admin: true, token: 'secret'};
const clean = cloneUser(dirty as User); // {id: 1, name: 'Ada'}, fresh object
// `dirty` still has admin/token; `clean` never did.

// The intended pipeline: validate untrusted data, then clone to the exact
// declared shape so nothing undeclared flows downstream.
const isUser = createValidateFn<User>();
export function parseUser(data: unknown): User {
  if (!isUser(data)) throw new Error('not a User');
  return cloneUser(data);
}

export {cloneUser};
