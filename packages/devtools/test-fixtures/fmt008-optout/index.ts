// The FMT008 escape hatch: the same runaway pattern as the fmt008 fixture, with
// `unsafePattern: true` on it. Expected: the build completes.
import {createValidateFn} from '@mionjs/run-types';
import {String} from '@mionjs/run-types/formats';

type Runaway = String<{
  pattern: {source: '^(\\w+\\s?)*$'; mockSamples: ['one two']; unsafePattern: true};
}>;

export const validate = createValidateFn<Runaway>();
