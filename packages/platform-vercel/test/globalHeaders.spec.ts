/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// The router's global headers reach the wire through the adapter's own defaults, with no middleware writing them.

import {describe, it, expect, beforeAll} from 'vitest';
import {createMionRouter, resetRouter} from '@mionjs/router';
import type {CallContext, Route} from '@mionjs/router';
import {createVercelHandler, resetVercelHandlerOpts, setVercelHandlerOpts} from '../src/vercelHandler.ts';

describe('vercel global response headers', () => {
  const getSharedData = () => ({auth: {me: null as any}});
  const mion = createMionRouter({
    contextDataFactory: getSharedData,
    globalResponseHeaders: {'x-team': 'mion', 'x-app-name': 'TheRouter'},
  });
  const ping: Route = mion.route((ctx: CallContext): string => 'pong');
  let handler: ReturnType<typeof createVercelHandler>;

  beforeAll(() => {
    resetVercelHandlerOpts();
    resetRouter();
    setVercelHandlerOpts({defaultResponseHeaders: {'x-app-name': 'TheAdapter'}});
    mion.initRoutes({ping}, 'abc123');
    handler = createVercelHandler();
  });

  it('ride every response, and the adapter still wins its own name', async () => {
    const req = new Request('http://localhost/ping', {
      method: 'POST',
      body: JSON.stringify({ping: []}),
      headers: {'content-type': 'application/json'},
    });
    const response = await handler.POST(req);
    expect(response.headers.get('x-team')).toEqual('mion');
    expect(response.headers.get('x-build-version')).toEqual('abc123');
    expect(response.headers.get('x-app-name')).toEqual('TheAdapter');
  });
});
