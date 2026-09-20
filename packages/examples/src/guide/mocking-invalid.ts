import {createValidateFn} from '@mionjs/run-types';
import {createMockDataFn} from '@mionjs/run-types/mocking';

type User = {
  id: number;
  email: string;
  role: 'admin' | 'editor' | 'viewer';
  active: boolean;
};

// start-invalid
// every User this returns fails the validator
const mockBadUser = createMockDataFn<User>(undefined, {mock: {invalid: true}});

const isUser = createValidateFn<User>();
isUser(mockBadUser()); // false  (e.g. {id: 7, email: 12345, role: 'editor', active: true})

// 1 always breaks a single deep field instead of the whole value
const mockBadField = createMockDataFn<User>(undefined, {
  mock: {invalid: true, invalidLeafProbability: 1},
});
// end-invalid

export {mockBadUser, mockBadField, isUser};
