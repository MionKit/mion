/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// The router's global headers reach the wire through the adapter's own defaults, with no middleFn writing them.

import {describe, it, expect, beforeAll, afterAll} from 'vitest';
import {createMionRouter, resetRouter} from '@mionjs/router';
import type {CallContext, Route} from '@mionjs/router';
import {setUwsHttpOpts, resetUwsHttpOpts, startUwsServer, type UwsServer} from './uwsHttp.ts';

describe('uws global response headers', () => {
  const port = 8094;
  const getSharedData = () => ({auth: {me: null as any}});
  const mion = createMionRouter({
    contextDataFactory: getSharedData,
    globalResponseHeaders: {'x-team': 'mion', 'x-app-name': 'TheRouter'},
  });
  const ping: Route = mion.route((ctx: CallContext): string => 'pong');
  let server: UwsServer;

  beforeAll(async () => {
    resetUwsHttpOpts();
    resetRouter();
    setUwsHttpOpts({port, defaultResponseHeaders: {'x-app-name': 'TheAdapter'}});
    mion.initRoutes({ping}, 'abc123');
    server = await startUwsServer();
  });

  afterAll(() => {
    if (server) server.close();
  });

  it('ride every response, and the adapter still wins its own name', async () => {
    const response = await fetch(`http://127.0.0.1:${port}/ping`, {method: 'POST', body: JSON.stringify({ping: []})});
    await response.text();
    expect(response.headers.get('x-team')).toEqual('mion');
    expect(response.headers.get('x-build-version')).toEqual('abc123');
    expect(response.headers.get('x-app-name')).toEqual('TheAdapter');
  });
});
