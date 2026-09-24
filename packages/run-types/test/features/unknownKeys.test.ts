// Undeclared keys by POSITION, through the `{checkUnknowns: true}` validators: every place a key can hide, and every
// value shape the check must stay quiet on. checkUnknowns.test.ts owns the option's contract; removeUnknownKeys has
// its own suite in test/suites/cloning/.

import {describe, expect, it} from 'vitest';
import {createGetValidationErrorsFn, createValidateFn, getRunType} from '@mionjs/run-types';
import {getFnHash} from '@mionjs/run-types/runtime';

describe('checkUnknowns — basics', () => {
  it('accepts an atomic type', () => {
    expect(createValidateFn<string>(undefined, {checkUnknowns: true})('hello')).toBe(true);
    expect(createGetValidationErrorsFn<string>(undefined, {checkUnknowns: true})('hello')).toEqual([]);
  });

  it('rejects an extra key on an interface with all optional props', () => {
    expect(createValidateFn<{a?: string; b?: number}>(undefined, {checkUnknowns: true})({extra: true})).toBe(false);
  });

  it('reports one error per undeclared key', () => {
    const errors = createGetValidationErrorsFn<{a: string}>(undefined, {checkUnknowns: true})({a: 'x', extra1: 1, extra2: 2});
    expect(errors).toHaveLength(2);
    expect(errors.map((error) => error.path[0]).sort()).toEqual(['extra1', 'extra2']);
    expect(errors.every((error) => error.expected === 'never')).toBe(true);
  });

  it('rejects an extra key on a tuple inside an array', () => {
    const isStrict = createValidateFn<Array<[string, {a: number}]>>(undefined, {checkUnknowns: true});
    expect(
      isStrict([
        ['x', {a: 1}],
        ['y', {a: 2}],
      ])
    ).toBe(true);
    expect(
      isStrict([
        ['x', {a: 1}],
        ['y', {a: 2, extra: 1}],
      ])
    ).toBe(false);
  });
});

// A NAMED nested type compiles to its OWN cache entry and is reached by a call, where an anonymous one is inlined.
// All-required shapes take the O(1) key-count compare; the parent must dep-call the strict child, not the plain one.
interface Address {
  street: string;
  city: string;
}
interface Person {
  name: string;
  address: Address;
}

describe('checkUnknowns — named nested types', () => {
  it('rejects an extra key at the root and on the named child', () => {
    const isStrict = createValidateFn<Person>(undefined, {checkUnknowns: true});
    expect(isStrict({name: 'jane', address: {street: '10', city: 'sf'}})).toBe(true);
    expect(isStrict({name: 'jane', address: {street: '10', city: 'sf', extra: 1}})).toBe(false);
    expect(isStrict({name: 'jane', address: {street: '10', city: 'sf'}, extra: 1})).toBe(false);
  });

  it('compiles an all-required named child to the key-count compare', () => {
    expect(createValidateFn<Address>(undefined, {checkUnknowns: true}).toString()).toContain('cntEK(v) === 2');
  });

  it('keeps the key scan for a shape with an optional key', () => {
    const isStrict = createValidateFn<{a: string; b?: number}>(undefined, {checkUnknowns: true});
    expect(isStrict.toString()).not.toContain('cntEK(v) ===');
    expect(isStrict({a: 'x', b: 2})).toBe(true);
    expect(isStrict({a: 'x', extra: 1})).toBe(false);
  });

  it('dep-calls the strict child entry from the parent, not the plain one', () => {
    const parent = createValidateFn<Person>(undefined, {checkUnknowns: true}).toString();
    expect(parent).toContain(`${getFnHash('validateStrict')}_`);
    expect(parent).not.toContain(`${getFnHash('validate')}_`);
  });
});

// A union answers per branch: every nested object inside the matched member carries its own key check.
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

// `data` is `{x: number}` on one branch and `{y: number}` on the other, so a pooled allowlist cannot descend into it.
interface AmbA {
  tag: 'a';
  data: {x: number};
}
interface AmbB {
  tag: 'b';
  data: {y: number};
}
type Ambiguous = AmbA | AmbB;

