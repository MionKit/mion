// A SERVER dev server with a SEPARATE client project (`client.tsConfig`): the
// resolver generates the batch transport from the client program, the server's
// router-init module imports it, and a client edit is picked up while the dev
// server runs. The client files live outside the server root, so nothing in
// vite's graph names them: the core plugin registers them on the watcher from
// the generate echo and regenerates on a change (the resolver rebuilds the
// client program from its file stamps).
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createServer, type ViteDevServer} from 'vite';
import {BIN, hasBinary, writeMarkerPackage} from './helpers/inline.ts';
import {mionVitePlugin} from '../src/vite/index.ts';

const register = hasBinary() ? describe : describe.skip;

const CLIENT_DTS = `declare module '@mionjs/client' {
  import type {PureFunction, InjectPureFnHash, InjectBatchId} from '@mionjs/run-types';
  export interface RouteSubRequest<PH> { id: string }
  export type ClientRoutes<RA> = { [K in keyof RA]: RA[K] extends (...a: infer P) => infer R ? (...p: P) => RouteSubRequest<RA[K]> : ClientRoutes<RA[K]> };
  export function initClient<RA>(o?: unknown): {client: unknown; routes: ClientRoutes<RA>};
  export interface InputFromRef<F> { asArg(): ReturnType<F> }
  export function inputFrom<S extends RouteSubRequest<any>, M = any>(source: S, name: string): InputFromRef<(v: any) => M>;
  export function inputFrom<S extends RouteSubRequest<any>, M = any>(source: S, mapper: PureFunction<(v: any) => M>, hash?: InjectPureFnHash<(v: any) => M>): InputFromRef<(v: any) => M>;
  export function batch<R extends RouteSubRequest<any>[]>(routes: [...R], batchId?: InjectBatchId<R>): unknown;
}
`;
const ROUTER_DTS = `declare module '@mionjs/router' {
  export function createMionRouter(opts?: unknown): {initRoutes: (routes: unknown) => unknown};
}
`;
const ROUTES_TS = `import {initClient} from '@mionjs/client';
export type Routes = {
  users: {getById: (id: number) => {id: number; name: string}};
  orders: {getById: (id: number) => {id: number}; list: (userId: number) => string[]};
};
export const {routes} = initClient<Routes>();
`;
const CLIENT_ONE = `import {batch, inputFrom} from '@mionjs/client';
import {routes} from './routes.ts';
const user = routes.users.getById(1);
export const b = batch([user, routes.orders.getById(inputFrom(user, (u: {id: number}) => u.id))]);
`;
const CLIENT_TWO = CLIENT_ONE + `export const c = batch([routes.orders.list(1)]);\n`;
const SERVER_TS = `import {createMionRouter} from '@mionjs/router';
export const mion = createMionRouter();
export const api = mion.initRoutes({});
`;
const TSCONFIG = `{
  "compilerOptions": {
    "target": "ES2022", "module": "ESNext", "moduleResolution": "Bundler",
    "strict": true, "noEmit": true, "allowImportingTsExtensions": true
  },
  "include": ["src"]
}
`;

function writeProject(base: string, name: string, files: Record<string, string>): string {
  const dir = path.join(base, name);
  fs.mkdirSync(path.join(dir, 'src'), {recursive: true});
  writeMarkerPackage(dir);
  fs.writeFileSync(path.join(dir, 'tsconfig.json'), TSCONFIG);
  for (const [rel, content] of Object.entries(files)) fs.writeFileSync(path.join(dir, 'src', rel), content);
  return dir;
}

async function waitFor(check: () => boolean, what: string, timeoutMs = 15000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`timed out waiting for ${what}`);
}

const batchIds = (file: string): string[] =>
  fs.existsSync(file) ? [...fs.readFileSync(file, 'utf8').matchAll(/"(b_[A-Za-z0-9_-]+)"/g)].map((match) => match[1]) : [];

register('client.tsConfig — a separate client project, refreshed while the server dev server runs', () => {
  let base = '';
  let vite: ViteDevServer | undefined;

  beforeEach(() => {
    base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'mion-client-refresh-')));
  });
  afterEach(async () => {
    await vite?.close();
    vite = undefined;
    fs.rmSync(base, {recursive: true, force: true});
  });

  it('generates the transport from the client project, imports it, and follows a client edit', async () => {
    const client = writeProject(base, 'client', {'client.d.ts': CLIENT_DTS, 'routes.ts': ROUTES_TS, 'a.ts': CLIENT_ONE});
    const server = writeProject(base, 'server', {'router.d.ts': ROUTER_DTS, 'server.ts': SERVER_TS});
    const genDir = path.join(server, '.mion');
    const table = path.join(genDir, 'rpc', 'batches.generated.js');

    vite = await createServer({
      root: server,
      configFile: false,
      logLevel: 'silent',
      server: {middlewareMode: true},
      plugins: mionVitePlugin({
        runTypes: {tsConfig: path.join(server, 'tsconfig.json'), binary: BIN, genDir},
        client: {tsConfig: path.join(client, 'tsconfig.json')},
      }),
    });
    // vite runs buildStart (the whole-program generate) as the server initialises
    await waitFor(() => fs.existsSync(table), 'the batch table from the client project');
    expect(batchIds(table)).toHaveLength(1);
    const mappers = fs.readdirSync(path.join(genDir, 'rpc', 'pf', 'rt'));
    expect(mappers).toHaveLength(1);

    // the server's router-init module gets the import appended (vite's SSR transform has already
    // turned the relative specifier into a root-relative one by the time it hands the code back)
    const transformed = await vite.transformRequest('/src/server.ts', {ssr: true});
    expect(transformed?.code).toContain('/.mion/rpc/batches.generated.js');

    // a client edit (outside the server root) regenerates: the second batch lands in the table
    fs.writeFileSync(path.join(client, 'src', 'a.ts'), CLIENT_TWO);
    await waitFor(() => batchIds(table).length === 2, 'the regenerated table after the client edit');
    expect(fs.readdirSync(path.join(genDir, 'rpc', 'pf', 'rt'))).toEqual(mappers);
  });
});
