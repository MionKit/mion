// Regression: the mock walker's negation rejection sampling must agree with the
// COMPILED validator about what the negated child accepts.
//
// The walker (src/mocking/negationMatch.ts) is a runtime mirror of a question
// the generated validators answer by compilation, and its documented bias is to
// over-match: saying "this candidate matches the negated child" only costs a
// retry, while saying "it does not" when the real validator says it does ships a
// value that `validate(mock())` rejects — the O1 soundness gate.
//
// It took the unsound direction for every pattern-bearing named format. `url`
// and `domain` compile to `namedPatternValidate` over their params, but the
// walker tested them with a loose stand-in instead: `new URL()` rejects the
// relative references UriReference / IriReference exist to accept, and the loose
// domain test demands a dot that a single-label Hostname does not have. Found by
// the DataOnly non-data fuzz soak (3 violations in 466 types, all `Not<url>`);
// see docs/done/fuzz-followups.md.
import {describe, it, expect} from 'vitest';
import * as TF from '@ts-runtypes/core/formats';
import {createMockDataFn, createValidateFn, getRunTypeId} from '@ts-runtypes/core';

const RUNS = 200;

describe('negated format mocks are accepted by the compiled validator', () => {
  it('Not<IriReference> — the shape the soak reported', () => {
    const mock = createMockDataFn<TF.Not<TF.IriReference>>();
    const validate = createValidateFn<TF.Not<TF.IriReference>>();
    for (let i = 0; i < RUNS; i++) {
      const value = mock();
      expect(validate(value), `mock produced an IRI reference: ${JSON.stringify(value)}`).toBe(true);
    }
  });

  it('Not<UriReference> — the same relative-reference trap', () => {
    const mock = createMockDataFn<TF.Not<TF.UriReference>>();
    const validate = createValidateFn<TF.Not<TF.UriReference>>();
    for (let i = 0; i < RUNS; i++) {
      const value = mock();
      expect(validate(value), `mock produced a URI reference: ${JSON.stringify(value)}`).toBe(true);
    }
  });

  it('Not<Uri> — the absolute form, where the loose test happened to agree', () => {
    const mock = createMockDataFn<TF.Not<TF.Uri>>();
    const validate = createValidateFn<TF.Not<TF.Uri>>();
    for (let i = 0; i < RUNS; i++) expect(validate(mock())).toBe(true);
  });

  it('Not<Hostname> — a single-label host has no dot, the loose domain test demanded one', () => {
    const mock = createMockDataFn<TF.Not<TF.Hostname>>();
    const validate = createValidateFn<TF.Not<TF.Hostname>>();
    for (let i = 0; i < RUNS; i++) {
      const value = mock();
      expect(validate(value), `mock produced a hostname: ${JSON.stringify(value)}`).toBe(true);
    }
  });

  it('Not<Domain> stays sound', () => {
    const mock = createMockDataFn<TF.Not<TF.Domain>>();
    const validate = createValidateFn<TF.Not<TF.Domain>>();
    for (let i = 0; i < RUNS; i++) expect(validate(mock())).toBe(true);
  });

  it('Not<Email> stays sound', () => {
    const mock = createMockDataFn<TF.Not<TF.Email>>();
    const validate = createValidateFn<TF.Not<TF.Email>>();
    for (let i = 0; i < RUNS; i++) expect(validate(mock())).toBe(true);
  });

  // Pattern-less named formats still ride the loose name test, which over-matches
  // (the safe direction) — pinned so the fallback arm keeps working.
  it('Not<UUID> and Not<IPv4> keep the pattern-less fallback sound', () => {
    const mockUuid = createMockDataFn<TF.Not<TF.UUID>>();
    const validateUuid = createValidateFn<TF.Not<TF.UUID>>();
    const mockIp = createMockDataFn<TF.Not<TF.IPv4>>();
    const validateIp = createValidateFn<TF.Not<TF.IPv4>>();
    for (let i = 0; i < RUNS; i++) {
      expect(validateUuid(mockUuid())).toBe(true);
      expect(validateIp(mockIp())).toBe(true);
    }
  });

  it('Not<StringDate> / Not<StringTime> / Not<StringDateTime> keep the date-family fallback sound', () => {
    // The last NAMED_STRING_FORMATS arms without a pinned case ('date' / 'time'
    // / 'dateTime') — with these, every runtime named-format test in
    // negationMatch.ts has an enumerated soundness pin, which is what lets the
    // fuzz lanes keep only mechanically-1:1 format leaves (typeGen ADMISSION
    // RULE) without losing named-format coverage.
    const mockDate = createMockDataFn<TF.Not<TF.StringDate>>();
    const validateDate = createValidateFn<TF.Not<TF.StringDate>>();
    const mockTime = createMockDataFn<TF.Not<TF.StringTime>>();
    const validateTime = createValidateFn<TF.Not<TF.StringTime>>();
    const mockDateTime = createMockDataFn<TF.Not<TF.StringDateTime>>();
    const validateDateTime = createValidateFn<TF.Not<TF.StringDateTime>>();
    for (let i = 0; i < RUNS; i++) {
      expect(validateDate(mockDate())).toBe(true);
      expect(validateTime(mockTime())).toBe(true);
      expect(validateDateTime(mockDateTime())).toBe(true);
    }
  });

  // Marker coverage rule: both getRunTypeId call shapes resolve a negated format
  // to the same cache entry.
  it('resolves the same id from the static and reflection call shapes', () => {
    const staticId = getRunTypeId<TF.Not<TF.IriReference>>();
    const value: TF.Not<TF.IriReference> = 'not an iri reference' as TF.Not<TF.IriReference>;
    const reflectedId = getRunTypeId(value);
    expect(staticId).toBe(reflectedId);
  });
});
