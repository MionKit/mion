// End-to-end tests for the `{checkUnknowns: true}` fused validators — one
// compiled function that checks properties AND undeclared keys in a single walk,
// replacing `isT(v) && !hasUnknownKeys(v)`.
//
// The load-bearing test here is the PARITY suite: whatever shape is thrown at it,
// the fused validator must agree with the two-call composition it replaces. That
// is the contract users are trading their two calls for. The nested-named-type
// case is the one that would silently regress if the feature were built as a
// compile-time VARIANT instead of its own family, since a variant only reaches
// the root object.

import {describe, expect, it} from 'vitest';
import {createGetValidationErrorsFn, createHasUnknownKeysFn, createUnknownKeyErrorsFn, createValidateFn} from '@ts-runtypes/core';

describe('checkUnknowns — createValidateFn', () => {
  it('accepts a value with exactly the declared keys', () => {
    const isUser = createValidateFn<{a: string; b: number}>(undefined, {checkUnknowns: true});
    expect(isUser({a: 'x', b: 1})).toBe(true);
  });

  it('rejects an extra key the plain validator accepts', () => {
    const isUser = createValidateFn<{a: string; b: number}>(undefined, {checkUnknowns: true});
    const isUserLoose = createValidateFn<{a: string; b: number}>();
    expect(isUserLoose({a: 'x', b: 1, extra: true})).toBe(true);
    expect(isUser({a: 'x', b: 1, extra: true})).toBe(false);
  });

  it('still rejects a type mismatch', () => {
    const isUser = createValidateFn<{a: string; b: number}>(undefined, {checkUnknowns: true});
    expect(isUser({a: 'x', b: 'not a number'})).toBe(false);
  });

  // The whole reason this ships as a family rather than a variant: a NAMED
  // nested type is emitted as its own entry and dependency-called, so a
  // root-scoped variant would leave it checked by the plain validator and miss
  // the extra key entirely.
  it('rejects an extra key on a NAMED nested type', () => {
    type Address = {street: string; city: string};
    type Person = {name: string; address: Address};
    const isPerson = createValidateFn<Person>(undefined, {checkUnknowns: true});
    expect(isPerson({name: 'Ada', address: {street: 'A', city: 'B'}})).toBe(true);
    expect(isPerson({name: 'Ada', address: {street: 'A', city: 'B', zip: '1'}})).toBe(false);
  });

  it('rejects an extra key on an inline nested object', () => {
    const isPerson = createValidateFn<{name: string; address: {street: string}}>(undefined, {checkUnknowns: true});
    expect(isPerson({name: 'Ada', address: {street: 'A', extra: 1}})).toBe(false);
  });

  it('rejects an extra key inside an array element', () => {
    const isList = createValidateFn<{items: {id: number}[]}>(undefined, {checkUnknowns: true});
    expect(isList({items: [{id: 1}, {id: 2}]})).toBe(true);
    expect(isList({items: [{id: 1}, {id: 2, extra: true}]})).toBe(false);
  });

  it('accepts any key on an index-signature shape', () => {
    // Every key matching the index IS declared, so nothing can be "unknown".
    const isRecord = createValidateFn<Record<string, number>>(undefined, {checkUnknowns: true});
    expect(isRecord({a: 1, b: 2, anythingElse: 3})).toBe(true);
  });

  it('handles a shape with optional properties', () => {
    const isUser = createValidateFn<{a: string; b?: number}>(undefined, {checkUnknowns: true});
    expect(isUser({a: 'x'})).toBe(true);
    expect(isUser({a: 'x', b: 1})).toBe(true);
    expect(isUser({a: 'x', extra: true})).toBe(false);
  });

  it('leaves the plain validator untouched', () => {
    const isUserLoose = createValidateFn<{a: string}>();
    expect(isUserLoose({a: 'x', extra: 1})).toBe(true);
  });
});

describe('checkUnknowns — createGetValidationErrorsFn', () => {
  it('reports no errors for a clean value', () => {
    const errorsOf = createGetValidationErrorsFn<{a: string}>(undefined, {checkUnknowns: true});
    expect(errorsOf({a: 'x'})).toEqual([]);
  });

  it('reports an undeclared key as expected never', () => {
    const errorsOf = createGetValidationErrorsFn<{a: string}>(undefined, {checkUnknowns: true});
    expect(errorsOf({a: 'x', extra: 1})).toEqual([{path: ['extra'], expected: 'never'}]);
  });

  it('reports an undeclared key on a NAMED nested type with the right path', () => {
    type Address = {street: string};
    type Person = {name: string; address: Address};
    const errorsOf = createGetValidationErrorsFn<Person>(undefined, {checkUnknowns: true});
    expect(errorsOf({name: 'Ada', address: {street: 'A', zip: '1'}})).toEqual([{path: ['address', 'zip'], expected: 'never'}]);
  });

  it('reports both a type error and an undeclared key', () => {
    const errorsOf = createGetValidationErrorsFn<{a: string}>(undefined, {checkUnknowns: true});
    const errors = errorsOf({a: 1, extra: true});
    expect(errors).toContainEqual({path: ['a'], expected: 'string'});
    expect(errors).toContainEqual({path: ['extra'], expected: 'never'});
  });
});

