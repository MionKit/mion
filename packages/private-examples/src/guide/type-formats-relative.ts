import type * as TF from '@mionjs/run-types/formats';
import {createValidateFn} from '@mionjs/run-types';

// `now` is the current time each time a value is validated
// A birth date in the past, no more than 120 years ago.
type BirthDate = TF.StringDate<{min: 'now-P120Y'; max: 'now'}>;

// A meeting that starts within the next 30 days.
type StartsSoon = TF.StringDateTime<{min: 'now'; max: 'now+P30D'}>;

const isBirthDate = createValidateFn<BirthDate>();
const startsSoon = createValidateFn<StartsSoon>();

isBirthDate('1990-05-20'); // true
isBirthDate('1850-01-01'); // false, more than 120 years ago

export {isBirthDate, startsSoon};
