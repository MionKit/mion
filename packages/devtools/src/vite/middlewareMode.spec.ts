/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, expect, it, beforeEach, afterEach} from 'vitest';
import {mkdtempSync, mkdirSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {createServer as createHttpServer, type Server} from 'node:http';
import path from 'node:path';
import {createServer, type ViteDevServer} from 'vite';
import {mionMiddlewarePlugin} from './middlewareMode.ts';
import {batchesImportPlugin} from './mionVitePlugin.ts';
import {batchesModulePath, writeBatchesModule} from '../options.ts';
import {mionVitePlugin} from './mionVitePlugin.ts';
import type {MionServerOptions} from './mionVitePlugin.ts';
import type {Plugin} from 'vite';

// The mion API mounted INSIDE a REAL vite dev server, over temp fixtures: the middleware only ever
// exists inside `configureServer`, so nothing short of an actual dev server + an actual HTTP request
// proves it forwards, falls through, or fails the way it claims.
//
// `@mionjs/router` and the platform adapter are STUBBED through resolve.alias (the isolation trick
// batchesBuild.spec.ts uses): what is under test is the mount mechanism — which module is
// loaded, what is asked of it, and which requests reach it — not route dispatch, which would drag
// the mion resolver and a real program into a dev-server test.

const ROUTER_STUB = (basePath: string) => `
globalThis.__mion = globalThis.__mion ?? {loads: 0, resets: 0, platformConfig: undefined};
export const getRouterOptions = () => ({basePath: ${JSON.stringify(basePath)}});
export const getPlatformConfig = () => globalThis.__mion.platformConfig;
export const setPlatformConfig = (config) => {globalThis.__mion.platformConfig = config;};
export const resetRouter = () => {globalThis.__mion.resets += 1; globalThis.__mion.platformConfig = undefined;};
export const initMionRouter = () => {};
export const replaceBatches = (table) => {globalThis.__mion.batches = table;};
`;

/** @mionjs/core stub: the generated batch module imports the tuple registrar from it. */
const CORE_STUB = `export const registerInputMapperTuple = () => {};
`;

/** Node-style adapter stub: same export names @mionjs/platform-node uses. */
const NODE_PLATFORM_STUB = `
import {setPlatformConfig} from '@mionjs/router';
let opts = {asMiddleware: false};
export const setNodeHttpOpts = (patch) => (opts = {...opts, ...patch});
export const startNodeServer = () => setPlatformConfig({...opts});
export function httpRequestHandler(req, res) {
    res.statusCode = 200;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({served: 'node', url: req.url, method: req.method, loads: globalThis.__mion.loads}));
}
`;

/** Fetch-style adapter stub: same shape as @mionjs/platform-bun's bunRequestHandler. */
const FETCH_PLATFORM_STUB = `
import {setPlatformConfig} from '@mionjs/router';
let opts = {asMiddleware: false};
export const setBunHttpOpts = (patch) => (opts = {...opts, ...patch});
export const startBunServer = () => setPlatformConfig({...opts});
export async function bunRequestHandler(req) {
    const body = req.method === 'GET' ? null : await req.text();
    return new Response(JSON.stringify({served: 'fetch', url: req.url, method: req.method, body}), {
        status: 201,
        headers: {'content-type': 'application/json', 'x-mion-test': 'bridged'},
    });
}
`;

/** Entry that registers routes and "starts" the adapter, exactly like a real mion server entry. */
const ENTRY = (platform: string) => `
import {startNodeServer, startBunServer} from ${JSON.stringify(platform)};
import './routes.ts';
globalThis.__mion.loads += 1;
(startNodeServer ?? startBunServer)();
`;

const ROUTES = `export const marker = 'routes-v1';\n`;

describe('middleware mode (in-process vite dev server)', () => {
  let root: string;
  let vite: ViteDevServer | undefined;
  let http: Server | undefined;
  let baseUrl = '';
  let ready: {resolved: boolean; error?: Error};

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'mion-middleware-'));
    mkdirSync(path.join(root, 'src'), {recursive: true});
    (globalThis as any).__mion = {loads: 0, resets: 0, platformConfig: undefined};
    ready = {resolved: false};
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => (http ? http.close(() => resolve()) : resolve()));
    await vite?.close();
    http = undefined;
    vite = undefined;
    rmSync(root, {recursive: true, force: true});
  });

  /** Writes the fixture tree and boots a real dev server with the middleware plugin mounted. */
  async function startDevServer(opts: {
    basePath?: string;
    platformStub?: string;
    entry?: string;
    server?: Partial<MionServerOptions>;
    /** Mount the batch transport's server side too (always on in mionVitePlugin). */
    withBatches?: boolean;
  }): Promise<void> {
    const routerPath = path.join(root, 'router-stub.js');
    const corePath = path.join(root, 'core-stub.js');
    const platformPath = path.join(root, 'platform-stub.js');
    const entryPath = path.join(root, 'src', 'entry.ts');
    writeFileSync(routerPath, ROUTER_STUB(opts.basePath ?? '/api'));
    writeFileSync(corePath, CORE_STUB);
    writeFileSync(platformPath, opts.platformStub ?? NODE_PLATFORM_STUB);
    writeFileSync(path.join(root, 'src', 'routes.ts'), ROUTES);
    writeFileSync(entryPath, opts.entry ?? ENTRY(platformPath));

    const serverOptions: MionServerOptions = {startScript: entryPath, platform: platformPath, ...opts.server};
    vite = await createServer({
      root,
      configFile: false,
      logLevel: 'silent',
      appType: 'custom', // no SPA fallback: an unmatched request must 404, not return index.html
      server: {middlewareMode: true},
      resolve: {alias: {'@mionjs/router': routerPath, '@mionjs/core': corePath}},
      plugins: [
        ...(opts.withBatches ? [batchesImportPlugin()] : []),
        mionMiddlewarePlugin(serverOptions, {
          onReady: () => (ready.resolved = true),
          onError: (err) => (ready.error = err),
        }),
      ],
    });
    const devServer = vite;
    http = createHttpServer((req, res) => devServer.middlewares(req, res));
    await new Promise<void>((resolve) => http!.listen(0, resolve));
    baseUrl = `http://127.0.0.1:${(http!.address() as {port: number}).port}`;
  }

  const loads = () => (globalThis as any).__mion.loads as number;
  const resets = () => (globalThis as any).__mion.resets as number;

  it('forwards requests under the router basePath to the platform handler', async () => {
    await startDevServer({basePath: '/api'});
    const res = await fetch(`${baseUrl}/api/users.get`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({served: 'node', url: '/api/users.get', method: 'GET'});
  });

  it('serves the basePath itself and its query form', async () => {
    await startDevServer({basePath: '/api'});
    expect((await fetch(`${baseUrl}/api`)).status).toBe(200);
    expect((await fetch(`${baseUrl}/api?users.get`)).status).toBe(200);
  });

  it('does NOT swallow a sibling path that merely shares the prefix', async () => {
    await startDevServer({basePath: '/api'});
    // '/apidocs' is the frontend's, not mion's — the pre-migration plugin matched it (and, with
    // an empty basePath, matched literally every request the dev server received).
    expect((await fetch(`${baseUrl}/apidocs`)).status).toBe(404);
  });

  it("normalizes a basePath written the router's way ('api/v1')", async () => {
    await startDevServer({basePath: 'api/v1/'});
    const res = await fetch(`${baseUrl}/api/v1/users.get`);
    expect(res.status).toBe(200);
  });

  it('with no basePath serves the root but leaves vite internals and assets alone', async () => {
    await startDevServer({basePath: ''});
    expect((await fetch(`${baseUrl}/users.get`)).status).toBe(200);
    for (const url of ['/@vite/client', '/src/routes.ts', '/assets/logo.svg', '/favicon.ico']) {
      const res = await fetch(`${baseUrl}${url}`);
      const body = await res.text();
      expect(body, `${url} must not be served by mion`).not.toContain('"served"');
    }
  });

  it('bridges a fetch-style platform through node req/res, both directions', async () => {
    await startDevServer({basePath: '/api', platformStub: FETCH_PLATFORM_STUB});
    const res = await fetch(`${baseUrl}/api/users.set`, {method: 'POST', body: JSON.stringify([{id: 1}])});
    expect(res.status).toBe(201);
    expect(res.headers.get('x-mion-test')).toBe('bridged');
    const body = (await res.json()) as {served: string; url: string; method: string; body: string};
    expect(body.served).toBe('fetch');
    expect(body.method).toBe('POST');
    expect(body.url).toMatch(/\/api\/users\.set$/);
    expect(body.body).toBe(JSON.stringify([{id: 1}]));
  });

  it('does not load the API until it is asked for (vitest sets VITEST, so no eager warm-up)', async () => {
    expect(process.env.VITEST).toBeTruthy();
    await startDevServer({basePath: '/api'});
    expect(loads()).toBe(0);
    await fetch(`${baseUrl}/api/users.get`);
    expect(loads()).toBe(1);
    await fetch(`${baseUrl}/api/users.get`);
    expect(loads()).toBe(1); // loaded once, not per request
  });

  it('resolves serverReady through onReady once the API is mounted', async () => {
    await startDevServer({basePath: '/api'});
    await fetch(`${baseUrl}/api/users.get`);
    expect(ready.resolved).toBe(true);
    expect(ready.error).toBeUndefined();
  });

  it('answers 503 with the real cause when the entry throws, and reports it to serverReady', async () => {
    await startDevServer({basePath: '/api', entry: `throw new Error('boom: routes are broken');\n`});
    const res = await fetch(`${baseUrl}/api/users.get`);
    expect(res.status).toBe(503);
    expect(await res.text()).toContain('boom: routes are broken');
    expect(ready.error?.message).toContain('boom: routes are broken');
  });

  it('fails loudly when the entry opened its own port (a second adapter instance)', async () => {
    const listeningEntry = `
import {setPlatformConfig} from '@mionjs/router';
globalThis.__mion.loads += 1;
setPlatformConfig({port: 8076, asMiddleware: false});
`;
    await startDevServer({basePath: '/api', entry: listeningEntry});
    const res = await fetch(`${baseUrl}/api/users.get`);
    expect(res.status).toBe(503);
    expect(await res.text()).toMatch(/loaded twice|asMiddleware/);
  });

  it('tells the adapter to skip listen() BEFORE the entry runs', async () => {
    await startDevServer({basePath: '/api'});
    await fetch(`${baseUrl}/api/users.get`);
    // the stub publishes whatever options it held when the entry "started" it
    expect((globalThis as any).__mion.platformConfig).toMatchObject({asMiddleware: true});
  });

  it('re-loads the API after a source change, resetting the router first', async () => {
    await startDevServer({basePath: '/api'});
    await fetch(`${baseUrl}/api/users.get`);
    expect(loads()).toBe(1);
    expect(resets()).toBe(0);

    const changed = path.join(root, 'src', 'routes.ts');
    writeFileSync(changed, `export const marker = 'routes-v2';\n`);
    vite!.watcher.emit('change', changed);

    const res = await fetch(`${baseUrl}/api/users.get`);
    expect((await res.json()) as {loads: number}).toMatchObject({loads: 2});
    expect(resets()).toBe(1); // initRoutes would throw "already initialized" without this
  });

  // ############# the batch module rides the same reload #############
  // The client build writes `<root>/.mion/rpc/batches.generated.js`; the import plugin appends an
  // import of it to the entry, so it is a node in the SSR graph and a rewrite is an ordinary
  // change. Its first APPEARANCE is the one case the graph cannot see, hence the `add` listener.
  const BATCH_ENTRY = `
import {initMionRouter} from '@mionjs/router';
import {startNodeServer} from './../platform-stub.js';
globalThis.__mion.loads += 1;
initMionRouter();
startNodeServer();
`;
  const table = (id: string) => new Map([[id, {routes: ['users/getById']}]]);
  const registered = () => Object.keys(((globalThis as any).__mion.batches as Record<string, unknown> | undefined) ?? {});

  it('registers the batch module the client build wrote into this root, with no option', async () => {
    writeBatchesModule(root, root, table('b_first'), new Map());
    await startDevServer({basePath: '/api', entry: BATCH_ENTRY, withBatches: true});
    await fetch(`${baseUrl}/api/users.get`);
    expect(registered()).toEqual(['b_first']);
  });

  it('re-registers the new table when the client rewrites the module, and drops the old ids', async () => {
    writeBatchesModule(root, root, table('b_first'), new Map());
    await startDevServer({basePath: '/api', entry: BATCH_ENTRY, withBatches: true});
    await fetch(`${baseUrl}/api/users.get`);
    expect(registered()).toEqual(['b_first']);

    writeBatchesModule(root, root, table('b_second'), new Map());
    vite!.watcher.emit('change', batchesModulePath(root));

    await fetch(`${baseUrl}/api/users.get`);
    expect(registered()).toEqual(['b_second']);
    expect(resets()).toBe(1);
  });

  it('picks the module up when it appears after the API was first loaded', async () => {
    await startDevServer({basePath: '/api', entry: BATCH_ENTRY, withBatches: true});
    await fetch(`${baseUrl}/api/users.get`);
    expect(registered()).toEqual([]);

    writeBatchesModule(root, root, table('b_late'), new Map());
    vite!.watcher.emit('add', batchesModulePath(root));

    await fetch(`${baseUrl}/api/users.get`);
    expect(registered()).toEqual(['b_late']);
  });

  it('leaves the API alone on a change when hotReload is off', async () => {
    await startDevServer({basePath: '/api', server: {hotReload: false}});
    await fetch(`${baseUrl}/api/users.get`);
    vite!.watcher.emit('change', path.join(root, 'src', 'routes.ts'));
    await fetch(`${baseUrl}/api/users.get`);
    expect(loads()).toBe(1);
    expect(resets()).toBe(0);
  });

  it('survives a broken API instead of taking the dev server down with it', async () => {
    // Through the REAL plugin, so the real `serverReady` signals are wired: its rejection has no
    // consumer in a plain `vite dev`, and an unhandled one kills the process — which is exactly
    // what a single bad import in the API used to do. Vitest fails this test on any unhandled
    // rejection, which is the assertion.
    const plugins = (
      mionVitePlugin({
        server: {startScript: path.join(root, 'src', 'entry.ts'), platform: '/nope.js'},
      }) as unknown as Plugin[]
    )
      .flat()
      .filter((plugin) => (plugin as Plugin)?.name === 'mion-middleware-server');
    writeFileSync(path.join(root, 'src', 'entry.ts'), `throw new Error('broken API');\n`);

    vite = await createServer({
      root,
      configFile: false,
      logLevel: 'silent',
      appType: 'custom',
      server: {middlewareMode: true},
      plugins,
    });
    const devServer = vite;
    http = createHttpServer((req, res) => devServer.middlewares(req, res));
    await new Promise<void>((resolve) => http!.listen(0, resolve));
    const port = (http!.address() as {port: number}).port;

    const res = await fetch(`http://127.0.0.1:${port}/anything`);
    expect(res.status).toBe(503);
    await new Promise((resolve) => setTimeout(resolve, 50)); // let any stray rejection surface
  });

  it('keeps @mionjs/* in one SSR instance', () => {
    const plugin = mionMiddlewarePlugin({startScript: '/srv.ts'}, {onReady: () => {}, onError: () => {}});
    const config = (plugin.config as (c: unknown, e: unknown) => {ssr: {noExternal: RegExp[]}}).call(
      plugin,
      {},
      {command: 'serve', mode: 'development'}
    );
    expect(config.ssr.noExternal.map(String)).toContain(String(/@mionjs\//));
  });
});

describe('runMode selects the lane', () => {
  const pluginNames = (options: MionServerOptions): string[] =>
    (mionVitePlugin({server: options}) as unknown as Plugin[]).flat().map((plugin) => (plugin as Plugin)?.name);

  it('mounts in-process by default — middleware is the idiomatic fullstack mode', () => {
    expect(pluginNames({startScript: '/srv.ts'})).toContain('mion-middleware-server');
  });

  it('still spawns a child process when asked for one', () => {
    const names = pluginNames({startScript: '/srv.ts', runMode: 'childProcess'});
    expect(names).toContain('mion-server-orchestrator');
    expect(names).not.toContain('mion-middleware-server');
  });

  it('never spawns anything in middleware mode', () => {
    expect(pluginNames({startScript: '/srv.ts', runMode: 'middleware'})).not.toContain('mion-server-orchestrator');
  });
});
