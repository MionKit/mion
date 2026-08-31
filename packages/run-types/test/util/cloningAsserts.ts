// Shared asserts for the cloning suite (test/suites/cloning). One universal
// entry point — `assertCloneCase` — derives every check from the case data:
//
//   1. value equality: clone(input) deep-equals the input (or the case's
//      `expected` shape when the input carries undeclared keys),
//   2. non-mutation: after cloning, the input still deep-equals an untouched
//      twin built by a second `getTestData()` call,
//   3. isolation: the clone graph shares NO mutable object reference with the
//      input graph (walks both sides: plain objects, class instances, arrays,
//      Map/Set incl. keys/values, Date, RegExp, Temporal instances) — which
//      also implies mutating the clone can never affect the input,
//   4. prototype preservation: an object-typed root keeps the input root's
//      prototype (covers `instanceof` for classes, Date, Map/Set, Temporal),
//   5. pass-through cases (`passThrough`) assert `clone(x) === x` instead of
//      2–4, and `factoryThrows` cases assert the CES001 alwaysThrow.

import {expect} from 'vitest';
import type {CloningCase} from '../suites/cloning/types.ts';

/** True for object-typed values the clone contract deliberately passes
 *  through by reference: opaque handles the type system gives no declared
 *  shape for (promises, ArrayBuffers and their views, weak collections).
 *  Copying a resource handle would be wrong, so sharing them is the
 *  documented behavior — the freshness walk must not flag them. **/
function isOpaqueHandle(value: object): boolean {
  return (
    value instanceof Promise ||
    value instanceof ArrayBuffer ||
    ArrayBuffer.isView(value) ||
    value instanceof WeakMap ||
    value instanceof WeakSet
  );
}

/** Collects every MUTABLE object reachable from `value` into `out`.
 *  Functions and opaque handles are excluded (pass-through by contract);
 *  everything else object-typed counts — sharing any of them between input
 *  and clone would leak mutations across. **/
function collectMutableRefs(value: unknown, out: Set<object>, seen: Set<object>): void {
  if (value === null || typeof value !== 'object') return;
  if (seen.has(value)) return;
  seen.add(value);
  if (isOpaqueHandle(value)) return;
  out.add(value);
  if (value instanceof Date || value instanceof RegExp) return;
  if (value instanceof Map) {
    for (const [entryKey, entryValue] of value) {
      collectMutableRefs(entryKey, out, seen);
      collectMutableRefs(entryValue, out, seen);
    }
    return;
  }
  if (value instanceof Set) {
    for (const item of value) collectMutableRefs(item, out, seen);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectMutableRefs(item, out, seen);
    return;
  }
  // Plain objects, class instances, Temporal instances (no enumerable own
  // keys — collected as leaves above and terminated here).
  for (const key of Object.keys(value)) {
    collectMutableRefs((value as Record<string, unknown>)[key], out, seen);
  }
}

/** Asserts the clone graph shares no mutable object with the input graph. **/
export function assertNoSharedMutableRefs(input: unknown, out: unknown): void {
  const inputRefs = new Set<object>();
  collectMutableRefs(input, inputRefs, new Set());
  const cloneRefs = new Set<object>();
  collectMutableRefs(out, cloneRefs, new Set());
  for (const ref of cloneRefs) {
    expect(inputRefs.has(ref), 'clone shares a mutable reference with the input').toBe(false);
  }
}

/** The universal per-case assertion — see the module doc for the checklist. **/
export function assertCloneCase(c: CloningCase): void {
  if (c.factoryThrows) {
    expect(() => c.clone()).toThrow(/CES001/);
    return;
  }
  const clone = c.clone();
  const {values, expected} = c.getTestData();
  const {values: twins} = c.getTestData();
  values.forEach((input, index) => {
    const out = clone(input);
    expect(out).toEqual(expected ? expected[index] : twins[index]);
    if (c.passThrough) {
      expect(out).toBe(input);
    } else {
      // Non-mutation: the input still equals its untouched twin.
      expect(input).toEqual(twins[index]);
      assertNoSharedMutableRefs(input, out);
      if (out !== null && typeof out === 'object' && input !== null && typeof input === 'object') {
        expect(Object.getPrototypeOf(out)).toBe(Object.getPrototypeOf(input));
      }
    }
    c.verifyClone?.(out, input);
  });
}
