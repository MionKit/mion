// format-generator-invalid: a last name never starts with a digit, so the mock generator has nothing to produce.
// Expected: the build halts at the validator call.
import {createValidateFn} from '@mionjs/run-types';
import {String} from '@mionjs/run-types/formats';

type DigitName = String<{allowedChars: {val: '0123456789'}; generator: 'lastName'}>;

export const isDigitName = createValidateFn<DigitName>();

// The value call shape reports the same error at its own call.
declare const sample: DigitName;
export const isDigitNameValue = createValidateFn(sample);
