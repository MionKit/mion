import {
  createJsonDecoderFn,
  createValidateFn,
  createGetValidationErrorsFn,
} from '@mionjs/run-types';

interface User {
  id: string;
  createdAt: Date;
}

const decodeUser = createJsonDecoderFn<User>();
const isUser = createValidateFn<User>();
const getUserErrors = createGetValidationErrorsFn<User>();

export function readUser(body: string) {
  const user = decodeUser(body);
  if (!isUser(user))
    throw new Error(`Invalid user: ${JSON.stringify(getUserErrors(user))}`);
  return user;
}

readUser('{"id":"u1","createdAt":"2024-05-01T10:00:00.000Z"}'); // ok, createdAt is a Date
readUser('{"id":"u1","createdAt":"yesterday"}'); // throws, createdAt is an invalid Date
