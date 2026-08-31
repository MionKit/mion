// Correctness + instantiation-budget test for `SubstituteSelf` / `Recursive`
// (src/builders/static.ts) — the value-first `circular(…self()…)` type channel.
//
// Lighter than the DataOnly suite (per request): it covers the recursive /
// circular shapes that matter rather than an exhaustive per-branch matrix. Each
// `it` compiles a `Recursive<Body>` (with `Self` placeholders) through the real
// TypeScript compiler (see substituteSelfHarness.ts) and asserts:
//   1. `Self` is tied to the recursion fixpoint (e.g. `next?: Self` becomes
//      `next?: <the type itself>`), proving the knot closes and nothing leaks the
//      `Self` brand;
//   2. the NET instantiation count stays under an absolute budget.
//
// Budgets follow the same one-way ratchet documented in dataonly.compile.test.ts:
// each is the branch's current net; only ever lower it (re-run to see `net=…`).
// `Recursive<Body>` walks the body ONCE (the self-reference is deferred), so the
// numbers are small and flat — a spike means a regression.
//
// ONE REVIEWED EXCEPTION raised every recursive branch (the array/tree branch
// most, 229→1976): sentinel payloads now SURVIVE the substitution. A carrier
// intersection (structural format params, contains / patternProperties /
// propertyNames slots, tuple labels) used to be
// dropped or folded into its base, so a value-first `circular` resolved a
// different structural id than its type-first twin — the bug this pays for
// (docs/done/circular-brand-substitution.md). Two costs bought it: a
// `ContainsSelf` pre-walk, which returns a non-recursing subtree VERBATIM
// (that is what preserves the carriers, and it makes the no-Self branch
// CHEAPER — it now passes well under its old budget), and a `keyof` sentinel
// lookup on the nodes the cycle runs through, where `keyof` an array
// instantiates the whole `Array<T>` interface. Both are bounded by the
// containers ON the cycle, not by the schema's size. The cheaper probes were
// measured and rejected: an assignability check and an `infer`-based slot read
// each force the deferred recursive type and trip TS2589 on every recursive
// schema. The ratchet stays one-way from these numbers.
//
// A SECOND REVIEWED EXCEPTION raised every branch by 10-32 (1-4%): the walk
// stopped keeping a LIST of builtin classes to leave alone and started deciding
// it by RULE (see `ContainsSelfIn` in src/builders/static.ts). The list was
// always going to be incomplete — it covered Date, RegExp and Temporal, and a
// plain `class Fluent { clone(): Fluent }` broke exactly the same way, as did
// Generator, Iterator, the weak collections and every typed array. Three
// changes replaced it: `any` answers "no Self" instead of matching `Self`; the
// depth cap answers "no Self" instead of "assume Self"; and the cap went 12 to
// 24. What is left is one rule — a schema body is a finite tree and always
// bottoms out, a class's members loop and never do, so anything that does not
// bottom out is left alone. Deleting the list paid part of the cost back
// (keeping it as a fast path measured WORSE: the union costs more to test than
// it saves), and `Date | RegExp` stay named purely as a shortcut for the two
// builtins schemas carry most.
//
// The residual risk is the depth cap, and it is the reverse of the old one: a
// `Self` nested deeper than 24 would be left alone rather than substituted.
// Walk battery below pins both directions.

import {describe, it, expect} from 'vitest';
import {measureSubstituteSelf} from './substituteSelfHarness.ts';

function check(snippet: string, budget: number): number {
  const r = measureSubstituteSelf(snippet);
  expect(r.errors, `snippet should type-check cleanly:\n${snippet}\n→ ${r.errors.join('\n  ')}`).toEqual([]);
  // eslint-disable-next-line no-console
  //console.log(`    net=${String(r.netInstantiations).padStart(4)}  budget=${budget}`);
  expect(
    r.netInstantiations,
    `net instantiations (${r.netInstantiations}) exceeded budget (${budget}) — possible SubstituteSelf cost regression`
  ).toBeLessThanOrEqual(budget);
  return r.netInstantiations;
}

/** Battery variant: asserts the snippet type-checks, with NO budget. Walking a
 *  class to prove it bottoms out is expensive by construction (~158k
 *  instantiations for the 18 below) and that cost is paid HERE, never by a real
 *  schema — a schema body bottoms out in a handful of levels. Budgeting it
 *  would measure the test, not the code. **/
function checkTypesOnly(snippet: string): void {
  const r = measureSubstituteSelf(snippet);
  expect(r.errors, `snippet should type-check cleanly:\n${snippet}\n→ ${r.errors.join('\n  ')}`).toEqual([]);
}

