// Mock soundness: `validate(createMockDataFn<T>()())` must hold — or fail
// loudly. Pins the mocking-gaps and format-pattern-samples soundness fixes:
//   1. format case-transforms apply to mocks (the fmt cache lookup used a
//      dead 'fmt_'-prefixed key; now resolved via familyTag scan);
//   2. domain formats restricted by allowedValues mock FROM the allowed set;
//   3. same-shape formats differing only in mockSamples share ONE entry
//      (samples are NOT id-relevant — they describe the same validator), and
//      the shared entry still mocks soundly;
//   4. length-incompatible pattern samples never silently produce an invalid
//      mock — the mock throws a pointed error instead;
//   5. a FormatPattern's `message` is surfaced as the validation error `val`.
//
// (Marker coverage rule: both getRunTypeId call shapes on the sample-distinct
// formats, with a per-form convergence assert.)

import {describe, expect, it} from 'vitest';
import {
  createValidateFn,
  createGetValidationErrorsFn,
  createMockDataFn,
  createFormatTransformFn,
  getRunTypeId,
  type TypeFormat,
} from '@ts-runtypes/core';
// Side-effect import FIRST: the formats module registers the per-kind mock
// fns at load (mockStringFormat). The named import below is erased by the
// transpiler when its bindings are only used as TYPES — without this value
// import the registry stays empty and every format mocks as a plain random
// string (the exact trap mion's CLAUDE.md warns about).
import '@ts-runtypes/core/formats';
import {Lowercase, String as StringFormat} from '@ts-runtypes/core/formats';

describe('mock soundness — validate(mock()) holds or fails loudly', () => {
  it('applies the declared case transform to mocks (fmt entry resolved by familyTag)', () => {
    type LoweredTag = Lowercase<{mockSamples: ['MiXeD', 'UPPERCASE', 'already']}>;
    // The fmt family is demand-driven: this call site is what compiles the
    // transform entry the mock generator must find.
    const toCanonical = createFormatTransformFn<LoweredTag>();
    expect(toCanonical('ABC')).toBe('abc');
    const mock = createMockDataFn<LoweredTag>();
    for (let i = 0; i < 8; i++) {
      const value = mock() as string;
      expect(value).toBe(value.toLowerCase());
    }
  });

  it('domain formats restricted by allowedValues mock from the allowed set', () => {
    type PinnedDomain = TypeFormat<string, 'domain', {allowedValues: {val: ['alpha.example', 'beta.example']}}>;
    const isPinnedDomain = createValidateFn<PinnedDomain>();
    const mock = createMockDataFn<PinnedDomain>();
    for (let i = 0; i < 8; i++) {
      const value = mock() as string;
      expect(['alpha.example', 'beta.example']).toContain(value);
      expect(isPinnedDomain(value)).toBe(true);
    }
  });

  it('same-shape formats differing only in mockSamples share ONE entry and still mock soundly', () => {
    type FormatA = StringFormat<{maxLength: 10; mockSamples: ['aaa', 'aa']}>;
    type FormatB = StringFormat<{maxLength: 10; mockSamples: ['zzz', 'zz']}>;
    const idA = getRunTypeId<FormatA>();
    const idB = getRunTypeId<FormatB>();
    // Samples are generation metadata, not validation behaviour: the two
    // formats describe the SAME validator, so they dedup onto one entry.
    expect(idA).toBe(idB);
    // reflect form converges too (marker coverage rule)
    const sampleA: FormatA = 'aaa';
    expect(getRunTypeId(sampleA)).toBe(idA);
    // The shared entry mocks from the first-interned pool; assert soundness
    // (validate holds, bound respected), not a specific pool.
    const isFormat = createValidateFn<FormatA>();
    const mockA = createMockDataFn<FormatA>();
    for (let i = 0; i < 8; i++) {
      const value = mockA() as string;
      expect(isFormat(value)).toBe(true);
      expect(value.length).toBeLessThanOrEqual(10);
    }
  });

  it('length-compatible samples survive the bound filter; incompatible-only samples throw', () => {
    type Mixed = StringFormat<{minLength: 5; pattern: {source: '^a+$'; flags: ''; mockSamples: ['aa', 'aaaaaa']}}>;
    const isMixed = createValidateFn<Mixed>();
    const mockMixed = createMockDataFn<Mixed>();
    for (let i = 0; i < 8; i++) {
      const value = mockMixed() as string;
      expect(value).toBe('aaaaaa'); // the only sample satisfying minLength
      expect(isMixed(value)).toBe(true);
    }

    type Impossible = StringFormat<{minLength: 5; pattern: {source: '^b+$'; flags: ''; mockSamples: ['b', 'bb']}}>;
    const mockImpossible = createMockDataFn<Impossible>();
    expect(() => mockImpossible()).toThrow(/`mockSamples` compatible with the length bounds/);
  });

  it("surfaces a pattern's `message` as the validation error format val", () => {
    type Slugish = StringFormat<{pattern: {source: '^[a-z-]+$'; flags: ''; mockSamples: ['my-slug']; message: 'must be a slug'}}>;
    const getErrors = createGetValidationErrorsFn<Slugish>();
    const errors = getErrors('NOT A SLUG!') as Array<{format?: {name?: string; val?: unknown}}>;
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].format?.val).toBe('must be a slug');
    expect(getErrors('my-slug')).toEqual([]);
  });
});
