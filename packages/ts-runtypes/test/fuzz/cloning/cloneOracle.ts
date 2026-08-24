// The cloning oracle layer — "is the compiled exact-shape clone behaving?".
//
// Same philosophy as value/fuzzOracle.ts: every check derives from a property
// the library must uphold, never from a hand-written expected output. The
// clone contract is checked over CONFORMING values only (`validate(v)` true —
// the mock stream and the extras stream are both valid by construction):
//
//   STRONG (metamorphic, model-based)
//     O15 clone-reference   deepEqual(clone(v), referenceClone(schema, v)) —
//                           the compiled clone must agree with the naive
//                           reference interpreter on every conforming value
//     O16 clone-isolation   the input still deep-equals its pre-clone
//                           snapshot, the clone shares NO mutable object
//                           reference with the input, and an object-typed
//                           root keeps the input root's prototype
//     O17 clone-consistency validate(clone(v)) is true, clone(clone(v))
//                           deep-equals clone(v), and (extras stream)
//                           hasUnknownKeys(clone(v)) is false
//
//   ROBUSTNESS (junk stream)
//     clone's contract does NOT cover non-conforming input — it may return
//     garbage or throw. The only hard requirement checked is that a throw is
//     a real Error (no non-Error throws); hangs are the suite timeout's job.
//
// Pure module: no vitest imports, so the runner also works as a standalone
// soak. `deepEqual` is implemented locally (Node's isDeepStrictEqual treats
// two different Temporal instances as equal — no own enumerable keys — and
// its unordered Map matching is stricter than the pairwise order the clone
// walks produce).

import type {RunType} from '../../../src/runtypes/types.ts';
import {snapshot, type Violation} from '../value/fuzzOracle.ts';
import {referenceClone} from './referenceClone.ts';

/** One target under clone fuzz: the schema drives mock/extras generation and
 *  the reference interpreter; validate gates conformance; hasUnknownKeys is
 *  the optional extras cross-check. The test file builds these so the Vite
 *  plugin can rewrite the `createX<T>()` call sites. **/
export interface CloneFuzzTarget {
  title: string;
  /** Runtype tree — mock/extras generation + the reference interpreter. **/
  schema: RunType;
  mock: () => unknown;
  validate: (value: unknown) => boolean;
  hasUnknownKeys?: (value: unknown) => boolean;
  /** The compiled `createCloneExactShapeFn<T>()` under test. `any` parameter:
   *  `CloneExactShapeFn<T>` is T-narrowed and strictFunctionTypes rejects it
   *  where `(value: unknown) => unknown` is expected (contravariance) — same
   *  erasure the cloning suite's `AnyCloneFn` does. **/
  clone: (value: any) => unknown;
}

/** The extras stream is a fourth phase the value fuzzer doesn't have. **/
export type ClonePhase = Violation['phase'] | 'extras';

/** Violation with the widened phase — same shape otherwise, so reports
 *  render through the exact same formatting as the value fuzzer's. **/
export interface CloneViolation extends Omit<Violation, 'phase'> {
  phase: ClonePhase;
}

export interface CloneCheckCtx {
  seed: number;
  phase: ClonePhase;
}

