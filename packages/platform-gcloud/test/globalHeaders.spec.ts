/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// The router's global headers reach the wire through the adapter's own defaults, with no middleware writing them.

import {describe, it, expect, beforeAll, afterAll} from 'vitest';
import {createMionRouter, resetRouter} from '@mionjs/router';
import type {CallContext, Route} from '@mionjs/router';
import {Server} from 'http';
import {getTestServer} from '@google-cloud/functions-framework/testing';
import * as functions from '@google-cloud/functions-framework';
import {googleCFHandler, resetGoogleCFOpts, setGoogleCFOpts} from '../src/googleCF.ts';

describe('google cloud global response headers', () => {
  const port = 8099;
  const getSharedData = () => ({auth: {me: null as any}});
  const mion = createMionRouter({
    contextDataFactory: getSharedData,
    globalResponseHeaders: {'x-team': 'mion', 'x-app-name': 'TheRouter'},
  });
  const ping: Route = mion.route((ctx: CallContext): string => 'pong');
  let server: Server;

  beforeAll(async () => {
    resetGoogleCFOpts();
    resetRouter();
    setGoogleCFOpts({defaultResponseHeaders: {'x-app-name': 'TheAdapter'}});
    mion.initRoutes({ping}, 'abc123');
    functions.http('GlobalHeadersTests', googleCFHandler);
    server = getTestServer('GlobalHeadersTests');
    await new Promise<void>((done) => server.listen(port, () => done()));
  });

  afterAll(async () => new Promise<void>((done) => server.close(() => done())));

  it('ride every response, and the adapter still wins its own name', async () => {
    const response = await fetch(`http://127.0.0.1:${port}/ping`, {method: 'POST', body: JSON.stringify({ping: []})});
    await response.text();
    expect(response.headers.get('x-team')).toEqual('mion');
    expect(response.headers.get('x-build-version')).toEqual('abc123');
    expect(response.headers.get('x-app-name')).toEqual('TheAdapter');
  });
});
