// format-generator-invalid: allowedValues already decides the value, so a mock generator beside it is a mistake.
// Expected: the build halts at the validator call.
import {createValidateFn} from '@mionjs/run-types';
import {String} from '@mionjs/run-types/formats';

type KnownName = String<{allowedValues: {val: ['Lee']}; generator: 'lastName'}>;

export const isKnownName = createValidateFn<KnownName>();

// The value call shape reports the same error at its own call.
declare const sample: KnownName;
export const isKnownNameValue = createValidateFn(sample);
