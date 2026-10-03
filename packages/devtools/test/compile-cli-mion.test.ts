// The batch transport through `mion compile` over a real fullstack project on disk. The mion packages are
// declared ambiently (as in compile-cli.test.ts), so no built framework package is needed.
import {describe, expect, it} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {hasBinary, writeMarkerPackage} from './helpers/inline.ts';
import {runCli} from './helpers/cliCrash.ts';

const register = hasBinary() ? it : it.skip;

const CLIENT_DTS = `declare module '@mionjs/client' {
  import type {PureFunction, InjectPureFnId, InjectBatchId} from '@mionjs/run-types';
  export interface RouteSubRequest<PH> { id: string }
  export type ClientRoutes<RA> = { [K in keyof RA]: RA[K] extends (...a: infer P) => infer R ? (...p: {[I in keyof P]: P[I] | InputFromRef<any>}) => RouteSubRequest<RA[K]> : ClientRoutes<RA[K]> };
  export function initClient<RA>(o?: unknown): {client: unknown; routes: ClientRoutes<RA>};
  export interface InputFromRef<F extends (...args: any) => any> { asArg(): ReturnType<F> }
  export function inputFrom<S extends RouteSubRequest<any>, M = any>(source: S, mapper: PureFunction<(v: any) => M>, pureFnId?: InjectPureFnId<(v: any) => M>): InputFromRef<(v: any) => M>;
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
  // A named package, like any real project: it is what a pure fn's id is built from.
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({name: `@acme/${name}-app`, private: true, type: 'module'}));
  for (const [rel, content] of Object.entries(files)) fs.writeFileSync(path.join(dir, 'src', rel), content);
  return dir;
}

/** Every generated pure-fn module under `<genDir>/types/pf`, by path. */
function generatedTypeModules(genDir: string): string[] {
  const root = path.join(genDir, 'types', 'pf');
  const walk = (dir: string): string[] =>
    fs.readdirSync(dir, {withFileTypes: true}).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      return entry.isDirectory() ? walk(full) : [full];
    });
  return fs.existsSync(root) ? walk(root).sort() : [];
}

/** Every generated pure-fn module under `<genDir>/rpc/pf`, by path. */
function generatedMappers(genDir: string): string[] {
  const root = path.join(genDir, 'rpc', 'pf');
  const walk = (dir: string): string[] =>
    fs.readdirSync(dir, {withFileTypes: true}).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      return entry.isDirectory() ? walk(full) : [full];
    });
  return fs.existsSync(root) ? walk(root).sort() : [];
}

describe('mion compile — a fullstack project', () => {
  register('emits rpc/ from its own batches, imports the table, and the client carries the same ids', () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-compile-mion-'));
    try {
      const app = writeProject(base, 'app', {
        'client.d.ts': CLIENT_DTS,
        'router.d.ts': ROUTER_DTS,
        'routes.ts': ROUTES_TS,
        'a.ts': CLIENT_TS,
        'server.ts': SERVER_TS,
      });

      const run = runCli(['compile', '--cwd', app, '--tsconfig', 'tsconfig.json', '--gen-dir', path.join(app, '.mion')], {
        label: 'compile-cli-mion-fullstack',
      });
      expect(run.status, run.report).toBe(0);

      // relative imports only, no absolute path leaks into the table
      const table = fs.readFileSync(path.join(app, '.mion', 'rpc', 'batches.generated.js'), 'utf8');
      expect(table).toMatch(/import \{__rt_pf\$2F[A-Za-z0-9_$]+\} from '[^']*\/pf\/@acme\/app-app\/[^']+\.js';/);
      expect(table).toMatch(/replaceBatches\(\{"b_[A-Za-z0-9_-]+":/);
      expect(table).not.toContain(app);
      const mappers = generatedMappers(path.join(app, '.mion'));
      expect(mappers).toHaveLength(1);
      expect(fs.readFileSync(mappers[0], 'utf8')).toContain('u.id');

      // the emitted router-init module ends with the import, relativized from dist/ to .mion/rpc/
      const serverJs = fs.readFileSync(path.join(app, 'dist', 'server.js'), 'utf8');
      expect(serverJs).not.toContain('rtrpc:');
      expect(serverJs).toContain("import '../.mion/rpc/batches.generated.js';");
      expect(serverJs).toContain('createMionRouter(');

      // the emitted client carries the batch id and mapper id the table registers
      const clientJs = fs.readFileSync(path.join(app, 'dist', 'a.js'), 'utf8');
      const batchId = /'(b_[A-Za-z0-9_-]+)'/.exec(clientJs)?.[1];
      const mapperKey = /'(@acme\/app-app#pf_[A-Za-z0-9_-]+)'/.exec(clientJs)?.[1];
      expect(batchId, clientJs).toBeDefined();
      expect(mapperKey, clientJs).toBeDefined();
      expect(table).toContain(`"${batchId}"`);
      expect(table).toContain(`'${mapperKey}'`);
      expect(clientJs).not.toContain('batches.generated');
    } finally {
      fs.rmSync(base, {recursive: true, force: true});
    }
  });
});

// A pure fn reaching another one by IMPORTING its id, compiled by the CLI with no
// bundler in the loop, then RUN under plain node. The emitted body must carry the
// imported id as a literal (it closes over nothing), and the generated modules must
// register under the same ids the rewritten source passes — which is what proves the
// CLI and the bundler plugins share the one Go transform.
const PURE_FNS_TS = `import {registerPureFn} from '@mionjs/run-types/runtime';
export const trim = registerPureFn((s) => s.trim());
`;
const PURE_MAIN_TS = `import {registerPureFnFactory, getRTUtils} from '@mionjs/run-types/runtime';
import {trim} from './fns.js';
declare const process: {stdout: {write(text: string): void}};

