// End-to-end acceptance test for the ANONYMOUS pure-fn lane
// (registerAnonymousPureFn + InjectPureFnHash). Drives the Go binary over inline
// sources, then verifies:
//
//   1. the factory argument is rewritten to its entry-module binding AND the
//      empty trailing slot is spliced with the injected `"rt::<hash>"` id;
//   2. the injected id equals the key the entry module is registered under
//      (content-addressed — one row per unique body);
//   3. structurally-identical bodies collapse to ONE rt::<hash> entry and inject
//      the same id; different bodies get different ids;
//   4. a library wrapper forwarding the markers injects the SAME id a direct call
//      would, with zero diagnostics — the whole reason the lane exists.
//
// Per the repo's marker-test discipline the lane is covered both DIRECTLY and
// THROUGH A LIBRARY WRAPPER, asserting the two inject the same hash.

import {describe, expect, it} from 'vitest';
import {type Diagnostic} from '../src/protocol.ts';
import {hasBinary, withInlineSources, evalEntryModules} from './helpers/inline.ts';

interface PureFnEntry {
  key: string;
  bodyHash: string;
  code: string;
  createPureFn: unknown;
}

// evalAnonymousEntries evaluates every entry module and picks the pure-fn-kind
// tuples (slot 0 === 2), keyed by their `<ns>::<fn>` key (slot 3).
function evalAnonymousEntries(entryModules: Record<string, string>): Record<string, PureFnEntry> {
  const registered: Record<string, PureFnEntry> = {};
  for (const tuple of Object.values(evalEntryModules(entryModules))) {
    if (!Array.isArray(tuple) || tuple[0] !== 2) continue;
    const key = tuple[3] as string;
    registered[key] = {key, bodyHash: tuple[4] as string, code: tuple[6] as string, createPureFn: tuple[8]};
  }
  return registered;
}

interface Replacement {
  start: number;
  end: number;
  text: string;
  importFrom?: string;
}

// applyReplacements applies every byte-range replacement to the source. Sorted
// by descending start so a higher-offset edit never shifts a lower-offset one
// (all offsets index the ORIGINAL bytes).
function applyReplacements(source: string, reps: Replacement[]): string {
  let buf = Buffer.from(source, 'utf8');
  for (const rep of [...reps].sort((a, b) => b.start - a.start)) {
    buf = Buffer.concat([buf.subarray(0, rep.start), Buffer.from(rep.text, 'utf8'), buf.subarray(rep.end)]);
  }
  return buf.toString('utf8');
}

// factoryAndHashReplacements splits a response's replacements into the
// factory-arg rewrite (importFrom set) and the hash splice (point insertion, no
// importFrom).
function factoryAndHashReplacements(reps: Replacement[]): {factory?: Replacement; hash?: Replacement} {
  let factory: Replacement | undefined;
  let hash: Replacement | undefined;
  for (const rep of reps) {
    if (rep.importFrom) factory = rep;
    else if (rep.start === rep.end) hash = rep;
  }
  return {factory, hash};
}

