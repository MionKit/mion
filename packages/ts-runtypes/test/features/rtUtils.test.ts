/* ########
 * 2025 ma-jerez
 * Author: Ma-jerez
 * License: UNLICENSED - proprietary, see LICENSE
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, it, expect} from 'vitest';
import {getRTFnCaches, getRTUtils, entryCode, buildFactoryFromCode} from '../../src/runtypes/rtUtils.ts';
import type {TypesFunctionsCache, PureFunctionsCache, RunType, CompiledTypeFn} from '../../src/runtypes/types.ts';

const {rtFnsCache, pureFnsCache} = getRTFnCaches() as {rtFnsCache: TypesFunctionsCache; pureFnsCache: PureFunctionsCache};

/**
 * Loads compiled RT and pure functions into the respective caches.
 * Both caches are flat single-key maps now; the helper merges without
 * overwriting existing entries.
 */
function loadRTCachesCaches(caches: {rtFnsCache?: TypesFunctionsCache; pureFnsCache?: PureFunctionsCache}) {
  if (caches.rtFnsCache) {
    for (const [key, value] of Object.entries(caches.rtFnsCache)) {
      if (!(key in rtFnsCache)) {
        rtFnsCache[key] = value;
      }
    }
  }
  if (caches.pureFnsCache) {
    for (const [key, value] of Object.entries(caches.pureFnsCache)) {
      if (!(key in pureFnsCache)) {
        pureFnsCache[key] = value;
      }
    }
  }
}

