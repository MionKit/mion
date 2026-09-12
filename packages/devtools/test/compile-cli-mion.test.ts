// The batch transport through `mion compile`, the tsc-like CLI lane, over a real
// client project and a real server project on disk: the server compile writes
// `<genDir>/rpc/` from the client tsconfig and appends the relativized table import
// to its emitted router-init module; the client compile splices the batch id and
// the mapper hash into its emitted `.js`. Both projects declare the mion packages
// ambiently (the pattern of compile-cli.test.ts), so no built framework package
// is needed; the markers come from the real marker package.
import {describe, expect, it} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {hasBinary, writeMarkerPackage} from './helpers/inline.ts';
import {runCli} from './helpers/cliCrash.ts';

const register = hasBinary() ? it : it.skip;

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
  orders: {getById: (id: number) => {id: number}};
};
export const {routes} = initClient<Routes>();
`;
const CLIENT_TS = `import {batch, inputFrom} from '@mionjs/client';
import {routes} from './routes.ts';
const user = routes.users.getById(1);
export const b = batch([user, routes.orders.getById(inputFrom(user, (u: {id: number}) => u.id))]);
`;
const SERVER_TS = `import {createMionRouter} from '@mionjs/router';
export const mion = createMionRouter();
export const api = mion.initRoutes({});
`;
// A batch written in the SERVER's own program while a client project is named: it never
// reaches the table generated from that client, so the build reports it fatally (BAT008).
const SERVER_OWN_BATCH_TS = `import {batch} from '@mionjs/client';
import {routes} from './routes.ts';
export const own = batch([routes.users.getById(2)]);
`;
const TSCONFIG = `{
  "compilerOptions": {
    "target": "ES2022", "module": "ESNext", "moduleResolution": "Bundler",
    "rootDir": "src", "outDir": "dist", "strict": true,
    "allowImportingTsExtensions": true, "rewriteRelativeImportExtensions": true
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

describe('mion compile — a mion client and a mion server, in two projects', () => {
  register('the server emits rpc/ from --client-tsconfig and imports the table; the client emits its ids', () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-compile-mion-'));
    try {
      const client = writeProject(base, 'client', {'client.d.ts': CLIENT_DTS, 'routes.ts': ROUTES_TS, 'a.ts': CLIENT_TS});
      const server = writeProject(base, 'server', {'router.d.ts': ROUTER_DTS, 'server.ts': SERVER_TS});

      const serverRun = runCli(
        [
          'compile',
          '--cwd',
          server,
          '--tsconfig',
          'tsconfig.json',
          '--client-tsconfig',
          path.join(client, 'tsconfig.json'),
          '--gen-dir',
          path.join(server, '.mion'),
        ],
        {label: 'compile-cli-mion-server'}
      );
      expect(serverRun.status, serverRun.report).toBe(0);

      // the transport is under the SERVER's gen dir, relative imports only, nothing from the client tree
      const table = fs.readFileSync(path.join(server, '.mion', 'rpc', 'batches.generated.js'), 'utf8');
      expect(table).toMatch(/import \{__rt_pf\$2Frt\$2F[A-Za-z0-9_$]+\} from '\.\/pf\/rt\/[^']+\.js';/);
      expect(table).toMatch(/replaceBatches\(\{"b_[A-Za-z0-9_-]+":/);
      expect(table).not.toContain(client);
      expect(table).not.toContain(server);
      const mappers = fs.readdirSync(path.join(server, '.mion', 'rpc', 'pf', 'rt'));
      expect(mappers).toHaveLength(1);
      expect(fs.readFileSync(path.join(server, '.mion', 'rpc', 'pf', 'rt', mappers[0]), 'utf8')).toContain('u.id');

      // the emitted router-init module ends with the import, relativized from dist/ to .mion/rpc/
      const serverJs = fs.readFileSync(path.join(server, 'dist', 'server.js'), 'utf8');
      expect(serverJs).not.toContain('rtrpc:');
      expect(serverJs).toContain("import '../.mion/rpc/batches.generated.js';");
      expect(serverJs).toContain('createMionRouter(');

      // the client compile carries the same batch id and mapper hash the table registers
      const clientRun = runCli(
        ['compile', '--cwd', client, '--tsconfig', 'tsconfig.json', '--gen-dir', path.join(client, '.mion')],
        {
          label: 'compile-cli-mion-client',
        }
      );
      expect(clientRun.status, clientRun.report).toBe(0);
      const clientJs = fs.readFileSync(path.join(client, 'dist', 'a.js'), 'utf8');
      const batchId = /'(b_[A-Za-z0-9_-]+)'/.exec(clientJs)?.[1];
      const mapperKey = /'(rt::[A-Za-z0-9_-]+)'/.exec(clientJs)?.[1];
      expect(batchId, clientJs).toBeDefined();
      expect(mapperKey, clientJs).toBeDefined();
      expect(table).toContain(`"${batchId}"`);
      expect(table).toContain(`'${mapperKey}'`);
      // a client is not a server: no rpc/ of its own, no import appended
      expect(fs.existsSync(path.join(client, '.mion', 'rpc'))).toBe(false);
      expect(clientJs).not.toContain('batches.generated');
    } finally {
      fs.rmSync(base, {recursive: true, force: true});
    }
  });

  // The release gate rode into this on main: the pre-publish e2e consumer compiled with
  // --client-tsconfig while its own program still pulled in the vitest specs, which batch
  // against the running server. BAT008 was a warning when the fixture was written and is a
  // RuntimeError now, so the compile exits 1 and the whole lane dies. Pin the exit code here,
  // on the host, rather than only in the container the gate runs.
  register('a batch in the server program itself fails the compile with BAT008', () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-compile-mion-own-'));
    try {
      const client = writeProject(base, 'client', {'client.d.ts': CLIENT_DTS, 'routes.ts': ROUTES_TS, 'a.ts': CLIENT_TS});
      const server = writeProject(base, 'server', {
        'client.d.ts': CLIENT_DTS,
        'router.d.ts': ROUTER_DTS,
        'routes.ts': ROUTES_TS,
        'server.ts': SERVER_TS,
        'ownBatch.ts': SERVER_OWN_BATCH_TS,
      });

      const run = runCli(
        [
          'compile',
          '--cwd',
          server,
          '--tsconfig',
          'tsconfig.json',
          '--client-tsconfig',
          path.join(client, 'tsconfig.json'),
          '--gen-dir',
          path.join(server, '.mion'),
        ],
        {label: 'compile-cli-mion-own-batch'}
      );
      expect(run.status, run.report).not.toBe(0);
      expect(`${run.stdout}${run.stderr}`).toContain('BAT008');
      expect(`${run.stdout}${run.stderr}`).toContain('ownBatch.ts');
    } finally {
      fs.rmSync(base, {recursive: true, force: true});
    }
  });
});

// The bundled-API lane through the same CLI: a server project whose initRoutes call the build
// walks into a server manifest, a client project built with --bundle-api against the server's
// tsconfig (its route types come from the server program), and `mion api-check` over the two gen
// dirs, the prerelease gate for a split deployment.
const API_ROUTER_DTS = `declare module '@mionjs/router' {
  type Handler = (...args: any[]) => any;
  type Opts = {alwaysRun: false; validateParams: true; validateReturn: false; description: undefined; encoder: {params: 'clone'; return: 'clone'}; isMutation: undefined; strictTypes: undefined; sanitizeParams: undefined};
  export type PublicApi<R> = {
    [K in keyof R]: R[K] extends {type: infer T; handler: infer H extends Handler}
      ? {type: T; handler: H; options: Opts; types?: {params: Parameters<H>; return: Awaited<ReturnType<H>>; headers: never; isAsync: false}}
      : PublicApi<R[K]>;
  };
  export interface MionRouter { initRoutes<R>(routes: R): PublicApi<R> }
  export function createMionRouter(): MionRouter;
}
`;
function apiServerTs(extraParam: boolean): string {
  const getById = extraParam
    ? 'handler: (id: number, verbose: boolean, tenant: string): {id: number; name: string} => ({id, name: tenant})'
    : "handler: (id: number, verbose: boolean): {id: number; name: string} => ({id, name: ''})";
  return `import {createMionRouter} from '@mionjs/router';
export const mion = createMionRouter();
export const api = mion.initRoutes({users: {getById: {type: 1 as const, ${getById}}}, sum: {type: 1 as const, handler: (a: number, b: number): number => a + b}});
`;
}
const API_CLIENT_DTS = `declare module '@mionjs/client' {
  import type {InjectApiMetadata} from '@mionjs/run-types';
  export interface RouteSubRequest<PH, Id extends string = string, RA = any> {
    id: Id;
    call(setup?: unknown, apiMetadata?: InjectApiMetadata<RA, Id>): Promise<unknown>;
  }
  type Handler = (...args: any[]) => any;
  export type ClientRoutes<RA, Prefix extends string = '', Root = RA> = {
    [K in keyof RA as RA[K] extends {type: 1} ? K : RA[K] extends {type: number} ? never : K]: RA[K] extends {type: 1; handler: infer H extends Handler}
      ? (...params: Parameters<H>) => RouteSubRequest<H, \`\${Prefix}\${K & string}\`, Root>
      : ClientRoutes<RA[K], \`\${Prefix}\${K & string}/\`, Root>;
  };
  export function initClient<RA>(o?: unknown): {routes: ClientRoutes<RA>};
  export function setBundleApiMode(mode: 'bundled' | 'mixed'): void;
}
`;
// The client's own view of the API leaves out the boolean the server declares: with --api-tsconfig
// the server program answers, so the compiled validators carry it anyway.
const API_CLIENT_TS = `import {initClient} from '@mionjs/client';
type RouteOpts = {alwaysRun: false; validateParams: true; validateReturn: false; description: undefined; encoder: {params: 'clone'; return: 'clone'}; isMutation: undefined; strictTypes: undefined; sanitizeParams: undefined};
type Api = {
  users: {getById: {type: 1; handler: (id: number) => Promise<{id: number; name: string}>; options: RouteOpts; types?: {params: [id: number]; return: {id: number; name: string}; headers: never; isAsync: false}}};
  sum: {type: 1; handler: (a: number, b: number) => Promise<number>; options: RouteOpts; types?: {params: [a: number, b: number]; return: number; headers: never; isAsync: false}};
};
export const {routes} = initClient<Api>({baseURL: 'http://x'});
export const a = routes.users.getById(1).call();
`;

/** Every file under dir, recursively, as its text. */
function readTree(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...readTree(full));
    else out.push(fs.readFileSync(full, 'utf8'));
  }
  return out;
}

