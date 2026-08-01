/* ########
 * 2026 ma-jerez
 * Author: Ma-jerez
 * License: UNLICENSED - proprietary, see LICENSE
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, it, expect} from 'vitest';
import type {CompiledPureFunction} from '../../src/runtypes/types.ts';
import {RTUtils, getRTUtils, pureFnKey} from '../../src/runtypes/rtUtils.ts';
import {registerPureFnFactory} from '../../src/runtypes/pureFn.ts';

const TEST_NAMESPACE = 'test';

function getCompiledPureFn(namespace: string, fnName: string): CompiledPureFunction | undefined {
  return getRTUtils().getCompiledPureFn(pureFnKey(namespace, fnName));
}

// 14-char base64url — what the Go binary's BodyHash emits.
const BODY_HASH_REGEX = /^[A-Za-z0-9_-]{14}$/;

it('register and get pure function with extracted data', () => {
  type StringParams = {
    isLowercase?: boolean;
    isNumeric?: boolean;
  };
  registerPureFnFactory('test::stringPureFn', function () {
    const isNumericRegexp = /^[0-9]+$/;
    return function is_s(s: string, p: StringParams): boolean {
      if (p.isLowercase && s !== s.toLowerCase()) return false;
      if (p.isNumeric && !isNumericRegexp.test(s)) return false;
      return true;
    };
  });
  const restoredFn = getRTUtils().getPureFn(pureFnKey(TEST_NAMESPACE, 'stringPureFn')) as (s: string, p: StringParams) => boolean;
  expect(restoredFn).toBeDefined();
  expect(restoredFn).toBeInstanceOf(Function);
  expect(restoredFn('a', {isLowercase: true})).toBe(true);
  expect(restoredFn('A', {isLowercase: true})).toBe(false);
});

it('throws when no cache entry is found (USER key, null factory)', () => {
  // A USER-namespaced key with a null factory and no cache entry is a
  // missing-plugin signal — the Go binary only emits entries for files it walks,
  // so a key it never saw must throw. (The hollowed BUILT-IN lane is exempt; see
  // the 'hollowed built-in lane' block below.)
  expect(() => registerPureFnFactory(`${TEST_NAMESPACE}_unscanned_${Math.random()}::noSuchFn`, null)).toThrow(
    /no cache entry for/
  );
});

it('populates bodyHash, paramNames, and code from extracted data', () => {
  registerPureFnFactory('test::metadataTestFn', function () {
    return function test_fn(val: string): string {
      return val.toUpperCase();
    };
  });
  const compiled = getCompiledPureFn(TEST_NAMESPACE, 'metadataTestFn');
  expect(compiled).toBeDefined();
  expect(compiled?.bodyHash).toMatch(BODY_HASH_REGEX);
  expect(compiled?.paramNames).toEqual([]);
  expect(typeof compiled?.code).toBe('string');
  expect(compiled?.code?.length).toBeGreaterThan(0);
  expect(compiled?.fnName).toBe('metadataTestFn');
  expect(compiled?.namespace).toBe(TEST_NAMESPACE);
});

it('auto-detects dependencies via proxy when factory calls getPureFn', () => {
  type Params = {
    isA?: boolean;
    isB?: boolean;
  };
  registerPureFnFactory('test::pureFunctionA', function (_jUtils: RTUtils) {
    return function is_a(s: string, p: Params): boolean {
      if (p.isA) return s.includes('a');
      return true;
    };
  });
  registerPureFnFactory('test::pureFunctionB', function (jUtils: RTUtils) {
    const isA = jUtils.getPureFn('test::pureFunctionA') as (s: string, p: Params) => boolean;
    return function is_b(s: string, p: Params): boolean {
      const isAResult = isA(s, p);
      if (p.isB) return isAResult && s.includes('b');
      return isAResult;
    };
  });
  const compiledIsA = getCompiledPureFn(TEST_NAMESPACE, 'pureFunctionA');
  const compiledIsB = getCompiledPureFn(TEST_NAMESPACE, 'pureFunctionB');
  expect(compiledIsA).toBeDefined();
  expect(compiledIsB).toBeDefined();
  // Materialise `fn` lazily — the cache module sets fn=undefined until
  // a getPureFn / usePureFn caller forces createPureFn to run.
  expect(getRTUtils().getPureFn(pureFnKey(TEST_NAMESPACE, 'pureFunctionA'))).toBeInstanceOf(Function);
  expect(getRTUtils().getPureFn(pureFnKey(TEST_NAMESPACE, 'pureFunctionB'))).toBeInstanceOf(Function);
  // Static dep extraction emits full `"<namespace>::<fnName>"` keys.
  expect(compiledIsB?.pureFnDependencies?.includes('test::pureFunctionA')).toBeTruthy();
  expect(compiledIsA?.pureFnDependencies ?? []).toEqual([]);
  expect(compiledIsA?.namespace).toBe(TEST_NAMESPACE);
  expect(compiledIsB?.namespace).toBe(TEST_NAMESPACE);
});

describe('arrow function factory functions', () => {
  it('should register and get arrow function pure factory with parentheses', () => {
    type StringParams = {
      isLowercase?: boolean;
    };
    registerPureFnFactory('test::arrowWithParens', (_jUtils: RTUtils) => {
      return function is_s(s: string, p: StringParams): boolean {
        if (p.isLowercase) return s === s.toLowerCase();
        return true;
      };
    });
    const restoredFn = getRTUtils().getPureFn(pureFnKey(TEST_NAMESPACE, 'arrowWithParens')) as (
      s: string,
      p: StringParams
    ) => boolean;
    expect(restoredFn).toBeDefined();
    expect(restoredFn).toBeInstanceOf(Function);
    expect(restoredFn('abc', {isLowercase: true})).toBe(true);
    expect(restoredFn('ABC', {isLowercase: true})).toBe(false);
  });

  it('should register arrow function with expression body', () => {
    type NumParams = {
      multiplier?: number;
    };
    registerPureFnFactory(
      'test::arrowExpression',
      (_jUtils: RTUtils) =>
        function multiply(n: number, p: NumParams): number {
          return n * (p.multiplier ?? 1);
        }
    );
    const restoredFn = getRTUtils().getPureFn(pureFnKey(TEST_NAMESPACE, 'arrowExpression')) as (
      n: number,
      p: NumParams
    ) => number;
    expect(restoredFn).toBeDefined();
    expect(restoredFn).toBeInstanceOf(Function);
    expect(restoredFn(5, {multiplier: 3})).toBe(15);
    expect(restoredFn(5, {})).toBe(5);
  });

  it('should auto-detect dependencies for arrow functions', () => {
    type Params = {
      isA?: boolean;
      isB?: boolean;
    };
    registerPureFnFactory('test::arrowFnA', (_jUtils: RTUtils) => {
      return function is_a(s: string, p: Params): boolean {
        if (p.isA) return s.includes('a');
        return true;
      };
    });
    registerPureFnFactory('test::arrowFnB', (jUtils: RTUtils) => {
      const isA = jUtils.getPureFn('test::arrowFnA') as (s: string, p: Params) => boolean;
      return function is_b(s: string, p: Params): boolean {
        const isAResult = isA(s, p);
        if (p.isB) return isAResult && s.includes('b');
        return isAResult;
      };
    });
    const compiledA = getCompiledPureFn(TEST_NAMESPACE, 'arrowFnA');
    const compiledB = getCompiledPureFn(TEST_NAMESPACE, 'arrowFnB');
    expect(compiledA).toBeDefined();
    expect(compiledB).toBeDefined();
    expect(compiledB?.pureFnDependencies?.includes('test::arrowFnA')).toBeTruthy();
    expect(compiledA?.pureFnDependencies ?? []).toEqual([]);
  });
});

// The hollowed built-in lane (demand-driven built-in pure-fns, phase
// E): the dist build strips the `rt::`/`rtFormats::` factory bodies to `null`
// because the resolver now delivers them on demand through the pure-fn cache. A
// `null` factory for such a key must be an inert no-op — never a throw, and never
// a cached placeholder that could mask the real body arriving via a deps thunk.
describe('hollowed built-in lane', () => {
  it('null factory for a built-in key is inert: no throw, not cached', () => {
    const key = 'rt::hollowLaneUnusedFn';
    expect(getRTUtils().getCompiledPureFn(key)).toBeUndefined();
    // Hollowed dist ships `registerPureFnFactory('rt::…', null)`.
    expect(() => registerPureFnFactory(key, null)).not.toThrow();
    // Crucially NOT cached — a cached placeholder would mask the real registration.
    expect(getRTUtils().getCompiledPureFn(key)).toBeUndefined();
  });

  it('rtFormats:: built-in key is inert too', () => {
    expect(() => registerPureFnFactory('rtFormats::hollowLaneUnusedFmt', null)).not.toThrow();
    expect(getRTUtils().getCompiledPureFn('rtFormats::hollowLaneUnusedFmt')).toBeUndefined();
  });

  it('real body wins whichever order it arrives in (deps-thunk after hollowed call)', () => {
    const key = 'rt::hollowLaneRealBody';
    // Hollowed side-effect import runs first (inert).
    registerPureFnFactory(key, null);
    expect(getRTUtils().getCompiledPureFn(key)).toBeUndefined();
    // The demand-driven cache then registers the real body (modelled here via the
    // no-plugin function path; production registers a tuple through the deps thunk).
    registerPureFnFactory(key, function () {
      return function real() {
        return 42;
      };
    });
    const fn = getRTUtils().getPureFn(key) as () => number;
    expect(fn).toBeDefined();
    expect(fn()).toBe(42);
  });
});
