import {createValidateFn} from '@mionjs/run-types';
import {createMockDataFn} from '@mionjs/run-types/mocking';

type User = {
  id: number;
  name: string;
  roles: ('admin' | 'user')[];
  active: boolean;
};

// start-basics
// a fresh, valid User on every call
const mockUser = createMockDataFn<User>();

const a = mockUser(); // {id: 91, name: 'qZ...', roles: ['user'], active: true}
const b = mockUser(); // a different one each time

// every mock passes the validator for its type
const isUser = createValidateFn<User>();
isUser(mockUser()); // true
// end-basics

export {mockUser, a, b};
