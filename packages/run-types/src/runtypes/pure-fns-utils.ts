/* ########
 * 2026 ma-jerez
 * Author: Ma-jerez
 * License: MIT, see LICENSE
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {registerPureFnFactory} from './pureFn.ts';
import {
  getUnknownKeysFromArrayId,
  countEnumKeysId,
  hasUnknownKeysFromArrayId,
  canonicalJsonId,
  uniqueArrayItemsId,
  uniqueSetMembersId,
  uniqueMapEntriesId,
  newRunTypeErrId,
} from './pure-fn-ids.generated.ts';
// TYPE-ONLY, so this file stays runtime dependency-free.
// It has to be the real `RTUtils`: the build records a dep through the `CompTimeArgs` brand on `getPureFn`'s first
// parameter, so a hand-rolled local shape with a plain `string` parameter is silently not tracked.
import type {RTUtils} from './rtUtils.ts';

// Slim local aliases for the RT utils surface, kept here so this file stays dependency-free.
type StrNumber = string | number;
type TypeFormatError = {
  name: string;
  val: StrNumber | boolean | bigint | (StrNumber | boolean | bigint)[];
  formatPath: StrNumber[];
  // Which way the format failed, for a format with more than one; documented twin in ../createRTFunctions.ts.
  errorType?: string;
  isCurrency?: boolean;
};
interface RTValidationError {
  path: (StrNumber | object)[];
  expected: string;
  format?: TypeFormatError;
}

// Ambient declaration: the package's tsconfig sets `types: []`, so Bun's globals aren't visible.
// `Bun` is the one runtime probe the pure-fn purity checker allows (`process` / `globalThis` / `global` are forbidden).
declare const Bun: unknown;

export const getUnknownKeysFromArray = registerPureFnFactory(function () {
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
}, getUnknownKeysFromArrayId);

export const countEnumKeys = registerPureFnFactory(function () {
  // Backs the `runsAfterValidation` key-count fast path: after validation an all-required object is clean iff its
  // key count equals the declared prop count.
  // Which counter is fastest inverts by engine: for-in on V8 (~19 vs ~25 ns/op), `Object.keys` on JavaScriptCore (~16 vs ~25).
  // The factory runs ONCE at materialisation inside the target runtime, so the engine test is paid once and the counter stays branch-free.
  // The two are NOT interchangeable: for-in also counts INHERITED enumerable properties, so the JSC arm tests the prototype per call.
  // The "is Object.prototype itself clean" half cannot vary per input, so it is hoisted up here.
  // The `!= null` half is for the same equivalence reason, not safety: for-in over null counts 0 where `Object.getPrototypeOf` throws.
  // Together both branches answer identically for EVERY input, and the per-call guard measured free on JSC.
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
}, countEnumKeysId);

export const hasUnknownKeysFromArray = registerPureFnFactory(function () {
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
}, hasUnknownKeysFromArrayId);

// ───────────────── uniqueItems: one predicate per collection ─────────────────
// ONE rule (no two entries equal by JSON value) over THREE walks: the collections disagree on what an entry is
// and on what is already unique by construction.
// A function per family rather than one branching walk: an array-only program never ships the Set or Map arm, and none pays a kind test.
// All three share `canonicalJson`, resolved once per module at factory time, so they can never disagree on "equal by value".

export const canonicalJson = registerPureFnFactory(function () {
  // JSON equality as a string key: numbers by mathematical value (0 and -0 collide), objects by unordered key set, arrays by order.
  // The runtime twin the mock walker uses is `canonicalJson` in mocking/structuralFormat.ts; the two MUST agree or mocks drift from validators.
  // A primitive's key carries its `typeof` prefix, so the string '{}' and the value {} are different entries.
  // Recursion rides a factory-LOCAL const: a factory body is inlined without its lexical environment, so self-naming reads as an outer capture (PFE9011).
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
}, canonicalJsonId);

export const uniqueArrayItems = registerPureFnFactory(function (utl: RTUtils) {
  const canonicalJsonFn = utl.getPureFn(canonicalJson) as (value: unknown) => string;
  // An array compares its ITEMS, and nothing in it is unique by construction.
  // Primitives key a Set directly, since SameValueZero is exactly the partition the canonical form produces, so they build no strings at all.
  // The two sets stay SEPARATE so a raw string cannot collide with an object's canonical form.
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
      const key = canonicalJsonFn(item);
      if (objects.has(key)) return false;
      objects.add(key);
    }
    return true;
  };
}, uniqueArrayItemsId);

export const uniqueSetMembers = registerPureFnFactory(function (utl: RTUtils) {
  const canonicalJsonFn = utl.getPureFn(canonicalJson) as (value: unknown) => string;
  // A Set's primitive members are already unique by construction (SameValueZero), so only object members are canonicalised.
  // That is why `Set<{id: number}>` needs the keyword at all: it may hold two structurally equal objects.
  return function _uniqueSetMembers(set: ReadonlySet<any>): boolean {
    let objects: Set<string> | null = null;
    for (const member of set) {
      if (member === null || typeof member !== 'object') continue;
      if (objects === null) objects = new Set<string>();
      const key = canonicalJsonFn(member);
      if (objects.has(key)) return false;
      objects.add(key);
    }
    return true;
  };
}, uniqueSetMembersId);

export const uniqueMapEntries = registerPureFnFactory(function (utl: RTUtils) {
  const canonicalJsonFn = utl.getPureFn(canonicalJson) as (value: unknown) => string;
  // A Map compares its ENTRIES, the `[key, value]` PAIRS that are its wire form.
  // A primitive key is unique by construction, so its whole pair is too and is skipped: `Map<string, BigObject>` canonicalises nothing.
  // An object key may repeat by content, so its pair is canonicalised whole: two content-equal keys with DIFFERENT values pass.
  return function _uniqueMapEntries(map: ReadonlyMap<any, any>): boolean {
    let objects: Set<string> | null = null;
    for (const [key, value] of map) {
      if (key === null || typeof key !== 'object') continue;
      if (objects === null) objects = new Set<string>();
      const pairKey = canonicalJsonFn([key, value]);
      if (objects.has(pairKey)) return false;
      objects.add(pairKey);
    }
    return true;
  };
}, uniqueMapEntriesId);

export const newRunTypeErr = registerPureFnFactory(function () {
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
}, newRunTypeErrId);
