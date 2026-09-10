// The bundled-API id lane — the real `mion` binary over two real temp
// projects, a SERVER and a CLIENT, per generated type:
//
//   generate a data type (core/typeGen.ts) → write it as the params and
//   return types of two routes in the server project, and as the client's
//   view of the same API
//     → `mion compile` the server: its initRoutes call yields the server
//       manifest; a probes file resolves the same params / return types
//       through the ordinary reflection marker (BOTH getRunTypeId call
//       shapes), the road every runtypes id travels
//     → A1: every manifest row's paramsId / returnId equals the marker
//       probe's id (the API tree walk and the marker scanner agree)
//     → `mion compile` the client with --bundle-api bundled and
//       --api-tsconfig pointing at the server, under a tsconfig that DIFFERS
//       from the server's (strictNullChecks off, an older lib)
//     → A2: no MET diagnostic, and the client bundled exactly the routes it
//       calls
//     → A3: `mion api-check` over the two gen dirs exits 0: the client
//       shipped the server's exact runtypes, tsconfig differences and all.
//
// The negative control lives in the integration test: the same client built
// WITHOUT the pointer, for a type whose id the client tsconfig changes, fails
// api-check on the field that moved.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {
  genType,
  renderGenerated,
  describeType,
  DATA_GEN_OPTIONS,
  FUZZ_FORMAT_PREAMBLE_PACKAGE,
  type GenOptions,
  type GeneratedType,
} from '../core/typeGen.ts';
import {withSeededRandom, mixSeed} from '../core/seededRng.ts';
import {hasBinary, BIN} from '../type/typeFuzzHarness.ts';
import {writeMarkerPackage} from '../../../../devtools/test/helpers/inline.ts';

export {hasBinary};

/** The lane's generation space: the serialisable subset (a route's params are
 *  data), with labeled tuples, classes and heritage, since every one of those
 *  folds into an id. **/
export const API_IDS_GEN_OPTIONS: GenOptions = {
  ...DATA_GEN_OPTIONS,
  tupleLabels: true,
  classes: true,
  heritage: true,
};

// --- the fixture sources -------------------------------------------------------

/** The API's two routes, as both projects spell them: r0 takes the generated
 *  type and returns a list of it, r1 (in a group) takes it twice, the second
 *  time optionally, and returns an object around it. Same handler types on
 *  both sides, so the only thing that can move an id is the program. **/
const ROUTE_HANDLERS = {
  r0: '(input: Root) => Root[]',
  r1: '(a: Root, b?: Root[]) => {items: Root[]; count: number}',
} as const;

