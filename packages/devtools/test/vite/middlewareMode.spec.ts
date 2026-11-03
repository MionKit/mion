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
import {mionMiddlewarePlugin} from '../../src/vite/middlewareMode.ts';
import {mionVitePlugin} from '../../src/vite/mionVitePlugin.ts';
import type {MionServerOptions} from '../../src/vite/mionVitePlugin.ts';
import type {Plugin} from 'vite';

// The mion API mounted INSIDE a REAL vite dev server, over temp fixtures: the middleware only ever
// exists inside `configureServer`, so nothing short of an actual dev server + an actual HTTP request
// proves it forwards, falls through, or fails the way it claims.
//
// `@mionjs/router` and the platform adapters are STUBBED through resolve.alias (the isolation trick
// batchesBuild.spec.ts uses): what is under test is the mount mechanism — which module is
// loaded, what is asked of it, and which requests reach it — not route dispatch, which would drag
// the mion resolver and a real program into a dev-server test.

const ROUTER_STUB = (basePath: string) => `
globalThis.__mion = globalThis.__mion ?? {loads: 0, resets: 0, platformConfig: undefined, host: {}};
globalThis.__mion.routerCopies = (globalThis.__mion.routerCopies ?? 0) + 1;
globalThis.__mion.host = {}; // per copy, like the real router: a fresh copy owns nothing until the host says so
export const setHostOwnsSocket = (owns) => {globalThis.__mion.host = owns ? {...globalThis.__mion.host, owns} : {};};
export const hostOwnsSocket = () => globalThis.__mion.host.owns === true;
export const handOverToHost = (handler) => {
  if (globalThis.__mion.host.owns) globalThis.__mion.host.handler = handler;
  return globalThis.__mion.host.owns === true;
};
export const getHostRequestHandler = () => globalThis.__mion.host.handler;
export const getRouterOptions = () => ({basePath: ${JSON.stringify(basePath)}});
export const getPlatformConfig = () => globalThis.__mion.platformConfig;
export const setPlatformConfig = (config) => {globalThis.__mion.platformConfig = config;};
export const resetRouter = () => {globalThis.__mion.resets += 1; globalThis.__mion.platformConfig = undefined;};
export const createMionRouter = () => ({initRoutes: () => ({})});
export const replaceBatches = (table) => {globalThis.__mion.batches = table;};
`;

/** @mionjs/core stub: the generated batch module imports the tuple registrar from it. */
const CORE_STUB = `export const registerInputMapperTuple = () => {};
`;

/** Node-style adapter stub: same export names @mionjs/platform-node uses, and the same reaction to the host flag. */
const NODE_PLATFORM_STUB = `
import {setPlatformConfig, handOverToHost} from '@mionjs/router';
let opts = {asMiddleware: false};
export const setNodeHttpOpts = (patch) => (opts = {...opts, ...patch});
export const startNodeServer = () => {
    const asMiddleware = handOverToHost({node: httpRequestHandler}) || opts.asMiddleware;
    setPlatformConfig({...opts, asMiddleware});
};
export function httpRequestHandler(req, res) {
    res.statusCode = 200;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({served: 'node', url: req.url, method: req.method, loads: globalThis.__mion.loads}));
}
`;

