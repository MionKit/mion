// The "did this scan change anything?" signals on a scanFiles response. The plugin regenerates the cache modules
// off addedRunTypes / addedPureFns, so a wrong signal means stale runtime state or needless regeneration.

import {describe, expect, it} from 'vitest';
import {hasBinary, withInlineSources} from './helpers/inline.ts';

describe('@mionjs/devtools / HMR signals on scanFiles', () => {
  const register = hasBinary() ? it : it.skip;

  register('first scan that introduces a new RunType sets addedRunTypes', async () => {
    const sources = {
      'fresh.ts': `import {getRunTypeId} from '@mionjs/run-types';
getRunTypeId<string>();
`,
    };
    await withInlineSources(
      sources,
      async ({client}) => {
        const response = await client.scanFiles(['fresh.ts']);
        expect(response.addedRunTypes).toBe(true);
      },
      {reset: true}
    );
  });

  register('idempotent re-scan reports no deltas on either signal', async () => {
    const sources = {
      'idempotent.ts': `import {getRunTypeId} from '@mionjs/run-types';
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
        expect(second.addedPureFns).toBeFalsy();
      },
      {reset: true}
    );
  });

  register('scanning a file with registerPureFnFactory sets addedPureFns', async () => {
    const sources = {
      'pure.ts': `import {registerPureFnFactory} from '@mionjs/run-types/runtime';
export const pureFnA = registerPureFnFactory(function () {
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
      'stable-pure.ts': `import {registerPureFnFactory} from '@mionjs/run-types/runtime';
export const stableFn = registerPureFnFactory(function () {
  return function _s(value: any): any { return value; };
});
`,
    };
    await withInlineSources(
      sources,
      async ({client}) => {
        // Prime.
        await client.scanFiles(['stable-pure.ts']);
        // Re-scan the same content — same id, no delta.
        const second = await client.scanFiles(['stable-pure.ts']);
        expect(second.addedPureFns).toBeFalsy();
      },
      {reset: true}
    );
  });
});
