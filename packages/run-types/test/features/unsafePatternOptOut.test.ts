// The FMT008 escape hatch, end to end under the real pipeline.
//
// The build rejects a `pattern` that a crafted input can make backtrack
// exponentially: the emitted validator runs that regex on every value it
// sees, so a runaway pattern is a way to stall whatever ships it. The Go
// side owns the check itself (internal/regexsafety) and the diagnostic
// matrix (internal/compiler/resolver/format_pattern_safety_test.go).
//
// What this spec proves is the opt-out: `unsafePattern: true` on the
// pattern, on BOTH roads a pattern reaches the build by — the inline
// `{source, ...}` literal read from the type, and a registerFormatPattern
// const read from the call site. This file only compiles at all because
// the flag is honoured; without it the build halts on FMT008.

import type * as TF from '@mionjs/run-types/formats';
import {describe, expect, it} from 'vitest';
import {createValidateFn, getRunTypeId, registerFormatPattern} from '@mionjs/run-types';
import '@mionjs/run-types/formats';

// `(\w+\s?)*` splits a run of word characters more than one way per turn.
const RUNAWAY_SOURCE = '^(\\w+\\s?)*$';

type WordRun = TF.String<{
  pattern: {source: '^(\\w+\\s?)*$'; mockSamples: ['one two']; unsafePattern: true};
}>;

const WORD_RUN_PATTERN = registerFormatPattern({
  source: '^(\\w+\\s?)*$',
  mockSamples: ['one two'],
  unsafePattern: true,
});

type RegisteredWordRun = TF.String<{pattern: typeof WORD_RUN_PATTERN}>;

// A safe pattern, declared twice: once plain, once opted out. Both build,
// which is what makes them usable for the id assertion below.
type Slug = TF.String<{pattern: {source: '^[a-z]+$'; mockSamples: ['abc']}}>;
type SlugOptedOut = TF.String<{pattern: {source: '^[a-z]+$'; mockSamples: ['abc']; unsafePattern: true}}>;

describe('unsafePattern opts a pattern out of the backtracking check', () => {
  it('the inline literal form builds and validates', () => {
    const validate = createValidateFn<WordRun>();
    expect(validate('one two')).toBe(true);
    // A hyphen is neither \w nor \s, so this cannot match. Kept short on
    // purpose: this is the very pattern the check exists to reject, and a
    // long non-match is what takes exponential time.
    expect(validate('a-b')).toBe(false);
  });

  it('the registerFormatPattern form builds and validates', () => {
    const validate = createValidateFn<RegisteredWordRun>();
    expect(validate('one two')).toBe(true);
    expect(validate('a-b')).toBe(false);
  });

  it('registerFormatPattern keeps the flag on the frozen pattern', () => {
    expect(WORD_RUN_PATTERN.source).toBe(RUNAWAY_SOURCE);
    expect(WORD_RUN_PATTERN.unsafePattern).toBe(true);
  });

  it('getRunTypeId agrees across call shapes — static form', () => {
    expect(typeof getRunTypeId<WordRun>()).toBe('string');
  });

  it('getRunTypeId agrees across call shapes — reflection form', () => {
    const value: WordRun = 'one two';
    expect(typeof getRunTypeId(value)).toBe('string');
  });

  it('both call shapes resolve to one cache entry', () => {
    const value: WordRun = 'one two';
    expect(getRunTypeId<WordRun>()).toBe(getRunTypeId(value));
  });

  it('both roads to a pattern recover the same params', () => {
    // The inline literal is read from the resolved type, the registered
    // const from its call site. Same source, same samples, same flag, so
    // they must land on one cache entry.
    expect(getRunTypeId<WordRun>()).toBe(getRunTypeId<RegisteredWordRun>());
  });

  it('opting out is part of the type: the flag changes the cache entry', () => {
    // The flag is a real format param, not a comment, so a checked and an
    // opted-out pattern do not silently share one entry, which would make
    // the verdict depend on scan order (the FMT006 trap).
    expect(getRunTypeId<Slug>()).not.toBe(getRunTypeId<SlugOptedOut>());
  });
});
