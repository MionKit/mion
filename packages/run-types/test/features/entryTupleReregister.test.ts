// initFromTuple prunes closures it already registered through a processed-keys
// set. That prune must hold only while the registry still has the entry: a
// removal (`removeFromRTCache`, `removeRunType`, the resets a test or an
// app-restart simulation runs) drops the entry, and the next injection of the
// SAME tuple objects has to register it again, or every consumer of the key
// silently degrades to its family identity. Cycles keep terminating: the
// per-call cycle guard is separate from the cross-call prune.

import {describe, expect, it} from 'vitest';
import {initFromTuple, type EntryTuple} from '../../src/runtypes/entryTuple.ts';
import {getRTUtils} from '../../src/runtypes/rtUtils.ts';

// Type-fn tuple in `functions` mode: [familyTag, deps, ini, rtFnHash, typeName,
// code, isNoop, rtDependencies, pureFnDependencies, createRTFn].
function valTuple(key: string, answer: boolean, deps?: () => readonly EntryTuple[]): EntryTuple {
  return ['val', deps, undefined, key, 'T', undefined, false, [], [], () => () => answer] as unknown as EntryTuple;
}

// Standalone runtype tuple (kind 0): [entryKind, deps, ini, id, kind].
function runTypeTuple(id: string, deps?: () => readonly EntryTuple[]): EntryTuple {
  return [0, deps, undefined, id, 5] as unknown as EntryTuple;
}

describe('entryTuple / re-registration after a removal', () => {
  it('registers a type-fn tuple again once its entry was removed from the cache', () => {
    const utils = getRTUtils();
    const key = 'val0_reregisterFn';
    const tuple = valTuple(key, true);
    initFromTuple(tuple);
    expect(utils.getRT(key)?.fn(undefined)).toBe(true);

    utils.removeFromRTCache(utils.getRT(key)!);
    expect(utils.hasRTFn(key)).toBe(false);

    initFromTuple(tuple);
    expect(utils.hasRTFn(key)).toBe(true);
    expect(utils.getRT(key)?.fn(undefined)).toBe(true);
  });

  it('re-walks the deps of a removed entry, so a removed dependency comes back too', () => {
    const utils = getRTUtils();
    const depKey = 'val0_reregisterDep';
    const rootKey = 'val0_reregisterRoot';
    const dep = valTuple(depKey, false);
    const root = valTuple(rootKey, true, () => [dep]);
    initFromTuple(root);
    expect(utils.hasRTFn(depKey)).toBe(true);

    utils.removeFromRTCache(utils.getRT(rootKey)!);
    utils.removeFromRTCache(utils.getRT(depKey)!);
    initFromTuple(root);
    expect(utils.hasRTFn(rootKey)).toBe(true);
    expect(utils.hasRTFn(depKey)).toBe(true);
  });

  it('leaves a still-registered closure alone (no re-walk, no reset of the entry)', () => {
    const utils = getRTUtils();
    const key = 'val0_reregisterKeep';
    const tuple = valTuple(key, true);
    initFromTuple(tuple);
    const first = utils.getRT(key);
    initFromTuple(valTuple(key, false));
    expect(utils.getRT(key)).toBe(first);
    expect(utils.getRT(key)?.fn(undefined)).toBe(true);
  });

  it('still terminates on a cycle whose entries were all removed', () => {
    const utils = getRTUtils();
    const aId = 'k0-reregister-a';
    const bId = 'k0-reregister-b';
    // deps thunks are lazy, so each side can name the other before it exists
    const a: EntryTuple = runTypeTuple(aId, () => [b]);
    const b: EntryTuple = runTypeTuple(bId, () => [a]);
    initFromTuple(a);
    expect(utils.hasRunType(aId)).toBe(true);
    expect(utils.hasRunType(bId)).toBe(true);

    utils.removeRunType(aId);
    utils.removeRunType(bId);
    initFromTuple(a);
    expect(utils.hasRunType(aId)).toBe(true);
    expect(utils.hasRunType(bId)).toBe(true);
  });
});
