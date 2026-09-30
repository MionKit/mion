// A mock picks only union members DataOnly keeps: a Promise or a callable interface member is stripped by
// every compiled function, so a mock that drew one would fail its own validator.

import {describe, expect, it} from 'vitest';
import {createValidateFn} from '@mionjs/run-types';
import {createMockDataFn} from '@mionjs/run-types/mocking';

interface Handler {
  (): void;
  label: string;
}
type WithPromise = {u: Promise<string> | string};
type WithHandler = {u: Handler | number};

describe('mock data never draws a stripped union member', () => {
  it('a Promise member (static)', () => {
    const isValid = createValidateFn<WithPromise>();
    const mock = createMockDataFn<WithPromise>();
    for (let i = 0; i < 30; i++) expect(isValid(mock())).toBe(true);
  });

  it('a Promise member (value)', () => {
    const sample = {u: 'x'} as WithPromise;
    const isValid = createValidateFn(sample);
    const mock = createMockDataFn(sample);
    for (let i = 0; i < 30; i++) expect(isValid(mock())).toBe(true);
  });

  it('a callable interface member (static)', () => {
    const isValid = createValidateFn<WithHandler>();
    const mock = createMockDataFn<WithHandler>();
    for (let i = 0; i < 30; i++) expect(isValid(mock())).toBe(true);
  });

  it('a callable interface member (value)', () => {
    const sample = {u: 1} as WithHandler;
    const isValid = createValidateFn(sample);
    const mock = createMockDataFn(sample);
    for (let i = 0; i < 30; i++) expect(isValid(mock())).toBe(true);
  });
});
