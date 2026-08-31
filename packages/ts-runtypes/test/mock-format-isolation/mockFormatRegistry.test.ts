// Regression for docs/done/mock-format-registry-side-effect-import.md: the
// per-kind format mock fns must register via the mock subtree itself, NOT as
// a side effect of importing ts-runtypes/formats. This suite runs as its own
// vitest project so this file's runtime import graph is the trigger shape: the
// ONLY formats import below is type-only (erased at transpile), exactly what a
// consumer using format brands in type positions ships. Before the fix that
// left mockRegistry empty and every format-branded node mocked as a
// kind-default value that failed its own validator (500/500 in the original
// repro). Keep this file free of VALUE imports of the formats subpath — adding
// one would mask the regression.

import {describe, expect, it} from 'vitest';
import {createMockDataFn, createValidateFn, getRunTypeId} from '@mionjs/run-types';
import type * as TF from '@mionjs/run-types/formats';

interface User {
  id: TF.UUIDv4;
  email?: TF.Email;
  age: TF.Number<{integer: true; min: 0; max: 130}>;
}

const MOCK_ROUNDS = 25;

const SEED_USER: User = {
  id: '3f2f38f5-8b2e-4b0e-9f0a-0d9c2a4b1e77' as TF.UUIDv4,
  email: 'seed@example.com' as TF.Email,
  age: 30 as TF.Number<{integer: true; min: 0; max: 130}>,
};

describe('mock format registry — sound without a formats value import', () => {
  it('static shape: every createMockDataFn<User>() value passes createValidateFn<User>()', () => {
    const mockUser = createMockDataFn<User>();
    const isUser = createValidateFn<User>();
    for (let round = 0; round < MOCK_ROUNDS; round++) {
      const value = mockUser();
      expect(isUser(value)).toBe(true);
    }
  });

  it('reflection shape: every createMockDataFn(value) mock passes createValidateFn(value)', () => {
    const mockUser = createMockDataFn(SEED_USER);
    const isUser = createValidateFn(SEED_USER);
    for (let round = 0; round < MOCK_ROUNDS; round++) {
      const value = mockUser();
      expect(isUser(value)).toBe(true);
    }
  });

  it('both getRunTypeId shapes resolve the same hash (marker coverage rule)', () => {
    expect(getRunTypeId(SEED_USER)).toBe(getRunTypeId<User>());
  });
});