describe('SubstituteSelf / Recursive — recursive-schema correctness + budget', () => {
  it('self-referential object (linked list)', () => {
    check(
      `
      type N = Recursive<{value: number; next?: Self}>;
      type _01 = Expect<Equal<N['value'], number>>;
      type _02 = Expect<Equal<N['next'], N | undefined>>; // Self → the type itself
      `,
      416
    );
  });

  it('recursion through an array (tree)', () => {
    check(
      `
      type Tree = Recursive<{name: string; children: Self[]}>;
      type _01 = Expect<Equal<Tree['name'], string>>;
      type _02 = Expect<Equal<Tree['children'], Tree[]>>;
      `,
      1993
    );
  });

  it('recursion through Map / Set values (gated branch)', () => {
    check(
      `
      type M = Recursive<{id: string; kids: Map<string, Self>}>;
      type _01 = Expect<Equal<M['kids'], Map<string, M>>>;
      type S = Recursive<{id: string; kids: Set<Self>}>;
      type _02 = Expect<Equal<S['kids'], Set<S>>>;
      `,
      1303
    );
  });

  it('deep nested self-reference', () => {
    check(
      `
      type D = Recursive<{a: {b: {c: Self}}; x: string}>;
      type _01 = Expect<Equal<D['a']['b']['c'], D>>;
      type _02 = Expect<Equal<D['x'], string>>;
      `,
      753
    );
  });

  it('recursion through a function (params + return substituted)', () => {
    check(
      `
      type F = Recursive<{x: number; run: (next: Self) => Self}>;
      type _01 = Expect<Equal<F['run'], (next: F) => F>>;
      `,
      518
    );
  });

  it('discriminated union — Self substituted per arm', () => {
    check(
      `
      type U = Recursive<{kind: 'leaf'; val: number} | {kind: 'node'; child: Self}>;
      type _01 = Expect<Equal<Extract<U, {kind: 'node'}>['child'], U>>;
      type _02 = Expect<Equal<Extract<U, {kind: 'leaf'}>['val'], number>>;
      `,
      495
    );
  });

  it('non-recursive body is unchanged (no Self)', () => {
    check(
      `
      type P = Recursive<{a: string; b: number; c: {d: boolean}; when: Date}>;
      type _01 = Expect<Equal<P, {a: string; b: number; c: {d: boolean}; when: Date}>>;
      `,
      285
    );
  });

  // ── The walk battery: the RULE that replaced the leaf list ────────────
  //
  // Left column must be left ALONE (no `Self` inside, so no rebuild — a rebuild
  // is what used to flatten a class into a plain object and move its id).
  // Right column must still be FOUND, or a `Self` brand leaks into the
  // recovered type, which is silent and worse. Both directions matter: a walk
  // that answers "no Self" to everything passes the left column and destroys
  // the feature.
  //
  // `Fluent` is the case a list could never have covered — a plain user class
  // with a self-returning method, which is an ordinary thing to write.
  it('leaves alone everything that does not bottom out', () => {
    checkTypesOnly(
      `
      declare class Fluent { clone(): Fluent; x: number }
      declare class Plain { x: number }
      type Deep = {a: {b: {c: {d: {e: {f: {g: {h: {i: {j: {k: {l: number}}}}}}}}}}}};
      type _01 = Expect<Equal<ContainsSelf<Fluent>, false>>;
      type _02 = Expect<Equal<ContainsSelf<Plain>, false>>;
      type _03 = Expect<Equal<ContainsSelf<Deep>, false>>;
      type _04 = Expect<Equal<ContainsSelf<DataView>, false>>;
      type _05 = Expect<Equal<ContainsSelf<Uint8Array>, false>>;
      type _06 = Expect<Equal<ContainsSelf<BigUint64Array>, false>>;
      type _07 = Expect<Equal<ContainsSelf<ArrayBuffer>, false>>;
      type _08 = Expect<Equal<ContainsSelf<SharedArrayBuffer>, false>>;
      type _09 = Expect<Equal<ContainsSelf<Error>, false>>;
      type _10 = Expect<Equal<ContainsSelf<Generator<string>>, false>>;
      type _11 = Expect<Equal<ContainsSelf<Iterator<string>>, false>>;
      type _12 = Expect<Equal<ContainsSelf<WeakSet<object>>, false>>;
      type _13 = Expect<Equal<ContainsSelf<WeakMap<object, string>>, false>>;
      type _14 = Expect<Equal<ContainsSelf<Date>, false>>;
      type _15 = Expect<Equal<ContainsSelf<RegExp>, false>>;
      type _16 = Expect<Equal<ContainsSelf<{a: string; b: number}>, false>>;
      type _17 = Expect<Equal<ContainsSelf<string[]>, false>>;
      type _18 = Expect<Equal<ContainsSelf<{m: any}>, false>>;
      `
    );
  });

  it('still finds every real Self', () => {
    checkTypesOnly(
      `
      type _01 = Expect<Equal<ContainsSelf<Self>, true>>;
      type _02 = Expect<Equal<ContainsSelf<{next?: Self}>, true>>;
      type _03 = Expect<Equal<ContainsSelf<Self[]>, true>>;
      type _04 = Expect<Equal<ContainsSelf<[string, Self]>, true>>;
      type _05 = Expect<Equal<ContainsSelf<Map<string, Self>>, true>>;
      type _06 = Expect<Equal<ContainsSelf<Set<Self>>, true>>;
      type _07 = Expect<Equal<ContainsSelf<{fn: (a: Self) => string}>, true>>;
      type _08 = Expect<Equal<ContainsSelf<{fn: () => Self}>, true>>;
      type _09 = Expect<Equal<ContainsSelf<{a: {b: {c: {d: Self}}}}>, true>>;
      // Deeper than the OLD cap of 12 and still found — the cap is 24 now.
      type _10 = Expect<Equal<ContainsSelf<{a:{b:{c:{d:{e:{f:{g:{h:{i:{j:{k:{l:{m: Self}}}}}}}}}}}}}>, true>>;
      `
    );
  });
});
