/* ########
 * 2026 ma-jerez
 * Author: Ma-jerez
 * License: MIT, see LICENSE
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {registerPureFnFactory} from './pureFn.ts';
// TYPE-ONLY, so this file stays runtime dependency-free. It has to be the real
// `RTUtils`: the build records a pure fn's DEPENDENCIES by recognising
// `utl.getPureFn('<ns>::<name>')` through the `CompTimeArgs<string>` brand on
// that method's first parameter, so a hand-rolled local shape with a plain
// `string` parameter is silently not tracked and the dep never reaches the
// emitted module.
import type {RTUtils} from './rtUtils.ts';

// Slim local type aliases for the RT utils surface, kept here so this
// file stays dependency-free. Fully erased at runtime.
type StrNumber = string | number;
type TypeFormatError = {
  name: string;
  val: StrNumber | boolean | bigint | (StrNumber | boolean | bigint)[];
  formatPath: StrNumber[];
  // Which way the format failed, for a format with more than one. See the
  // documented twin in ../createRTFunctions.ts.
  errorType?: string;
  isCurrency?: boolean;
};
interface RTValidationError {
  path: (StrNumber | object)[];
  expected: string;
  format?: TypeFormatError;
}

// Ambient declaration — the package's tsconfig sets `types: []`, so Bun's
// globals aren't visible. Only ever read through `typeof Bun !== 'undefined'`
// (see pf_countEnumKeys); `Bun` is the one runtime probe the pure-fn purity
// checker allows (`process` / `globalThis` / `global` are forbidden).
declare const Bun: unknown;

export const pf_getUnknownKeysFromArray = registerPureFnFactory('rt::getUnknownKeysFromArray', function () {
  const MAX_UNKNOWN_KEYS = 10;
  return function _getUnknownKeysFromArray(obj: Record<StrNumber, any>, keys: StrNumber[]): StrNumber[] {
    const unknownKeys: StrNumber[] = [];
    for (const prop in obj) {
      let found = false;
      for (let j = 0; j < keys.length; j++) {
        if (keys[j] === prop) {
          found = true;
          break;
        }
      }
      if (!found) {
        unknownKeys.push(prop as string);
        if (unknownKeys.length >= MAX_UNKNOWN_KEYS) throw new Error('Too many unknown keys');
      }
    }
    return unknownKeys;
  };
});

export const pf_countEnumKeys = registerPureFnFactory('rt::countEnumKeys', function () {
  // Counts enumerable keys. Backs the `runsAfterValidation` key-count fast
  // path — after validation an all-required object is clean iff its key count
  // equals the declared prop count.
  //
  // WHICH counter is fastest depends on the engine, and the two invert:
  //   - V8 (Node, Deno): for-in rides an enum cache and `Object.keys`
  //     allocates an array, so for-in wins (~19 vs ~25 ns/op on the full
  //     strict path over a 10-field shape).
  //   - JavaScriptCore (Bun): `Object.keys` is served from the cached
  //     structure property table and for-in is comparatively slow, so keys
  //     wins (~16 vs ~25 ns/op on the same bench).
  // The factory runs ONCE at materialisation inside the target runtime, so the
  // engine test is paid once and the returned counter stays branch-free.
  //
  // The counters are NOT interchangeable in general: for-in also counts
  // INHERITED enumerable properties, `Object.keys` does not. They agree exactly
  // when the prototype chain contributes nothing enumerable, so the JSC counter
  // tests for that per call (plain object literal, or null prototype) and falls
  // back to for-in otherwise; the "is Object.prototype itself clean" half can
  // never vary per input, so it is hoisted up here. The `!= null` half is there
  // for the same equivalence reason rather than for safety: the fast path only
  // ever sees validated objects, but `for-in` over null/undefined counts 0
  // where `Object.getPrototypeOf` would throw. Together those make both
  // branches answer identically for EVERY input — no program can validate
  // differently on Bun than on Node — and the per-call guard measured free on
  // JSC (~16 ns/op either way).
  if (typeof Bun !== 'undefined' && Object.keys(Object.prototype).length === 0) {
    const objectProto = Object.prototype;
    return function _countEnumKeys(obj: Record<StrNumber, any>): number {
      const proto = obj != null ? Object.getPrototypeOf(obj) : undefined;
      if (proto === objectProto || proto === null) return Object.keys(obj).length;
      let count = 0;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for (const _key in obj) count++;
      return count;
    };
  }
  return function _countEnumKeys(obj: Record<StrNumber, any>): number {
    let count = 0;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for (const _key in obj) count++;
    return count;
  };
});

export const pf_hasUnknownKeysFromArray = registerPureFnFactory('rt::hasUnknownKeysFromArray', function () {
  return function _hasUnknownKeysFromArray(obj: Record<StrNumber, any>, keys: StrNumber[]): boolean {
    for (const prop in obj) {
      let found = false;
      for (let j = 0; j < keys.length; j++) {
        if (keys[j] === prop) {
          found = true;
          break;
        }
      }
      if (!found) return true;
    }
    return false;
  };
});

// ───────────────── uniqueItems: one predicate per collection ─────────────────
// The 2020-12 `uniqueItems` keyword is ONE rule (no two entries equal by JSON
// value) over THREE different walks, because the three collections disagree on
// what an entry is and on what is already unique by construction. Splitting it
// into a function per family rather than branching inside one keeps each
// emitted module to the walk its own base needs: an array-only program never
// ships the Set or Map arm, and none of the three pays a runtime kind test.
//
// All three share the canonical form through `rt::canonicalJson`, resolved once
// per module at factory time, so the recursive closure is still built once and
// the three can never disagree on what "equal by value" means.

export const pf_canonicalJson = registerPureFnFactory('rt::canonicalJson', function () {
  // JSON equality as a string key: numbers by mathematical value (so 0 and -0
  // collide, 1 and 1.0 collide), objects by unordered key set, arrays by order.
  // The runtime twin the mock walker uses is `canonicalJson` in
  // mocking/structuralFormat.ts — the two MUST agree or mocks drift from
  // validators.
  //
  // A primitive's key carries its `typeof` prefix (a string is JSON-quoted
  // instead), so a raw string can never collide with the canonical form of an
  // object: the string '{}' and the value {} are different entries.
  // The recursion rides a factory-LOCAL const, not the returned function's own
  // name: a factory body is inlined without its lexical environment, so a
  // returned function that names itself reads as an outer capture (PFE9011).
  const canonical = (value: any): string => {
    if (value === null || typeof value !== 'object') {
      return typeof value === 'string' ? JSON.stringify(value) : typeof value + ':' + String(value);
    }
    if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
    return (
      '{' +
      Object.keys(value)
        .sort()
        .map((key) => JSON.stringify(key) + ':' + canonical(value[key]))
        .join(',') +
      '}'
    );
  };
  return function _canonicalJson(value: any): string {
    return canonical(value);
  };
});

export const pf_uniqueArrayItems = registerPureFnFactory('rt::uniqueArrayItems', function (utl: RTUtils) {
  const canonicalJson = utl.getPureFn('rt::canonicalJson') as (value: unknown) => string;
  // An array (FormattedArray, plain or tuple) compares its ITEMS, and nothing
  // in it is unique by construction. Primitives key a Set directly — Set
  // membership is SameValueZero, exactly the partition the canonical form
  // produces (0 with -0, NaN with itself) — so an array of numbers or strings
  // builds no strings at all. The two sets stay SEPARATE so a raw string
  // cannot collide with an object's canonical form.
  return function _uniqueArrayItems(arr: readonly any[]): boolean {
    const len = arr.length;
    if (len < 2) return true;
    const primitives = new Set<any>();
    let objects: Set<string> | null = null;
    for (let i = 0; i < len; i++) {
      const item = arr[i];
      if (item === null || typeof item !== 'object') {
        if (primitives.has(item)) return false;
        primitives.add(item);
        continue;
      }
      if (objects === null) objects = new Set<string>();
      const key = canonicalJson(item);
      if (objects.has(key)) return false;
      objects.add(key);
    }
    return true;
  };
});

export const pf_uniqueSetMembers = registerPureFnFactory('rt::uniqueSetMembers', function (utl: RTUtils) {
  const canonicalJson = utl.getPureFn('rt::canonicalJson') as (value: unknown) => string;
  // A Set (FormattedSet) compares its MEMBERS, and its primitive members are
  // already unique by construction (SameValueZero), so only object members are
  // canonicalised and a Set of primitives allocates nothing. That is the whole
  // difference from the array walk, and the reason a `Set<{id: number}>` needs
  // the keyword at all: it may hold two structurally equal objects.
  return function _uniqueSetMembers(set: ReadonlySet<any>): boolean {
    let objects: Set<string> | null = null;
    for (const member of set) {
      if (member === null || typeof member !== 'object') continue;
      if (objects === null) objects = new Set<string>();
      const key = canonicalJson(member);
      if (objects.has(key)) return false;
      objects.add(key);
    }
    return true;
  };
});

export const pf_uniqueMapEntries = registerPureFnFactory('rt::uniqueMapEntries', function (utl: RTUtils) {
  const canonicalJson = utl.getPureFn('rt::canonicalJson') as (value: unknown) => string;
  // A Map (FormattedMap) compares its ENTRIES, the `[key, value]` PAIRS that
  // are its wire form. A primitive map key is unique by construction, which
  // makes its whole pair unique too, so it is skipped — a
  // `Map<string, BigObject>` canonicalises nothing however large its values.
  // An object key may repeat by content, so its pair is canonicalised whole:
  // two content-equal keys with DIFFERENT values are two different entries and
  // pass.
  return function _uniqueMapEntries(map: ReadonlyMap<any, any>): boolean {
    let objects: Set<string> | null = null;
    for (const [key, value] of map) {
      if (key === null || typeof key !== 'object') continue;
      if (objects === null) objects = new Set<string>();
      const pairKey = canonicalJson([key, value]);
      if (objects.has(pairKey)) return false;
      objects.add(pairKey);
    }
    return true;
  };
});

export const pf_newRunTypeErr = registerPureFnFactory('rt::newRunTypeErr', function () {
  return function _err(
    pλth: readonly StrNumber[],
    εrr: RTValidationError[],
    expected: string,
    accessPath?: readonly StrNumber[]
  ): void {
    const path = accessPath?.length ? [...pλth, ...accessPath] : [...pλth];
    const runTypeErr: RTValidationError = {expected, path};
    εrr.push(runTypeErr);
  };
});
