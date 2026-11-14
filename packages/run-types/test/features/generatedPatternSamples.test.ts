// Runtime half of pattern-sample generation: a pattern with no mockSamples gets a pool baked in at build time,
// random per build unless a literal `{mock: {seed}}` pins it. Generation, seeding and failure lanes are proven by
// pkg/compiler/resolver/format_sample_validation_test.go; this spec checks the emitted artifacts within one build.

import type * as TF from '@mionjs/run-types/formats';
import * as TFV from '@mionjs/run-types/formats';
import {describe, expect, it} from 'vitest';
import {createValidateFn, getRunTypeId} from '@mionjs/run-types';
import {createMockDataFn} from '@mionjs/run-types/mocking';
import '@mionjs/run-types/formats';

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

  it('a literal factory seed (the CompTimeHints lane) mocks reproducibly end to end', () => {
    // The literal {mock: {seed: 11}} is read at BUILD time (it pins this
    // pattern's generated pool — the cross-build half is pinned by the Go
    // resolver tests) AND merges into every call as the runtime pick seed,
    // so one knob makes the whole mock reproducible.
    const mock = createMockDataFn<Ticket>(undefined, {mock: {seed: 11}});
    const validate = createValidateFn<Ticket>();
    const first = mock();
    expect(first).toMatch(TICKET);
    expect(validate(first)).toBe(true);
    expect(mock()).toBe(first);
  });

  it('a dynamic options bag stays legal (CompTimeHints never validates)', () => {
    const dynamicOptions = {mock: {seed: Number('9')}};
    const mock = createMockDataFn<Ticket>(undefined, dynamicOptions);
    // The computed seed is invisible to the build (the pool stays on the
    // per-build key) but works fine at runtime for the pick.
    expect(mock()).toMatch(TICKET);
    expect(mock()).toBe(mock());
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
