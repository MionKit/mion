// Generated pattern mockSamples — the runtime half of the auto-generation
// feature: a format pattern with NO declared mockSamples builds under the
// real pipeline (the resolver generates a deterministic pool from the regex
// and bakes it into the emitted annotation), so mocking works with nothing
// declared. The Go matrix (internal/compiler/resolver/
// format_sample_validation_test.go) proves the build-time enrichment,
// determinism, and the FMT005 failure lanes; this spec proves the EMITTED
// artifacts behave: mocks match the regex, validate accepts every mock, and
// both marker call shapes ride the same cache entry.

import type * as TF from '@ts-runtypes/core/formats';
import * as TFV from '@ts-runtypes/core/formats';
import {describe, expect, it} from 'vitest';
import {createMockDataFn, createValidateFn, getRunTypeId} from '@ts-runtypes/core';
import '@ts-runtypes/core/formats';

// Sample-less inline pattern — no mockSamples anywhere in the program.
type Ticket = TF.String<{pattern: {source: '^[a-h]{2}-[0-9]{3}$'; flags: ''}}>;
const TICKET = /^[a-h]{2}-[0-9]{3}$/;

describe('generated pattern mockSamples', () => {
  it('mockData draws regex-matching values — static form', () => {
    const mock = createMockDataFn<Ticket>();
    for (let i = 0; i < 25; i++) expect(mock()).toMatch(TICKET);
  });

  it('mockData draws regex-matching values — reflection form', () => {
    const ticket: Ticket = 'ab-123';
    const mock = createMockDataFn(ticket);
    for (let i = 0; i < 25; i++) expect(mock()).toMatch(TICKET);
  });

  it('both getRunTypeId call shapes agree (one generated pool, one cache entry)', () => {
    const ticket: Ticket = 'ab-123';
    expect(getRunTypeId<Ticket>()).toBe(getRunTypeId(ticket));
  });

  it('every mock passes the emitted validator (validate(mock()) soundness)', () => {
    const mock = createMockDataFn<Ticket>();
    const validate = createValidateFn<Ticket>();
    for (let i = 0; i < 25; i++) expect(validate(mock())).toBe(true);
  });

  it('a seeded mock reproduces the same draw (the pool order is baked in)', () => {
    const mock = createMockDataFn<Ticket>();
    expect(mock({mock: {seed: 7}})).toBe(mock({mock: {seed: 7}}));
    expect(mock({mock: {seed: 8}})).toBe(mock({mock: {seed: 8}}));
  });

  it('value-first sample-less pattern works too (same params, same pool)', () => {
    const schema = TFV.string({pattern: {source: '^[a-h]{2}-[0-9]{3}$', flags: ''}});
    const mock = createMockDataFn(schema);
    const validate = createValidateFn(schema);
    for (let i = 0; i < 25; i++) {
      const value = mock();
      expect(value).toMatch(TICKET);
      expect(validate(value)).toBe(true);
    }
  });
});
