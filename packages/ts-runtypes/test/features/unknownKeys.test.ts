// End-to-end tests for the unknown-keys predicates:
//
//   - hasUnknownKeys: boolean predicate (plain + runsAfterValidation variant)
//   - unknownKeyErrors: accumulate errors with path tracking
//
// cloneExactShape (the clone-based replacement for the removed mutating
// stripUnknownKeys / unknownKeysToUndefined) has its own full suite at
// test/suites/cloning/.

import {describe, expect, it} from 'vitest';
import {createHasUnknownKeysFn, createUnknownKeyErrorsFn, createValidateFn} from '@ts-runtypes/core';

describe('hasUnknownKeys', () => {
  it('returns false when the value matches the schema', () => {
    const has = createHasUnknownKeysFn<{a: string; b: number}>();
    expect(has({a: 'x', b: 1})).toBe(false);
  });

  it('returns true when an extra key is present', () => {
    const has = createHasUnknownKeysFn<{a: string; b: number}>();
    expect(has({a: 'x', b: 1, extra: true})).toBe(true);
  });

  it('returns false on atomic types', () => {
    const has = createHasUnknownKeysFn<string>();
    expect(has('hello')).toBe(false);
  });

  it('returns false when an optional property is absent', () => {
    const has = createHasUnknownKeysFn<{a: string; b?: number}>();
    expect(has({a: 'x'})).toBe(false);
  });

  it('returns true for an extra key on an interface with all optional props', () => {
    const has = createHasUnknownKeysFn<{a?: string; b?: number}>();
    expect(has({extra: true})).toBe(true);
  });
});

describe('hasUnknownKeys — runsAfterValidation variant', () => {
  // The variant's contract: inputs already PASSED this type's validate. On an
  // all-required shape the emitter swaps the key-array scan for a key-count
  // compare; these tests pin that the fast path answers exactly like the
  // plain variant on validated inputs.
  interface Flat {
    a: string;
    b: number;
  }
  interface Nested {
    name: string;
    address: {street: string; city: string};
  }

  it('agrees with the plain variant on clean validated input', () => {
    const has = createHasUnknownKeysFn<Flat>(undefined, {runsAfterValidation: true});
    expect(has({a: 'x', b: 1})).toBe(false);
  });

  it('detects a root extra key', () => {
    const has = createHasUnknownKeysFn<Flat>(undefined, {runsAfterValidation: true});
    expect(has({a: 'x', b: 1, extra: true})).toBe(true);
  });

  it('detects a nested-only extra key', () => {
    const has = createHasUnknownKeysFn<Nested>(undefined, {runsAfterValidation: true});
    expect(has({name: 'jane', address: {street: '10', city: 'sf', extra: 1}})).toBe(true);
    expect(has({name: 'jane', address: {street: '10', city: 'sf'}})).toBe(false);
  });

  it('optional-prop shapes fall back to the scan and stay correct', () => {
    const has = createHasUnknownKeysFn<{a: string; b?: number}>(undefined, {runsAfterValidation: true});
    expect(has({a: 'x'})).toBe(false);
    expect(has({a: 'x', b: 2})).toBe(false);
    expect(has({a: 'x', extra: 1})).toBe(true);
  });

  it('array elements use the fast path per element', () => {
    const has = createHasUnknownKeysFn<Array<{a: string}>>(undefined, {runsAfterValidation: true});
    expect(has([{a: 'x'}, {a: 'y'}])).toBe(false);
    expect(has([{a: 'x'}, {a: 'y', extra: 1}])).toBe(true);
  });

  it('both variants of the same type coexist (distinct cache entries)', () => {
    const plain = createHasUnknownKeysFn<Flat>();
    const fast = createHasUnknownKeysFn<Flat>(undefined, {runsAfterValidation: true});
    const clean = {a: 'x', b: 1};
    const dirty = {a: 'x', b: 1, extra: true};
    expect(plain(clean)).toBe(false);
    expect(fast(clean)).toBe(false);
    expect(plain(dirty)).toBe(true);
    expect(fast(dirty)).toBe(true);
  });

  it('composes with validate for the assertStrict flow', () => {
    const validate = createValidateFn<Nested>();
    const has = createHasUnknownKeysFn<Nested>(undefined, {runsAfterValidation: true});
    const isStrict = (v: unknown) => validate(v) && !has(v);
    expect(isStrict({name: 'jane', address: {street: '10', city: 'sf'}})).toBe(true);
    expect(isStrict({name: 'jane', address: {street: '10', city: 'sf', extra: 1}})).toBe(false);
    expect(isStrict({name: 'jane'})).toBe(false); // fails validate, huk never runs
  });
});

