// format-generator-invalid — a last name is never one character long, so the mock generator has nothing to produce.
// Expected: the build halts at the validator call.
import {createValidateFn} from '@mionjs/run-types';
import {String} from '@mionjs/run-types/formats';

type Initial = String<{maxLength: 1; generator: 'lastName'}>;

export const isInitial = createValidateFn<Initial>();
