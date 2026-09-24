// End-to-end tests for the `{checkUnknowns: true}` fused validators — one
// compiled function that checks properties AND undeclared keys in a single walk.
//
// The load-bearing test here is the PARITY suite: whatever shape is thrown at it,
// the fused validator must agree with the plain validator plus an in-test walk
// over the keys the type declares. The nested-named-type
// case is the one that would silently regress if the feature were built as a
// compile-time VARIANT instead of its own family, since a variant only reaches
// the root object.

import {describe, expect, it} from 'vitest';
import {createGetValidationErrorsFn, createValidateFn} from '@mionjs/run-types';
import {undeclaredKeyErrors, type DeclaredKeys} from '../suites/strict-validation/Strict.ts';

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

// Error ORDER is deliberate: one walk cannot group every type error ahead of
// every unknown-key error. The fused report interleaves
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

// Every case below is checked against a reference (the plain validator plus an
// in-test key walk) rather than a hand-written expectation per value.
describe('checkUnknowns — parity with the plain validator plus a key walk', () => {
  type Address = {street: string; city: string};
  type Person = {name: string; age: number; address: Address; tags?: string[]};

  const isPersonStrict = createValidateFn<Person>(undefined, {checkUnknowns: true});
  const isPerson = createValidateFn<Person>();
  const personKeys: DeclaredKeys = {name: null, age: null, address: {street: null, city: null}, tags: null};
  const keyErrors = (value: unknown) => undeclaredKeyErrors(value, personKeys);
  const hasUnknown = (value: unknown) => keyErrors(value).length > 0;

  const errorsStrict = createGetValidationErrorsFn<Person>(undefined, {checkUnknowns: true});
  const typeErrors = createGetValidationErrorsFn<Person>();

  // Values the object guard ADMITS (`typeof v === 'object' && v !== null`).
  // An array, Map or Date here is a shape error only: an array's indexes are
  // never reported as undeclared keys, the shape error already names the problem.
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

  // Values the object guard REJECTS: they carry no undeclared keys, so both
  // oracles below cover them too.
  const primitiveCorpus: unknown[] = [null, undefined, 'a string', 42];

  it.each([...objectCorpus, ...primitiveCorpus].map((value, index) => [index, value] as const))(
    'validator agrees with isT(v) && !hasUnknown(v) — case %i',
    (_index, value) => {
      expect(isPersonStrict(value)).toBe(isPerson(value) && !hasUnknown(value));
    }
  );

  // Compared as SETS: the fused walk interleaves entries where the reference
  // groups them (see the error-order suite above), so membership is the shared
  // contract, not sequence.
  it.each([...objectCorpus, ...primitiveCorpus].map((value, index) => [index, value] as const))(
    'error report matches verr + the key walk as a set — case %i',
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

// ============================================================================
// Arrays
// ============================================================================
//
// An array never reaches an unknown-key check, and nothing in the fused families
// arranges that — `validate` already does, and did before this feature existed.
// A shape with a required property rejects an array on the property check (an
// array has no `a`), and a shape without one (all-optional, index signature,
// empty) carries the `[object Object]` brand guard, which excludes arrays
// outright. That split is a deliberate optimisation in emitObjectValidate: the
// guard is only worth emitting where a required property is not already doing
// the job.
//
// The one shape that slips through is a type whose required property is one
// arrays really have (`{length: number}`, `{0: string}`). Behaviour there is
// undefined and not worth defining: you cannot express such a value in JSON as
// anything but an array, and an array has no undeclared properties to find.

describe('checkUnknowns — arrays', () => {
  it('rejects an array for a shape with a required property', () => {
    const isUser = createValidateFn<{a: string}>(undefined, {checkUnknowns: true});
    expect(isUser([])).toBe(false);
    expect(isUser([1, 2])).toBe(false);
    expect(isUser(['x'])).toBe(false);
  });

  it('rejects an array for an all-optional shape', () => {
    const isOpt = createValidateFn<{a?: string}>(undefined, {checkUnknowns: true});
    expect(isOpt({})).toBe(true);
    expect(isOpt([])).toBe(false);
    expect(isOpt([1, 2])).toBe(false);
  });

  it('rejects an array for an index-signature shape', () => {
    const isRec = createValidateFn<Record<string, number>>(undefined, {checkUnknowns: true});
    expect(isRec({a: 1})).toBe(true);
    expect(isRec([])).toBe(false);
    expect(isRec([1, 2])).toBe(false);
  });

  // A DECLARED array is a different thing entirely: it is walked, and each
  // element carries its own key check. Pinned because it would be easy to
  // "simplify" the rule above into one that stops checking every list.
  it('descends into the elements of a declared array', () => {
    type Item = {a: string};
    const isItems = createValidateFn<Item[]>(undefined, {checkUnknowns: true});
    const itemErrors = createGetValidationErrorsFn<Item[]>(undefined, {checkUnknowns: true});
    expect(isItems([{a: 'x'}])).toBe(true);
    expect(isItems([{a: 'x', evil: 1}])).toBe(false);
    expect(itemErrors([{a: 'x', evil: 1}])).toEqual([{path: [0, 'evil'], expected: 'never'}]);
  });

  it('descends into an array held by a property', () => {
    type Holder = {items: {a: string}[]};
    const isHolder = createValidateFn<Holder>(undefined, {checkUnknowns: true});
    const holderErrors = createGetValidationErrorsFn<Holder>(undefined, {checkUnknowns: true});
    expect(isHolder({items: [{a: 'x'}]})).toBe(true);
    expect(isHolder({items: [{a: 'x', evil: 1}]})).toBe(false);
    expect(holderErrors({items: [{a: 'x', evil: 1}]})).toEqual([{path: ['items', 0, 'evil'], expected: 'never'}]);
  });

  it('descends into a tuple element', () => {
    type Pair = [{a: string}, {a: string}];
    const isPair = createValidateFn<Pair>(undefined, {checkUnknowns: true});
    expect(isPair([{a: 'x'}, {a: 'y'}])).toBe(true);
    expect(isPair([{a: 'x'}, {a: 'y', evil: 1}])).toBe(false);
  });
});

// ============================================================================
// Unions of named interfaces — the case with the most room for a trick
// ============================================================================
//
// A union is where "which keys are declared?" stops having one answer, so it is
// the shape most likely to hide a hole. Named interfaces specifically: each
// member compiles to its OWN entry and is dependency-called, which is exactly
// where two separate bugs have already hidden in this family.
//
// The fused validator inherits validate's OR chain, so each arm carries ITS OWN
// key check and nothing is pooled:
//
//   vst_Cat: (… v.kind==='cat' && typeof v.meows==='boolean' && cntEK(v) === 2)
//   vst_Dog: (… v.kind==='dog' && Number.isFinite(v.barks)   && cntEK(v) === 2)
//
// A codec cannot do that: it never validates, so it cannot know which member
// matched, and instead pools every member's property names into one merged
// allowlist. The two DISAGREE on a value carrying another member's key; the
// fused validator is the one that follows the branch `isType` actually matched.

interface Cat {
  kind: 'cat';
  meows: boolean;
}
interface Dog {
  kind: 'dog';
  barks: number;
}
type Pet = Cat | Dog;

interface Circle {
  shape: 'circle';
  r: number;
}
interface Square {
  shape: 'square';
  side: number;
}
interface Tri {
  shape: 'tri';
  base: number;
  height: number;
}
type Shape = Circle | Square | Tri;

describe('checkUnknowns — unions of named interfaces', () => {
  const isPet = createValidateFn<Pet>(undefined, {checkUnknowns: true});

  it('accepts each member with exactly its own keys', () => {
    expect(isPet({kind: 'cat', meows: true})).toBe(true);
    expect(isPet({kind: 'dog', barks: 3})).toBe(true);
  });

  // The property this suite exists for: a key belonging to NO member is
  // rejected, whichever member the value matched.
  it('rejects a key that belongs to no member at all', () => {
    expect(isPet({kind: 'cat', meows: true, evil: 1})).toBe(false);
    expect(isPet({kind: 'dog', barks: 3, evil: 1})).toBe(false);
  });

  it('rejects a key that belongs to the OTHER member', () => {
    // `barks` is Dog's. The value matched Cat, so by Cat it is undeclared.
    expect(isPet({kind: 'cat', meows: true, barks: 3})).toBe(false);
    expect(isPet({kind: 'dog', barks: 3, meows: true})).toBe(false);
  });

  it('still rejects what the plain validator rejects', () => {
    expect(isPet({kind: 'fish', meows: true})).toBe(false); // outside the union
    expect(isPet({kind: 'cat'})).toBe(false); // missing its own property
    expect(isPet({kind: 'cat', meows: 'yes'})).toBe(false); // wrong type
    expect(isPet(null)).toBe(false);
    expect(isPet('not an object')).toBe(false);
  });

  it('holds with three members, and with the member that has two properties', () => {
    const isShape = createValidateFn<Shape>(undefined, {checkUnknowns: true});
    expect(isShape({shape: 'tri', base: 1, height: 2})).toBe(true);
    expect(isShape({shape: 'tri', base: 1, height: 2, evil: 1})).toBe(false);
    // `side` is Square's, so it is undeclared on the Tri branch this matched.
    expect(isShape({shape: 'tri', base: 1, height: 2, side: 9})).toBe(false);
    expect(isShape({shape: 'circle', r: 1, base: 2})).toBe(false);
  });

  // DELIBERATE DIVERGENCE, pinned so it stays a decision rather than becoming a
  // surprise. The merged allowlist accepts a cat carrying `barks`; the fused
  // validator does not, because it follows the branch that matched.
  it('is STRICTER than validate + the merged allowlist on a mixed-member value', () => {
    const loose = createValidateFn<Pet>();
    const mergedKeys: DeclaredKeys = {kind: null, meows: null, barks: null};
    const hasUnknown = (value: unknown) => undeclaredKeyErrors(value, mergedKeys).length > 0;
    const mixed = {kind: 'cat', meows: true, barks: 3};

    expect(loose(mixed) && !hasUnknown(mixed)).toBe(true); // the merged allowlist admits it
    expect(isPet(mixed)).toBe(false); // the per-branch check does not

    // A key in NO member is rejected by BOTH, which is the part that must never
    // drift: the divergence is only ever about another member's key.
    const alien = {kind: 'cat', meows: true, evil: 1};
    expect(loose(alien) && !hasUnknown(alien)).toBe(false);
    expect(isPet(alien)).toBe(false);
  });

  it('reports the undeclared key, and reports nothing when the value is clean', () => {
    const errorsStrictPet = createGetValidationErrorsFn<Pet>(undefined, {checkUnknowns: true});
    expect(errorsStrictPet({kind: 'cat', meows: true})).toEqual([]);
    expect(errorsStrictPet({kind: 'cat', meows: true, evil: 1}).length).toBeGreaterThan(0);
  });

  // The validator and its error twin must never disagree: a caller that gets a
  // rejection and then asks why must not be handed an empty list.
  it('validator and error report agree on every sample', () => {
    const errorsStrictPet = createGetValidationErrorsFn<Pet>(undefined, {checkUnknowns: true});
    const samples: unknown[] = [
      {kind: 'cat', meows: true},
      {kind: 'dog', barks: 3},
      {kind: 'cat', meows: true, evil: 1},
      {kind: 'cat', meows: true, barks: 3},
      {kind: 'fish', meows: true},
      {kind: 'cat'},
      null,
      'not an object',
      [],
    ];
    for (const value of samples) {
      expect(errorsStrictPet(value).length === 0, `disagreement on ${JSON.stringify(value)}`).toBe(isPet(value));
    }
  });
});
