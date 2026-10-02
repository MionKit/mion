// The bundled-API id lane: the real `mion` binary builds one temp fullstack project twice per generated type,
// into a SERVER then a CLIENT gen dir. A1: every server manifest row's ids equal a reflection-marker probe's
// (both getRunTypeId call shapes). A2: the client build reports no MET diagnostic, bundles exactly the routes
// it calls and writes a byte-identical api/ tree. A3: `mion api-check` over the two manifests exits 0.
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

const ROUTER_DTS = `declare module '@mionjs/router' {
  type Handler = (...args: any[]) => any;
  type Opts = {alwaysRun: false; description: undefined; parser: {params: 'clone'; return: 'clone'}; isMutation: undefined; sanitizeParams: undefined};
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
  export function initClient<RA>(o?: unknown): {routes: ClientRoutes<RA>};
}
`;

const CLIENT_TS = `import {initClient} from '@mionjs/client';
import type {api} from './server.ts';
import type {Root} from './types.ts';
declare const rootValue: Root;
export const {routes} = initClient<typeof api>({baseURL: 'http://x'});
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

export const PROJECT_TSCONFIG = tsconfig({});

/** Renders the generated type as the project's `types.ts`. **/
export function renderTypesModule(gen: GeneratedType): string {
  const {decls, rootExpr} = renderGenerated(gen, FUZZ_FORMAT_PREAMBLE_PACKAGE);
  return `${decls}${decls ? '\n' : ''}export type Root = ${rootExpr};\n`;
}

// --- the on-disk project -------------------------------------------------------

export interface ApiProject {
  dir: string;
  serverGen: string;
  clientGen: string;
}

/** One project per run, reused across iterations: the marker dist copy is the expensive part. **/
export function createApiProject(): ApiProject {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-apiids-fuzz-'));
  fs.mkdirSync(path.join(dir, 'src'), {recursive: true});
  writeMarkerPackage(dir);
  fs.writeFileSync(path.join(dir, 'tsconfig.json'), PROJECT_TSCONFIG);
  const files = {
    'router.d.ts': ROUTER_DTS,
    'server.ts': SERVER_TS,
    'probes.ts': PROBES_TS,
    'client.d.ts': CLIENT_DTS,
    'app.ts': CLIENT_TS,
  };
  for (const [rel, content] of Object.entries(files)) fs.writeFileSync(path.join(dir, 'src', rel), content);
  return {dir, serverGen: path.join(dir, '.mion-server'), clientGen: path.join(dir, '.mion-client')};
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

/** One build of the project into genDir, routes bundled. **/
export function compile(project: ApiProject, genDir: string): CliResult {
  return runMion(
    ['compile', '--cwd', project.dir, '--tsconfig', 'tsconfig.json', '--gen-dir', genDir, '--client-routes', 'bundle'],
    project.dir
  );
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

/** Every file under dir, relative path to content. **/
function readTree(dir: string, prefix = ''): Map<string, string> {
  const out = new Map<string, string>();
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) for (const [file, content] of readTree(full, rel)) out.set(file, content);
    else out.set(rel, fs.readFileSync(full, 'utf8'));
  }
  return out;
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

/** A2: no MET diagnostic, exactly the called routes bundled, and the server build's api/ tree. **/
export function checkClientBundle(project: ApiProject, build: CliResult): void {
  if (build.status !== 0) throw new Error(`client compile exited ${build.status}\n--- stderr ---\n${build.stderr}`);
  const met = build.stderr.split('\n').filter((line) => /\bMET\d{3}\b/.test(line));
  if (met.length) throw new Error(`A2: the client build reported bundled-API diagnostics:\n${met.join('\n')}`);
  const manifest = readManifest(project.clientGen, 'client-manifest.json');
  if (manifest.kind !== 'client') throw new Error(`the client build wrote a ${manifest.kind} manifest`);
  const bundled = Object.keys(manifest.methods).sort();
  if (bundled.join(',') !== [...CALLED_ROUTE_IDS].sort().join(','))
    throw new Error(`A2: bundled ${bundled.join(',')}, expected ${CALLED_ROUTE_IDS.join(',')}`);
  const serverTree = readTree(path.join(project.serverGen, 'api'));
  const clientTree = readTree(path.join(project.clientGen, 'api'));
  const files = new Set([...serverTree.keys(), ...clientTree.keys()]);
  for (const file of files) {
    if (serverTree.get(file) !== clientTree.get(file))
      throw new Error(`A2: api/${file} differs between the two builds of one program`);
  }
}

/** A3: api-check passes: the client's ids, families, options and chains are
 *  the server's. **/
export function checkApiCheckPasses(project: ApiProject): void {
  const check = apiCheck(project, project.serverGen, project.clientGen);
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
    const server = compile(project, project.serverGen);
    if (server.status !== 0) throw new Error(`server compile exited ${server.status}\n--- stderr ---\n${server.stderr}`);
    checkServerManifestAgainstProbes(project);
    checkClientBundle(project, compile(project, project.clientGen));
    checkApiCheckPasses(project);
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
