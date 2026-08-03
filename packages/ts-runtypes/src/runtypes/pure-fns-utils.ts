/* ########
 * 2026 ma-jerez
 * Author: Ma-jerez
 * License: UNLICENSED - proprietary, see LICENSE
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
  isCurrency?: boolean;
};
interface RTValidationError {
  path: (StrNumber | object)[];
  expected: string;
  format?: TypeFormatError;
}

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
  // Counts enumerable keys via for-in: no array allocation (beats
  // `Object.keys(obj).length` ~1.4x on V8) and the same enumeration semantics
  // the hasUnknownKeysFromArray scan uses. Backs the `runsAfterValidation`
  // key-count fast path — after validation an all-required object is clean
  // iff its key count equals the declared prop count.
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
    // No `new Set<T>()` type arguments anywhere in a pure-fn body: the
    // built-in extractor strips annotations but not type arguments, so they
    // would survive into the emitted JS as a comparison expression.
    const primitives: Set<any> = new Set();
    let objects: Set<string> | null = null;
    for (let i = 0; i < len; i++) {
      const item = arr[i];
      if (item === null || typeof item !== 'object') {
        if (primitives.has(item)) return false;
        primitives.add(item);
        continue;
      }
      if (objects === null) objects = new Set();
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
