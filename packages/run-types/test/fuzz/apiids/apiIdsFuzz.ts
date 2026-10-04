// The bundled-API id lane: per generated type, the real `mion` binary builds the server alone, then the whole program.
// A1: every server manifest row's ids equal a reflection-marker probe's (both getRunTypeId call shapes). A2: the
// client build reports no rpc-client-* diagnostic and bundles exactly the routes it calls. A3: `mion api-check` passes.
// A4: a client built against the server's `mion api-types` package passes A2 and A3 too.
// The negative control lives in the integration test.

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

/** The API's two routes; r1 sits in the `users` group. **/
const ROUTE_HANDLERS = {
  r0: '(input: Root) => Root[]',
  r1: '(a: Root, b?: Root[]) => {items: Root[]; count: number}',
} as const;

/** A package, so the types package resolves it as a client does; its build version mirrors the real router's. **/
export const ROUTER_DTS = `import type {InjectBuildVersion} from '@mionjs/run-types';
type Handler = (...args: any[]) => any;
type Opts = {alwaysRun: false; description: undefined; parser: {params: 'clone'; return: 'clone'}; isMutation: undefined; sanitizeParams: undefined};
declare const apiBuildVersion: unique symbol;
export type ApiBuildVersion<Version extends string> = {readonly [apiBuildVersion]?: Version};
export type PublicApi<R> = {
  [K in keyof R]: R[K] extends {type: infer T; handler: infer H extends Handler}
    ? {type: T; handler: H; options: Opts; types?: {params: Parameters<H>; return: Awaited<ReturnType<H>>; headers: never; isAsync: false}}
    : PublicApi<R[K]>;
};
export interface MionRouter {
  initRoutes<R, const Version extends string = string>(routes: R, buildVersion?: InjectBuildVersion<PublicApi<R>> & Version): PublicApi<R> & ApiBuildVersion<Version>;
}
export declare function createMionRouter(): MionRouter;
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

export const CLIENT_DTS = `declare module '@mionjs/client' {
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
  export function initClient<RM>(o?: unknown, buildVersion?: InjectBuildVersion<RM>): {routes: ClientRoutes<RM>};
}
`;

/** The client calling both routes, with the API read from the server sources or from the published types package. **/
const clientSource = (apiModule: string): string => `import {initClient} from '@mionjs/client';
import type {api} from '${apiModule}';
declare const rootValue: Parameters<typeof api.r0.handler>[0];
export const {routes} = initClient<typeof api>({baseURL: 'http://x'});
export const a = routes.r0(rootValue).call();
export const b = routes.users.r1(rootValue).call();
`;

/** The route ids the client calls, in manifest order. **/
export const CALLED_ROUTE_IDS = ['r0', 'users/r1'] as const;

function tsconfig(exclude: string[], rootDir = 'src', outDir = 'dist'): string {
  const compilerOptions = {
    target: 'ES2022',
    module: 'ESNext',
    moduleResolution: 'Bundler',
    rootDir,
    outDir,
    strict: true,
    allowImportingTsExtensions: true,
    rewriteRelativeImportExtensions: true,
  };
  return JSON.stringify({compilerOptions, include: [rootDir], exclude}, null, 2) + '\n';
}

/** The server builds without the client's files, so it writes only the server manifest. **/
const SERVER_TSCONFIG = 'tsconfig.server.json';
/** The client of the published types package: its own sources only, never the server's. **/
const TYPES_CLIENT_TSCONFIG = 'tsconfig.types-client.json';
/** `mion api-types` names the package after the server's: `@acme/api` plus `-types`. **/
const TYPES_PACKAGE = '@acme/api-types';

/** Every declaration exported: the declaration build behind `mion api-types` must name each type the API reaches. **/
export function renderTypesModule(gen: GeneratedType): string {
  const {decls, rootExpr} = renderGenerated(gen, FUZZ_FORMAT_PREAMBLE_PACKAGE);
  const exported = decls.replace(/^(?=(?:interface|type|class|abstract class|enum|const enum|declare) )/gm, 'export ');
  return `${exported}${exported ? '\n' : ''}export type Root = ${rootExpr};\n`;
}

// --- the on-disk project -------------------------------------------------------

export interface ApiProject {
  dir: string;
  serverGen: string;
  clientGen: string;
  typesClientGen: string;
}

/** One project per run, reused across iterations: the marker dist copy is the expensive part. **/
export function createApiProject(): ApiProject {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-apiids-fuzz-'));
  fs.mkdirSync(path.join(dir, 'src'), {recursive: true});
  writeMarkerPackage(dir);
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({name: '@acme/api', version: '1.0.0', type: 'module'}) + '\n');
  fs.writeFileSync(path.join(dir, 'tsconfig.json'), tsconfig([]));
  fs.writeFileSync(path.join(dir, SERVER_TSCONFIG), tsconfig(['src/app.ts', 'src/client.d.ts']));
  fs.writeFileSync(path.join(dir, TYPES_CLIENT_TSCONFIG), tsconfig([], 'client', 'dist-client'));
  const files = {
    'node_modules/@mionjs/router/package.json': JSON.stringify({name: '@mionjs/router', version: '1.0.0', types: 'index.d.ts'}),
    'node_modules/@mionjs/router/index.d.ts': ROUTER_DTS,
    'src/server.ts': SERVER_TS,
    'src/probes.ts': PROBES_TS,
    'src/client.d.ts': CLIENT_DTS,
    'src/app.ts': clientSource('./server.ts'),
    'client/client.d.ts': CLIENT_DTS,
    'client/app.ts': clientSource(TYPES_PACKAGE),
  };
  for (const [rel, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), {recursive: true});
    fs.writeFileSync(path.join(dir, rel), content);
  }
  return {
    dir,
    serverGen: path.join(dir, '.mion-server'),
    clientGen: path.join(dir, '.mion-client'),
    typesClientGen: path.join(dir, '.mion-types-client'),
  };
}

export function destroyApiProject(project: ApiProject): void {
  fs.rmSync(project.dir, {recursive: true, force: true});
}

export function writeTypes(project: ApiProject, typesSource: string): void {
  fs.writeFileSync(path.join(project.dir, 'src', 'types.ts'), typesSource);
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

/** The server alone, the whole program, or the types-package client, each into its own gen dir, routes bundled. **/
export function compile(project: ApiProject, side: 'server' | 'client' | 'types-client'): CliResult {
  const [tsconfigFile, genDir] = {
    server: [SERVER_TSCONFIG, project.serverGen],
    client: ['tsconfig.json', project.clientGen],
    'types-client': [TYPES_CLIENT_TSCONFIG, project.typesClientGen],
  }[side];
  return runMion(
    ['compile', '--cwd', project.dir, '--tsconfig', tsconfigFile, '--gen-dir', genDir, '--client-routes', 'bundle'],
    project.dir
  );
}

/** The types-only package of the server, written where the types client installs it. **/
export function apiTypes(project: ApiProject): CliResult {
  const out = path.join(project.dir, 'node_modules', ...TYPES_PACKAGE.split('/'));
  return runMion(['api-types', '--cwd', project.dir, '--tsconfig', SERVER_TSCONFIG, '--out', out], project.dir);
}

/** api-check of a server manifest against a client manifest (a gen dir or the file itself). **/
export function apiCheck(project: ApiProject, serverGen: string, client: string): CliResult {
  return runMion(['api-check', '--server-gen-dir', serverGen, '--client-gen-dir', client], project.dir);
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

export function readManifest(genDir: string, file: 'manifest.json' | 'client-manifest.json'): Manifest {
  return JSON.parse(fs.readFileSync(path.join(genDir, 'api', file), 'utf8')) as Manifest;
}

/** The transform's import binding for a cache entry is `__rt_` plus the id
 *  with every non-identifier character as `$XX` (two hex digits). **/
function unescapeBinding(binding: string): string {
  return binding.replace(/\$([0-9A-Fa-f]{2})/g, (_match, hex: string) => String.fromCharCode(parseInt(hex, 16)));
}

/** The ids the marker road assigned: the compiled probes file carries each
 *  probe as `getRunTypeId(undefined, __rt_<id>)` (the static shape) or
 *  `getRunTypeId(value, __rt_<id>)` (the value shape), keyed by export name. **/
export function readProbeIds(project: ApiProject): Map<string, string> {
  const compiled = fs.readFileSync(path.join(project.dir, 'dist', 'probes.js'), 'utf8');
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
export function checkServerManifestAgainstProbes(project: ApiProject): void {
  const manifest = readManifest(project.serverGen, 'manifest.json');
  if (manifest.kind !== 'server') throw new Error(`the server build wrote a ${manifest.kind} manifest`);
  const probes = readProbeIds(project);
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

/** A2: no rpc-client-* diagnostic and exactly the called routes bundled. **/
export function checkClientBundle(project: ApiProject, build: CliResult, clientGen = project.clientGen): void {
  if (build.status !== 0) throw new Error(`client compile exited ${build.status}\n--- stderr ---\n${build.stderr}`);
  const met = build.stderr.split('\n').filter((line) => /\brpc-client-[a-z0-9-]+/.test(line));
  if (met.length) throw new Error(`A2: the client build reported bundled-API diagnostics:\n${met.join('\n')}`);
  const manifest = readManifest(clientGen, 'client-manifest.json');
  if (manifest.kind !== 'client') throw new Error(`the client build wrote a ${manifest.kind} manifest`);
  const bundled = Object.keys(manifest.methods).sort();
  if (bundled.join(',') !== [...CALLED_ROUTE_IDS].sort().join(','))
    throw new Error(`A2: bundled ${bundled.join(',')}, expected ${CALLED_ROUTE_IDS.join(',')}`);
}

/** A3: api-check passes: the client's ids, families, options and chains are the server's. **/
export function checkApiCheckPasses(project: ApiProject, clientGen = project.clientGen): void {
  const check = apiCheck(project, project.serverGen, clientGen);
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

/** Builds the project twice for one generated type and runs A1-A3; throws with the full context on a failure. **/
export function runApiIdsIteration(project: ApiProject, gen: GeneratedType): void {
  const typesSource = renderTypesModule(gen);
  writeTypes(project, typesSource);
  try {
    const server = compile(project, 'server');
    if (server.status !== 0) throw new Error(`server compile exited ${server.status}\n--- stderr ---\n${server.stderr}`);
    if (fs.existsSync(path.join(project.serverGen, 'api', 'client-manifest.json')))
      throw new Error('the server build holds no client, so it writes no client manifest');
    checkServerManifestAgainstProbes(project);
    checkClientBundle(project, compile(project, 'client'));
    checkApiCheckPasses(project);
    const published = apiTypes(project);
    if (published.status !== 0) throw new Error(`A4: api-types exited ${published.status}\n--- stderr ---\n${published.stderr}`);
    checkClientBundle(project, compile(project, 'types-client'), project.typesClientGen);
    checkApiCheckPasses(project, project.typesClientGen);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`${message}\n--- types.ts ---\n${typesSource}`);
  }
}

export async function runApiIdsFuzz(options: ApiIdsFuzzOptions): Promise<ApiIdsFuzzReport> {
  const report: ApiIdsFuzzReport = {iterations: 0, failures: []};
  const project = createApiProject();
  try {
    for (let iteration = 0; iteration < options.iterations; iteration++) {
      report.iterations++;
      const gen = withSeededRandom(mixSeed(options.seed, 'apiids', iteration), () => genType(API_IDS_GEN_OPTIONS));
      try {
        runApiIdsIteration(project, gen);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        report.failures.push(`iteration ${iteration} (seed ${options.seed}, ${describeType(gen)}): ${message}`);
      }
    }
  } finally {
    destroyApiProject(project);
  }
  return report;
}