describe('rtUtils', () => {
  it('should load compiled RT functions cache from cache data', () => {
    const testRTCache: TypesFunctionsCache = {
      testRTFn: {
        typeName: 'TestType',
        fnID: 'validate',
        rtFnHash: 'testRTFn',
        args: {vλl: 'v'},
        defaultParamValues: {vλl: ''},
        code: 'return true;',
        rtDependencies: [],
        pureFnDependencies: [],
        fn: () => true,
        createRTFn: () => () => true,
      },
    };

    const initialCaches = getRTFnCaches();
    const initialRTCacheSize = Object.keys(initialCaches.rtFnsCache).length;

    loadRTCachesCaches({rtFnsCache: testRTCache});

    const updatedCaches = getRTFnCaches();
    const updatedRTCacheSize = Object.keys(updatedCaches.rtFnsCache).length;

    expect(updatedRTCacheSize).toBeGreaterThan(initialRTCacheSize);
    expect(updatedCaches.rtFnsCache).toHaveProperty('testRTFn');
  });

  it('should load compiled pure functions cache from cache data', () => {
    // Flat cache: keys are composite `"<namespace>::<fnName>"` strings.
    const testPureCache: PureFunctionsCache = {
      'testNamespace::testPureFn': {
        namespace: 'testNamespace',
        paramNames: ['a', 'b'],
        fnName: 'testPureFn',
        bodyHash: 'testPureFn_hash',
        code: 'return (a, b) => a + b;',
        pureFnDependencies: [],
        createPureFn: () => (a: number, b: number) => a + b,
        fn: (a: number, b: number) => a + b,
      },
    };

    const initialCaches = getRTFnCaches();
    const initialPureCacheSize = Object.keys(initialCaches.pureFnsCache).length;

    loadRTCachesCaches({pureFnsCache: testPureCache});

    const updatedCaches = getRTFnCaches();
    const updatedPureCacheSize = Object.keys(updatedCaches.pureFnsCache).length;

    expect(updatedPureCacheSize).toBeGreaterThan(initialPureCacheSize);
    expect(updatedCaches.pureFnsCache).toHaveProperty('testNamespace::testPureFn');
  });

  it('should handle empty cache data gracefully', () => {
    expect(() => loadRTCachesCaches({})).not.toThrow();
    expect(() => loadRTCachesCaches({rtFnsCache: {}})).not.toThrow();
    expect(() => loadRTCachesCaches({pureFnsCache: {}})).not.toThrow();
  });

  describe('runType registry', () => {
    it('addRunType stores an entry and getRunType reads it back', () => {
      const id = 'rt-test-add-get';
      const entry: RunType = {id, kind: 'object', typeName: 'Foo'};
      const stored = getRTUtils().addRunType(id, entry);
      expect(stored).toBe(entry);
      expect(getRTUtils().getRunType(id)).toBe(entry);
      expect(getRTUtils().hasRunType(id)).toBe(true);
    });

    it('useRunType returns the entry, or throws when missing', () => {
      const id = 'rt-test-use';
      const entry: RunType = {id, kind: 'primitive'};
      getRTUtils().addRunType(id, entry);
      expect(getRTUtils().useRunType(id)).toBe(entry);
      expect(() => getRTUtils().useRunType('rt-test-missing')).toThrow(/Run-type not found/);
    });

    it('addRunType overwrites existing entries (idempotent re-init)', () => {
      const id = 'rt-test-overwrite';
      getRTUtils().addRunType(id, {id, kind: 'a'});
      getRTUtils().addRunType(id, {id, kind: 'b'});
      expect((getRTUtils().getRunType(id) as RunType).kind).toBe('b');
    });

    it('removeRunType clears the entry', () => {
      const id = 'rt-test-remove';
      getRTUtils().addRunType(id, {id, kind: 'gone'});
      getRTUtils().removeRunType(id);
      expect(getRTUtils().hasRunType(id)).toBe(false);
      expect(getRTUtils().getRunType(id)).toBeUndefined();
    });

    it('addRunType rejects empty id', () => {
      expect(() => getRTUtils().addRunType('', {id: '', kind: 'x'})).toThrow(/non-empty/);
    });
  });

  it('should not overwrite existing cache entries', () => {
    const firstCache: TypesFunctionsCache = {
      testFn1: {
        typeName: 'TestType1',
        fnID: 'validate',
        rtFnHash: 'testFn1',
        args: {vλl: 'v'},
        defaultParamValues: {vλl: ''},
        code: 'return true;',
        rtDependencies: [],
        pureFnDependencies: [],
        fn: () => true,
        createRTFn: () => () => true,
      },
    };

    const secondCache: TypesFunctionsCache = {
      testFn1: {
        // Same key as first cache - should NOT overwrite
        typeName: 'TestType2',
        fnID: 'validate',
        rtFnHash: 'testFn1',
        args: {vλl: 'v'},
        defaultParamValues: {vλl: ''},
        code: 'return false;',
        rtDependencies: [],
        pureFnDependencies: [],
        fn: () => false,
        createRTFn: () => () => false,
      },
      testFn2: {
        // New key - should be added
        typeName: 'TestType2',
        fnID: 'validate',
        rtFnHash: 'testFn2',
        args: {vλl: 'v'},
        defaultParamValues: {vλl: ''},
        code: 'return false;',
        rtDependencies: [],
        pureFnDependencies: [],
        fn: () => false,
        createRTFn: () => () => false,
      },
    };

    // Load first cache
    loadRTCachesCaches({rtFnsCache: firstCache});

    const cachesAfterFirst = getRTFnCaches();
    expect(cachesAfterFirst.rtFnsCache).toHaveProperty('testFn1');
    expect(cachesAfterFirst.rtFnsCache.testFn1?.typeName).toBe('TestType1');

    // Load second cache - should not overwrite testFn1 but should add testFn2
    loadRTCachesCaches({rtFnsCache: secondCache});

    const cachesAfterSecond = getRTFnCaches();
    expect(cachesAfterSecond.rtFnsCache).toHaveProperty('testFn1');
    expect(cachesAfterSecond.rtFnsCache).toHaveProperty('testFn2');
    expect(cachesAfterSecond.rtFnsCache.testFn1?.typeName).toBe('TestType1');
    expect(cachesAfterSecond.rtFnsCache.testFn2?.typeName).toBe('TestType2');
  });
});

