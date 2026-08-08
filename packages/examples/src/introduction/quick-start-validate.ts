import {createValidateFn, createGetValidationErrorsFn} from '@ts-runtypes/core';

// 1. Write a normal type.
type User = {
  id: number;
  name: string;
  email: string;
  roles: ('admin' | 'user')[];
};

// 2. Ask for a validator. The build generates it from `User`.
const isUser = createValidateFn<User>();

// 3. Use it. This is a real, specialized function: no runtime reflection.
const maybeUser: unknown = JSON.parse('{"id":1,"name":"Ada","email":"ada@x.io","roles":["admin"]}');

if (isUser(maybeUser)) {
  // maybeUser is narrowed to User here.
  console.log(maybeUser.name);
}

// Want the WHY, not just a yes/no? Reach for the error reporter.
const getUserErrors = createGetValidationErrorsFn<User>();
getUserErrors({id: '1', name: 'Ada'}); // [{path: ['id'], ...}, ...]

export {isUser, getUserErrors};
