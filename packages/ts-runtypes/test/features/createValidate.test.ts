// End-to-end acceptance test for createValidateFn<T>. Drives the FULL
// vite-plugin pipeline via vitest's vite integration: the plugin
// transforms this file at load time (injecting the runtype hash at
// the createValidateFn call site), serves the `virtual:runtypes-validate`
// module body from the Go-side typefns renderer, and `createValidateFn`
// at runtime dispatches into the precompiled factory.
//
// Migrated from packages/ts-runtypes-devtools/test/rt-validate.test.ts,
// which used a `new Function` eval shortcut to bypass the bundler.
// The pipeline now works end-to-end via the real plugin so the
// shortcut is redundant.
//
// `ts-runtypes` resolves to the package's own
// `src/index.ts` via the `"source"` exports condition
// (vite: resolve.conditions; tsgo: customConditions) — see
// CLAUDE.md → Marker package self-import resolution.
//
// Success bar (from plans/the-idea-is-to-groovy-rainbow.md):
//   validate('abc')      === true
//   validate(42)         === false
//   validate(undefined)  === false

import {describe, test, expect} from 'vitest';
import {createValidateFn} from '@ts-runtypes/core';

describe('createValidateFn<T> — string', () => {
  test('validator returns true for strings, false for non-strings', () => {
    const isString = createValidateFn<string>();
    expect(isString('abc')).toBe(true);
    expect(isString(42)).toBe(false);
    expect(isString(undefined)).toBe(false);
  });

  test('repeated calls return the same cached validator instance', () => {
    const a = createValidateFn<string>();
    const b = createValidateFn<string>();
    expect(a).toBe(b);
  });
});
