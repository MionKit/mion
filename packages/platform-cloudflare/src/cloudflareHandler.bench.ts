/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of an kind.
 * ######## */

// Throughput of the cloudflare handler under workerd (Miniflare, in process): the prebuilt test
// server bundle answers real requests, so a body-reading change shows up as requests per second on
// the runtime it ships to. Run with:
//   pnpm exec vitest bench --project platform-cloudflare cloudflareHandler
// The bundle is rebuilt by the project's globalSetup, the same as for the workers specs.

import {bench, describe, afterAll} from 'vitest';
import {Miniflare} from 'miniflare';
import {readFileSync} from 'fs';
import {resolve} from 'path';

const CLOUDFLARE_BUNDLE_PATH = resolve(__dirname, '../../test-server/build/test-server-cloudflare.js');

const bundleCode = readFileSync(CLOUDFLARE_BUNDLE_PATH, 'utf-8');
const mf = new Miniflare({
  script: `
    globalThis.process = { env: {} };
    ${bundleCode}
    const __initPromise = CloudflareTestServer.setup({});
    addEventListener('fetch', event => {
      event.respondWith(__initPromise.then(() => globalThis.handler.fetch(event.request)));
    });
  `,
  compatibilityDate: '2024-01-01',
});

afterAll(() => mf.dispose());

const bodies = {
  'POST 100 B': ['/api/changeUserName', JSON.stringify({changeUserName: [{name: 'John', surname: 'Smith'}]})],
  'POST 1 KB': ['/api/changeUserName', JSON.stringify({changeUserName: [{name: 'John', surname: 'x'.repeat(1000)}]})],
  'POST 50 KB': ['/api/changeUserName', JSON.stringify({changeUserName: [{name: 'John', surname: 'x'.repeat(50_000)}]})],
  'GET, no body': ['/api/getDate', undefined],
  'POST to an unknown path, 1 KB body (404, never read)': ['/api/nope', 'x'.repeat(1000)],
} as const;

describe('cloudflare handler under workerd', () => {
  for (const [label, [path, body]] of Object.entries(bodies)) {
    bench(label, async () => {
      const response = await mf.dispatchFetch(`http://localhost${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        body,
        headers: {'content-type': 'application/json'},
      });
      await response.text();
    });
  }
});
