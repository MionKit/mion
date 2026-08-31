import {createMockDataFn, createValidateFn} from '@mionjs/run-types';

type User = {
  id: number;
  name: string;
  roles: ('admin' | 'user')[];
  active: boolean;
};

// start-basics
// createMockDataFn -> a function that invents a fresh, valid User every call.
const mockUser = createMockDataFn<User>();

const a = mockUser(); // {id: 91, name: 'qZ...', roles: ['user'], active: true}
const b = mockUser(); // a different one each time

// Whatever it produces passes the validator for the same type, by construction.
const isUser = createValidateFn<User>();
isUser(mockUser()); // true
// end-basics

export {mockUser, a, b};
