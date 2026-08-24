// End-to-end acceptance test for the validate precompiler. Drives the
// Go side over the same inline-server pipeline the other vite-plugin
// tests use, then evaluates the per-entry virtual modules:
//
//   - the runtype bundle row for `string` (bundle tuple slot 0 === 4);
//   - the validate entry module (slot 0 === 'val'), asserting the tuple's
//     positional args carry every RTCompiledFnData field and that the
//     inline factory (emitMode 'both' on the shared client)
//     materialises a working validator.
//
// Sibling test packages/ts-runtypes/test/createValidateFn.test.ts
// exercises the same entries through the public `createValidateFn<T>()`
// API. This file goes a level lower: it asserts the rendered tuple
// shape, so regressions in the entry emitter surface here before they
// break downstream consumers.

import {describe, expect, it} from 'vitest';
import {hasBinary, withInlineSources, evalEntryModules, instantiateRunTypes} from './helpers/inline.ts';

describe('@ts-runtypes/devtools / validate precompiler', () => {
  const register = hasBinary() ? it : it.skip;

  register('emits a working RTCompiledFn entry for `string`', async () => {
    // Both caches are demand-scoped: createValidateFn<string>() drives the
    // validate family this test inspects, and getRunTypeId<string>() drives
    // the runtype bundle (a createX-only file emits ZERO runtype modules).
    const sources = {
      'string.ts': `import {createValidateFn, getRunTypeId} from '@ts-runtypes/core';
createValidateFn<string>();
getRunTypeId<string>();
`,
    };
    await withInlineSources(sources, async ({client, sources: augmented}) => {
      const files = Object.keys(augmented).filter((file) => file !== 'runtypes.d.ts');
      const response = await client.scanFiles(files, {includeEntryModules: true});

      expect(response.sites.length).toBe(2);
      const site = response.sites.find((s) => s.fnId);
      if (!site) throw new Error('expected a createValidateFn site');
      const fnPrefix = site.fnId;
      if (!fnPrefix) throw new Error('expected an injected fnId (fnHash) on the createValidateFn site');
      const cacheKey = fnPrefix + '_' + site.id;

      const entryModules = response.entryModules ?? {};
      const tuples = evalEntryModules(entryModules);

      // 1. The runtype bundle row for `string` instantiates to the
      //    expected RunType record.
      const byHash = instantiateRunTypes(tuples);
      const stringRunType = byHash[site.id];
      expect(stringRunType).toBeDefined();
      expect(stringRunType.kind).toBe(5); // ReflectionKind.string

      // 2. The validate entry module exports the tuple this site's key
      //    names. Head: [familyTag, depsThunk, ini|u]; tail (slot 3+):
      //    rtFnHash, typeName, code, isNoop, rtDependencies,
      //    pureFnDependencies, createRTFn, … — every default-valued slot is a
      //    JS array HOLE (reads back as undefined), even interior ones, since
      //    the live factory (slot 9, `both` mode) blocks a trailing trim.
      const tuple = tuples[cacheKey] as readonly unknown[];
      expect(tuple, `expected entry module for ${cacheKey}`).toBeDefined();
      expect(tuple[0]).toBe('val');
      expect(tuple[1]).toBeUndefined(); // dep-less entry: no deps thunk, no self
      expect(tuple[3]).toBe(cacheKey);
      expect(tuple[4]).toBe('string');
      // `code` carries the factory body (suitable for
      // `new Function('utl', code)(rtUtils)` reconstruction), not just the
      // inner validator body. The inner fn is a hoisted declaration + name
      // return (see typefns.WrapClosure).
      expect(tuple[5]).toBe('function ' + cacheKey + "(v){return typeof v === 'string'}return " + cacheKey);
      expect(tuple[6]).toBeUndefined(); // isNoop false → hole (reads as not-noop)
      expect(tuple[7]).toBeUndefined(); // rtDependencies [] → hole (build-only metadata)
      expect(tuple[8]).toBeUndefined(); // pureFnDependencies [] → hole

      // 3. The inline factory (shared client runs emitMode 'both')
      //    materialises a working validator.
      const createRTFn = tuple[9] as (utl: unknown) => (value: unknown) => boolean;
      expect(createRTFn).toBeTypeOf('function');
      const fn = createRTFn({});
      expect(fn('abc')).toBe(true);
      expect(fn(42)).toBe(false);
      expect(fn(undefined)).toBe(false);
    });
  });
});
