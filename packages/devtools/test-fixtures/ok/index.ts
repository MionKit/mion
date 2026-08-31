// Positive control for buildFailure.spec.ts: a well-formed pattern that builds clean, so a failing
// negative case is known to have failed for ITS reason and not because the harness fails everything.
// Generation-friendly on purpose (a plain bounded char-class, no declared mockSamples), which also
// makes it the fixture that FMT005s when patternSampleCount is forced to 0.
import {createValidateFn} from '@mionjs/run-types';
import {String} from '@mionjs/run-types/formats';

type Sku = String<{pattern: {source: '^[a-z]{3}-[0-9]{2}$'}}>;

export const validate = createValidateFn<Sku>();
