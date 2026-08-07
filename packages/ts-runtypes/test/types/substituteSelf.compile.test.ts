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

describe('SubstituteSelf / Recursive — recursive-schema correctness + budget', () => {
  it('self-referential object (linked list)', () => {
    check(
      `
      type N = Recursive<{value: number; next?: Self}>;
      type _01 = Expect<Equal<N['value'], number>>;
      type _02 = Expect<Equal<N['next'], N | undefined>>; // Self → the type itself
      `,
      279
    );
  });

  it('recursion through an array (tree)', () => {
    check(
      `
      type Tree = Recursive<{name: string; children: Self[]}>;
      type _01 = Expect<Equal<Tree['name'], string>>;
      type _02 = Expect<Equal<Tree['children'], Tree[]>>;
      `,
      229
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
      662
    );
  });

  it('deep nested self-reference', () => {
    check(
      `
      type D = Recursive<{a: {b: {c: Self}}; x: string}>;
      type _01 = Expect<Equal<D['a']['b']['c'], D>>;
      type _02 = Expect<Equal<D['x'], string>>;
      `,
      323
    );
  });

  it('recursion through a function (params + return substituted)', () => {
    check(
      `
      type F = Recursive<{x: number; run: (next: Self) => Self}>;
      type _01 = Expect<Equal<F['run'], (next: F) => F>>;
      `,
      217
    );
  });

  it('discriminated union — Self substituted per arm', () => {
    check(
      `
      type U = Recursive<{kind: 'leaf'; val: number} | {kind: 'node'; child: Self}>;
      type _01 = Expect<Equal<Extract<U, {kind: 'node'}>['child'], U>>;
      type _02 = Expect<Equal<Extract<U, {kind: 'leaf'}>['val'], number>>;
      `,
      373
    );
  });

  it('non-recursive body is unchanged (no Self)', () => {
    check(
      `
      type P = Recursive<{a: string; b: number; c: {d: boolean}; when: Date}>;
      type _01 = Expect<Equal<P, {a: string; b: number; c: {d: boolean}; when: Date}>>;
      `,
      229
    );
  });
});