describe('checkUnknowns — unions descend into the matched member', () => {
  it('rejects an extra key nested inside a member, and names the union', () => {
    const isStrict = createValidateFn<WrapUnion>(undefined, {checkUnknowns: true});
    const errors = createGetValidationErrorsFn<WrapUnion>(undefined, {checkUnknowns: true});
    expect(isStrict({tag: 'n', inner: {x: 1}})).toBe(true);
    expect(isStrict({tag: 'm', other: 'x'})).toBe(true);
    expect(isStrict({tag: 'n', inner: {x: 1, evil: 2}})).toBe(false);
    expect(isStrict({tag: 'n', inner: {x: 1, evil: 2}, alien: true})).toBe(false);
    expect(errors({tag: 'n', inner: {x: 1, evil: 2}})).toEqual([{path: [], expected: 'union'}]);
    expect(errors({tag: 'm', other: 'x'})).toEqual([]);
  });

  it('follows the matched branch into a property two members declare with different shapes', () => {
    const isStrict = createValidateFn<Ambiguous>(undefined, {checkUnknowns: true});
    expect(isStrict({tag: 'a', data: {x: 1}})).toBe(true);
    expect(isStrict({tag: 'b', data: {y: 1}})).toBe(true);
    expect(isStrict({tag: 'a', data: {x: 1, evil: 2}})).toBe(false);
    // `y` is declared on the OTHER branch's `data` only.
    expect(isStrict({tag: 'a', data: {x: 1, y: 2}})).toBe(false);
  });
});

interface SmallObject {
  a: string;
  b: number;
}

describe('checkUnknowns — Map and Set', () => {
  it('rejects and reports an extra key on a Map value', () => {
    const isStrict = createValidateFn<Map<string, SmallObject>>(undefined, {checkUnknowns: true});
    const errors = createGetValidationErrorsFn<Map<string, SmallObject>>(undefined, {checkUnknowns: true});
    const clean = new Map([['k1', {a: 'x', b: 1}]]);
    const dirty = new Map([
      ['k1', {a: 'x', b: 1, extra: 'gone'}],
      ['k2', {a: 'y', b: 2}],
    ]);
    expect(isStrict(clean)).toBe(true);
    expect(errors(clean)).toEqual([]);
    expect(isStrict(dirty)).toBe(false);
    expect(errors(dirty)).toEqual([{path: [{key: 0, failed: 'mapValue'}, 'extra'], expected: 'never'}]);
  });

  it('rejects and reports an extra key on a Set element', () => {
    const isStrict = createValidateFn<Set<SmallObject>>(undefined, {checkUnknowns: true});
    const errors = createGetValidationErrorsFn<Set<SmallObject>>(undefined, {checkUnknowns: true});
    expect(isStrict(new Set([{a: 'x', b: 1}]))).toBe(true);
    const dirty = new Set([{a: 'x', b: 1, extra: 'gone'}]);
    expect(isStrict(dirty)).toBe(false);
    expect(errors(dirty)).toEqual([{path: [{key: 0, failed: 'setKey'}, 'extra'], expected: 'never'}]);
  });
});