function violation(
  oracle: CloneViolation['oracle'],
  target: CloneFuzzTarget,
  ctx: CloneCheckCtx,
  message: string,
  value: unknown
): CloneViolation {
  return {oracle, target: target.title, seed: ctx.seed, phase: ctx.phase, message, value: snapshot(value)};
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** O15 — the compiled clone agrees with the reference interpreter. Also owns
 *  reporting a clone throw on a conforming value (the other checks return
 *  null on a throw so it isn't triple-counted). **/
export function checkCloneReference(target: CloneFuzzTarget, value: unknown, ctx: CloneCheckCtx): CloneViolation | null {
  let out: unknown;
  try {
    out = target.clone(value);
  } catch (err) {
    return violation('O15', target, ctx, `clone threw on a conforming value: ${errMsg(err)}`, value);
  }
  let reference: unknown;
  try {
    reference = referenceClone(target.schema, value);
  } catch (err) {
    // The interpreter crashing is OUR bug (or a corpus type outside its
    // documented scope) — flag it loudly rather than skipping silently.
    return violation('O15', target, ctx, `reference interpreter threw (fix the harness): ${errMsg(err)}`, value);
  }
  if (!deepEqual(out, reference)) {
    return violation(
      'O15',
      target,
      ctx,
      `clone diverges from the reference interpreter:\n      clone    =${snapshot(out)}\n      reference=${snapshot(reference)}`,
      value
    );
  }
  return null;
}

/** O16 — cloning never touches the input and shares nothing mutable with it.
 *  `preSnapshot` must be taken BEFORE the first clone call of the iteration
 *  so mutation by any earlier oracle's clone call is also caught. **/
export function checkCloneIsolation(
  target: CloneFuzzTarget,
  value: unknown,
  preSnapshot: unknown,
  ctx: CloneCheckCtx
): CloneViolation | null {
  let out: unknown;
  try {
    out = target.clone(value);
  } catch {
    return null; // O15 reports the throw
  }
  if (!deepEqual(value, preSnapshot)) {
    return violation('O16', target, ctx, 'clone MUTATED its input (differs from the pre-clone snapshot)', value);
  }
  const shared = findSharedMutableRef(value, out);
  if (shared !== null) {
    return violation('O16', target, ctx, `clone shares a mutable reference with the input: ${snapshot(shared)}`, value);
  }
  if (
    out !== null &&
    typeof out === 'object' &&
    value !== null &&
    typeof value === 'object' &&
    Object.getPrototypeOf(out) !== Object.getPrototypeOf(value)
  ) {
    return violation('O16', target, ctx, 'clone root does not preserve the input prototype', value);
  }
  return null;
}

/** O17 — the clone is itself a conforming value, cloning is idempotent, and
 *  (extras stream) the clone carries no unknown keys. **/
export function checkCloneConsistency(
  target: CloneFuzzTarget,
  value: unknown,
  ctx: CloneCheckCtx,
  options: {expectNoUnknownKeys?: boolean} = {}
): CloneViolation | null {
  let out: unknown;
  try {
    out = target.clone(value);
  } catch {
    return null; // O15 reports the throw
  }
  try {
    if (target.validate(out) !== true) {
      return violation('O17', target, ctx, 'validate rejected the clone of a conforming value', out);
    }
  } catch (err) {
    return violation('O17', target, ctx, `validate threw on the clone of a conforming value: ${errMsg(err)}`, out);
  }
  try {
    const again = target.clone(out);
    if (!deepEqual(again, out)) {
      return violation('O17', target, ctx, 'clone is not idempotent: clone(clone(v)) differs from clone(v)', value);
    }
  } catch (err) {
    return violation('O17', target, ctx, `clone threw on its own output: ${errMsg(err)}`, out);
  }
  if (options.expectNoUnknownKeys && target.hasUnknownKeys) {
    try {
      if (target.hasUnknownKeys(out) !== false) {
        return violation('O17', target, ctx, 'hasUnknownKeys still finds unknown keys on the clone of an extras value', out);
      }
    } catch (err) {
      return violation('O17', target, ctx, `hasUnknownKeys threw on a clone: ${errMsg(err)}`, out);
    }
  }
  return null;
}

/** Robustness (junk stream, deliberately minimal): clone's contract covers
 *  conforming values only, so on junk that FAILS validate it may return
 *  anything or throw — the only violation recorded is a non-Error throw.
 *  Conforming junk is skipped (the valid stream owns that ground); a hang
 *  is caught by the suite timeout, not here. **/
export function checkCloneRobustness(target: CloneFuzzTarget, junk: unknown, ctx: CloneCheckCtx): CloneViolation | null {
  try {
    if (target.validate(junk) === true) return null;
  } catch {
    return null; // validate totality is the value fuzzer's O3, not re-checked here
  }
  try {
    target.clone(junk);
  } catch (err) {
    if (!(err instanceof Error)) {
      return violation('O17', target, ctx, `clone threw a NON-Error on junk input: ${String(err)}`, junk);
    }
  }
  return null;
}

// ─────────────────────────── deep equality ───────────────────────────

const TEMPORAL_TYPE_NAMES = [
  'Instant',
  'ZonedDateTime',
  'PlainDate',
  'PlainTime',
  'PlainDateTime',
  'PlainYearMonth',
  'PlainMonthDay',
  'Duration',
] as const;

function isTemporalInstance(value: object): boolean {
  const temporal = (globalThis as Record<string, unknown>).Temporal as Record<string, unknown> | undefined;
  if (!temporal) return false;
  for (const name of TEMPORAL_TYPE_NAMES) {
    const ctor = temporal[name] as (abstract new () => object) | undefined;
    if (ctor && value instanceof ctor) return true;
  }
  return false;
}

/** Structural deep equality for clone outputs. Handles Map/Set/Date/RegExp/
 *  NaN and Temporal; functions, symbols and promises compare by identity
 *  (they are pass-through in the clone contract, so both sides hold the
 *  same reference). Key PRESENCE matters (`{a: undefined}` ≠ `{}`), and
 *  object prototypes must match (class clones keep theirs). Map/Set entries
 *  compare pairwise in iteration order — both sides of every comparison
 *  here are derived from the same input walk, so orders align. **/
export function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true; // NaN === NaN here; also fn/symbol/promise identity
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (a instanceof Date || b instanceof Date) {
    return a instanceof Date && b instanceof Date && Object.is(a.getTime(), b.getTime());
  }
  if (a instanceof RegExp || b instanceof RegExp) {
    return (
      a instanceof RegExp && b instanceof RegExp && a.source === b.source && a.flags === b.flags && a.lastIndex === b.lastIndex
    );
  }
  if (isTemporalInstance(a) || isTemporalInstance(b)) {
    // Temporal instances have no own enumerable keys — compare the canonical
    // ISO rendering under a matching prototype instead.
    return Object.getPrototypeOf(a) === Object.getPrototypeOf(b) && String(a) === String(b);
  }
  if (a instanceof Map || b instanceof Map) {
    if (!(a instanceof Map) || !(b instanceof Map) || a.size !== b.size) return false;
    const bEntries = [...b.entries()];
    let index = 0;
    for (const [key, value] of a) {
      const [otherKey, otherValue] = bEntries[index++];
      if (!deepEqual(key, otherKey) || !deepEqual(value, otherValue)) return false;
    }
    return true;
  }
  if (a instanceof Set || b instanceof Set) {
    if (!(a instanceof Set) || !(b instanceof Set) || a.size !== b.size) return false;
    const bItems = [...b.values()];
    let index = 0;
    for (const item of a) {
      if (!deepEqual(item, bItems[index++])) return false;
    }
    return true;
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }
  if (isOpaqueHandle(a) || isOpaqueHandle(b)) return false; // identity (Object.is) already failed
  if (Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) return false;
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
    if (!deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])) return false;
  }
  return true;
}

// ─────────────────────── shared-reference walker ───────────────────────
// Ported from test/util/cloningAsserts.ts (collectMutableRefs /
// isOpaqueHandle) — that module asserts through vitest's `expect`, and this
// layer must stay framework-free, so the walk is copied verbatim and returns
// the first offending reference instead of asserting.

/** Object-typed values the clone contract deliberately passes through by
 *  reference: opaque handles the type system gives no declared shape for
 *  (promises, ArrayBuffers and their views, weak collections). Sharing them
 *  is the documented behavior — the freshness walk must not flag them. **/
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

/** First mutable object the clone shares with the input, or null. **/
export function findSharedMutableRef(input: unknown, out: unknown): object | null {
  const inputRefs = new Set<object>();
  collectMutableRefs(input, inputRefs, new Set());
  const cloneRefs = new Set<object>();
  collectMutableRefs(out, cloneRefs, new Set());
  for (const ref of cloneRefs) {
    if (inputRefs.has(ref)) return ref;
  }
  return null;
}
