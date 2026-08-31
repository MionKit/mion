// End-to-end tests for the unknown-keys predicates:
//
//   - hasUnknownKeys: boolean predicate (plain + runsAfterValidation variant)
//   - unknownKeyErrors: accumulate errors with path tracking
//
// cloneExactShape (the clone-based replacement for the removed mutating
// stripUnknownKeys / unknownKeysToUndefined) has its own full suite at
// test/suites/cloning/.

import {describe, expect, it} from 'vitest';
import {
  createGetValidationErrorsFn,
  createHasUnknownKeysFn,
  createUnknownKeyErrorsFn,
  createValidateFn,
  getFnHash,
  getRunType,
} from '@ts-runtypes/core';

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

// A NAMED nested type (a type alias or interface used as a property) compiles to
// its OWN cache entry and is reached by a call, where an anonymous one is inlined
// into the parent body. The option is a claim about the value, not about the root
// call, so it must reach the named child too: if `v` passed validate then so did
// `v.address`.
interface Address {
  street: string;
  city: string;
}
interface Person {
  name: string;
  address: Address;
}

describe('hasUnknownKeys — runsAfterValidation reaches named nested types', () => {
  it('answers like the plain predicate on a named nested type', () => {
    const plain = createHasUnknownKeysFn<Person>();
    const fast = createHasUnknownKeysFn<Person>(undefined, {runsAfterValidation: true});
    const clean = {name: 'jane', address: {street: '10', city: 'sf'}};
    const dirtyNested = {name: 'jane', address: {street: '10', city: 'sf', extra: 1}};
    const dirtyRoot = {name: 'jane', address: {street: '10', city: 'sf'}, extra: 1};
    expect([plain(clean), fast(clean)]).toEqual([false, false]);
    expect([plain(dirtyNested), fast(dirtyNested)]).toEqual([true, true]);
    expect([plain(dirtyRoot), fast(dirtyRoot)]).toEqual([true, true]);
  });

  it('compiles the named child to the key-count fast path, not the key scan', () => {
    // The nested type read on its own: an all-required object, so the whole body
    // is the O(1) count compare with no per-object guard.
    const nested = createHasUnknownKeysFn<Address>(undefined, {runsAfterValidation: true}).toString();
    expect(nested).toContain('cntEK(v) !== 2');
    expect(nested).not.toContain('hUKFA');
    expect(nested).not.toContain('typeof v ===');
  });

  it('dep-calls the fast-path child entry from the parent, not the plain one', () => {
    // The parent body names its child entry by cache key, `<fnHash>_<typeId>`.
    // Before the fast path propagated, that key carried the PLAIN hash and the
    // child ran the scan; it must now carry the variant's own hash.
    const parent = createHasUnknownKeysFn<Person>(undefined, {runsAfterValidation: true}).toString();
    expect(parent).toContain(`${getFnHash('huk', {runsAfterValidation: true})}_`);
    expect(parent).not.toContain(`${getFnHash('huk')}_`);
  });

  it('the plain predicate keeps the scan for the same named type', () => {
    const nested = createHasUnknownKeysFn<Address>().toString();
    expect(nested).toContain('hUKFA');
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
// Unions descend into their members
// ============================================================================
//
// The merged allowlist answers for the union's OWN keys. On its own that left a
// nested object inside a member unlooked-at, so `{tag:'n', inner:{x:1, evil:2}}`
// came back clean. Descent fixes that: every unambiguous merged property is
// walked, so every nested object carries its own check, exactly like an object
// that is not under a union.

interface NestedInner {
  x: number;
}
interface WrapNested {
  tag: 'n';
  inner: NestedInner;
}
interface WrapPlain {
  tag: 'm';
  other: string;
}
type WrapUnion = WrapNested | WrapPlain;

describe('union types — descent into member objects', () => {
  const has = createHasUnknownKeysFn<WrapUnion>();
  const errs = createUnknownKeyErrorsFn<WrapUnion>();

  it('finds an extra key nested inside a member', () => {
    const dirty = {tag: 'n', inner: {x: 1, evil: 2}};
    expect(has(dirty)).toBe(true);
    expect(errs(dirty)).toEqual([{path: ['inner', 'evil'], expected: 'never'}]);
  });

  it('stays clean when the nested object is clean', () => {
    expect(has({tag: 'n', inner: {x: 1}})).toBe(false);
    expect(errs({tag: 'n', inner: {x: 1}})).toEqual([]);
  });

  // The other member does not declare `inner` at all, so the descent reads
  // `undefined`. The nested object arm carries its own shape guard, so it
  // contributes nothing rather than inventing an error.
  it('does not false-positive on the member that lacks the nested prop', () => {
    expect(has({tag: 'm', other: 'x'})).toBe(false);
    expect(errs({tag: 'm', other: 'x'})).toEqual([]);
  });

  it("still reports the union's own undeclared keys, and both together", () => {
    const both = {tag: 'n', inner: {x: 1, evil: 2}, alien: true};
    expect(has(both)).toBe(true);
    const paths = errs(both)
      .map((e) => JSON.stringify(e.path))
      .sort();
    expect(paths).toEqual([JSON.stringify(['alien']), JSON.stringify(['inner', 'evil'])]);
  });

  it('agrees with the validator on the nested case', () => {
    const isWrapStrict = createValidateFn<WrapUnion>(undefined, {checkUnknowns: true});
    expect(isWrapStrict({tag: 'n', inner: {x: 1}})).toBe(true);
    expect(isWrapStrict({tag: 'n', inner: {x: 1, evil: 2}})).toBe(false);
  });
});

// A merged property TWO members declare with different object shapes is
// ambiguous: `data` is `{x:number}` on one branch and `{y:number}` on the other.
// Descending either would report the other's keys as undeclared on a clean
// value, and choosing the right one means validating, which this family does not
// do. So the prop is skipped and the loose merged allowlist stops at that level.
// Pinned, so it stays a decision rather than becoming a surprise.

interface AmbA {
  tag: 'a';
  data: {x: number};
}
interface AmbB {
  tag: 'b';
  data: {y: number};
}
type Ambiguous = AmbA | AmbB;

describe('union types — an ambiguous merged prop is not descended into', () => {
  it('never false-positives on a clean value of either branch', () => {
    const has = createHasUnknownKeysFn<Ambiguous>();
    const errs = createUnknownKeyErrorsFn<Ambiguous>();
    expect(has({tag: 'a', data: {x: 1}})).toBe(false);
    expect(errs({tag: 'a', data: {x: 1}})).toEqual([]);
    expect(has({tag: 'b', data: {y: 1}})).toBe(false);
    expect(errs({tag: 'b', data: {y: 1}})).toEqual([]);
  });

  it('trades that for missing an extra key at the ambiguous level', () => {
    const has = createHasUnknownKeysFn<Ambiguous>();
    expect(has({tag: 'a', data: {x: 1, evil: 2}})).toBe(false);
    // The fused validator DOES catch it, because it follows the branch it
    // matched. Anywhere the two must agree, use the fused one.
    const strict = createValidateFn<Ambiguous>(undefined, {checkUnknowns: true});
    expect(strict({tag: 'a', data: {x: 1, evil: 2}})).toBe(false);
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

// A value that is not the shape the schema declares carries no "declared vs
// undeclared key" question at all, so both families answer NEUTRALLY: no
// errors from unknownKeyErrors, false from hasUnknownKeys. Reporting the
// shape is getValidationErrors' job. That split is what keeps the documented
// strict report — `[...verr(v), ...uke(v)]` — carrying exactly ONE shape
// error instead of a duplicate pair.
//
// Before the guard landed, the descent ran anyway: it read `v.address`
// against null (a TypeError), and `for (const k in v)` over a string or an
// array yielded one bogus `{expected: 'never'}` entry per character / index.
describe('unknown keys on a value the schema does not admit', () => {
  interface Nested {
    street: string;
    city: string;
  }
  interface Shape {
    name: string;
    age: number;
    address: Nested;
  }

  const notObjects: [string, unknown][] = [
    ['null', null],
    ['undefined', undefined],
    ['a string', 'a string'],
    ['a number', 42],
    ['a boolean', true],
    ['an array', [1, 2, 3]],
  ];

  describe.each(notObjects)('%s', (_label, value) => {
    it('unknownKeyErrors returns an empty array and never throws', () => {
      const keyErrors = createUnknownKeyErrorsFn<Shape>();
      expect(keyErrors(value as never)).toEqual([]);
    });

    it('hasUnknownKeys returns false and never throws', () => {
      const has = createHasUnknownKeysFn<Shape>();
      expect(has(value)).toBe(false);
    });

    it('the strict report says only what getValidationErrors says', () => {
      // uke adds nothing, so concatenating the two never double-reports the
      // shape. (An array IS an object, so getValidationErrors descends into
      // it and reports the missing props rather than one root error — either
      // way the composition is exactly its own output.)
      const typeErrors = createGetValidationErrorsFn<Shape>();
      const keyErrors = createUnknownKeyErrorsFn<Shape>();
      expect([...typeErrors(value as never), ...keyErrors(value as never)]).toEqual(typeErrors(value as never));
    });
  });

  it('a non-object root reports one shape error and nothing else', () => {
    const typeErrors = createGetValidationErrorsFn<Shape>();
    const keyErrors = createUnknownKeyErrorsFn<Shape>();
    for (const value of [null, undefined, 'a string', 42, true]) {
      expect([...typeErrors(value as never), ...keyErrors(value as never)]).toEqual([{path: [], expected: 'objectLiteral'}]);
    }
  });

  it('guards a NESTED position too, not just the root', () => {
    const keyErrors = createUnknownKeyErrorsFn<Shape>();
    const has = createHasUnknownKeysFn<Shape>();
    for (const address of ['oops', null, 42]) {
      const value = {name: 'jane', age: 1, address};
      expect(keyErrors(value as never)).toEqual([]);
      expect(has(value)).toBe(false);
    }
  });

  it('still reports real unknown keys at both depths', () => {
    const keyErrors = createUnknownKeyErrorsFn<Shape>();
    const has = createHasUnknownKeysFn<Shape>();
    const good = {name: 'jane', age: 1, address: {street: '10', city: 'sf'}};
    expect(keyErrors(good as never)).toEqual([]);
    expect(has(good)).toBe(false);
    expect(keyErrors({...good, extra: 1} as never)).toEqual([{path: ['extra'], expected: 'never'}]);
    expect(has({...good, extra: 1})).toBe(true);
    const dirtyNested = {...good, address: {street: '10', city: 'sf', zip: 9}};
    expect(keyErrors(dirtyNested as never)).toEqual([{path: ['address', 'zip'], expected: 'never'}]);
    expect(has(dirtyNested)).toBe(true);
  });

  // Both call shapes of the factory (static `<T>()` and value-first, passing
  // the RunType handle) resolve to the same compiled entry, so the guard has
  // to hold for both.
  it('(static form) answers []/false on a rejected value', () => {
    const keyErrors = createUnknownKeyErrorsFn<Shape>();
    const has = createHasUnknownKeysFn<Shape>();
    expect(keyErrors(null as never)).toEqual([]);
    expect(has(null)).toBe(false);
  });

  it('(value-first form) answers []/false on a rejected value', () => {
    const keyErrors = createUnknownKeyErrorsFn(getRunType<Shape>());
    const has = createHasUnknownKeysFn(getRunType<Shape>());
    expect(keyErrors(null as never)).toEqual([]);
    expect(has(null)).toBe(false);
  });
});

// Container roots read `v.length`, `v[0]` or iterate the value, all of which
// throw on null/undefined. A Map / Set root additionally used to bail with a
// bare `return`, which — inlined into the parent closure — abandoned the whole
// walk and handed back `undefined` where the contract promises an array.
describe('unknown keys on a container root the value does not match', () => {
  interface Item {
    a: string;
    nested: {b: string};
  }

  const rejected: unknown[] = [null, undefined, 'a string', 42];

  it('array root', () => {
    const keyErrors = createUnknownKeyErrorsFn<Item[]>();
    const has = createHasUnknownKeysFn<Item[]>();
    for (const value of rejected) {
      expect(keyErrors(value as never)).toEqual([]);
      expect(has(value)).toBe(false);
    }
    expect(keyErrors([{a: 'x', nested: {b: 'y'}, extra: 1}] as never)).toEqual([{path: [0, 'extra'], expected: 'never'}]);
  });

  it('tuple root', () => {
    const keyErrors = createUnknownKeyErrorsFn<[Item, Item]>();
    const has = createHasUnknownKeysFn<[Item, Item]>();
    for (const value of rejected) {
      expect(keyErrors(value as never)).toEqual([]);
      expect(has(value)).toBe(false);
    }
  });

  it('Map root returns the errors array, not undefined', () => {
    const keyErrors = createUnknownKeyErrorsFn<Map<string, Item>>();
    for (const value of rejected) {
      expect(keyErrors(value as never)).toEqual([]);
    }
  });

  it('Set root returns the errors array, not undefined', () => {
    const keyErrors = createUnknownKeyErrorsFn<Set<Item>>();
    for (const value of rejected) {
      expect(keyErrors(value as never)).toEqual([]);
    }
  });

  it('index-signature root', () => {
    const keyErrors = createUnknownKeyErrorsFn<Record<string, Item>>();
    const has = createHasUnknownKeysFn<Record<string, Item>>();
    for (const value of rejected) {
      expect(keyErrors(value as never)).toEqual([]);
      expect(has(value)).toBe(false);
    }
  });
});
