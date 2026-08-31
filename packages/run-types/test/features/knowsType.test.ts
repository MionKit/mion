// rtUtils.knowsType — the degrade-vs-throw signal for compiled-fn key misses.
//
// resolveEntryTupleFn degrades to the family identity when the missed key
// names a type the build KNOWS, and throws for a wholly unknown id. "Known"
// used to mean "the runtype graph is registered" (hasRunType), but the graph
// is demand-driven — only reflection sites emit it — so a createX-only type
// would flip from degrade to throw depending on whether some unrelated file
// happened to reflect it. knowsType also counts registered fn entries
// (`<fnHash>_<typeId>` keys), making the decision independent of reflection.
//
// Pure runtime-registry unit test: entries are hand-registered, no plugin
// markers involved (so the marker pairing rule does not apply here).

import {describe, expect, it} from 'vitest';
import {getRTUtils} from '../../src/runtypes/rtUtils.ts';
import {resolveEntryTupleFn} from '../../src/runtypes/entryTuple.ts';
import type {CompiledTypeFn, RunType} from '../../src/runtypes/types.ts';

const utils = getRTUtils();

function fakeEntry(rtFnHash: string): CompiledTypeFn {
  return {
    rtFnHash,
    fnID: 'val',
    familyTag: 'val',
    typeName: 'KnowsTypeProbe',
    args: {vλl: 'v'},
    defaultParamValues: {vλl: ''},
    code: 'return function probe(){return true;};',
    isNoop: false,
  } as unknown as CompiledTypeFn;
}

describe('rtUtils.knowsType', () => {
  it('is false for a wholly unknown id', () => {
    expect(utils.knowsType('KnowsTypeNope1')).toBe(false);
  });

  it('counts a registered runtype graph', () => {
    utils.addRunType('KnowsTypeGraph1', {id: 'KnowsTypeGraph1', kind: 1} as unknown as RunType);
    try {
      expect(utils.knowsType('KnowsTypeGraph1')).toBe(true);
    } finally {
      utils.removeRunType('KnowsTypeGraph1');
    }
  });

  it('counts a registered fn entry even with NO runtype graph', () => {
    const entry = fakeEntry('abc_KnowsTypeFn1');
    utils.addToRTCache(entry);
    try {
      expect(utils.getRunType('KnowsTypeFn1')).toBeUndefined();
      expect(utils.knowsType('KnowsTypeFn1')).toBe(true);
    } finally {
      utils.removeFromRTCache(entry);
    }
  });
});

describe('resolveEntryTupleFn degrade decision uses knowsType', () => {
  const identity = () => 'identity';

  it('schema-form without a tuple degrades to identity when only a fn entry knows the type', () => {
    const entry = fakeEntry('abc_KnowsTypeFn2');
    utils.addToRTCache(entry);
    try {
      // Pre-change this threw: hasRunType was the only knowledge signal and no
      // graph is registered for the id.
      const resolved = resolveEntryTupleFn('probeFn', identity, 'KnowsTypeFn2', undefined);
      expect(resolved()).toBe('identity');
    } finally {
      utils.removeFromRTCache(entry);
    }
  });

  it('still throws for a wholly unknown schema id', () => {
    expect(() => resolveEntryTupleFn('probeFn', identity, 'KnowsTypeNope2', undefined)).toThrow(/no RTCompiledFn entry/);
  });
});
