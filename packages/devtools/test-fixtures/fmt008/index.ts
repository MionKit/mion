// FMT008 — a pattern a crafted input can make backtrack exponentially.
// `(\w+\s?)*` splits a run of word characters more than one way per turn, so an input
// that ALMOST matches is retried exponentially many times and the validator hangs.
// Expected: the build halts rather than ship a validator an attacker can stall.
import {createValidateFn} from '@mionjs/run-types';
import {String} from '@mionjs/run-types/formats';

type Runaway = String<{pattern: {source: '^(\\w+\\s?)*$'; mockSamples: ['one two']}}>;

export const validate = createValidateFn<Runaway>();
