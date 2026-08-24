import {createMockDataFn, createValidateFn} from '@ts-runtypes/core';

type User = {
  id: number;
  email: string;
  role: 'admin' | 'editor' | 'viewer';
  active: boolean;
};

// start-invalid
// `invalid: true` flips the generator: instead of a valid User it returns one
// with a single field replaced by a value of the wrong type, so it FAILS the
// validator. Great for testing the unhappy path without writing broken fixtures.
const mockBadUser = createMockDataFn<User>(undefined, {mock: {invalid: true}});

const isUser = createValidateFn<User>();
isUser(mockBadUser()); // false  (e.g. {id: 7, email: 12345, role: 'editor', active: true})

// invalidLeafProbability (0 to 1) steers where the bad value lands: 1 always
// corrupts a single deep field, 0 replaces the whole value. Defaults to 0.85.
const mockBadField = createMockDataFn<User>(undefined, {mock: {invalid: true, invalidLeafProbability: 1}});
// end-invalid

export {mockBadUser, mockBadField, isUser};