describe('entryCode (emitMode functions lazy code derivation)', () => {
  // Minimal CompiledTypeFn shell — entryCode only reads code + createRTFn.
  const shell = (over: Partial<CompiledTypeFn>): CompiledTypeFn =>
    ({
      rtFnHash: 'x',
      typeName: 'T',
      fnID: 'val',
      args: {vλl: 'v'},
      defaultParamValues: {vλl: undefined},
      ...over,
    }) as CompiledTypeFn;

  it('returns the code string verbatim when present (code/both modes)', () => {
    const entry = shell({code: 'return function x(v){return true}'});
    expect(entryCode(entry)).toBe('return function x(v){return true}');
  });

  it('derives the body from the live factory when code is absent (functions mode)', () => {
    // The Go renderer ships `function g_<hash>(utl){return function <hash>(v){…}}`
    // in functions mode — a real function declaration with an outer brace block.
    const createRTFn = function g_x(_utl: unknown) {
      return function x(v: unknown) {
        return typeof v === 'string';
      };
    } as unknown as CompiledTypeFn['createRTFn'];
    const entry = shell({code: undefined, createRTFn});
    const derived = entryCode(entry);
    // Body is the slice between the factory's outer braces; rebuilding from it
    // must yield a working validator (the round-trip deserializeRTFunctions runs).
    const rebuilt = buildFactoryFromCode(derived)(getRTUtils()) as (v: unknown) => boolean;
    expect(rebuilt('hello')).toBe(true);
    expect(rebuilt(42)).toBe(false);
  });

  it('memoizes the derived code onto the entry so the slice runs once', () => {
    const createRTFn = function g_x(_utl: unknown) {
      return function x(v: unknown) {
        return v;
      };
    } as unknown as CompiledTypeFn['createRTFn'];
    const entry = shell({code: undefined, createRTFn});
    const first = entryCode(entry);
    expect(first).toContain('return function x');
    expect(entry.code).toBe(first); // cached back onto the entry
    expect(entryCode(entry)).toBe(first);
  });
});

describe('rtUtils.findRTForType — memoized suffix scan', () => {
  // The scan is memoized (including negative results) because mock generation
  // calls it once per format-annotated NODE of a generated value; the memo must
  // be invalidated by BOTH cache mutations, or a stale hit would outlive the
  // entry it points at.
  const utils = getRTUtils();
  const fmtEntry = (rtFnHash: string): CompiledTypeFn =>
    ({
      typeName: 'MemoProbe',
      fnID: 'fmt',
      familyTag: 'fmt',
      rtFnHash,
      args: {vλl: 'v'},
      defaultParamValues: {vλl: ''},
      rtDependencies: [],
      pureFnDependencies: [],
      fn: (v: unknown) => v,
      createRTFn: () => (v: unknown) => v,
    }) as unknown as CompiledTypeFn;

  it('a negative result is invalidated when a matching entry is added', () => {
    expect(utils.findRTForType('fmt', 'memoProbeTypeA')).toBeUndefined();
    utils.addToRTCache(fmtEntry('abc_memoProbeTypeA'));
    expect(utils.findRTForType('fmt', 'memoProbeTypeA')?.typeName).toBe('MemoProbe');
  });

  it('a positive result is stable across repeat lookups and dies with its entry', () => {
    const entry = fmtEntry('abc_memoProbeTypeB');
    utils.addToRTCache(entry);
    const first = utils.findRTForType('fmt', 'memoProbeTypeB');
    expect(first?.rtFnHash).toBe('abc_memoProbeTypeB');
    expect(utils.findRTForType('fmt', 'memoProbeTypeB')).toBe(first);
    utils.removeFromRTCache(entry);
    expect(utils.findRTForType('fmt', 'memoProbeTypeB')).toBeUndefined();
  });

  it('the family tag still gates the match', () => {
    utils.addToRTCache(fmtEntry('abc_memoProbeTypeC'));
    expect(utils.findRTForType('val', 'memoProbeTypeC')).toBeUndefined();
    expect(utils.findRTForType('fmt', 'memoProbeTypeC')).toBeDefined();
  });
});
