// Verifies the per-cache "did this scan change anything?" signals the Go
// daemon emits on a scanFiles response. The Vite plugin's
// handleHotUpdate reads these to decide which cache modules to
// invalidate on a user-file change; if the signals are wrong we either
// over-invalidate (cheap but noisy) or under-invalidate (stale runtime
// state, which is the bug HMR is supposed to prevent).
//
// Three scenarios:
//   1. Fresh scan of a file that introduces a new RunType
//      → addedRunTypes=true, addedValidate=true (KindString is supported).
//   2. Re-scan of the same source content with no changes
//      → all three signals false (cache hits, no deltas).
//   3. Adding a `registerPureFnFactory` call to a file
//      → addedPureFns=true.

import {describe, expect, it} from 'vitest';
import {hasBinary, withInlineSources} from './helpers/inline.ts';

describe('@ts-runtypes/devtools / HMR signals on scanFiles', () => {
  const register = hasBinary() ? it : it.skip;

  register('first scan that introduces a new RunType sets addedRunTypes + addedValidate', async () => {
    const sources = {
      'fresh.ts': `import {getRunTypeId} from '@ts-runtypes/core';
getRunTypeId<string>();
`,
    };
    await withInlineSources(
      sources,
      async ({client}) => {
        const response = await client.scanFiles(['fresh.ts']);
        expect(response.addedRunTypes).toBe(true);
        expect(response.addedValidate).toBe(true);
      },
      {reset: true}
    );
  });

  register('idempotent re-scan reports no deltas across all three signals', async () => {
    const sources = {
      'idempotent.ts': `import {getRunTypeId} from '@ts-runtypes/core';
getRunTypeId<string>();
`,
    };
    await withInlineSources(
      sources,
      async ({client}) => {
        // Prime the cache.
        await client.scanFiles(['idempotent.ts']);
        // Re-scan the same content. Structural dedup hits; no new
        // entries get interned. pureFn extraction yields the same
        // (empty) set, so its delta is false too.
        const second = await client.scanFiles(['idempotent.ts']);
        expect(second.addedRunTypes).toBeFalsy();
        expect(second.addedValidate).toBeFalsy();
        expect(second.addedPureFns).toBeFalsy();
      },
      {reset: true}
    );
  });

  register('scanning a file with registerPureFnFactory sets addedPureFns', async () => {
    const sources = {
      'pure.ts': `import {registerPureFnFactory} from '@ts-runtypes/core';
export const a = registerPureFnFactory('hmrns::pureFnA', function () {
  return function _a(value: any): any { return value; };
});
`,
    };
    await withInlineSources(
      sources,
      async ({client}) => {
        const response = await client.scanFiles(['pure.ts']);
        expect(response.addedPureFns).toBe(true);
      },
      {reset: true}
    );
  });

  register('re-scanning the same pureFn content does not re-set addedPureFns', async () => {
    const sources = {
      'stable-pure.ts': `import {registerPureFnFactory} from '@ts-runtypes/core';
export const a = registerPureFnFactory('hmrns::stableFn', function () {
  return function _s(value: any): any { return value; };
});
`,
    };
    await withInlineSources(
      sources,
      async ({client}) => {
        // Prime.
        await client.scanFiles(['stable-pure.ts']);
        // Re-scan the same content — bodyHash matches, no delta.
        const second = await client.scanFiles(['stable-pure.ts']);
        expect(second.addedPureFns).toBeFalsy();
      },
      {reset: true}
    );
  });
});
