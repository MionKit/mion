import {createMockDataFn} from '@ts-runtypes/core';

type Account = {
  balance: number;
  label: string;
  tags?: string[];
};

// start-options
// Options can be set at the factory (apply to every call) or per call.
// They merge: defaults < factory < call.
const mockAccount = createMockDataFn<Account>(undefined, {
  mock: {
    minNumber: 0,
    maxNumber: 1000, // numbers land in [0, 1000]
    stringLength: 8, // every generated string is 8 chars
    optionalProbability: 1, // always include optional props like `tags`
  },
});

const rich = mockAccount({mock: {minNumber: 1_000_000}}); // override just for this call
// end-options

// start-seed
// Pass a seed for reproducible data: the same seed always yields the same value,
// so snapshot tests and fixtures stay stable. Leave it out for fresh data.
const mockFixture = createMockDataFn<Account>(undefined, {mock: {seed: 123}});
const sameEveryRun = mockFixture(); // identical on every run
// end-seed

export {mockAccount, rich, mockFixture, sameEveryRun};