/** Fetch-style adapter stub: same shape as @mionjs/platform-bun's bunRequestHandler. */
const FETCH_PLATFORM_STUB = `
import {setPlatformConfig, handOverToHost} from '@mionjs/router';
let opts = {asMiddleware: false};
export const setBunHttpOpts = (patch) => (opts = {...opts, ...patch});
export const startBunServer = () => {
    const asMiddleware = handOverToHost({fetch: bunRequestHandler}) || opts.asMiddleware;
    setPlatformConfig({...opts, asMiddleware});
};
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
  let plugin: ReturnType<typeof mionMiddlewarePlugin>;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'mion-middleware-'));
    mkdirSync(path.join(root, 'src'), {recursive: true});
    (globalThis as any).__mion = {loads: 0, resets: 0, platformConfig: undefined, host: {}};
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
    /** Replaces the @mionjs/platform-node stub, the adapter an entry that starts none falls back to. */
    nodePlatformStub?: string;
    server?: Partial<MionServerOptions>;
    /** The vite root, relative to the fixture dir; the entry stays at `src/entry.ts`. */
    viteRoot?: string;
  }): Promise<void> {
    const routerPath = path.join(root, 'router-stub.js');
    const corePath = path.join(root, 'core-stub.js');
    const platformPath = path.join(root, 'platform-stub.js');
    const nodePlatformPath = path.join(root, 'platform-node-stub.js');
    const entryPath = path.join(root, 'src', 'entry.ts');
    writeFileSync(routerPath, ROUTER_STUB(opts.basePath ?? '/api'));
    writeFileSync(corePath, CORE_STUB);
    writeFileSync(platformPath, opts.platformStub ?? NODE_PLATFORM_STUB);
    writeFileSync(nodePlatformPath, opts.nodePlatformStub ?? NODE_PLATFORM_STUB);
    writeFileSync(path.join(root, 'src', 'routes.ts'), ROUTES);
    writeFileSync(entryPath, opts.entry ?? ENTRY(platformPath));

    const serverOptions: MionServerOptions = {entry: entryPath, ...opts.server};
    const viteRoot = path.join(root, opts.viteRoot ?? '.');
    mkdirSync(viteRoot, {recursive: true});
    vite = await createServer({
      root: viteRoot,
      configFile: false,
      logLevel: 'silent',
      appType: 'custom', // no SPA fallback: an unmatched request must 404, not return index.html
      // No real fs watcher: each test signals its edits with watcher.emit, and chokidar's own event for the
      // same write could land after the first reload and load the API a third time.
      server: {middlewareMode: true, watch: null},
      resolve: {alias: {'@mionjs/router': routerPath, '@mionjs/core': corePath, '@mionjs/platform-node': nodePlatformPath}},
      plugins: [
        (plugin = mionMiddlewarePlugin(serverOptions, {
          onReady: () => (ready.resolved = true),
          onError: (err) => (ready.error = err),
        })),
      ],
    });
    const devServer = vite;
    http = createHttpServer((req, res) => devServer.middlewares(req, res));
    await new Promise<void>((resolve) => http!.listen(0, resolve));
    baseUrl = `http://127.0.0.1:${(http!.address() as {port: number}).port}`;
  }

  const loads = () => (globalThis as any).__mion.loads as number;
  const resets = () => (globalThis as any).__mion.resets as number;
  const routerCopies = () => (globalThis as any).__mion.routerCopies as number;
  const editRoutes = (marker: string) => {
    const changed = path.join(root, 'src', 'routes.ts');
    writeFileSync(changed, `export const marker = '${marker}';\n`);
    vite!.watcher.emit('change', changed);
  };

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

  it('signals onReady once the API is mounted', async () => {
    await startDevServer({basePath: '/api'});
    await fetch(`${baseUrl}/api/users.get`);
    expect(ready.resolved).toBe(true);
    expect(ready.error).toBeUndefined();
  });

  it('answers 503 with the real cause when the entry throws, and reports it to onError', async () => {
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

  it('takes the handler from the entry itself before any adapter', async () => {
    const entry = `
globalThis.__mion.loads += 1;
export function requestHandler() {
    return new Response(JSON.stringify({served: 'entry'}), {headers: {'content-type': 'application/json'}});
}
`;
    await startDevServer({basePath: '/api', entry});
    const res = await fetch(`${baseUrl}/api/users.get`);
    expect(((await res.json()) as {served: string}).served).toBe('entry');
  });

  it("prefers the entry's own handler over the one a started adapter handed over", async () => {
    const platformPath = path.join(root, 'platform-stub.js');
    const entry = `
import {startNodeServer} from ${JSON.stringify(platformPath)};
globalThis.__mion.loads += 1;
startNodeServer();
export function requestHandler() {
    return new Response(JSON.stringify({served: 'entry'}), {headers: {'content-type': 'application/json'}});
}
`;
    await startDevServer({basePath: '/api', entry});
    const res = await fetch(`${baseUrl}/api/users.get`);
    expect(((await res.json()) as {served: string}).served).toBe('entry');
    expect((globalThis as any).__mion.host.handler?.node).toBeTypeOf('function');
  });

  it('resolves a relative server.entry against the vite root, not the working directory', async () => {
    expect(root).not.toBe(process.cwd());
    await startDevServer({basePath: '/api', server: {entry: 'src/entry.ts'}});
    const res = await fetch(`${baseUrl}/api/users.get`);
    expect(((await res.json()) as {served: string}).served).toBe('node');
  });

  it('keeps why the node adapter failed to load as the cause of the no-handler error', async () => {
    await startDevServer({
      basePath: '/api',
      entry: `import './routes.ts';\nglobalThis.__mion.loads += 1;\n`,
      nodePlatformStub: `throw new Error('adapter is broken');\n`,
    });
    const res = await fetch(`${baseUrl}/api/users.get`);
    expect(res.status).toBe(503);
    expect(ready.error?.message).toMatch(/found no request handler/);
    expect(String((ready.error?.cause as Error | undefined)?.message)).toContain('adapter is broken');
  });

  it('never sets the host flag once the server is closing, even for a load still in flight', async () => {
    await startDevServer({basePath: '/api'});
    (plugin.closeBundle as () => void).call(plugin);
    await fetch(`${baseUrl}/api/users.get`);
    expect((globalThis as any).__mion.host.owns).toBeUndefined();
  });

  it('keeps the host flag until a loading entry finished, so its adapter never listens', async () => {
    const entry = `import './routes.ts';
await new Promise((resolve) => setTimeout(resolve, 200));
globalThis.__mion.ownedAtStart = globalThis.__mion.host.owns;
`;
    await startDevServer({basePath: '/api', entry});
    void fetch(`${baseUrl}/api/users.get`).catch(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, 50));
    await (plugin.closeBundle as () => Promise<void>).call(plugin);
    expect((globalThis as any).__mion.ownedAtStart).toBe(true);
    expect((globalThis as any).__mion.host.owns).toBeUndefined();
  });

  it('serves an entry that only registers routes through the node adapter', async () => {
    await startDevServer({basePath: '/api', entry: `import './routes.ts';\nglobalThis.__mion.loads += 1;\n`});
    const res = await fetch(`${baseUrl}/api/users.get`);
    expect(((await res.json()) as {served: string}).served).toBe('node');
  });

  it('clears the host flag when the dev server closes, so a later server in the process listens', async () => {
    await startDevServer({basePath: '/api'});
    await fetch(`${baseUrl}/api/users.get`);
    expect((globalThis as any).__mion.host.owns).toBe(true);
    await (vite as ViteDevServer).close();
    vite = undefined;
    expect((globalThis as any).__mion.host.owns).toBeUndefined();
  });

  it('re-loads a fresh copy of the API after a source change, router included, with no reset', async () => {
    await startDevServer({basePath: '/api'});
    await fetch(`${baseUrl}/api/users.get`);
    expect(loads()).toBe(1);
    expect(routerCopies()).toBe(1);

    editRoutes('routes-v2');

    const res = await fetch(`${baseUrl}/api/users.get`);
    expect((await res.json()) as {loads: number}).toMatchObject({loads: 2});
    expect(routerCopies()).toBe(2);
    expect(resets()).toBe(0);
  });

  it('makes every request that arrives during a reload wait for it, none answered by a half-loaded API', async () => {
    // A slow entry: the reload is in flight while the requests arrive.
    const entry = `import {startNodeServer} from ${JSON.stringify(path.join(root, 'platform-stub.js'))};
import './routes.ts';
await new Promise((resolve) => setTimeout(resolve, 100));
globalThis.__mion.loads += 1;
startNodeServer();
`;
    await startDevServer({basePath: '/api', entry});
    await fetch(`${baseUrl}/api/users.get`);
    editRoutes('routes-v2');

    const answers = await Promise.all(Array.from({length: 20}, () => fetch(`${baseUrl}/api/users.get`)));
    expect(answers.map((res) => res.status)).toEqual(Array(20).fill(200));
    const bodies = (await Promise.all(answers.map((res) => res.json()))) as {loads: number}[];
    expect(bodies.map((body) => body.loads)).toEqual(Array(20).fill(2));
    expect(loads()).toBe(2);
  });

  it('re-loads an entry that sits outside the vite root (a Nuxt layout, root at app/)', async () => {
    await startDevServer({basePath: '/api', viteRoot: 'app'});
    await fetch(`${baseUrl}/api/users.get`);
    editRoutes('routes-v2');
    const res = await fetch(`${baseUrl}/api/users.get`);
    expect((await res.json()) as {loads: number}).toMatchObject({loads: 2});
  });

  it('reloads after an edit made while the first load was still running', async () => {
    const entry = `import {startNodeServer} from ${JSON.stringify(path.join(root, 'platform-stub.js'))};
import './routes.ts';
await new Promise((resolve) => setTimeout(resolve, 150));
globalThis.__mion.loads += 1;
startNodeServer();
`;
    await startDevServer({basePath: '/api', entry});
    const first = fetch(`${baseUrl}/api/users.get`);
    await new Promise((resolve) => setTimeout(resolve, 50));
    editRoutes('routes-v2');
    await first;
    const res = await fetch(`${baseUrl}/api/users.get`);
    expect((await res.json()) as {loads: number}).toMatchObject({loads: 2});
  });

  it('serves a request sent after a mid-reload edit from the reload that saw the edit', async () => {
    const entry = `import {startNodeServer} from ${JSON.stringify(path.join(root, 'platform-stub.js'))};
import './routes.ts';
await new Promise((resolve) => setTimeout(resolve, 150));
globalThis.__mion.loads += 1;
startNodeServer();
`;
    await startDevServer({basePath: '/api', entry});
    await fetch(`${baseUrl}/api/users.get`);
    editRoutes('routes-v2');
    const duringFirstReload = fetch(`${baseUrl}/api/users.get`);
    await new Promise((resolve) => setTimeout(resolve, 50));
    editRoutes('routes-v3');
    const afterSecondEdit = await fetch(`${baseUrl}/api/users.get`);
    await duringFirstReload;
    expect((await afterSecondEdit.json()) as {loads: number}).toMatchObject({loads: 3});
  });

  it('after a failed load, retries on an edit to a file the failed load never reached', async () => {
    writeFileSync(
      path.join(root, 'src', 'broken.ts'),
      `globalThis.__mion.attempts = (globalThis.__mion.attempts ?? 0) + 1;\nthrow new Error('broken');\n`
    );
    await startDevServer({basePath: '/api', entry: `import './broken.ts';\nimport './routes.ts';\n`});
    expect((await fetch(`${baseUrl}/api/users.get`)).status).toBe(503);
    expect((globalThis as any).__mion.attempts).toBe(1);
    const unrelated = path.join(root, 'src', 'helper.ts');
    writeFileSync(unrelated, `export const helper = 1;\n`);
    vite!.watcher.emit('change', unrelated);
    await fetch(`${baseUrl}/api/users.get`);
    expect((globalThis as any).__mion.attempts).toBe(2);
  });

  it('leaves the API alone when the changed file is not part of it', async () => {
    await startDevServer({basePath: '/api'});
    await fetch(`${baseUrl}/api/users.get`);
    const other = path.join(root, 'src', 'page.ts');
    writeFileSync(other, `export const page = 1;\n`);
    vite!.watcher.emit('change', other);
    await fetch(`${baseUrl}/api/users.get`);
    expect(loads()).toBe(1);
  });

  it('answers 503 while the last reload failed, and recovers on the edit that fixes it', async () => {
    await startDevServer({basePath: '/api'});
    await fetch(`${baseUrl}/api/users.get`);
    const routes = path.join(root, 'src', 'routes.ts');
    writeFileSync(routes, `throw new Error('typo in routes');\n`);
    vite!.watcher.emit('change', routes);
    const broken = await fetch(`${baseUrl}/api/users.get`);
    expect(broken.status).toBe(503);
    expect(await broken.text()).toContain('typo in routes');

    editRoutes('routes-v3');
    const fixed = await fetch(`${baseUrl}/api/users.get`);
    expect(fixed.status).toBe(200);
  });

  it('lets page navigations through when the API failed before its basePath was known', async () => {
    await startDevServer({basePath: '/api', entry: `throw new Error('broken API');\n`});
    const page = await fetch(`${baseUrl}/`, {headers: {accept: 'text/html'}});
    expect(page.status).toBe(404); // vite's own answer (appType custom): the app is reachable
    const api = await fetch(`${baseUrl}/api/users.get`, {method: 'POST'});
    expect(api.status).toBe(503);
  });

  // ############# the batch module rides the same reload #############
  // The transform appends the table's import to the router-init module, so a rewrite is an ordinary graph change.
  // Its first APPEARANCE (or removal) reaches no watcher in time, so the preset marks the API stale itself.
  // The transform is the Go side's job: here the entry imports the module directly, as a transformed one would.
  const batchesModule = () => path.join(root, '.mion', 'rpc', 'batches.generated.js');
  const BATCH_ENTRY = `
import {createMionRouter} from '@mionjs/router';
import {startNodeServer} from './../platform-stub.js';
import '../.mion/rpc/batches.generated.js';
globalThis.__mion.loads += 1;
createMionRouter().initRoutes({});
startNodeServer();
`;
  const writeTable = (id: string) => {
    mkdirSync(path.dirname(batchesModule()), {recursive: true});
    writeFileSync(
      batchesModule(),
      `import {replaceBatches} from '@mionjs/router';\nreplaceBatches(${JSON.stringify({[id]: {routes: ['users/getById']}})});\n`
    );
  };
  const registered = () => Object.keys(((globalThis as any).__mion.batches as Record<string, unknown> | undefined) ?? {});

  it('registers the generated batch module the entry imports, with no option', async () => {
    writeTable('b_first');
    await startDevServer({basePath: '/api', entry: BATCH_ENTRY});
    await fetch(`${baseUrl}/api/users.get`);
    expect(registered()).toEqual(['b_first']);
  });

  it('re-registers the new table when the resolver rewrites the module, and drops the old ids', async () => {
    writeTable('b_first');
    await startDevServer({basePath: '/api', entry: BATCH_ENTRY});
    await fetch(`${baseUrl}/api/users.get`);
    expect(registered()).toEqual(['b_first']);

    writeTable('b_second');
    vite!.watcher.emit('change', batchesModule());

    await fetch(`${baseUrl}/api/users.get`);
    expect(registered()).toEqual(['b_second']);
  });

  it('reloads when the preset marks the API stale: the table appeared, and no file event says so', async () => {
    // a server started before its client had a batch: the module the entry imports is still an empty stub
    mkdirSync(path.dirname(batchesModule()), {recursive: true});
    writeFileSync(batchesModule(), 'export {};\n');
    await startDevServer({basePath: '/api', entry: BATCH_ENTRY});
    await fetch(`${baseUrl}/api/users.get`);
    expect(registered()).toEqual([]);

    writeTable('b_late');
    plugin.markStale();

    await fetch(`${baseUrl}/api/users.get`);
    expect(registered()).toEqual(['b_late']);
  });

  it('leaves the API alone on a change, or a stale mark, when hotReload is off', async () => {
    await startDevServer({basePath: '/api', server: {hotReload: false}});
    await fetch(`${baseUrl}/api/users.get`);
    vite!.watcher.emit('change', path.join(root, 'src', 'routes.ts'));
    plugin.markStale();
    await fetch(`${baseUrl}/api/users.get`);
    expect(loads()).toBe(1);
  });

  it('survives a broken API instead of taking the dev server down with it', async () => {
    // Through the REAL plugin, so the preset's own signals are wired: a broken API must surface as
    // a 503 and NOT as an unhandled rejection that kills the process, which is exactly what a
    // single bad import in the API used to do. Vitest fails this test on any unhandled rejection,
    // which is the assertion.
    const plugins = (
      mionVitePlugin({
        server: {entry: path.join(root, 'src', 'entry.ts')},
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
    const plugin = mionMiddlewarePlugin({entry: '/srv.ts'}, {onReady: () => {}, onError: () => {}});
    const config = (plugin.config as (c: unknown, e: unknown) => {ssr: {noExternal: RegExp[]}}).call(
      plugin,
      {},
      {command: 'serve', mode: 'development'}
    );
    expect(config.ssr.noExternal.map(String)).toContain(String(/@mionjs\//));
  });
});

describe('the server block mounts in-process, and only in-process', () => {
  const pluginNames = (options: MionServerOptions): string[] =>
    (mionVitePlugin({server: options}) as unknown as Plugin[]).flat().map((plugin) => (plugin as Plugin)?.name);

  it('mounts in-process — one program, one process, no lane to choose', () => {
    expect(pluginNames({entry: '/srv.ts'})).toContain('mion-middleware-server');
  });

  it('adds the server-bundle plugin only when server.build asks for it', () => {
    expect(pluginNames({entry: '/srv.ts'})).not.toContain('mion-server-bundle');
    expect(pluginNames({entry: '/srv.ts', build: {}})).toContain('mion-server-bundle');
  });
});
