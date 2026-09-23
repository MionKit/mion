/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// The router's global headers reach the wire through the adapter's own defaults, with no middleware writing them.

import {expect, test, beforeAll, afterAll, describe, setDefaultTimeout} from 'bun:test';
import {createMionRouter, resetRouter} from '@mionjs/router';
import {CallContext} from '@mionjs/router';
import {setBunHttpOpts, resetBunHttpOpts, startBunServer} from './bunHttp.ts';
import {Server} from 'bun';

setDefaultTimeout(30_000);

describe('bun global response headers', () => {
  const port = 8078;
  const getSharedData = () => ({auth: {me: null as any}});
  let server: Server<any>;

  // Router built here, not in the describe body: bun evaluates every body before any hook, in one process.
  // Built in the body it would hit the once-guard another test file set, skipping this whole file.
  beforeAll(async () => {
    resetBunHttpOpts();
    resetRouter();
    const mion = createMionRouter({
      contextDataFactory: getSharedData,
      globalResponseHeaders: {'x-team': 'mion', 'x-app-name': 'TheRouter'},
    });
    const ping = mion.route((ctx: CallContext): string => 'pong');
    setBunHttpOpts({port, defaultResponseHeaders: {'x-app-name': 'TheAdapter'}});
    mion.initRoutes({ping}, 'abc123');
    server = (await startBunServer()) as Server<any>;
  });

  afterAll(() => {
    if (server) void server.stop();
    resetBunHttpOpts();
  });

  test('ride every response, and the adapter still wins its own name', async () => {
    const response = await fetch(`http://127.0.0.1:${port}/ping`, {method: 'POST', body: JSON.stringify({ping: []})});
    await response.text();
    expect(response.headers.get('x-team')).toEqual('mion');
    expect(response.headers.get('x-build-version')).toEqual('abc123');
    expect(response.headers.get('x-app-name')).toEqual('TheAdapter');
  });
});
