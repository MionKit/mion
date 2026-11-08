// format-generator-invalid at a mock-only site: no validator is compiled, yet every mock call would throw.
// Expected: the build halts at the mock call.
import {createMockDataFn} from '@mionjs/run-types/mocking';
import {String} from '@mionjs/run-types/formats';

type DigitName = String<{allowedChars: {val: '0123456789'}; generator: 'lastName'}>;

export const mockDigitName = createMockDataFn<DigitName>();

// The value call shape reports the same error at its own call.
declare const sample: DigitName;
export const mockDigitNameValue = createMockDataFn(sample);
