// FMT005 — a pattern with no declared mockSamples gets them generated, but the generator cannot
// handle lookarounds (the case FMT005 names outright). With nothing declared to fall back on the
// build halts and asks for explicit mockSamples.
import {createValidateFn} from '@ts-runtypes/core';
import {String} from '@ts-runtypes/core/formats';

type UngeneratablePattern = String<{pattern: {source: '(?<=x)y(?=z)'}}>;

export const validate = createValidateFn<UngeneratablePattern>();