describe('unknownKeyErrors', () => {
  it('returns an empty array when the value matches the schema', () => {
    const validate = createUnknownKeyErrorsFn<{a: string; b: number}>();
    expect(validate({a: 'x', b: 1})).toEqual([]);
  });

  it('reports one error per unknown key with path including the key', () => {
    const validate = createUnknownKeyErrorsFn<{a: string}>();
    const errors = validate({a: 'x', extra: 1});
    expect(errors).toEqual([{path: ['extra'], expected: 'never'}]);
  });

  it('returns an empty array for atomic types', () => {
    const validate = createUnknownKeyErrorsFn<string>();
    expect(validate('hello')).toEqual([]);
  });

  it('collects multiple errors when many unknown keys present', () => {
    const validate = createUnknownKeyErrorsFn<{a: string}>();
    const errors = validate({a: 'x', extra1: 1, extra2: 2});
    expect(errors).toHaveLength(2);
    expect(errors.map((e) => e.path[0]).sort()).toEqual(['extra1', 'extra2']);
    expect(errors.every((e) => e.expected === 'never')).toBe(true);
  });
});

describe('nested unknown-keys cases (hasUnknownKeys)', () => {
  interface User {
    name: string;
    address: {street: string; city: string};
  }

  it('detects unknowns in nested object', () => {
    const has = createHasUnknownKeysFn<User>();
    expect(has({name: 'jane', address: {street: '10', city: 'sf', extra: true}})).toBe(true);
  });

  it('returns false for arrays of objects without extras', () => {
    const has = createHasUnknownKeysFn<Array<{a: string}>>();
    expect(has([{a: 'x'}, {a: 'y'}])).toBe(false);
  });

  it('returns true when an array element has an extra key', () => {
    const has = createHasUnknownKeysFn<Array<{a: string}>>();
    expect(has([{a: 'x'}, {a: 'y', extra: 1}])).toBe(true);
  });

  it('returns false when the schema has an index signature (any key allowed)', () => {
    const has = createHasUnknownKeysFn<{[key: string]: number}>();
    expect(has({a: 1, b: 2, anyOther: 3})).toBe(false);
  });

  it('reports unknown keys on a tuple inside an array', () => {
    const has = createHasUnknownKeysFn<Array<[string, {a: number}]>>();
    expect(
      has([
        ['x', {a: 1}],
        ['y', {a: 2, extra: 1}],
      ])
    ).toBe(true);
  });

  it('default ignores the checkNonRTProps option for a RT-only schema', () => {
    const has = createHasUnknownKeysFn<{a: string}>();
    expect(has({a: 'x'}, {checkNonRTProps: true})).toBe(false);
    expect(has({a: 'x', extra: 1}, {checkNonRTProps: true})).toBe(true);
  });
});

// ============================================================================
// Union types — the merged-allowlist semantic (has / keyErrors)
// ============================================================================
//
// For a union `{a: string} | {b: number}` the declared key set is the UNION
// of every object member's declared property names. hasUnknownKeys and
// unknownKeyErrors flag/report anything outside that set. (cloneExactShape's
// union stance — per-member dispatch for atomic unions, CES001 for
// object-bearing ones — is pinned in test/suites/cloning/Unions.ts.)

