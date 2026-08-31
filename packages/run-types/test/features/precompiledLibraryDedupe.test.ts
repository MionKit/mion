// E1 verification: a precompiled library (built with `--compile`, shipping its
// own `__runtypes/` cache modules) and a consumer that ALSO generates entries
// for the SAME types can be loaded together without any double-registration.
//
// The reason it is harmless is content-addressing: an entry's key is
// `<fnHash>_<typeId>` (fn) or the structural id (runtype), both folding in the
// binary version. So the SAME type produces the SAME key + SAME body no matter
// who compiled it. Registering it twice is therefore idempotent:
//   - addToRTCache is a keyed overwrite — the second write replaces with
//     identical content, leaving ONE entry.
//   - addPureFn keeps the existing entry when the bodyHash matches (a content
//     hash), so identical pure fns never warn. It warns + replaces ONLY on a
//     genuine body divergence under the same key, which content-addressing
//     makes impossible for equal bodies.
//
// This pins that behaviour so a future change to the registry can't silently
// turn a duplicate registration into a warning or a double-count.

import {describe, it, expect, vi} from 'vitest';
import {getRTUtils, getRTFnCaches, pureFnKey} from '../../src/runtypes/rtUtils.ts';
import type {CompiledTypeFn} from '../../src/runtypes/types.ts';

describe('precompiled-library dedupe is harmless (E1)', () => {
  it('addToRTCache collapses a duplicate content-addressed entry to one (library + consumer)', () => {
    const utils = getRTUtils();
    const hash = 'e1_shared_typefn_key';
    const entry = (): CompiledTypeFn => ({
      typeName: 'SharedType',
      fnID: 'validate',
      rtFnHash: hash,
      args: {vλl: 'v'},
      defaultParamValues: {vλl: ''},
      code: 'return true;',
      rtDependencies: [],
      pureFnDependencies: [],
      fn: () => true,
      createRTFn: () => () => true,
    });

    const before = Object.keys(getRTFnCaches().rtFnsCache).length;
    // The library's precompiled module registers the entry...
    utils.addToRTCache(entry());
    // ...then the consumer's own generated module registers the SAME key.
    expect(() => utils.addToRTCache(entry())).not.toThrow();

    // One entry, not two — the content-addressed key collapsed the duplicate.
    expect(Object.keys(getRTFnCaches().rtFnsCache).length - before).toBe(1);
    expect(utils.hasRTFn(hash)).toBe(true);
    expect(utils.getRTFn(hash)()).toBe(true);
  });

  it('addPureFn keeps the existing entry with NO warning when the body hash matches', () => {
    const utils = getRTUtils();
    const key = pureFnKey('e1', 'sharedPureFn');
    const compiled = {code: '(utl) => (v) => v === 1', bodyHash: 'e1bodyhash', paramNames: ['v']} as never;

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      utils.addPureFn(key, compiled);
      // The consumer registers the SAME key + SAME body — no conflict warning.
      const second = utils.addPureFn(key, {code: '(utl) => (v) => v === 1', bodyHash: 'e1bodyhash', paramNames: ['v']} as never);
      expect(warn).not.toHaveBeenCalled();
      // The existing entry is kept (identity preserved), not a fresh registration.
      expect(second).toBe(utils.getCompiledPureFn(key));
    } finally {
      warn.mockRestore();
    }
  });
});
