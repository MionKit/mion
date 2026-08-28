// End-to-end acceptance for the unused-builder-const elision (always on):
//
//   type X = InferType<typeof myRT>; createValidateFn<X>()  → fn cache ONLY
//   createValidateFn(myRT)                                  → fn cache ONLY
//   getRunType(myRT)                                        → BOTH caches
//
// Both createValidateFn spellings elide, because the factory resolves its own
// injected entry tuple and never reads the schema it was handed. Drives the real
// Go pipeline over the inline server and evaluates the emitted virtual modules:
// each elided file must produce NO runtype modules (no `runtypes` bundle, no
// facade, one single site) while its validator entry still materialises and
// validates correctly. The id-lookup escape is the counter-case that keeps the
// graph.

import {describe, expect, it} from 'vitest';
import {hasBinary, withInlineSources, evalEntryModules, instantiateRunTypes} from './helpers/inline.ts';

const prelude = `import {createValidateFn, getRunType, type InferType} from '@ts-runtypes/core';
import {object} from '@ts-runtypes/core/builders';
import {string, number} from '@ts-runtypes/core/formats';
`;

describe('@ts-runtypes/devtools / unused-builder-const elision', () => {
  const register = hasBinary() ? it : it.skip;

  register('type-only use emits the function cache ONLY, and the validator works', async () => {
    const sources = {
      'static-form.ts':
        prelude +
        `const myRT = object({a: string(), b: number()});
type X = InferType<typeof myRT>;
export const isX = createValidateFn<X>();
`,
    };
    await withInlineSources(sources, async ({client, sources: augmented}) => {
      const files = Object.keys(augmented).filter((file) => file !== 'runtypes.d.ts');
      const response = await client.scanFiles(files, {includeEntryModules: true});

      // The builder site is elided: only the createValidateFn site remains.
      expect(response.sites.length).toBe(1);
      const site = response.sites[0];
      expect(site.fnId).toBeTruthy();

      const entryModules = response.entryModules ?? {};
      // No reflection payload of any shape: no fixed-name bundle module, and
      // zero instantiable runtype rows.
      expect(Object.keys(entryModules)).not.toContain('runtypes');
      const tuples = evalEntryModules(entryModules);
      const byHash = instantiateRunTypes(tuples);
      expect(Object.keys(byHash)).toEqual([]);

      // The compiled validator still materialises and behaves.
      const tuple = tuples[`${site.fnId}_${site.id}`] as readonly unknown[];
      expect(tuple, 'expected the val entry module').toBeDefined();
      const createRTFn = tuple[9] as (utl: unknown) => (value: unknown) => boolean;
      expect(createRTFn).toBeTypeOf('function');
      const isX = createRTFn({});
      expect(isX({a: 'x', b: 1})).toBe(true);
      expect(isX({a: 1, b: 1})).toBe(false);
      expect(isX(undefined)).toBe(false);
    });
  });

  register('the value form ALSO emits the function cache only, and the validator works', async () => {
    const sources = {
      'value-form.ts':
        prelude +
        `const myRT = object({a: string(), b: number()});
export const isX = createValidateFn(myRT);
`,
    };
    await withInlineSources(sources, async ({client, sources: augmented}) => {
      const files = Object.keys(augmented).filter((file) => file !== 'runtypes.d.ts');
      const response = await client.scanFiles(files, {includeEntryModules: true});

      // The builder site is elided here too: handing the const to the factory is
      // not a value use, since the factory reads its own injected entry tuple.
      expect(response.sites.length).toBe(1);
      const site = response.sites[0];
      expect(site.fnId).toBeTruthy();

      const entryModules = response.entryModules ?? {};
      expect(Object.keys(entryModules)).not.toContain('runtypes');
      const tuples = evalEntryModules(entryModules);
      expect(Object.keys(instantiateRunTypes(tuples))).toEqual([]);

      const tuple = tuples[`${site.fnId}_${site.id}`] as readonly unknown[];
      expect(tuple, 'expected the val entry module').toBeDefined();
      const createRTFn = tuple[9] as (utl: unknown) => (value: unknown) => boolean;
      const isX = createRTFn({});
      expect(isX({a: 'x', b: 1})).toBe(true);
      expect(isX({a: 'x', b: 'nope'})).toBe(false);
    });
  });

  register('the id-lookup escape keeps BOTH caches', async () => {
    const sources = {
      'escape-form.ts':
        prelude +
        `const myRT = object({a: string(), b: number()});
export const isX = createValidateFn(myRT);
export const node = getRunType(myRT);
`,
    };
    await withInlineSources(sources, async ({client, sources: augmented}) => {
      const files = Object.keys(augmented).filter((file) => file !== 'runtypes.d.ts');
      const response = await client.scanFiles(files, {includeEntryModules: true});

      // getRunType reads the graph, so the builder site stays: three sites, the
      // builder plus the two calls.
      const reflectionSites = response.sites.filter((site) => !site.fnId);
      expect(reflectionSites.length).toBe(2);

      const entryModules = response.entryModules ?? {};
      expect(Object.keys(entryModules)).toContain('runtypes');
      const byHash = instantiateRunTypes(evalEntryModules(entryModules));
      expect(byHash[reflectionSites[0].id], 'the runtype graph must instantiate for the looked-up builder').toBeDefined();
    });
  });
});