const trimTwice = registerPureFnFactory((utl) => {
  const once = utl.getPureFn(trim)!;
  return (value) => once(once(value));
});

process.stdout.write(
  '<<RT>>' +
    JSON.stringify({
      trimId: trim,
      twiceId: trimTwice,
      deps: getRTUtils().getCompiledPureFnByKey(trimTwice)!.pureFnDependencies,
      result: getRTUtils().getPureFnByKey(trimTwice)!('  hi  '),
    }) +
    '<<RT>>'
);
`;

describe('mion compile — a pure fn that imports another pure fn id', () => {
  register('emits the imported id as a literal and runs under plain node', () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-compile-purefn-'));
    try {
      const project = path.join(base, 'app');
      fs.mkdirSync(path.join(project, 'src'), {recursive: true});
      fs.writeFileSync(
        path.join(project, 'package.json'),
        JSON.stringify({name: '@acme/pure-app', private: true, type: 'module'})
      );
      fs.writeFileSync(path.join(project, 'tsconfig.json'), TSCONFIG);
      // the REAL marker package, so the emitted JS runs against the shipped runtime
      const scope = path.join(project, 'node_modules', '@mionjs');
      fs.mkdirSync(scope, {recursive: true});
      fs.symlinkSync(path.resolve(__dirname, '../../run-types'), path.join(scope, 'run-types'), 'dir');
      fs.writeFileSync(path.join(project, 'src', 'fns.ts'), PURE_FNS_TS);
      fs.writeFileSync(path.join(project, 'src', 'main.ts'), PURE_MAIN_TS);

      const run = runCli(['compile', '--cwd', project, '--tsconfig', 'tsconfig.json', '--gen-dir', path.join(project, '.mion')], {
        label: 'compile-cli-purefn',
      });
      expect(run.status, run.report).toBe(0);

      // the dependent body ships the imported id as a literal, so it closes over nothing
      const generated = generatedTypeModules(path.join(project, '.mion'));
      // A module is named after its id, which is a hash, so the dependent is
      // found by being the one whose body reaches another pure fn.
      const twice = generated.find((file) => fs.readFileSync(file, 'utf8').includes('getPureFn('));
      expect(twice, `no module reaching another pure fn in ${generated.join(', ')}`).toBeDefined();
      // the body rides the tuple as a quoted string, so its own quotes arrive escaped
      expect(fs.readFileSync(twice!, 'utf8')).toMatch(/getPureFn\(\\'@acme\/pure-app#pf_[A-Za-z0-9_-]{14}\\'\)/);

      const stdout = execFileSync(process.execPath, [path.join(project, 'dist', 'main.js')], {
        cwd: project,
        encoding: 'utf8',
      });
      const payload = /<<RT>>(.*)<<RT>>/s.exec(stdout);
      expect(payload, `the compiled program must print its result; got:\n${stdout}`).toBeTruthy();
      const result = JSON.parse(payload![1]) as {trimId: string; twiceId: string; deps: string[]; result: string};
      // An id is the owning package plus a hash of the body that ships.
      const ID_RE = /^@acme\/pure-app#pf_[A-Za-z0-9_-]{14}$/;
      expect(result.trimId).toMatch(ID_RE);
      expect(result.twiceId).toMatch(ID_RE);
      expect(result.twiceId).not.toBe(result.trimId);
      expect(result.deps).toEqual([result.trimId]);
      expect(result.result).toBe('hi');
    } finally {
      fs.rmSync(base, {recursive: true, force: true});
    }
  });
});

// The bundled-API lane through the same CLI: one build writes the server AND client manifests, then
// `mion api-check` compares an earlier client build against a later server build.
const API_ROUTER_DTS = `declare module '@mionjs/router' {
  import type {InjectBuildVersion} from '@mionjs/run-types';
  type Handler = (...args: any[]) => any;
  type Opts = {alwaysRun: false; description: undefined; parser: {params: 'clone'; return: 'clone'}; isMutation: undefined; sanitizeParams: undefined};
  export type PublicApi<R> = {
    [K in keyof R]: R[K] extends {type: infer T; handler: infer H extends Handler}
      ? {type: T; handler: H; options: Opts; types?: {params: Parameters<H>; return: Awaited<ReturnType<H>>; headers: never; isAsync: false}}
      : PublicApi<R[K]>;
  };
  const apiBuildVersion: unique symbol;
  export type ApiBuildVersion<V extends string> = {readonly [apiBuildVersion]?: V};
  export interface MionRouter {
    initRoutes<R, const V extends string = string>(routes: R, buildVersion?: InjectBuildVersion<PublicApi<R>> & V): PublicApi<R> & ApiBuildVersion<V>;
  }
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
  import type {InjectApiMetadata, InjectBuildVersion} from '@mionjs/run-types';
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
  export function initClient<RA>(o?: unknown, buildVersion?: InjectBuildVersion<RA>): {routes: ClientRoutes<RA>};
  export function setApiBundled(): void;
}
`;
// The client calls the API of server.ts from the same program.
function apiClientTs(extraParam: boolean): string {
  const args = extraParam ? "1, true, 't'" : '1, true';
  return `import {initClient} from '@mionjs/client';