const ROUTER_DTS = `declare module '@mionjs/router' {
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

const SERVER_TS = `import {createMionRouter} from '@mionjs/router';
import type {Root} from './types.ts';
export const mion = createMionRouter();
export const api = mion.initRoutes({
  r0: {type: 1 as const, handler: ((input: Root): Root[] => [input]) as ${ROUTE_HANDLERS.r0}},
  users: {r1: {type: 1 as const, handler: ((a: Root, b?: Root[]): {items: Root[]; count: number} => ({items: b ?? [a], count: 1})) as ${ROUTE_HANDLERS.r1}}},
});
`;

/** The probes: each route's params and return through the reflection marker,
 *  static shape, plus the value shape of r0's params (the marker coverage
 *  rule: both call shapes, paired). **/
const PROBES_TS = `import {getRunTypeId} from '@mionjs/run-types';
import type {api} from './server.ts';
type H0 = typeof api.r0.handler;
type H1 = typeof api.users.r1.handler;
export const r0Params = getRunTypeId<Parameters<H0>>();
export const r0Return = getRunTypeId<Awaited<ReturnType<H0>>>();
export const r1Params = getRunTypeId<Parameters<H1>>();
export const r1Return = getRunTypeId<Awaited<ReturnType<H1>>>();
declare const r0ParamsValue: Parameters<H0>;
export const r0ParamsByValue = getRunTypeId(r0ParamsValue);
`;

const CLIENT_DTS = `declare module '@mionjs/client' {
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
  export function initClient<RA>(o?: unknown, mode?: InjectApiMetadata<RA>): {routes: ClientRoutes<RA>};
}
`;

/** The client's view of the API: what PublicApi<typeof routes> reads as from
 *  a declaration file, over the same handler types. **/
const API_TS = `import type {Root} from './types.ts';
type RouteOpts = {alwaysRun: false; validateParams: true; validateReturn: false; description: undefined; encoder: {params: 'clone'; return: 'clone'}; isMutation: undefined; strictTypes: undefined; sanitizeParams: undefined};
type H0 = ${ROUTE_HANDLERS.r0};
type H1 = ${ROUTE_HANDLERS.r1};
export type Api = {
  r0: {type: 1; handler: H0; options: RouteOpts; types?: {params: Parameters<H0>; return: ReturnType<H0>; headers: never; isAsync: false}};
  users: {r1: {type: 1; handler: H1; options: RouteOpts; types?: {params: Parameters<H1>; return: ReturnType<H1>; headers: never; isAsync: false}}};
};
`;

const CLIENT_TS = `import {initClient} from '@mionjs/client';
import type {Api} from './api.ts';
import type {Root} from './types.ts';
declare const rootValue: Root;
export const {routes} = initClient<Api>({baseURL: 'http://x'});
export const a = routes.r0(rootValue).call();
export const b = routes.users.r1(rootValue).call();
`;

/** The route ids the client calls, in manifest order. **/
export const CALLED_ROUTE_IDS = ['r0', 'users/r1'] as const;

function tsconfig(extra: Record<string, unknown>): string {
  const compilerOptions = {
    target: 'ES2022',
    module: 'ESNext',
    moduleResolution: 'Bundler',
    rootDir: 'src',
    outDir: 'dist',
    strict: true,
    allowImportingTsExtensions: true,
    rewriteRelativeImportExtensions: true,
    ...extra,
  };
  return JSON.stringify({compilerOptions, include: ['src']}, null, 2) + '\n';
}

/** The server compiles strict; the client deliberately does not, and reads
 *  an older lib, so the two programs would not agree on every type on their
 *  own. **/
export const SERVER_TSCONFIG = tsconfig({});
export const CLIENT_TSCONFIG = tsconfig({strictNullChecks: false, lib: ['es2020']});

/** Renders the generated type as the shared `types.ts` of both projects. **/
export function renderTypesModule(gen: GeneratedType): string {
  const {decls, rootExpr} = renderGenerated(gen, FUZZ_FORMAT_PREAMBLE_PACKAGE);
  return `${decls}${decls ? '\n' : ''}export type Root = ${rootExpr};\n`;
}

// --- the on-disk projects ------------------------------------------------------

export interface ApiProjects {
  base: string;
  server: string;
  client: string;
}

/** One server and one client project per run, reused across iterations (the
 *  marker dist copy is the expensive part); each iteration rewrites types.ts. **/
export function createApiProjects(): ApiProjects {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-apiids-fuzz-'));
  const server = path.join(base, 'server');
  const client = path.join(base, 'client');
  for (const [dir, config, files] of [
    [server, SERVER_TSCONFIG, {'router.d.ts': ROUTER_DTS, 'server.ts': SERVER_TS, 'probes.ts': PROBES_TS}],
    [client, CLIENT_TSCONFIG, {'client.d.ts': CLIENT_DTS, 'api.ts': API_TS, 'a.ts': CLIENT_TS}],
  ] as const) {
    fs.mkdirSync(path.join(dir, 'src'), {recursive: true});
    writeMarkerPackage(dir);
    fs.writeFileSync(path.join(dir, 'tsconfig.json'), config);
    for (const [rel, content] of Object.entries(files)) fs.writeFileSync(path.join(dir, 'src', rel), content);
  }
  return {base, server, client};
}

export function destroyApiProjects(projects: ApiProjects): void {
  fs.rmSync(projects.base, {recursive: true, force: true});
}

export function writeTypes(projects: ApiProjects, typesSource: string): void {
  fs.writeFileSync(path.join(projects.server, 'src', 'types.ts'), typesSource);
  fs.writeFileSync(path.join(projects.client, 'src', 'types.ts'), typesSource);
}

// --- the CLI legs --------------------------------------------------------------

export interface CliResult {
  status: number;
  stdout: string;
  stderr: string;
}

function runMion(args: string[], cwd: string): CliResult {
  const result = spawnSync(BIN, args, {encoding: 'utf8', cwd, maxBuffer: 64 * 1024 * 1024});
  return {status: result.status ?? -1, stdout: result.stdout ?? '', stderr: result.stderr ?? ''};
}

export function compileServer(projects: ApiProjects): CliResult {
  return runMion(
    ['compile', '--cwd', projects.server, '--tsconfig', 'tsconfig.json', '--gen-dir', path.join(projects.server, '.mion')],
    projects.server
  );
}

/** Compiles the client bundled; `apiTsconfig` false leaves the pointer out
 *  (the negative control's build). **/
export function compileClient(projects: ApiProjects, apiTsconfig = true): CliResult {
  const args = [
    'compile',
    '--cwd',
    projects.client,
    '--tsconfig',
    'tsconfig.json',
    '--gen-dir',
    path.join(projects.client, '.mion'),
    '--bundle-api',
    'bundled',
  ];
  if (apiTsconfig) args.push('--api-tsconfig', path.join(projects.server, 'tsconfig.json'));
  return runMion(args, projects.client);
}

export function apiCheck(projects: ApiProjects): CliResult {
  return runMion(
    [
      'api-check',
      '--server-gen-dir',
      path.join(projects.server, '.mion'),
      '--client-gen-dir',
      path.join(projects.client, '.mion'),
    ],
    projects.base
  );
}

// --- what the builds wrote ------------------------------------------------------

interface ManifestRow {
  paramsId: string;
  returnId: string;
}
interface Manifest {
  kind: string;
  methods: Record<string, ManifestRow>;
}

export function readManifest(projectDir: string): Manifest {
  return JSON.parse(fs.readFileSync(path.join(projectDir, '.mion', 'api', 'manifest.json'), 'utf8')) as Manifest;
}

/** The transform's import binding for a cache entry is `__rt_` plus the id
 *  with every non-identifier character as `$XX` (two hex digits). **/
function unescapeBinding(binding: string): string {
  return binding.replace(/\$([0-9A-Fa-f]{2})/g, (_match, hex: string) => String.fromCharCode(parseInt(hex, 16)));
}

/** The ids the marker road assigned: the compiled probes file carries each
 *  probe as `getRunTypeId(undefined, __rt_<id>)` (the static shape) or
 *  `getRunTypeId(value, __rt_<id>)` (the value shape), keyed by export name. **/
export function readProbeIds(projects: ApiProjects): Map<string, string> {
  const compiled = fs.readFileSync(path.join(projects.server, 'dist', 'probes.js'), 'utf8');
  const ids = new Map<string, string>();
  for (const [, name, binding] of compiled.matchAll(/export const (\w+) = getRunTypeId\((?:\w+, )?__rt_([A-Za-z0-9_$]+)\)/g)) {
    ids.set(name, unescapeBinding(binding));
  }
  if (ids.size !== 5)
    throw new Error(`expected 5 resolved probes in the compiled probes file, got ${ids.size}\n--- probes.js ---\n${compiled}`);
  return ids;
}

// --- the oracles ----------------------------------------------------------------

/** A1: the server manifest's rows carry the ids the reflection marker assigns
 *  to the same types, and the two marker call shapes agree. **/
export function checkServerManifestAgainstProbes(projects: ApiProjects): void {
  const manifest = readManifest(projects.server);
  if (manifest.kind !== 'server') throw new Error(`the server build wrote a ${manifest.kind} manifest`);
  const probes = readProbeIds(projects);
  const expected: [string, string, string][] = [
    ['r0', 'paramsId', 'r0Params'],
    ['r0', 'returnId', 'r0Return'],
    ['users/r1', 'paramsId', 'r1Params'],
    ['users/r1', 'returnId', 'r1Return'],
  ];
  for (const [id, field, probe] of expected) {
    const row = manifest.methods[id];
    if (!row) throw new Error(`the server manifest lacks ${id}: ${JSON.stringify(Object.keys(manifest.methods))}`);
    const fromTree = row[field as keyof ManifestRow];
    const fromMarker = probes.get(probe);
    if (fromTree !== fromMarker)
      throw new Error(`A1: ${id}.${field} is ${fromTree} on the manifest but ${fromMarker} through the marker (${probe})`);
  }
  if (probes.get('r0Params') !== probes.get('r0ParamsByValue')) {
    throw new Error(
      `getRunTypeId<T>() and getRunTypeId(value) diverged on r0's params: ${probes.get('r0Params')} vs ${probes.get('r0ParamsByValue')}`
    );
  }
}

