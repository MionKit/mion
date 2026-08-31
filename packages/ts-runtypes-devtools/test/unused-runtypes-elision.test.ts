// End-to-end acceptance for the unused-builder-const elision (always on):
//
//   type X = InferType<typeof myRT>; createValidateFn<X>()  → fn cache ONLY
//   createValidateFn(myRT)                                  → BOTH caches
//
// Drives the real Go pipeline over the inline server and evaluates the
// emitted virtual modules: the static-form file must produce NO runtype
// modules (no `runtypes` bundle, no facade, one single site) while its
// validator entry still materialises and validates correctly; the value-form
// file keeps the bundle + facade and its validator works identically.

import {describe, expect, it} from 'vitest';
import {hasBinary, withInlineSources, evalEntryModules, instantiateRunTypes} from './helpers/inline.ts';

const prelude = `import {createValidateFn, type InferType} from '@ts-runtypes/core';
import {object} from '@mionjs/run-types/builders';
import {string, number} from '@mionjs/run-types/formats';
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

  register('value form keeps BOTH caches, and the validator works', async () => {
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

      // Both sites survive: the builder reflection root and the createX site.
      expect(response.sites.length).toBe(2);
      const builderSite = response.sites.find((s) => !s.fnId);
      const validateSite = response.sites.find((s) => s.fnId);
      if (!builderSite || !validateSite) throw new Error('expected a builder site and a createValidateFn site');
      expect(builderSite.id).toBe(validateSite.id);

      const entryModules = response.entryModules ?? {};
      expect(Object.keys(entryModules)).toContain('runtypes');
      const tuples = evalEntryModules(entryModules);
      const byHash = instantiateRunTypes(tuples);
      expect(byHash[builderSite.id], 'the runtype graph must instantiate for the value-used builder').toBeDefined();

      const tuple = tuples[`${validateSite.fnId}_${validateSite.id}`] as readonly unknown[];
      expect(tuple, 'expected the val entry module').toBeDefined();
      const createRTFn = tuple[9] as (utl: unknown) => (value: unknown) => boolean;
      const isX = createRTFn({});
      expect(isX({a: 'x', b: 1})).toBe(true);
      expect(isX({a: 'x', b: 'nope'})).toBe(false);
    });
  });
});