import type {api} from './server.ts';
export const {routes} = initClient<typeof api>({baseURL: 'http://x'});
export const a = routes.users.getById(${args}).call();
`;
}

function readManifest(genDir: string, file: string): {kind: string; methods: Record<string, {paramsId: string}>} {
  return JSON.parse(fs.readFileSync(path.join(genDir, 'api', file), 'utf8'));
}

describe('mion compile + api-check — a bundled client against its server', () => {
  register('one build writes both manifests, api-check passes, and fails against a later server build', () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-compile-apicheck-'));
    try {
      const app = writeProject(base, 'app', {
        'router.d.ts': API_ROUTER_DTS,
        'client.d.ts': API_CLIENT_DTS,
        'server.ts': apiServerTs(false),
        'a.ts': apiClientTs(false),
      });
      const genDir = path.join(app, '.mion');
      const compile = () =>
        runCli(['compile', '--cwd', app, '--tsconfig', 'tsconfig.json', '--gen-dir', genDir], {label: 'apicheck-compile'});
      const apiCheck = (serverDir: string, clientDir: string) =>
        runCli(['api-check', '--server-gen-dir', serverDir, '--client-gen-dir', clientDir], {label: 'apicheck'});

      const first = compile();
      expect(first.status, first.report).toBe(0);
      const serverManifest = readManifest(genDir, 'manifest.json');
      expect(serverManifest.kind).toBe('server');
      expect(Object.keys(serverManifest.methods).sort()).toEqual(['sum', 'users/getById']);
      const clientManifest = readManifest(genDir, 'client-manifest.json');
      expect(clientManifest.kind).toBe('client');
      expect(Object.keys(clientManifest.methods)).toEqual(['users/getById']);
      expect(clientManifest.methods['users/getById'].paramsId).toBe(serverManifest.methods['users/getById'].paramsId);
      // the emitted client imports the lane module and the site module at the call, both relativized
      const clientJs = fs.readFileSync(path.join(app, 'dist', 'a.js'), 'utf8');
      expect(clientJs).toMatch(/import '(\.\.\/)+\.mion\/api\/lane\.js';/);
      expect(clientJs).toMatch(/import \{ ?__rt_s\$2F[A-Za-z0-9_$]+ ?\} from '\.\.\/\.mion\/api\/[^']+\.js';/);
      expect(clientJs).not.toContain('rtapi:');
      // set by the module the build wrote, not spliced into the call
      expect(clientJs).not.toContain('setApiBundled');
      expect(fs.readFileSync(path.join(genDir, 'api', 'lane.js'), 'utf8')).toContain('setApiBundled()');

      const pass = apiCheck(genDir, genDir);
      expect(pass.status, pass.report).toBe(0);
      expect(pass.stdout).toContain('1 bundled method(s) match');

      // the shipped client keeps its manifest; the server grows a parameter and is rebuilt
      const shippedClient = path.join(base, 'shipped-client.json');
      fs.copyFileSync(path.join(genDir, 'api', 'client-manifest.json'), shippedClient);
      fs.writeFileSync(path.join(app, 'src', 'server.ts'), apiServerTs(true));
      fs.writeFileSync(path.join(app, 'src', 'a.ts'), apiClientTs(true));
      const rebuilt = compile();
      expect(rebuilt.status, rebuilt.report).toBe(0);
      const fail = apiCheck(genDir, shippedClient);
      expect(fail.status).toBe(1);
      expect(fail.stderr).toContain('users/getById: paramsId differs');
      expect(fail.stderr).toContain('1 mismatch(es)');

      // a build output without a manifest is a usage problem, not a mismatch
      const missing = apiCheck(genDir, path.join(base, 'nowhere'));
      expect(missing.status).toBe(2);
      expect(missing.stderr).toContain('client manifest');
    } finally {
      fs.rmSync(base, {recursive: true, force: true});
    }
  });
});

// A client built apart from its server, reading the API from the .d.ts the server's `mion compile` published.
const PACKAGE_CLIENT_TS = `import {initClient} from '@mionjs/client';
import type {api} from '@acme/api';
export const {routes} = initClient<typeof api>({baseURL: 'http://x'});
export const a = routes.users.getById(1, true).call();
`;
const BUILD_VERSION = /init(?:Routes|Client)\([\s\S]*?, ['"]([A-Za-z0-9]{12})['"]\)/;

function injectedVersion(file: string): string {
  return fs.readFileSync(file, 'utf8').match(BUILD_VERSION)?.[1] ?? '';
}

describe('mion compile + api-check — a client built from the published API types', () => {
  register('the server version rides the .d.ts; a matching client builds, a drifted one fails', () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-compile-apitypes-'));
    try {
      const server = writeProject(base, 'server', {'router.d.ts': API_ROUTER_DTS, 'server.ts': apiServerTs(false)});
      const tsconfig = JSON.parse(fs.readFileSync(path.join(server, 'tsconfig.json'), 'utf8'));
      tsconfig.compilerOptions.declaration = true;
      fs.writeFileSync(path.join(server, 'tsconfig.json'), JSON.stringify(tsconfig));
      const serverGen = path.join(server, '.mion');
      const built = runCli(['compile', '--cwd', server, '--tsconfig', 'tsconfig.json', '--gen-dir', serverGen], {
        label: 'apitypes-server',
      });
      expect(built.status, built.report).toBe(0);
      const serverVersion = injectedVersion(path.join(server, 'dist', 'server.js'));
      expect(serverVersion).not.toBe('');
      const publishedDts = fs.readFileSync(path.join(server, 'dist', 'server.d.ts'), 'utf8');
      expect(publishedDts).toContain(`ApiBuildVersion<"${serverVersion}">`);

      const client = writeProject(base, 'client', {
        'router.d.ts': API_ROUTER_DTS,
        'client.d.ts': API_CLIENT_DTS,
        'a.ts': PACKAGE_CLIENT_TS,
      });
      const apiPackage = path.join(client, 'node_modules', '@acme', 'api');
      fs.mkdirSync(apiPackage, {recursive: true});
      // a `main` makes it the full server package: a types-only one must come from `mion api-types` (MET015)
      fs.writeFileSync(
        path.join(apiPackage, 'package.json'),
        JSON.stringify({name: '@acme/api', types: 'index.d.ts', main: 'index.js'})
      );
      const publish = (dts: string) => fs.writeFileSync(path.join(apiPackage, 'index.d.ts'), dts);
      const clientGen = path.join(client, '.mion');
      const compileClient = () =>
        runCli(['compile', '--cwd', client, '--tsconfig', 'tsconfig.json', '--gen-dir', clientGen], {label: 'apitypes-client'});

      publish(publishedDts);
      const matching = compileClient();
      expect(matching.status, matching.report).toBe(0);
      expect(matching.stdout + matching.stderr).not.toMatch(/MET01[23]/);
      expect(injectedVersion(path.join(client, 'dist', 'a.js'))).toBe(serverVersion);
      const check = runCli(['api-check', '--server-gen-dir', serverGen, '--client-gen-dir', clientGen], {
        label: 'apitypes-check',
      });
      expect(check.status, check.report).toBe(0);

      // types written by plain tsc carry no version: the client builds, warned
      publish(publishedDts.replace(`ApiBuildVersion<"${serverVersion}">`, 'ApiBuildVersion<string>'));
      const unversioned = compileClient();
      expect(unversioned.status, unversioned.report).toBe(0);
      expect(unversioned.stdout + unversioned.stderr).toContain('MET013');

      // a route type that changed after the server build: the client's ids no longer hash to the server's version
      publish(publishedDts.replace('verbose: boolean', 'verbose: string'));
      const drifted = compileClient();
      expect(drifted.status).not.toBe(0);
      expect(drifted.stdout + drifted.stderr).toContain('MET012');
    } finally {
      fs.rmSync(base, {recursive: true, force: true});
    }
  });
});

// `mion api-types` builds the package a client installs instead of the whole server: the router stub is a real
// installed package here, since the trimmed types must resolve without the server's own files.
const INSTALLED_ROUTER_DTS = API_ROUTER_DTS.replace("declare module '@mionjs/router' {", '')
  .replace('export function createMionRouter', 'export declare function createMionRouter')
  .replace('const apiBuildVersion', 'declare const apiBuildVersion')
  .replace(/}\s*$/, '');
const TYPES_SERVER_TS = `import {createMionRouter} from '@mionjs/router';
import {Db} from './db.ts';
export interface User {id: number; name: string}
const db = new Db();
export const mion = createMionRouter();
export const api = mion.initRoutes({users: {getById: {type: 1 as const, handler: (id: number, verbose: boolean): User => ({id, name: db.name(verbose)})}}});
export function startServer(port: number): Db { void port; return db; }
`;
const TYPES_DB_TS = `export class Db {
  private conn = 1;
  name(verbose: boolean): string { return verbose ? String(this.conn) : ''; }
}
`;
const TYPES_CLIENT_TS = `import {initClient} from '@mionjs/client';
import {getRunTypeId} from '@mionjs/run-types';
import type {api, User} from '@acme/server-app-types';
export const {routes} = initClient<typeof api>({baseURL: 'http://x'});
export const a = routes.users.getById(1, true).call();
export const staticId = getRunTypeId<User>();
declare const user: User;
export const valueId = getRunTypeId(user);
`;

function installRouter(project: string): void {
  const router = path.join(project, 'node_modules', '@mionjs', 'router');
  fs.mkdirSync(router, {recursive: true});
  fs.writeFileSync(
    path.join(router, 'package.json'),
    JSON.stringify({name: '@mionjs/router', version: '0.0.1', types: 'index.d.ts'})
  );
  fs.writeFileSync(path.join(router, 'index.d.ts'), INSTALLED_ROUTER_DTS);
}

function listFiles(dir: string, prefix = ''): string[] {
  return fs.readdirSync(dir, {withFileTypes: true}).flatMap((entry) => {
    const rel = prefix + entry.name;
    return entry.isDirectory() ? listFiles(path.join(dir, entry.name), rel + '/') : [rel];
  });
}

describe('mion api-types — a types-only package for an API client', () => {
  register('builds the trimmed package, a client builds against it, and refuses it without the marker', () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-api-types-'));
    try {
      const server = writeProject(base, 'server', {'server.ts': TYPES_SERVER_TS, 'db.ts': TYPES_DB_TS});
      installRouter(server);
      const serverPkg = JSON.parse(fs.readFileSync(path.join(server, 'package.json'), 'utf8'));
      serverPkg.version = '1.4.0';
      serverPkg.dependencies = {'@mionjs/router': '^0.0.1'};
      fs.writeFileSync(path.join(server, 'package.json'), JSON.stringify(serverPkg));
      const out = path.join(base, 'api-types');
      const built = runCli(['api-types', '--cwd', server, '--tsconfig', 'tsconfig.json', '--out', out], {label: 'api-types'});
      expect(built.status, built.report).toBe(0);

      expect(listFiles(out).sort()).toEqual(['.mion/api/manifest.json', 'mion-api.json', 'package.json', 'server.d.ts']);
      const dts = fs.readFileSync(path.join(out, 'server.d.ts'), 'utf8');
      expect(dts).toContain('export interface User');
      expect(dts).toMatch(/ApiBuildVersion<"[A-Za-z0-9]{12}">/);
      for (const serverOnly of ['Db', 'startServer', 'db.ts', 'conn']) expect(dts).not.toContain(serverOnly);
      const pkg = JSON.parse(fs.readFileSync(path.join(out, 'package.json'), 'utf8'));
      expect(pkg).toMatchObject({
        name: '@acme/server-app-types',
        version: '1.4.0',
        types: './server.d.ts',
        mion: {apiTypes: './mion-api.json'},
      });
      expect(pkg.main).toBeUndefined();
      expect(pkg.peerDependencies).toMatchObject({
        '@mionjs/router': '^0.0.1',
        '@mionjs/core': '*',
        '@mionjs/run-types': expect.any(String),
      });
      const marker = JSON.parse(fs.readFileSync(path.join(out, 'mion-api.json'), 'utf8'));
      expect(marker).toMatchObject({format: 1, package: '@acme/server-app'});
      const serverVersion = dts.match(/ApiBuildVersion<"([A-Za-z0-9]{12})">/)![1];
      expect(marker.buildVersion).toBe(serverVersion);

      const client = writeProject(base, 'client', {'client.d.ts': API_CLIENT_DTS, 'a.ts': TYPES_CLIENT_TS});
      installRouter(client);
      const installed = path.join(client, 'node_modules', '@acme', 'server-app-types');
      fs.cpSync(out, installed, {recursive: true});
      const clientGen = path.join(client, '.mion');
      const compileClient = () =>
        runCli(['compile', '--cwd', client, '--tsconfig', 'tsconfig.json', '--gen-dir', clientGen], {label: 'api-types-client'});

      const matching = compileClient();
      expect(matching.status, matching.report).toBe(0);
      expect(matching.stdout + matching.stderr).not.toMatch(/MET01[2356]/);
      const clientJs = fs.readFileSync(path.join(client, 'dist', 'a.js'), 'utf8');
      expect(injectedVersion(path.join(client, 'dist', 'a.js'))).toBe(serverVersion);
      // both getRunTypeId shapes name the package's type and agree on its id
      const ids = [...clientJs.matchAll(/getRunTypeId\((?:undefined|user), (__rt_[A-Za-z0-9_$]+)\)/g)].map((match) => match[1]);
      expect(ids).toHaveLength(2);
      expect(ids[0]).toBe(ids[1]);
      const check = runCli(['api-check', '--server-gen-dir', path.join(installed, '.mion'), '--client-gen-dir', clientGen], {
        label: 'api-types-check',
      });
      expect(check.status, check.report).toBe(0);

      // a .d.ts any tool wrote, published types-only without the marker: one error naming the package
      fs.rmSync(path.join(installed, 'mion-api.json'));
      const refused = compileClient();
      expect(refused.status).not.toBe(0);
      const output = refused.stdout + refused.stderr;
      expect(output.match(/MET015/g)).toHaveLength(1);
      expect(output).toContain('@acme/server-app-types');
      expect(output).not.toMatch(/MET01[23]/);
    } finally {
      fs.rmSync(base, {recursive: true, force: true});
    }
  });
});
