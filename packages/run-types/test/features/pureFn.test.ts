/* ########
 * 2026 ma-jerez
 * Author: Ma-jerez
 * License: MIT, see LICENSE
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, it, expect} from 'vitest';
import {getRTUtils, type RTUtils} from '../../src/runtypes/rtUtils.ts';
import {registerPureFn, registerPureFnFactory} from '../../src/runtypes/pureFn.ts';
import {trimHelper} from './pureFnHelpers.ts';

// The vitest transform runs the plugin in-process, so every registration below
// is rewritten to its entry-module tuple plus the injected id, exactly what a
// built consumer sees. An id is the package that owns the pure fn plus a hash
// of the body that ships, so a test matches its SHAPE and reads the value the
// build produced rather than spelling one.
const HERE = '@mionjs/run-types#';
const ID_RE = /^@mionjs\/run-types#[A-Za-z0-9_-]{14}$/;

// 14-char base64url — what the Go binary's BodyHash emits.
const BODY_HASH_REGEX = /^[A-Za-z0-9_-]{14}$/;

type StringParams = {isLowercase?: boolean; isNumeric?: boolean};
type Params = {isA?: boolean; isB?: boolean};

// FACTORY form: the argument is a factory, emitted as-is, so its one-time setup
// (the regexp below) runs once.
const stringPureFn = registerPureFnFactory(function () {
  const isNumericRegexp = /^[0-9]+$/;
  return function is_s(s: string, p: StringParams): boolean {
    if (p.isLowercase && s !== s.toLowerCase()) return false;
    if (p.isNumeric && !isNumericRegexp.test(s)) return false;
    return true;
  };
});

// DIRECT form: the argument IS the pure fn; the compiler wraps it in a factory.
const halve = registerPureFn((n: number): number => n / 2);

const metadataFn = registerPureFnFactory(function () {
  return function test_fn(val: string): string {
    return val.toUpperCase();
  };
});

const isA = registerPureFnFactory(function (_utl: RTUtils) {
  return function is_a(s: string, p: Params): boolean {
    if (p.isA) return s.includes('a');
    return true;
  };
});

// Reaches another pure fn by its id, so the dependency is recorded from the
// binding rather than from a repeated string.
const isB = registerPureFnFactory(function (utl: RTUtils) {
  const checkA = utl.getPureFn(isA) as (s: string, p: Params) => boolean;
  return function is_b(s: string, p: Params): boolean {
    const isAResult = checkA(s, p);
    if (p.isB) return isAResult && s.includes('b');
    return isAResult;
  };
});

// Same, across files: the id is imported from another module.
const trimTwice = registerPureFnFactory(function (utl: RTUtils) {
  const trim = utl.getPureFn(trimHelper) as (s: string) => string;
  return function trim_twice(s: string): string {
    return trim(trim(s));
  };
});

const arrowWithParens = registerPureFnFactory((_utl: RTUtils) => {
  return function is_lower(s: string, p: StringParams): boolean {
    if (p.isLowercase) return s === s.toLowerCase();
    return true;
  };
});

const arrowExpression = registerPureFnFactory(
  (_utl: RTUtils) =>
    function multiply(n: number, p: {multiplier?: number}): number {
      return n * (p.multiplier ?? 1);
    }
);

// Bound to no name (handed straight to an array), so these are identified by
// their body instead of their location.
const namelessIds = [
  registerPureFn((s: string): string => s.padStart(3, '0')),
  registerPureFn((s: string): string => s.padStart(3, '0')),
  registerPureFn((s: string): string => s.padEnd(3, '0')),
];

// The registrar with its marker brands cast away: the scanner no longer sees a
// registration, so nothing is injected. This is what an unprocessed file ships,
// and it is also the dev-tool override path.
const rawRegister = registerPureFn as unknown as (fn: unknown, id?: string) => string;

describe('a pure fn is identified by where it lives', () => {
  it('the factory form returns its id and runs', () => {
    expect(stringPureFn).toMatch(ID_RE);
    const restored = getRTUtils().getPureFn(stringPureFn) as (s: string, p: StringParams) => boolean;
    expect(restored).toBeInstanceOf(Function);
    expect(restored('a', {isLowercase: true})).toBe(true);
    expect(restored('A', {isLowercase: true})).toBe(false);
  });

  it('the direct form returns its id and runs', () => {
    expect(halve).toMatch(ID_RE);
    const restored = getRTUtils().getPureFn(halve) as (n: number) => number;
    expect(restored(84)).toBe(42);
  });

  it('carries paramNames and code from the extracted data', () => {
    const compiled = getRTUtils().getCompiledPureFn(metadataFn);
    expect(compiled).toBeDefined();
    expect(compiled?.id).toMatch(ID_RE);
    expect(compiled?.paramNames).toEqual([]);
    expect(typeof compiled?.code).toBe('string');
    expect(compiled?.code?.length).toBeGreaterThan(0);
  });

  it('gives a nameless registration a body hash, and collapses equal bodies', () => {
    const [first, second, other] = namelessIds;
    expect(first).toBe(second);
    expect(other).not.toBe(first);
    const [, name] = first.split('#');
    expect(name).toMatch(BODY_HASH_REGEX);
    const restored = getRTUtils().getPureFn(first) as (s: string) => string;
    expect(restored('7')).toBe('007');
  });
});

describe('one pure fn reaches another by its id', () => {
  it('records the dependency from a binding in the same file', () => {
    const compiledA = getRTUtils().getCompiledPureFn(isA);
    const compiledB = getRTUtils().getCompiledPureFn(isB);
    expect(compiledA).toBeDefined();
    expect(compiledB).toBeDefined();
    // Materialise lazily — the cache module leaves fn undefined until a
    // getPureFn / usePureFn caller forces createPureFn to run.
    expect(getRTUtils().getPureFn(isA)).toBeInstanceOf(Function);
    const runB = getRTUtils().getPureFn(isB) as (s: string, p: Params) => boolean;
    expect(runB('ab', {isA: true, isB: true})).toBe(true);
    expect(runB('b', {isA: true, isB: true})).toBe(false);
    expect(compiledB?.pureFnDependencies).toContain(isA);
    expect(compiledA?.pureFnDependencies ?? []).toEqual([]);
  });

  it('records the dependency from an id imported out of another file', () => {
    expect(trimHelper).toMatch(ID_RE);
    const compiled = getRTUtils().getCompiledPureFn(trimTwice);
    expect(compiled?.pureFnDependencies).toContain(trimHelper);
    const run = getRTUtils().getPureFn(trimTwice) as (s: string) => string;
    expect(run('  hi  ')).toBe('hi');
  });
});

describe('arrow function factories', () => {
  it('registers an arrow factory with a block body', () => {
    const restored = getRTUtils().getPureFn(arrowWithParens) as (s: string, p: StringParams) => boolean;
    expect(restored('abc', {isLowercase: true})).toBe(true);
    expect(restored('ABC', {isLowercase: true})).toBe(false);
  });

  it('registers an arrow factory with an expression body', () => {
    const restored = getRTUtils().getPureFn(arrowExpression) as (n: number, p: {multiplier?: number}) => number;
    expect(restored(5, {multiplier: 3})).toBe(15);
    expect(restored(5, {})).toBe(5);
  });
});

describe('a registration with no injected id', () => {
  it('throws the missing-plugin message', () => {
    expect(() => rawRegister((n: number): number => n * 2)).toThrow(/no id injected/);
  });
});

// A hollowed registration: the body no longer ships in this file (a package
// build stripped it) and travels on demand through the pure-fn cache. The call
// must be inert — never a throw, and never a cached placeholder that could mask
// the real body arriving later.
describe('hollowed registrations', () => {
  it('a null registration caches nothing and does not throw', () => {
    // @mion-downgrade-error PFN001
    const hollow = registerPureFn(null);
    expect(hollow).toBe('');
    expect(getRTUtils().getCompiledPureFnByKey(`${HERE}neverRegistered0`)).toBeUndefined();
  });

  it('the real body wins whichever order it arrives in', () => {
    const id = `${HERE}hollowLaneRealBody0`;
    expect(rawRegister(null, id)).toBe(id);
    expect(getRTUtils().getCompiledPureFnByKey(id)).toBeUndefined();
    rawRegister(() => 42, id);
    const fn = getRTUtils().getPureFnByKey(id) as () => number;
    expect(fn()).toBe(42);
  });
});

describe('runtime-id lookups stay untracked', () => {
  it('getPureFnByKey / hasPureFnByKey resolve an id built at runtime', () => {
    // Built at runtime the way a framework dispatching on a wire id does, NOT a
    // comptime literal, so the build tracks nothing here.
    const wireId: string = [halve.slice(0, 1), halve.slice(1)].join('');
    expect(getRTUtils().hasPureFnByKey(wireId)).toBe(true);
    const fn = getRTUtils().getPureFnByKey(wireId) as (n: number) => number;
    expect(fn(84)).toBe(42);
  });

  it('returns undefined / false for an unregistered id', () => {
    const missing = HERE + 'notRegistered0';
    expect(getRTUtils().hasPureFnByKey(missing)).toBe(false);
    expect(getRTUtils().getPureFnByKey(missing)).toBeUndefined();
  });
});
