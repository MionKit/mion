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
// Success bar:
//   validate('abc')      === true
//   validate(42)         === false
//   validate(undefined)  === false

import {describe, test, expect, it} from 'vitest';
import {createGetValidationErrorsFn, createValidateFn} from '@mionjs/run-types';

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

// ============================================================================
// An array is never an object of an object type
// ============================================================================
//
// Arrays ARE objects in JavaScript, so `typeof v === 'object' && v !== null` is
// true for one. What normally keeps them out is a required property: an array
// has no `a`, so `typeof v.a === 'string'` is already false and no extra check
// is needed. Shapes with nothing required (all-optional, an index signature, an
// empty type) have no such property, so they carry the `[object Object]` brand
// guard instead.
//
// That optimisation had a hole. It assumed any required property excludes an
// array, but every array carries `length` and its numeric indices, so
// `{length: number}` was satisfied by `[1, 2]` and `{0: string}` by `['x']`.
// A required property only does the job when its NAME is one an array cannot
// supply.

describe('createValidateFn — an array is not an object', () => {
  it('rejects an array for a shape with an ordinary required property', () => {
    const isA = createValidateFn<{a: string}>();
    expect(isA({a: 'x'})).toBe(true);
    expect(isA([])).toBe(false);
    expect(isA([1, 2])).toBe(false);
    expect(isA(['x'])).toBe(false);
  });

  it('rejects an array for an all-optional shape', () => {
    const isOpt = createValidateFn<{a?: string}>();
    expect(isOpt({})).toBe(true);
    expect(isOpt([])).toBe(false);
    expect(isOpt([1, 2])).toBe(false);
  });

  it('rejects an array for an index-signature shape', () => {
    const isRec = createValidateFn<Record<string, number>>();
    expect(isRec({a: 1})).toBe(true);
    expect(isRec([])).toBe(false);
    expect(isRec([1, 2])).toBe(false);
  });

  // The hole. `length` is a property every array has, so it cannot be the thing
  // that keeps arrays out.
  it('rejects an array for a shape whose required property is `length`', () => {
    const isLen = createValidateFn<{length: number}>();
    expect(isLen({length: 2})).toBe(true);
    expect(isLen([])).toBe(false);
    expect(isLen([1, 2])).toBe(false);
    expect(isLen(['a', 'b', 'c'])).toBe(false);
  });

  it('rejects an array for a shape whose required property is a numeric index', () => {
    const isZero = createValidateFn<{0: string}>();
    expect(isZero({0: 'x'})).toBe(true);
    expect(isZero(['x'])).toBe(false);
    expect(isZero(['x', 'y'])).toBe(false);
  });

  // Mixed: `a` is a name no array has, so it still does the job on its own and
  // the shape needs no extra guard. Pinned so the fix cannot creep into shapes
  // that never needed it.
  it('still relies on the ordinary property when the shape has both', () => {
    const isMixed = createValidateFn<{length: number; a: string}>();
    expect(isMixed({length: 1, a: 'x'})).toBe(true);
    expect(isMixed([1, 2])).toBe(false);
  });

  // The error report has to agree with the validator, and say the useful thing:
  // the value is not an object of this type, once, rather than listing every
  // property it is missing.
  it('reports the shape error, not a list of missing properties', () => {
    const lenErrors = createGetValidationErrorsFn<{length: number}>();
    expect(lenErrors({length: 2})).toEqual([]);
    expect(lenErrors([1, 2])).toEqual([{path: [], expected: 'objectLiteral'}]);
    expect(lenErrors([])).toEqual([{path: [], expected: 'objectLiteral'}]);
  });
});
