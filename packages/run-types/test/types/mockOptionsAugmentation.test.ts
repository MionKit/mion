// Enforced by `typecheck:test` (vitest erases types); the runtime `it` keeps the file in the suite.
// An augmentation must declare the same type parameters, so dropping `T` breaks every extension field typed by it.

import {describe, it, expect} from 'vitest';
import type {RunTypeMockOptions} from '@mionjs/run-types/mocking';

declare module '@mionjs/run-types/mocking' {
  interface RunTypeMockOptions<T> {
    augmentationProbe?: {[K in keyof T]?: T[K]};
  }
}

type User = {name: string};

const typed: RunTypeMockOptions<User> = {augmentationProbe: {name: 'Ada'}};
// @ts-expect-error the field is typed against T
const wrongType: RunTypeMockOptions<User> = {augmentationProbe: {name: 1}};

describe('RunTypeMockOptions augmentation', () => {
  it('types an augmented field against T', () => {
    expect(typed.augmentationProbe?.name).toBe('Ada');
    expect(wrongType).toBeDefined();
  });
});