/** A2: the client build reported no MET diagnostic and bundled exactly the
 *  routes it calls. **/
export function checkClientBundle(projects: ApiProjects, build: CliResult): void {
  if (build.status !== 0) throw new Error(`client compile exited ${build.status}\n--- stderr ---\n${build.stderr}`);
  const met = build.stderr.split('\n').filter((line) => /\bMET\d{3}\b/.test(line));
  if (met.length) throw new Error(`A2: the client build reported bundled-API diagnostics:\n${met.join('\n')}`);
  const manifest = readManifest(projects.client);
  if (manifest.kind !== 'client') throw new Error(`the client build wrote a ${manifest.kind} manifest`);
  const bundled = Object.keys(manifest.methods).sort();
  if (bundled.join(',') !== [...CALLED_ROUTE_IDS].sort().join(','))
    throw new Error(`A2: bundled ${bundled.join(',')}, expected ${CALLED_ROUTE_IDS.join(',')}`);
}

/** A3: api-check passes: the client's ids, families, options and chains are
 *  the server's. **/
export function checkApiCheckPasses(projects: ApiProjects): void {
  const check = apiCheck(projects);
  if (check.status !== 0)
    throw new Error(`A3: api-check exited ${check.status}\n--- stderr ---\n${check.stderr}\n--- stdout ---\n${check.stdout}`);
}

