// Kind-2 (pure-fn) entry-tuple runtime registration across emit modes. The Go
// emitter's purefunctions.CollectEntries gates the pure-fn tuple's `code` and
// `createPureFn` slots on emitMode (mirroring the type-fn precedent):
//   - code (default): the `code` STRING, createPureFn dropped (trailing hole);
//     initPureFunction rebuilds the factory via new Function(...paramNames, code).
//   - functions: `code` holed out, the live `function(<params>){<code>}` shipped.
//   - both: both slots (the body twice) for CSP runtimes that read `.code`.
//
// These tests construct the three tuple shapes by hand (the exact arrays the Go
// side renders), register them through initFromTuple, materialize via usePureFn,
// and assert every mode yields the same working pure fn — including the
// code-mode `new Function` reconstruction path and a `paramNames: ['utl']`
// composing factory that closes over the rtUtils singleton.

import {describe, expect, it} from 'vitest';
import {initFromTuple, type EntryTuple} from '../../src/runtypes/entryTuple.ts';
import {getRTUtils, buildPureFnFactoryFromCode} from '../../src/runtypes/rtUtils.ts';

// Pure-fn tuple layouts (kind 2), by emit mode. Slots after the fixed head
// [entryKind, deps, ini] are: key, bodyHash, paramNames, code, pureFnDeps,
// createPureFn.
function codeModeTuple(key: string, paramNames: string[], code: string): EntryTuple {
  // createPureFn dropped as a trailing hole → the array ends at pureFnDeps.
  return [2, undefined, undefined, key, 'h', paramNames, code, []] as unknown as EntryTuple;
}
function functionsModeTuple(key: string, paramNames: string[], createPureFn: unknown): EntryTuple {
  // code holed out in place (undefined at slot 6); createPureFn follows.
  return [2, undefined, undefined, key, 'h', paramNames, undefined, [], createPureFn] as unknown as EntryTuple;
}
function bothModeTuple(key: string, paramNames: string[], code: string, createPureFn: unknown): EntryTuple {
  return [2, undefined, undefined, key, 'h', paramNames, code, [], createPureFn] as unknown as EntryTuple;
}

describe('entryTuple / kind-2 pure-fn registration across emit modes', () => {
  it('code mode: reconstructs the factory from code + paramNames via new Function', () => {
    const key = 'entryTuplePureFn::codeMode';
    initFromTuple(codeModeTuple(key, [], 'return function(){return 42;};'));
    const utils = getRTUtils();

    // Registered but not materialized: createPureFn is absent (code-mode hole).
    const before = utils.getCompiledPureFn(key)!;
    expect(before.createPureFn).toBeUndefined();
    expect(before.code).toBe('return function(){return 42;};');

    const fn = utils.usePureFn(key) as () => number;
    expect(fn()).toBe(42);

    // The reconstructed factory is cached back onto the entry (runs once).
    const after = utils.getCompiledPureFn(key)!;
    expect(typeof after.createPureFn).toBe('function');
    expect(after.fn).toBe(fn);
  });

  it('functions mode: runs from the live closure with no code string', () => {
    const key = 'entryTuplePureFn::functionsMode';
    const live = function () {
      return function () {
        return 42;
      };
    };
    initFromTuple(functionsModeTuple(key, [], live));
    const utils = getRTUtils();

    const entry = utils.getCompiledPureFn(key)!;
    expect(entry.code).toBeUndefined(); // functions mode drops the code string
    expect(typeof entry.createPureFn).toBe('function');

    const fn = utils.usePureFn(key) as () => number;
    expect(fn()).toBe(42);
  });

  it('both mode: ships code AND the live closure, uses the closure directly', () => {
    const key = 'entryTuplePureFn::bothMode';
    const live = function () {
      return function () {
        return 42;
      };
    };
    initFromTuple(bothModeTuple(key, [], 'return function(){return 42;};', live));
    const utils = getRTUtils();

    const entry = utils.getCompiledPureFn(key)!;
    expect(entry.code).toBe('return function(){return 42;};');
    expect(entry.createPureFn).toBe(live); // live literal preferred over reconstruction

    const fn = utils.usePureFn(key) as () => number;
    expect(fn()).toBe(42);
  });

  it('code and functions modes produce byte-for-byte equivalent results for the same body', () => {
    const codeKey = 'entryTuplePureFn::rtCode';
    const fnsKey = 'entryTuplePureFn::rtFns';
    const body = 'return function(v){return typeof v === "string";};';
    initFromTuple(codeModeTuple(codeKey, [], body));
    initFromTuple(
      functionsModeTuple(fnsKey, [], function () {
        return function (v: unknown) {
          return typeof v === 'string';
        };
      })
    );
    const utils = getRTUtils();
    const viaCode = utils.usePureFn(codeKey) as (v: unknown) => boolean;
    const viaFns = utils.usePureFn(fnsKey) as (v: unknown) => boolean;
    for (const sample of ['hello', 42, {}, null, undefined]) {
      expect(viaCode(sample)).toBe(viaFns(sample));
    }
    expect(viaCode('x')).toBe(true);
    expect(viaCode(1)).toBe(false);
  });

  it('code mode with paramNames ["utl"]: the composing factory closes over rtUtils', () => {
    const depKey = 'entryTuplePureFn::dep';
    const composeKey = 'entryTuplePureFn::compose';
    // Dep pure fn (code mode too): returns 5.
    initFromTuple(codeModeTuple(depKey, [], 'return function(){return 5;};'));
    // Composing factory: its body references `utl`, so the reconstruction must be
    // new Function('utl', code) — the recorded paramName binds the rtUtils arg.
    initFromTuple(codeModeTuple(composeKey, ['utl'], `return function(){return utl.usePureFn('${depKey}')() + 1;};`));

    const compose = getRTUtils().usePureFn(composeKey) as () => number;
    expect(compose()).toBe(6);
  });
});

describe('buildPureFnFactoryFromCode', () => {
  it('builds a zero-param factory that returns a working pure fn', () => {
    const factory = buildPureFnFactoryFromCode([], 'return function(a, b){return a + b;};');
    const fn = factory(getRTUtils()) as (a: number, b: number) => number;
    expect(fn(2, 3)).toBe(5);
  });

  it('binds the recorded param name to the rtUtils argument', () => {
    // The reconstructed factory declares `utl` as its param; calling it with the
    // rtUtils singleton lets the body compose other pure fns by key.
    const factory = buildPureFnFactoryFromCode(['utl'], 'return function(id){return utl.hasPureFn(id);};');
    const fn = factory(getRTUtils()) as (id: string) => boolean;
    expect(fn('definitely::missing')).toBe(false);
  });

  it('runs the reconstructed body in strict mode', () => {
    // Strict mode makes an assignment to an undeclared identifier throw, matching
    // the always-strict ESM literal shipped in functions/both mode.
    const factory = buildPureFnFactoryFromCode(
      [],
      'return function(){undeclaredStrictGlobal = 1; return undeclaredStrictGlobal;};'
    );
    const fn = factory(getRTUtils()) as () => number;
    expect(() => fn()).toThrow();
  });
});
