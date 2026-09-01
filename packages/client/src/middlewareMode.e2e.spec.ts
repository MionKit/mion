/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, expect, it, beforeAll, afterAll} from 'vitest';
import {createServer as createHttpServer, type Server} from 'node:http';
import {resolve} from 'node:path';
import {createServer, type ViteDevServer} from 'vite';
import {mionVitePlugin} from '@mionjs/devtools/vite';

// End-to-end proof for `server.runMode: 'middleware'`: the REAL test-server entry, transformed by
// the REAL mion pipeline, loaded INSIDE a vite dev server and answering a real route over
// HTTP — no child process, and no port of mion's own.
//
// devtools' own middlewareMode.spec.ts stubs the router/adapter to test the mount mechanism in
// isolation; this one is the integration the stubs cannot give: build-time type injection, router
// registration, dispatch and serialization all running through vite's SSR pipeline.

const TEST_SERVER_DIR = resolve(__dirname, '../../test-server');
const START_SCRIPT = resolve(TEST_SERVER_DIR, 'src/test-server.ts');

describe('mion API mounted in-process (middleware mode)', () => {
  let vite: ViteDevServer;
  let http: Server;
  let baseUrl: string;
  let previousAutoStart: string | undefined;

  beforeAll(async () => {
    // The client project's vitest env pins this to 'false' so importing the test-server for its
    // TYPES never boots a server. Middleware mode wants the opposite: the entry must run.
    previousAutoStart = process.env.MION_TEST_SERVER_AUTO_START;
    process.env.MION_TEST_SERVER_AUTO_START = 'true';

    vite = await createServer({
      root: TEST_SERVER_DIR,
      configFile: false,
      logLevel: 'silent',
      appType: 'custom',
      server: {middlewareMode: true},
      resolve: {conditions: ['source']},
      ssr: {resolve: {conditions: ['source']}},
      plugins: [
        mionVitePlugin({
          runTypes: {tsConfig: resolve(TEST_SERVER_DIR, 'tsconfig.json')},
          // no runMode: middleware is the default, which is half of what this asserts
          server: {startScript: START_SCRIPT},
        }),
      ],
    });
    http = createHttpServer((req, res) => vite.middlewares(req, res));
    await new Promise<void>((done) => http.listen(0, done));
    baseUrl = `http://127.0.0.1:${(http.address() as {port: number}).port}`;
  }, 120_000);

  afterAll(async () => {
    await new Promise<void>((done) => http?.close(() => done()));
    await vite?.close();
    if (previousAutoStart === undefined) delete process.env.MION_TEST_SERVER_AUTO_START;
    else process.env.MION_TEST_SERVER_AUTO_START = previousAutoStart;
  });

  it('answers a real route through the dev server, with validation and serialization applied', async () => {
    const response = await fetch(`${baseUrl}/sayHello`, {
      method: 'POST',
      headers: {'content-type': 'application/json', authorization: 'test-token'},
      body: JSON.stringify({sayHello: [{name: 'Leo', surname: 'Tungsten'}]}),
    });

    expect(response.status).toBe(200);
    // sayHello returns `string | RpcError`, so the reply carries mion's tagged-union wire shape
    // — i.e. the route's compiled serializer really ran, not some passthrough.
    expect(await response.json()).toMatchObject({sayHello: [0, 'Hello Leo Tungsten']});
  }, 120_000);

  it('rejects an invalid payload the same way the standalone server does', async () => {
    const response = await fetch(`${baseUrl}/sayHello`, {
      method: 'POST',
      headers: {'content-type': 'application/json', authorization: 'test-token'},
      body: JSON.stringify({sayHello: [{name: 42}]}),
    });

    // the validation error is part of the route's declared union, so it rides the same tagged
    // slot the client reads it from — proof the compiled validator ran, not just any 4xx
    expect(response.status).toBe(422);
    const body = (await response.json()) as {'@thrownErrors': {sayHello: {errorData: {typeErrors: unknown[]}}}};
    expect(body['@thrownErrors'].sayHello.errorData.typeErrors).toEqual([
      {expected: 'string', path: [0, 'name']},
      {expected: 'string', path: [0, 'surname']},
    ]);
  });

  it('leaves everything outside the API to vite', async () => {
    // test-server registers no basePath, so mion serves at the root and only the exclude list
    // keeps vite's own URLs — a request vite cannot serve either must NOT come back as a route.
    const response = await fetch(`${baseUrl}/@vite/client`);
    expect(response.headers.get('content-type')).not.toContain('application/json');
  });
});