// --- the runner -----------------------------------------------------------------

export interface ApiIdsFuzzReport {
  iterations: number;
  failures: string[];
}

export interface ApiIdsFuzzOptions {
  seed: number;
  iterations: number;
}

/** One iteration over already-created projects: generate, write, compile
 *  both, run the three oracles. Throws with the full context on a failure. **/
export function runApiIdsIteration(projects: ApiProjects, gen: GeneratedType): void {
  const typesSource = renderTypesModule(gen);
  writeTypes(projects, typesSource);
  try {
    const server = compileServer(projects);
    if (server.status !== 0) throw new Error(`server compile exited ${server.status}\n--- stderr ---\n${server.stderr}`);
    checkServerManifestAgainstProbes(projects);
    checkClientBundle(projects, compileClient(projects));
    checkApiCheckPasses(projects);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`${message}\n--- types.ts ---\n${typesSource}`);
  }
}

export async function runApiIdsFuzz(options: ApiIdsFuzzOptions): Promise<ApiIdsFuzzReport> {
  const report: ApiIdsFuzzReport = {iterations: 0, failures: []};
  const projects = createApiProjects();
  try {
    for (let iteration = 0; iteration < options.iterations; iteration++) {
      report.iterations++;
      const gen = withSeededRandom(mixSeed(options.seed, 'apiids', iteration), () => genType(API_IDS_GEN_OPTIONS));
      try {
        runApiIdsIteration(projects, gen);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        report.failures.push(`iteration ${iteration} (seed ${options.seed}, ${describeType(gen)}): ${message}`);
      }
    }
  } finally {
    destroyApiProjects(projects);
  }
  return report;
}