function readManifest(genDir: string): {kind: string; mode?: string; methods: Record<string, {paramsId: string}>} {
  return JSON.parse(fs.readFileSync(path.join(genDir, 'api', 'manifest.json'), 'utf8'));
}

describe('mion compile + api-check — a bundled client against its server', () => {
  register('both builds write a manifest, api-check passes, and fails after a server-side type edit', () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-compile-apicheck-'));
    try {
      const server = writeProject(base, 'server', {'router.d.ts': API_ROUTER_DTS, 'server.ts': apiServerTs(false)});
      const client = writeProject(base, 'client', {'client.d.ts': API_CLIENT_DTS, 'a.ts': API_CLIENT_TS});
      const serverGen = path.join(server, '.mion');
      const clientGen = path.join(client, '.mion');
      const compileServer = () =>
        runCli(['compile', '--cwd', server, '--tsconfig', 'tsconfig.json', '--gen-dir', serverGen], {label: 'apicheck-server'});
      const apiCheck = (clientDir: string) =>
        runCli(['api-check', '--server-gen-dir', serverGen, '--client-gen-dir', clientDir], {label: 'apicheck'});

      // the server: no bundleApi, but its initRoutes call yields the server manifest
      const serverRun = compileServer();
      expect(serverRun.status, serverRun.report).toBe(0);
      const serverManifest = readManifest(serverGen);
      expect(serverManifest.kind).toBe('server');
      expect(Object.keys(serverManifest.methods).sort()).toEqual(['sum', 'users/getById']);

      // the client: bundled, its route types resolved in the server program
      const clientRun = runCli(
        [
          'compile',
          '--cwd',
          client,
          '--tsconfig',
          'tsconfig.json',
          '--gen-dir',
          clientGen,
          '--bundle-api',
          'bundled',
          '--api-tsconfig',
          path.join(server, 'tsconfig.json'),
        ],
        {label: 'apicheck-client'}
      );
      expect(clientRun.status, clientRun.report).toBe(0);
      const clientManifest = readManifest(clientGen);
      expect(clientManifest.kind).toBe('client');
      expect(clientManifest.mode).toBe('bundled');
      expect(Object.keys(clientManifest.methods)).toEqual(['users/getById']);
      expect(clientManifest.methods['users/getById'].paramsId).toBe(serverManifest.methods['users/getById'].paramsId);
      // the emitted client imports the lane module and the site module at the call, both relativized
      const clientJs = fs.readFileSync(path.join(client, 'dist', 'a.js'), 'utf8');
      expect(clientJs).toMatch(/import '(\.\.\/)+\.mion\/api\/lane\.js';/);
      expect(clientJs).toMatch(/import \{ ?__rt_s\$2F[A-Za-z0-9_$]+ ?\} from '\.\.\/\.mion\/api\/[^']+\.js';/);
      expect(clientJs).not.toContain('rtapi:');
      // the mode is in the module the build wrote, not spliced into the call
      expect(clientJs).not.toContain("'bundled'");
      expect(fs.readFileSync(path.join(clientGen, 'api', 'lane.js'), 'utf8')).toContain("setBundleApiMode('bundled')");
      // the validators came from the server program: they check the boolean the client never declared
      const typeModules = readTree(path.join(clientGen, 'api', 'types'));
      expect(typeModules.some((source) => source.includes('boolean'))).toBe(true);

      const pass = apiCheck(clientGen);
      expect(pass.status, pass.report).toBe(0);
      expect(pass.stdout).toContain('1 bundled method(s) match');

      // the server grows a parameter and is rebuilt; the client built against the old server no longer matches
      fs.writeFileSync(path.join(server, 'src', 'server.ts'), apiServerTs(true));
      const rebuilt = compileServer();
      expect(rebuilt.status, rebuilt.report).toBe(0);
      const fail = apiCheck(clientGen);
      expect(fail.status).toBe(1);
      expect(fail.stderr).toContain('users/getById: paramsId differs');
      expect(fail.stderr).toContain('1 mismatch(es)');

      // a build output without a manifest is a usage problem, not a mismatch
      const missing = apiCheck(path.join(base, 'nowhere'));
      expect(missing.status).toBe(2);
      expect(missing.stderr).toContain('client manifest');
    } finally {
      fs.rmSync(base, {recursive: true, force: true});
    }
  });
});
