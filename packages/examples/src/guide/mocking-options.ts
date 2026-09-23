import {createMockDataFn} from '@mionjs/run-types/mocking';

type Account = {
  balance: number;
  label: string;
  tags?: string[];
};

// start-options
// factory options apply to every call; per-call options win (defaults < factory < call)
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
const mockFixture = createMockDataFn<Account>(undefined, {mock: {seed: 123}});
const sameEveryRun = mockFixture(); // identical on every run
// end-seed

export {mockAccount, rich, mockFixture, sameEveryRun};
