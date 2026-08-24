/* ########
 * 2026 ma-jerez
 * Author: Ma-jerez
 * License: UNLICENSED - proprietary, see LICENSE
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, it, expect} from 'vitest';
import {getRTUtils, pureFnKey, type RTUtils} from '../../src/runtypes/rtUtils.ts';
import {registerAnonymousPureFn, registerAnonymousPureFnFactory, registerPureFn} from '../../src/runtypes/pureFn.ts';

// The vitest transform runs the plugin in-process, so each registration below is
// rewritten to its entry-module tuple (+ the injected key/hash), exactly what a
// built consumer sees. The four registrars are two lanes (named vs anonymous) x
// two forms (direct vs factory); every form ends up as the same callable
// CompiledPureFunction.

// 14-char base64url — what the Go binary's CodeHash emits.
const BODY_HASH_REGEX = /^[A-Za-z0-9_-]{14}$/;

function keyOf(compiled: {namespace: string; fnName: string}): string {
  return pureFnKey(compiled.namespace, compiled.fnName);
}

describe('registerAnonymousPureFn — direct form (content-addressed)', () => {
  it('registers a plain callback under a content hash and runs it', () => {
    // DIRECT: the argument IS the pure fn; the compiler wraps it into a factory.
    const compiled = registerAnonymousPureFn((n: number): number => n * 2);
    expect(compiled.namespace).toBe('rt');
    expect(compiled.fnName).toMatch(BODY_HASH_REGEX);

    const restored = getRTUtils().getPureFn(keyOf(compiled)) as (n: number) => number;
    expect(restored).toBeInstanceOf(Function);
    expect(restored(21)).toBe(42);
  });

  it('collapses structurally-identical callbacks to one entry', () => {
    const first = registerAnonymousPureFn((s: string): string => s.trim());
    const second = registerAnonymousPureFn((s: string): string => s.trim());
    expect(keyOf(second)).toBe(keyOf(first));
  });

  it('gives different callbacks different ids', () => {
    const upper = registerAnonymousPureFn((s: string): string => s.toUpperCase());
    const lower = registerAnonymousPureFn((s: string): string => s.toLowerCase());
    expect(keyOf(lower)).not.toBe(keyOf(upper));
  });
});

describe('registerAnonymousPureFnFactory — factory form (one-time setup)', () => {
  it('emits the factory as-is so setup runs once', () => {
    // FACTORY: the argument IS a factory; its body (the one-time `const`) survives.
    const compiled = registerAnonymousPureFnFactory((_utl: RTUtils) => {
      const factor = 3;
      return function _triple(n: number): number {
        return n * factor;
      };
    });
    expect(compiled.namespace).toBe('rt');
    expect(compiled.fnName).toMatch(BODY_HASH_REGEX);

    const restored = getRTUtils().getPureFn(keyOf(compiled)) as (n: number) => number;
    expect(restored(14)).toBe(42);
  });
});

describe('registerPureFn — named direct form', () => {
  it('registers a plain callback under a literal id and runs it', () => {
    const compiled = registerPureFn('test::directHalve', (n: number): number => n / 2);
    expect(compiled.namespace).toBe('test');
    expect(compiled.fnName).toBe('directHalve');

    const restored = getRTUtils().getPureFn(pureFnKey('test', 'directHalve')) as (n: number) => number;
    expect(restored(84)).toBe(42);
  });
});

describe('runtime-key lookup accessors (untracked)', () => {
  it('getPureFnByKey / hasPureFnByKey resolve a registered anonymous pure fn by a runtime string', () => {
    const compiled = registerAnonymousPureFn((n: number): number => n + 1);
    // A runtime key — built at runtime as a framework dispatching on a wire id
    // would, NOT a comptime literal. The accessor is not build-tracked.
    const wireKey: string = ['rt', compiled.fnName].join('::');

    expect(getRTUtils().hasPureFnByKey(wireKey)).toBe(true);
    const fn = getRTUtils().getPureFnByKey(wireKey) as (n: number) => number;
    expect(fn).toBeInstanceOf(Function);
    expect(fn(41)).toBe(42);
  });

  it('returns undefined / false for an unregistered runtime key', () => {
    const missing = 'rt::' + 'notRegistered0';
    expect(getRTUtils().hasPureFnByKey(missing)).toBe(false);
    expect(getRTUtils().getPureFnByKey(missing)).toBeUndefined();
  });
});
