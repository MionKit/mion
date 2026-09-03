// Per-branch correctness + instantiation-budget test for `DataOnly<T>`.
//
// Each `it` compiles a representative snippet for ONE branch of the mapping
// (src/runtypes/types.ts) through the real TypeScript compiler (see
// dataonlyHarness.ts) and asserts two things:
//   1. it type-checks cleanly — the projection is what we expect (the snippet's
//      `Expect<Equal<…>>` assertions fail to compile otherwise);
//   2. the NET instantiation count (case minus the constant empty-snippet
//      baseline) stays under an absolute budget — a recursion / exponential
//      blowup in that branch spikes the number and reds the test long before it
//      trips the hard TS2589 cap. The numbers are also per-branch data for
//      tuning an individual arm of the mapping.
//
// Each budget IS the branch's current net instantiation count — a one-way
// RATCHET that may only ever be lowered.
//
// ──────────────────── UPDATING A BUDGET — READ THIS ────────────────────
// Budgets are NOT auto-derived; you update them BY HAND. The test prints
// `net=… budget=…` for every branch on each run. After ANY change to DataOnly
// (src/runtypes/types.ts) or to a snippet here, re-run this suite and compare
// each printed `net` to its budget:
//
//   • net WENT DOWN  → you made the branch cheaper. Set its budget to the new
//                      (lower) net to lock the win in.
//   • net UNCHANGED  → nothing to do.
//   • net WENT UP    → a cost regression. Do NOT raise the budget to make the
//                      test pass — that silently defeats the guard. Fix DataOnly
//                      so the net returns to (or below) the current budget.
//
// A budget may ONLY ever be set LOWER than its current value, never higher. (A
// genuinely unavoidable increase — e.g. a deliberate new capability in the
// mapping — is a reviewed exception to call out explicitly in the PR, not the
// default path.) Counts are deterministic because `typescript` is exact-pinned;
// a TS version bump is the one event that re-baselines every branch.

import {describe, it, expect} from 'vitest';
import {measureDataOnly} from './dataonlyHarness.ts';

/** Compile `snippet`, assert it type-checks AND its net instantiation count is
 *  within `budget`. Returns the net count (handy when tuning). Budgets were
 *  last ratcheted for the sentinel-kept guard (M8: DataOnly keeps
 *  format-branded / slotted containers verbatim — one Extract per object-ish
 *  node, shape probes on records only; ~3-5% net across the profiles). **/
function check(snippet: string, budget: number): number {
  const r = measureDataOnly(snippet);
  expect(r.errors, `snippet should type-check cleanly:\n${snippet}\n→ ${r.errors.join('\n  ')}`).toEqual([]);
  // eslint-disable-next-line no-console
  // console.log(`    net=${String(r.netInstantiations).padStart(5)}  budget=${budget}`);
  expect(
    r.netInstantiations,
    `net instantiations (${r.netInstantiations}) exceeded budget (${budget}) — possible DataOnly recursion/cost regression`
  ).toBeLessThanOrEqual(budget);
  return r.netInstantiations;
}

