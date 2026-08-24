// End-to-end test for the NE001 lint diagnostic: a property tagged
// `@nonEnumerable` in JSDoc must be OPTIONAL. The runtime enumerability guard
// only applies to optional properties (GUARDED ⇒ OPTIONAL-in-type keeps
// DataOnly<T> accurate), so the tag on a required property is a silent no-op —
// NE001 (Error severity) tells the user to add `?`. Purely syntactic: emitted by
// the resolver's per-file scan, routed to the editor by the transport plugin
// like any other diagnostic.

import {describe, expect, it} from 'vitest';
import {type Diagnostic} from '../src/protocol.ts';
import {hasBinary, withInlineSources} from './helpers/inline.ts';

function ne001(response: {diagnostics?: Diagnostic[]}): Diagnostic[] {
  return (response.diagnostics ?? []).filter((d) => d.code === 'NE001');
}

describe('@ts-runtypes/devtools / @nonEnumerable lint (NE001)', () => {
  const register = hasBinary() ? it : it.skip;

  register('flags a REQUIRED @nonEnumerable property', async () => {
    const sources = {
      'req.ts': `import {createJsonEncoderFn} from '@ts-runtypes/core';
interface Doc {
  id: string;
  /** @nonEnumerable */
  token: string;
}
export const _ = createJsonEncoderFn<Doc>();
`,
    };
    await withInlineSources(sources, async ({client}) => {
      const diags = ne001(await client.scanFiles(Object.keys(sources)));
      expect(diags).toHaveLength(1);
      expect(diags[0].args).toEqual(['token']);
    });
  });

  register('does NOT flag an OPTIONAL @nonEnumerable property', async () => {
    const sources = {
      'opt.ts': `import {createJsonEncoderFn} from '@ts-runtypes/core';
interface Doc {
  id: string;
  /** @nonEnumerable */
  token?: string;
}
export const _ = createJsonEncoderFn<Doc>();
`,
    };
    await withInlineSources(sources, async ({client}) => {
      expect(ne001(await client.scanFiles(Object.keys(sources)))).toHaveLength(0);
    });
  });

  register('flags a required @nonEnumerable class property too', async () => {
    const sources = {
      'cls.ts': `import {createJsonEncoderFn} from '@ts-runtypes/core';
class Doc {
  id = '';
  /** @nonEnumerable */
  token = '';
}
export const _ = createJsonEncoderFn<Doc>();
`,
    };
    await withInlineSources(sources, async ({client}) => {
      const diags = ne001(await client.scanFiles(Object.keys(sources)));
      expect(diags).toHaveLength(1);
      expect(diags[0].args).toEqual(['token']);
    });
  });
});
