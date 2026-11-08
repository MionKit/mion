// format-sample-out-of-bounds at a mock-only site: no validator is compiled for the type, yet every sample is
// longer than maxLength, so createMockDataFn would drop them all and throw at run time.
// Expected: the build halts at the mock call.
import {createMockDataFn} from '@mionjs/run-types/mocking';
import {String} from '@mionjs/run-types/formats';

type TooLongSample = String<{maxLength: 2; mockSamples: ['abcd', 'xyz']}>;

export const mock = createMockDataFn<TooLongSample>();