describe('union types — has/keyErrors merged allowlist', () => {
  type Disjoint = {a: string} | {b: number};

  it('hasUnknownKeys returns false when only union-declared keys are present', () => {
    const has = createHasUnknownKeysFn<Disjoint>();
    expect(has({a: 'x', b: 5})).toBe(false);
  });

  it('hasUnknownKeys returns true when any undeclared key is present', () => {
    const has = createHasUnknownKeysFn<Disjoint>();
    expect(has({a: 'x', evil: true})).toBe(true);
  });

  it('unknownKeyErrors reports one error per undeclared key', () => {
    const errs = createUnknownKeyErrorsFn<Disjoint>();
    const out = errs({a: 'x', evil: 'e1', stranger: 'e2'});
    expect(out).toHaveLength(2);
    expect(out.every((e) => e.expected === 'never')).toBe(true);
    const paths = out.map((e) => e.path?.[0]).sort();
    expect(paths).toEqual(['evil', 'stranger']);
  });
});

// ============================================================================
// Map<K, V> and Set<T> — iterable unknown-keys (has / keyErrors)
// ============================================================================

interface SmallObject {
  a: string;
  b: number;
}

describe('iterables — Map<K, V> unknown-keys', () => {
  it('hasUnknownKeys: false when no inner object carries extras', () => {
    const has = createHasUnknownKeysFn<Map<string, SmallObject>>();
    const m = new Map<string, SmallObject>([
      ['k1', {a: 'x', b: 1}],
      ['k2', {a: 'y', b: 2}],
    ]);
    expect(has(m)).toBe(false);
  });

  it('hasUnknownKeys: true when an inner value object has an extra key', () => {
    const has = createHasUnknownKeysFn<Map<string, SmallObject>>();
    const m = new Map<string, unknown>([
      ['k1', {a: 'x', b: 1, extra: 'gone'}],
      ['k2', {a: 'y', b: 2}],
    ]);
    expect(has(m as Map<string, SmallObject>)).toBe(true);
  });

  it('unknownKeyErrors: empty when no inner extras', () => {
    const errs = createUnknownKeyErrorsFn<Map<string, SmallObject>>();
    const m = new Map<string, SmallObject>([['k1', {a: 'x', b: 1}]]);
    expect(errs(m)).toEqual([]);
  });

  it('unknownKeyErrors: reports per-entry unknown key with path', () => {
    const errs = createUnknownKeyErrorsFn<Map<string, SmallObject>>();
    const m = new Map<string, unknown>([['k1', {a: 'x', b: 1, extra: 'gone'}]]);
    const out = errs(m as Map<string, SmallObject>);
    expect(out).toHaveLength(1);
    expect(out[0].expected).toBe('never');
    expect(out[0].path).toContain('extra');
  });
});

describe('iterables — Set<T> unknown-keys', () => {
  it('hasUnknownKeys: false when no element object carries extras', () => {
    const has = createHasUnknownKeysFn<Set<SmallObject>>();
    const s = new Set<SmallObject>([{a: 'x', b: 1}]);
    expect(has(s)).toBe(false);
  });

  it('hasUnknownKeys: true when an element object has an extra key', () => {
    const has = createHasUnknownKeysFn<Set<SmallObject>>();
    const s: Set<SmallObject> = new Set([{a: 'x', b: 1, extra: 'gone'} as SmallObject]);
    expect(has(s)).toBe(true);
  });

  it('unknownKeyErrors: reports unknown keys on elements', () => {
    const errs = createUnknownKeyErrorsFn<Set<SmallObject>>();
    const s = new Set([{a: 'x', b: 1, extra: 'gone'} as SmallObject]);
    const out = errs(s);
    expect(out).toHaveLength(1);
    expect(out[0].expected).toBe('never');
    expect(out[0].path).toContain('extra');
  });
});
