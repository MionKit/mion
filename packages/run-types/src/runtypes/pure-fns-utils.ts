/* ########
 * 2026 ma-jerez
 * Author: Ma-jerez
 * License: MIT, see LICENSE
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {registerPureFnFactory} from './pureFn.ts';

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

export const pf_uniqueItems = registerPureFnFactory('rt::uniqueItems', function () {
  // The 2020-12 `uniqueItems` predicate: JSON equality — numbers by
  // mathematical value (so 0 and -0 collide), objects by unordered key set,
  // arrays by order. `canon` is built once here at registration rather than
  // once per validator call, which is why this lives in a pure fn instead of
  // inline in the emitted body.
  //
  // Only objects and arrays pay for canonicalisation; primitives key a Set
  // directly, so an array of numbers or strings never builds a string. Set
  // membership is SameValueZero, which is exactly the partition the canonical
  // form produced (0 with -0, NaN with itself). The two sets are kept SEPARATE
  // so a raw string can never collide with the canonical form of an object —
  // the string '{}' and the value {} are different items.
  const canon = (x: any): string => {
    if (x === null || typeof x !== 'object') {
      return typeof x === 'string' ? JSON.stringify(x) : typeof x + ':' + String(x);
    }
    if (Array.isArray(x)) return '[' + x.map(canon).join(',') + ']';
    return (
      '{' +
      Object.keys(x)
        .sort()
        .map((k) => JSON.stringify(k) + ':' + canon(x[k]))
        .join(',') +
      '}'
    );
  };
  return function _uniqueItems(arr: readonly any[]): boolean {
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
      const key = canon(item);
      if (objects.has(key)) return false;
      objects.add(key);
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
