// format-generator-invalid at a mock-only site: no validator is compiled, yet the generator is still checked.
// Expected: the build halts at the mock call.
import {createMockDataFn} from '@mionjs/run-types/mocking';
import {String} from '@mionjs/run-types/formats';

type KnownName = String<{allowedValues: {val: ['Lee']}; generator: 'lastName'}>;

export const mockKnownName = createMockDataFn<KnownName>();

// The value call shape reports the same error at its own call.
declare const sample: KnownName;
export const mockKnownNameValue = createMockDataFn(sample);