// Error ORDER is a deliberate, documented divergence from the two-call form:
// `verr(v).concat(uke(v))` groups every type error ahead of every unknown-key
// error, but one walk cannot produce that grouping. The fused report interleaves
// per node, in walk order. Pinned here so a future change to the emit has to
// decide the order on purpose rather than drift into it.
describe('checkUnknowns — error order', () => {
  it('interleaves per node in walk order rather than grouping by kind', () => {
    type Inner = {x: string};
    type Outer = {inner: Inner; y: string};
    const errorsOf = createGetValidationErrorsFn<Outer>(undefined, {checkUnknowns: true});
    const errors = errorsOf({inner: {x: 1, innerExtra: true}, y: 2, outerExtra: true});

    // The inner node is fully reported (its type error AND its unknown key)
    // before the walk returns to the outer node's remaining property.
    expect(errors).toEqual([
      {path: ['inner', 'x'], expected: 'string'},
      {path: ['inner', 'innerExtra'], expected: 'never'},
      {path: ['y'], expected: 'string'},
      {path: ['outerExtra'], expected: 'never'},
    ]);
  });
});

// The contract users are trading their two calls for. Every case below is
// checked against the composition it replaces rather than against a hand-written
// expectation, so the two can never drift apart silently.
describe('checkUnknowns — parity with the two-call composition', () => {
  type Address = {street: string; city: string};
  type Person = {name: string; age: number; address: Address; tags?: string[]};

  const isPersonStrict = createValidateFn<Person>(undefined, {checkUnknowns: true});
  const isPerson = createValidateFn<Person>();
  const hasUnknown = createHasUnknownKeysFn<Person>();

  const errorsStrict = createGetValidationErrorsFn<Person>(undefined, {checkUnknowns: true});
  const typeErrors = createGetValidationErrorsFn<Person>();
  const keyErrors = createUnknownKeyErrorsFn<Person>();

  // Values the object guard ADMITS (`typeof v === 'object' && v !== null`).
  // Arrays, Maps and Dates belong here, not with the primitives: they pass that
  // gate for a required-prop shape, so their own enumerable keys really are
  // undeclared ones. `[{name: 'Ada'}]` carrying a `'0'` key is a genuine
  // `{expected: 'never'}` entry, not a false positive.
  const objectCorpus: unknown[] = [
    {name: 'Ada', age: 36, address: {street: 'A', city: 'B'}},
    {name: 'Ada', age: 36, address: {street: 'A', city: 'B'}, tags: ['x']},
    {name: 'Ada', age: 36, address: {street: 'A', city: 'B'}, extra: true},
    {name: 'Ada', age: 36, address: {street: 'A', city: 'B', zip: '1'}},
    {name: 'Ada', age: 'not a number', address: {street: 'A', city: 'B'}},
    {name: 'Ada', age: 36, address: {street: 'A'}},
    {name: 'Ada', age: 36, address: {street: 'A', city: 'B', zip: '1'}, extra: 1},
    {},
    [],
    [{name: 'Ada'}],
    new Map(),
    new Date(),
  ];

  // Values the object guard REJECTS. Since the unknown-keys families gained
  // their own shape guard (they now answer [] / false for a value the schema
  // does not admit, rather than throwing or inventing one entry per character
  // index), the ERROR composition is well-defined over these too — so they ride
  // both oracles below rather than only the boolean one.
  const primitiveCorpus: unknown[] = [null, undefined, 'a string', 42];

  it.each([...objectCorpus, ...primitiveCorpus].map((value, index) => [index, value] as const))(
    'validator agrees with isT(v) && !hasUnknown(v) — case %i',
    (_index, value) => {
      expect(isPersonStrict(value)).toBe(isPerson(value) && !hasUnknown(value));
    }
  );

  // Compared as SETS: the fused walk interleaves entries where the two-call form
  // groups them (see the error-order suite above), so membership is the shared
  // contract, not sequence.
  //
  // This oracle used to be restricted to guard-admitted values, because
  // `createUnknownKeyErrorsFn` descended into declared properties with nothing
  // asserting shape — it threw on `null` and returned one bogus
  // `{expected: 'never'}` per character index on a string. That is fixed, so the
  // reference is defined over every input and the corpus is whole again.
  it.each([...objectCorpus, ...primitiveCorpus].map((value, index) => [index, value] as const))(
    'error report matches verr + uke as a set — case %i',
    (_index, value) => {
      const fused = errorsStrict(value);
      const composed = [...typeErrors(value), ...keyErrors(value)];
      const sortKey = (error: {path: unknown[]; expected: string}) => JSON.stringify([error.path, error.expected]);
      expect(fused.map(sortKey).sort()).toEqual(composed.map(sortKey).sort());
    }
  );

  // A value the object guard rejects never reaches the key check, so the fused
  // report must be exactly the plain type-error report, and must never throw.
  it.each(primitiveCorpus.map((value, index) => [index, value] as const))(
    'guard-rejected input reports only the type error — case %i',
    (_index, value) => {
      expect(() => errorsStrict(value)).not.toThrow();
      expect(errorsStrict(value)).toEqual(typeErrors(value));
    }
  );
});
