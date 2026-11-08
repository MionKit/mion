// format-generator-invalid at a mock-only site: no validator is compiled, yet every mock call would throw.
// Expected: the build halts at the mock call.
import {createMockDataFn} from '@mionjs/run-types/mocking';
import {String} from '@mionjs/run-types/formats';

type Initial = String<{maxLength: 1; generator: 'lastName'}>;

export const mockInitial = createMockDataFn<Initial>();

// The value call shape reports the same error at its own call.
declare const sample: Initial;
export const mockInitialValue = createMockDataFn(sample);
