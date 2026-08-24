import {createValidateFn, createGetValidationErrorsFn} from '@ts-runtypes/core';

type User = {
  id: number;
  name: string;
  roles: ('admin' | 'user')[];
};

// start-validate
// createValidateFn -> a type guard. Fast yes/no.
const isUser = createValidateFn<User>();

isUser({id: 1, name: 'Ada', roles: ['admin']}); // true
isUser({id: '1', name: 'Ada', roles: ['admin']}); // false, id is not a number

// It narrows too: inside the `if`, `data` is typed.
function handle(data: unknown) {
  if (isUser(data)) data.roles; // ('admin' | 'user')[]
}
// end-validate

// start-errors
// createGetValidationErrorsFn -> the same checks, but it tells you what broke.
const userErrors = createGetValidationErrorsFn<User>();

userErrors({id: 1, name: 'Ada', roles: ['admin']}); // [], all good
userErrors({id: '1', name: 42, roles: ['boss']});
// [
//   {path: ['id'], expected: 'number'},
//   {path: ['name'], expected: 'string'},
//   {path: ['roles', 0], expected: "'admin' | 'user'"},
// ]
// end-errors

export {isUser, userErrors, handle};