describe('@ts-runtypes/devtools / anonymous pure-fn lane', () => {
  const register = hasBinary() ? it : it.skip;

  register('rewrites the factory and splices the injected rt::<hash> id', async () => {
    const sources = {
      'anon.ts': `import {registerAnonymousPureFn} from '@ts-runtypes/core';
export const cpf = registerAnonymousPureFn(function _double(n: number): number { return n * 2; });
`,
    };
    await withInlineSources(sources, async ({client}) => {
      const response = await client.scanFiles(Object.keys(sources), {includeEntryModules: true});
      expect(response.diagnostics ?? []).toEqual([]);

      const pureFns = evalAnonymousEntries(response.entryModules!);
      const keys = Object.keys(pureFns);
      expect(keys.length).toBe(1);
      const key = keys[0];
      // Content-addressed: `rt::<14-char body hash>`.
      expect(key).toMatch(/^rt::[A-Za-z0-9_-]{14}$/);
      const entry = pureFns[key];
      // Direct form: the compiler wraps the pure fn into `() => fn`, so the
      // emitted factory code is `return <fn>;` — the whole fn returned, with TS
      // annotations stripped.
      expect(entry.code).not.toContain(': number');
      expect(entry.code).toContain('return function _double');
      expect(entry.code).toContain('return n * 2');
      expect(typeof entry.createPureFn).toBe('function');

      const reps = (response.replacements ?? []) as Replacement[];
      const {factory, hash} = factoryAndHashReplacements(reps);
      expect(factory, 'factory-arg rewrite').toBeTruthy();
      expect(factory!.importFrom).toBe(`rtmod:/pf/rt/${key.slice('rt::'.length)}.js`);
      expect(hash, 'hash splice').toBeTruthy();
      // The injected id is EXACTLY the key the entry registers under.
      expect(hash!.text).toBe(`, '${key}'`);

      // Applying both replacements yields the fully-injected call.
      const after = applyReplacements(sources['anon.ts'], reps);
      expect(after).toContain(`${factory!.text}, '${key}')`);
    });
  });

  register('collapses structurally-identical bodies to one content-addressed entry', async () => {
    const sources = {
      'a.ts': `import {registerAnonymousPureFn} from '@ts-runtypes/core';
export const first = registerAnonymousPureFn(function _id(n: number): number { return n; });
`,
      'b.ts': `import {registerAnonymousPureFn} from '@ts-runtypes/core';
export const second = registerAnonymousPureFn(function _id(n: number): number { return n; });
`,
    };
    await withInlineSources(sources, async ({client}) => {
      const response = await client.scanFiles(Object.keys(sources), {includeEntryModules: true});
      expect(response.diagnostics ?? []).toEqual([]);
      const pureFns = evalAnonymousEntries(response.entryModules!);
      // Equal bodies → one rt::<hash> entry (content-addressed dedup).
      expect(Object.keys(pureFns).length).toBe(1);
    });
  });

  register('gives different bodies different ids', async () => {
    const sources = {
      'ops.ts': `import {registerAnonymousPureFn} from '@ts-runtypes/core';
export const dbl = registerAnonymousPureFn(function _double(n: number): number { return n * 2; });
export const trp = registerAnonymousPureFn(function _triple(n: number): number { return n * 3; });
`,
    };
    await withInlineSources(sources, async ({client}) => {
      const response = await client.scanFiles(Object.keys(sources), {includeEntryModules: true});
      const pureFns = evalAnonymousEntries(response.entryModules!);
      expect(Object.keys(pureFns).length).toBe(2);
    });
  });

  register('library wrapper injects the same rt::<hash> a direct call would, with zero diagnostics', async () => {
    // Extract the id a DIRECT call to a given body injects.
    const directSources = {
      'direct.ts': `import {registerAnonymousPureFn} from '@ts-runtypes/core';
export const cpf = registerAnonymousPureFn(function _slug(s: string): string { return s.toLowerCase(); });
`,
    };
    let directKey = '';
    await withInlineSources(directSources, async ({client}) => {
      const response = await client.scanFiles(Object.keys(directSources), {includeEntryModules: true});
      directKey = Object.keys(evalAnonymousEntries(response.entryModules!))[0];
      expect(directKey).toMatch(/^rt::[A-Za-z0-9_-]{14}$/);
    });

    // A library wrapper forwarding the PureFunction + InjectPureFnHash markers —
    // the mion `registerMionPureFn` shape. Its consumer call is recognised by
    // BRAND (not callee name), injects at ITS site, and must match the direct id.
    const wrapperSources = {
      'toolkit.ts': `import {type PureFunction, type InjectPureFnHash, type RTUtils} from '@ts-runtypes/core';
export function registerAcmePureFn<F extends (utl: RTUtils) => any>(fn: PureFunction<F>, hash?: InjectPureFnHash<F>) {
  if (!hash) throw new Error('ts-runtypes plugin did not run');
  return {hash, fn};
}
`,
      'consumer.ts': `import {registerAcmePureFn} from './toolkit.ts';
export const cpf = registerAcmePureFn(function _slug(s: string): string { return s.toLowerCase(); });
`,
    };
    await withInlineSources(wrapperSources, async ({client}) => {
      const response = await client.scanFiles(['consumer.ts', 'toolkit.ts'], {includeEntryModules: true});
      expect(response.diagnostics ?? []).toEqual([]);
      const {hash} = factoryAndHashReplacements((response.replacements ?? []) as Replacement[]);
      expect(hash, 'wrapper consumer must inject a hash').toBeTruthy();
      // The wrapper injects the SAME content id as a direct call to the same body.
      expect(hash!.text).toBe(`, '${directKey}'`);
    });
  });
});