// A value that is not the declared shape carries no "declared vs undeclared key" question: the strict report must be
// exactly the plain report, one shape error and no invented `{expected: 'never'}` per character or index, and never throw.
describe('checkUnknowns — a value the schema does not admit', () => {
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

  it.each(notObjects)('%s: the strict report says only what the plain report says', (_label, value) => {
    const plainErrors = createGetValidationErrorsFn<Shape>();
    const strictErrors = createGetValidationErrorsFn<Shape>(undefined, {checkUnknowns: true});
    expect(() => strictErrors(value)).not.toThrow();
    expect(strictErrors(value)).toEqual(plainErrors(value));
    expect(createValidateFn<Shape>(undefined, {checkUnknowns: true})(value)).toBe(false);
  });

  it('a non-object root reports one shape error and nothing else', () => {
    const strictErrors = createGetValidationErrorsFn<Shape>(undefined, {checkUnknowns: true});
    for (const value of [null, undefined, 'a string', 42, true]) {
      expect(strictErrors(value)).toEqual([{path: [], expected: 'objectLiteral'}]);
    }
  });

  it('guards a NESTED position too, not just the root', () => {
    const plainErrors = createGetValidationErrorsFn<Shape>();
    const strictErrors = createGetValidationErrorsFn<Shape>(undefined, {checkUnknowns: true});
    for (const address of ['oops', null, 42]) {
      const value = {name: 'jane', age: 1, address};
      expect(strictErrors(value)).toEqual(plainErrors(value));
    }
  });

  it('still reports real undeclared keys at both depths', () => {
    const strictErrors = createGetValidationErrorsFn<Shape>(undefined, {checkUnknowns: true});
    const good = {name: 'jane', age: 1, address: {street: '10', city: 'sf'}};
    expect(strictErrors(good)).toEqual([]);
    expect(strictErrors({...good, extra: 1})).toEqual([{path: ['extra'], expected: 'never'}]);
    expect(strictErrors({...good, address: {street: '10', city: 'sf', zip: 9}})).toEqual([
      {path: ['address', 'zip'], expected: 'never'},
    ]);
  });

  // Both call shapes of the factory resolve to the same compiled entry, so the guard has to hold for both.
  it('(static form) reports only the shape error on a rejected value', () => {
    expect(createGetValidationErrorsFn<Shape>(undefined, {checkUnknowns: true})(null)).toEqual([
      {path: [], expected: 'objectLiteral'},
    ]);
    expect(createValidateFn<Shape>(undefined, {checkUnknowns: true})(null)).toBe(false);
  });

  it('(value-first form) reports only the shape error on a rejected value', () => {
    expect(createGetValidationErrorsFn(getRunType<Shape>(), {checkUnknowns: true})(null)).toEqual([
      {path: [], expected: 'objectLiteral'},
    ]);
    expect(createValidateFn(getRunType<Shape>(), {checkUnknowns: true})(null)).toBe(false);
  });
});

// Container roots read `v.length`, `v[0]` or iterate the value, all of which throw on null / undefined.
describe('checkUnknowns — a container root the value does not match', () => {
  interface Item {
    a: string;
    nested: {b: string};
  }

  const rejected: unknown[] = [null, undefined, 'a string', 42];

  it('array root', () => {
    const plainErrors = createGetValidationErrorsFn<Item[]>();
    const strictErrors = createGetValidationErrorsFn<Item[]>(undefined, {checkUnknowns: true});
    for (const value of rejected) expect(strictErrors(value)).toEqual(plainErrors(value));
    expect(strictErrors([{a: 'x', nested: {b: 'y'}, extra: 1}])).toEqual([{path: [0, 'extra'], expected: 'never'}]);
  });

  it('tuple root', () => {
    const plainErrors = createGetValidationErrorsFn<[Item, Item]>();
    const strictErrors = createGetValidationErrorsFn<[Item, Item]>(undefined, {checkUnknowns: true});
    for (const value of rejected) expect(strictErrors(value)).toEqual(plainErrors(value));
  });

  it('Map root', () => {
    const plainErrors = createGetValidationErrorsFn<Map<string, Item>>();
    const strictErrors = createGetValidationErrorsFn<Map<string, Item>>(undefined, {checkUnknowns: true});
    for (const value of rejected) expect(strictErrors(value)).toEqual(plainErrors(value));
  });

  it('Set root', () => {
    const plainErrors = createGetValidationErrorsFn<Set<Item>>();
    const strictErrors = createGetValidationErrorsFn<Set<Item>>(undefined, {checkUnknowns: true});
    for (const value of rejected) expect(strictErrors(value)).toEqual(plainErrors(value));
  });

  it('index-signature root', () => {
    const plainErrors = createGetValidationErrorsFn<Record<string, Item>>();
    const strictErrors = createGetValidationErrorsFn<Record<string, Item>>(undefined, {checkUnknowns: true});
    for (const value of rejected) expect(strictErrors(value)).toEqual(plainErrors(value));
    expect(
      createValidateFn<Record<string, Item>>(undefined, {checkUnknowns: true})({
        k: {a: 'x', nested: {b: 'y'}},
        any: {a: 'z', nested: {b: 'w'}},
      })
    ).toBe(true);
  });
});
