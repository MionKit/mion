// Registration is first-wins by key: a code-only entry (a dependency built in emitMode 'code') registered before
// the app's live copy must not force `new Function` on hosts that forbid it.

import {afterEach, describe, expect, it, vi} from 'vitest';
import {initFromTuple, type EntryTuple} from '../../src/runtypes/entryTuple.ts';
import {getRTUtils} from '../../src/runtypes/rtUtils.ts';

const BLOCKED = 'Code generation from strings disallowed for this context';

// Type-fn tuple: [familyTag, deps, ini, rtFnHash, typeName, code, isNoop, rtDependencies, pureFnDependencies, createRTFn].
function valTuple(key: string, code: string | undefined, createRTFn?: unknown, deps?: () => readonly EntryTuple[]): EntryTuple {
  return ['val', deps, undefined, key, 'LiveFill', code, false, [], [], createRTFn] as unknown as EntryTuple;
}
// Pure-fn tuple: [entryKind, deps, ini, key, paramNames, code, pureFnDeps, createPureFn].
function pureTuple(key: string, code: string | undefined, createPureFn?: unknown): EntryTuple {
  return [2, undefined, undefined, key, [], code, [], createPureFn] as unknown as EntryTuple;
}

/** Makes `new Function` throw like workerd does, for the rest of the test. */
function blockCodeGen() {
  vi.stubGlobal('Function', function blocked() {
    throw new EvalError(BLOCKED);
  });
}

afterEach(() => vi.unstubAllGlobals());

describe('entryTuple / a live factory fills in a code-only entry', () => {
  it('type fn: code-only first, live second → the live factory runs, no new Function', () => {
    const key = 'val0_liveFillType';
    initFromTuple(valTuple(key, 'return function(v){return v === 1}'));
    initFromTuple(valTuple(key, 'return function(v){return v === 1}', () => (v: unknown) => v === 1));
    blockCodeGen();
    expect(getRTUtils().getRT(key)?.fn(1)).toBe(true);
  });

  it('pure fn: code-only first, live second → the live factory runs, no new Function', () => {
    const key = '@acme/lib/src/liveFill#pure';
    initFromTuple(pureTuple(key, 'return function(){return 7;};'));
    initFromTuple(pureTuple(key, 'return function(){return 7;};', () => () => 7));
    blockCodeGen();
    expect(getRTUtils().getPureFnByKey(key)?.()).toBe(7);
  });

  it('fills the deps of a filled entry too, not just the root', () => {
    const rootKey = 'val0_liveFillRoot';
    const depKey = 'val0_liveFillDep';
    const code = 'return function(v){return true}';
    initFromTuple(valTuple(rootKey, code, undefined, () => [valTuple(depKey, code)]));
    const liveDep = valTuple(depKey, code, () => (v: unknown) => v === 2);
    initFromTuple(
      valTuple(
        rootKey,
        code,
        () => (v: unknown) => v === 1,
        () => [liveDep]
      )
    );
    blockCodeGen();
    expect(getRTUtils().getRT(rootKey)?.fn(1)).toBe(true);
    expect(getRTUtils().getRT(depKey)?.fn(2)).toBe(true);
  });

  it('fills an entry cached outside the tuple walk (the client metadata path) on the register path', () => {
    const utils = getRTUtils();
    const key = 'val0_liveFillCachedType';
    const compiled = {
      rtFnHash: key,
      fnID: 'val',
      familyTag: 'val',
      typeName: 'LiveFill',
      code: 'return function(v){return v === 1}',
      isNoop: false,
      rtDependencies: [],
      pureFnDependencies: [],
    };
    utils.addToRTCache(compiled as never);
    initFromTuple(valTuple(key, 'return function(v){return v === 1}', () => (v: unknown) => v === 1));
    blockCodeGen();
    expect(utils.getRT(key)?.fn(1)).toBe(true);
  });

  it('fills a pure fn cached outside the tuple walk on the register path', () => {
    const utils = getRTUtils();
    const key = '@acme/lib/src/liveFill#cachedPure';
    utils.addPureFn(key, {id: key, paramNames: [], code: 'return function(){return 9;};', pureFnDependencies: []} as never);
    initFromTuple(pureTuple(key, 'return function(){return 9;};', () => () => 9));
    blockCodeGen();
    expect(utils.getPureFnByKey(key)?.()).toBe(9);
  });
});

describe('entryTuple / blocked code generation names the code-only entry', () => {
  it('rethrows any other build error unchanged', () => {
    const key = 'val0_liveFillBrokenCode';
    initFromTuple(valTuple(key, 'return function('));
    expect(() => getRTUtils().getRT(key)).toThrow(SyntaxError);
  });

  it('type fn error carries the host message, the entry id and its type name', () => {
    const key = 'val0_liveFillBlockedType';
    initFromTuple(valTuple(key, 'return function(v){return true}'));
    blockCodeGen();
    expect(() => getRTUtils().getRT(key)).toThrow(
      `${BLOCKED}: compiled fn "${key}" (LiveFill) has no live function, only a code string`
    );
  });

  it('pure fn error carries the host message and the pure fn id', () => {
    const key = '@acme/lib/src/liveFill#blocked';
    initFromTuple(pureTuple(key, 'return function(){return 1;};'));
    blockCodeGen();
    expect(() => getRTUtils().getPureFnByKey(key)).toThrow(
      `${BLOCKED}: pure fn "${key}" has no live function, only a code string`
    );
  });
});
