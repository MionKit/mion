import {createValidateFn, createGetValidationErrorsFn} from '@mionjs/run-types';

type User = {
  id: number;
  name: string;
  email: string;
  roles: ('admin' | 'user')[];
};

// generated from User at build time
const isUser = createValidateFn<User>();

const maybeUser: unknown = JSON.parse(
  '{"id":1,"name":"Ada","email":"ada@x.io","roles":["admin"]}'
);

if (isUser(maybeUser)) {
  // narrowed to User here
  console.log(maybeUser.name);
}

// lists what failed, not just yes or no
const getUserErrors = createGetValidationErrorsFn<User>();
getUserErrors({id: '1', name: 'Ada'}); // [{path: ['id'], ...}, ...]

export {isUser, getUserErrors};