describe('DataOnly<T> — per-branch correctness + instantiation budget', () => {
  it('atomics & broad kinds kept, symbol stripped', () => {
    check(
      `
      type _01 = Expect<Equal<DataOnly<string>, string>>;
      type _02 = Expect<Equal<DataOnly<number>, number>>;
      type _03 = Expect<Equal<DataOnly<boolean>, boolean>>;
      type _04 = Expect<Equal<DataOnly<bigint>, bigint>>;
      type _05 = Expect<Equal<DataOnly<null>, null>>;
      type _06 = Expect<Equal<DataOnly<undefined>, undefined>>;
      type _07 = Expect<Equal<DataOnly<'lit'>, 'lit'>>;
      type _08 = Expect<Equal<DataOnly<42>, 42>>;
      type _09 = Expect<Equal<DataOnly<any>, any>>;
      type _10 = Expect<Equal<DataOnly<unknown>, unknown>>;
      type _11 = Expect<Equal<DataOnly<never>, never>>;
      type _12 = Expect<Equal<DataOnly<void>, void>>;
      type _13 = Expect<Equal<DataOnly<object>, object>>;
      type _14 = Expect<Equal<DataOnly<symbol>, never>>;
      `,
      551
    );
  });

  it('Date is kept verbatim by identity; RegExp is not data and strips', () => {
    check(
      `
      type _01 = Expect<Equal<DataOnly<Date>, Date>>;
      type _02 = Expect<Equal<DataOnly<RegExp>, never>>;
      `,
      101
    );
  });

  // ArrayBuffer / SharedArrayBuffer / DataView + every typed array are
  // SubKindNonSerializable in the emitter (unsupported for validate/getValidationErrors
  // and every serializer) → DataOnly strips them to `never`. (The DOM classes
  // URL/Blob/File/FileList/FormData/URLSearchParams are NOT here: the emitter
  // validates them STRUCTURALLY as plain classes, so DataOnly projects them via
  // the object branch — same path as the `objects` case below. They aren't
  // asserted here because they require lib.dom, which the harness omits.)
  it('non-serialisable built-ins stripped to never (buffers + typed arrays)', () => {
    check(
      `
      type _01 = Expect<Equal<DataOnly<ArrayBuffer>, never>>;
      type _02 = Expect<Equal<DataOnly<SharedArrayBuffer>, never>>;
      type _03 = Expect<Equal<DataOnly<DataView>, never>>;
      type _04 = Expect<Equal<DataOnly<Int8Array>, never>>;
      type _05 = Expect<Equal<DataOnly<Uint8Array>, never>>;
      type _06 = Expect<Equal<DataOnly<Uint8ClampedArray>, never>>;
      type _07 = Expect<Equal<DataOnly<Int16Array>, never>>;
      type _08 = Expect<Equal<DataOnly<Uint16Array>, never>>;
      type _09 = Expect<Equal<DataOnly<Int32Array>, never>>;
      type _10 = Expect<Equal<DataOnly<Uint32Array>, never>>;
      type _11 = Expect<Equal<DataOnly<Float32Array>, never>>;
      type _12 = Expect<Equal<DataOnly<Float64Array>, never>>;
      type _13 = Expect<Equal<DataOnly<BigInt64Array>, never>>;
      type _14 = Expect<Equal<DataOnly<BigUint64Array>, never>>;
      `,
      184
    );
  });

  // Node's Buffer is a Uint8Array subclass, so the `ArrayBufferView` arm above
  // already catches it. Pinned separately because the Go emitter only started
  // agreeing with this in the ESNext-Buffer fix: the Go side now recognises the
  // binary family through what a type EXTENDS, so `Buffer` projects atomically
  // instead of being walked as a plain class. Declared inline — the harness has
  // no @types/node.
  it('Node Buffer stripped to never, like the typed array it is', () => {
    check(
      `
      interface Buffer extends Uint8Array<ArrayBuffer> {write(text: string): number}
      type _01 = Expect<Equal<DataOnly<Buffer>, never>>;
      type _02 = Expect<Equal<DataOnly<{id: number; blob: Buffer}>, {id: number}>>;
      `,
      252
    );
  });

  it('Temporal kept verbatim (via DataOnlyNativeExtra augmentation)', () => {
    check(
      `
      type _01 = Expect<Equal<DataOnly<Temporal.Instant>, Temporal.Instant>>;
      type _02 = Expect<Equal<DataOnly<Temporal.ZonedDateTime>, Temporal.ZonedDateTime>>;
      type _03 = Expect<Equal<DataOnly<Temporal.PlainDate>, Temporal.PlainDate>>;
      type _04 = Expect<Equal<DataOnly<Temporal.Duration>, Temporal.Duration>>;
      type _05 = Expect<Equal<DataOnly<{at: Temporal.Instant; name: string}>, {at: Temporal.Instant; name: string}>>;
      `,
      346
    );
  });

  it('functions & constructors stripped to never', () => {
    check(
      `
      type _01 = Expect<Equal<DataOnly<() => void>, never>>;
      type _02 = Expect<Equal<DataOnly<(a: string, b: number) => boolean>, never>>;
      type _03 = Expect<Equal<DataOnly<new (x: number) => Date>, never>>;
      type _04 = Expect<Equal<DataOnly<abstract new () => Date>, never>>;
      `,
      83
    );
  });

  it('Promise / thenables stripped to never', () => {
    check(
      `
      type _01 = Expect<Equal<DataOnly<Promise<string>>, never>>;
      type _02 = Expect<Equal<DataOnly<Promise<void>>, never>>;
      type _03 = Expect<Equal<DataOnly<Promise<{a: string}>>, never>>;
      type _04 = Expect<Equal<DataOnly<{then: (...a: never[]) => unknown}>, never>>;
      `,
      84
    );
  });

  it('Map / Set — kept as Map/Set, keys & values projected', () => {
    check(
      `
      type _01 = Expect<Equal<DataOnly<Map<string, number>>, Map<string, number>>>;
      type _02 = Expect<Equal<DataOnly<Set<string>>, Set<string>>>;
      type _03 = Expect<Equal<DataOnly<ReadonlyMap<string, number>>, ReadonlyMap<string, number>>>;
      type _04 = Expect<Equal<DataOnly<ReadonlySet<string>>, ReadonlySet<string>>>;
      // value type's method is stripped — a decoded value can't call it:
      type _05 = Expect<Equal<DataOnly<Map<string, { id: string; greet(): void }>>, Map<string, { id: string }>>>;
      type _06 = Expect<Equal<DataOnly<Set<{ id: string; run(): Promise<void> }>>, Set<{ id: string }>>>;
      // a function-typed value collapses the value type to never:
      type _07 = Expect<Equal<DataOnly<Map<string, () => void>>, Map<string, never>>>;
      `,
      1865
    );
  });

  // The members that aren't data must drop from CHILDREN of collections/unions
  // too, not just top-level object props — otherwise a decoded child would be
  // typed with methods it can't have.
  it('non-data members are stripped from collection / union children', () => {
    check(
      `
      interface WithMethod { id: string; greet(): string }
      type _01 = Expect<Equal<DataOnly<WithMethod[]>, { id: string }[]>>;                 // array element
      type _02 = Expect<Equal<DataOnly<[WithMethod, number]>, [{ id: string }, number]>>; // tuple slot
      type _03 = Expect<Equal<DataOnly<Map<string, WithMethod>>, Map<string, { id: string }>>>; // map value
      type _04 = Expect<Equal<DataOnly<Set<WithMethod>>, Set<{ id: string }>>>;           // set element
      type _05 = Expect<Equal<DataOnly<WithMethod | { n: number; run(): void }>, { id: string } | { n: number }>>; // union member
      // PROOF the method key is gone from the projected child — it cannot be accessed:
      type _06 = Expect<Equal<'greet' extends keyof DataOnly<WithMethod> ? true : false, false>>;
      `,
      2904
    );
  });

  it('arrays — homomorphic, element projected', () => {
    check(
      `
      type _01 = Expect<Equal<DataOnly<string[]>, string[]>>;
      type _02 = Expect<Equal<DataOnly<number[][]>, number[][]>>;
      type _03 = Expect<Equal<DataOnly<readonly string[]>, string[]>>;
      type _04 = Expect<Equal<DataOnly<(() => void)[]>, never[]>>;
      type _05 = Expect<Equal<DataOnly<{a: string; fn: () => void}[]>, {a: string}[]>>;
      `,
      958
    );
  });

  it('tuples — slots projected in place, modifiers & Parameters<Fn> preserved', () => {
    check(
      `
      type _01 = Expect<Equal<DataOnly<[string, number]>, [string, number]>>;
      type _02 = Expect<Equal<DataOnly<readonly [string, number]>, [string, number]>>;
      type _03 = Expect<Equal<DataOnly<[a?: string, b?: number]>, [a?: string, b?: number]>>;
      type _04 = Expect<Equal<DataOnly<[name: string, age: number]>, [string, number]>>;
      type _05 = Expect<Equal<DataOnly<[string, () => void]>, [string, never]>>;
      type _06 = Expect<Equal<DataOnly<[]>, []>>;
      type _07 = Expect<Equal<DataOnly<Parameters<(a: string, b: number) => void>>, [a: string, b: number]>>;
      `,
      2952
    );
  });

  it('objects — drop methods / symbol keys / never-valued, keep modifiers', () => {
    check(
      `
      type _01 = Expect<Equal<DataOnly<{a: string; b: number}>, {a: string; b: number}>>;
      type _02 = Expect<Equal<DataOnly<{a: string; fn: () => void}>, {a: string}>>;
      type _03 = Expect<Equal<DataOnly<{a: string; greet(): string}>, {a: string}>>;
      type _04 = Expect<Equal<DataOnly<{a: string; s: symbol}>, {a: string}>>;
      type _05 = Expect<Equal<DataOnly<{readonly a: string; b?: number}>, {readonly a: string; b?: number}>>;
      type _06 = Expect<Equal<DataOnly<{outer: {inner: string; fn: () => void}}>, {outer: {inner: string}}>>;
      type _07 = Expect<Equal<DataOnly<{p: Promise<string>; a: number}>, {a: number}>>;
      `,
      1137
    );
  });

  it('unions — non-data arms dropped', () => {
    check(
      `
      type _01 = Expect<Equal<DataOnly<string | (() => void)>, string>>;
      type _02 = Expect<Equal<DataOnly<string | symbol>, string>>;
      type _03 = Expect<Equal<DataOnly<number | Promise<number>>, number>>;
      type _04 = Expect<Equal<DataOnly<string | number>, string | number>>;
      type _05 = Expect<Equal<DataOnly<{a: string} | {b: number}>, {a: string} | {b: number}>>;
      `,
      392
    );
  });

  it('intersections — merged, non-data members dropped', () => {
    check(
      `
      type _01 = Expect<Equal<DataOnly<{a: string} & {b: number}>, {a: string; b: number}>>;
      type _02 = Expect<Equal<DataOnly<{a: string} & {fn: () => void}>, {a: string}>>;
      `,
      368
    );
  });

  it('circular — self-referential linked list', () => {
    check(
      `
      interface LinkedList { value: number; next?: LinkedList }
      type _01 = Expect<Assignable<DataOnly<LinkedList>, LinkedList>>;
      type _02 = Expect<Assignable<LinkedList, DataOnly<LinkedList>>>;
      type _03 = Expect<Equal<DataOnly<LinkedList>['value'], number>>;
      `,
      658
    );
  });

  it('circular — mutually recursive cross-reference', () => {
    check(
      `
      interface NodeA { x: string; b?: NodeB }
      interface NodeB { y: number; a?: NodeA }
      type _01 = Expect<Equal<DataOnly<NodeA>['x'], string>>;
      type _02 = Expect<Equal<DataOnly<NodeB>['y'], number>>;
      type _03 = Expect<Assignable<DataOnly<NodeA>, NodeA>>;
      `,
      1218
    );
  });

  it('circular — tree (recursive via array) drops a member at every level', () => {
    check(
      `
      interface Tree { name: string; onClick: () => void; children: Tree[] }
      type _01 = Expect<Equal<keyof DataOnly<Tree>, 'name' | 'children'>>;
      type _02 = Expect<Equal<DataOnly<Tree>['children'], DataOnly<Tree>[]>>;
      `,
      658
    );
  });

  it('circular — root-level recursive tuple (the old TS2589 case)', () => {
    check(
      `
      type TupleCircular = [number, string, TupleCircular?];
      type _01 = Expect<Equal<DataOnly<TupleCircular>[0], number>>;
      type _02 = Expect<Assignable<DataOnly<TupleCircular>, readonly unknown[]>>;
      `,
      587
    );
  });

  it('circular — recursive JSON value (union + index signature + array)', () => {
    check(
      `
      type Json = null | boolean | number | string | Json[] | {[key: string]: Json};
      type _01 = Expect<Assignable<DataOnly<Json>, Json>>;
      type _02 = Expect<Assignable<Json, DataOnly<Json>>>;
      `,
      1152
    );
  });

  it('circular — deep nesting + back-refs + stripped members + native + Map', () => {
    check(
      `
      interface Deep {
        id: string;
        fn: () => void;
        token: symbol;
        pending: Promise<number>;
        when: Date;
        child?: Deep;
        bag: { inner?: Deep; cb: () => void; count: number; index: Map<string, Deep> };
      }
      type _01 = Expect<Equal<keyof DataOnly<Deep>, 'id' | 'when' | 'child' | 'bag'>>;
      type _02 = Expect<Equal<keyof DataOnly<Deep>['bag'], 'inner' | 'count' | 'index'>>;
      type _03 = Expect<Equal<DataOnly<Deep>['when'], Date>>;
      // index stays a Map of string keys; its VALUE is now the projected Deep
      // (Map values recurse), so assert the Map shape, not the raw value type.
      type _04 = Expect<DataOnly<Deep>['bag']['index'] extends Map<string, any> ? true : false>;
      `,
      2516
    );
  });
});
