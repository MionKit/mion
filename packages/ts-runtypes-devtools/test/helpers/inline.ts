// Test helpers for in-memory inline sources.
//
// Process model: one ts-runtypes process per VITEST WORKER (not per
// test file). Vitest's default `pool: 'forks'` spawns one Node child per
// worker; each worker can run multiple test files sequentially. Within a
// single worker we share one ts-runtypes subprocess and clear its
// state between test files via a `reset` op. Across workers, each worker
// has its own subprocess — no inter-process shared state, parallel-file
// execution stays safe.
//
// The singleton is stashed on `globalThis` because vitest's `isolate: true`
// resets the module graph per file (so a module-scope `let` would re-spawn
// the process every file). Module-scope state is fresh per file; the
// global slot survives.
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import {AsyncLocalStorage} from 'node:async_hooks';
import {it, type TestAPI} from 'vitest';
import {ResolverClient} from '../../src/resolver-client.ts';
import {type Replacement, type Site, type RunType, type SourceMap} from '../../src/protocol.ts';

const ROOT = path.resolve(__dirname, '../../../..');
export const BIN = path.resolve(ROOT, 'bin/ts-runtypes');
export const hasBinary = (): boolean => fs.existsSync(BIN);

// BARE_CWD is the working directory for bare (config-less) server spawns. The
// daemon resolves the tsconfig exactly as tsc does — searching upward from
// cwd — so a spawn rooted at the repo would adopt the repo's own tsconfig.
// Bare suites pin the no-config posture instead: a temp dir with no
// tsconfig.json above it (nothing sits above the system temp root).
export const BARE_CWD = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-bare-'));

export type InlineSources = Record<string, string>;

// The REAL `@mionjs/run-types` package — its package.json plus the built
// dist/**/*.d.ts declaration tree (esm AND dist/cjs/, since a node16-style
// CommonJS importer resolves the `require` export condition) — keyed as
// virtual node_modules paths for setSources. `withInlineSources` always
// injects it, so test snippets resolve the marker module exactly the way a
// consumer install does; there is no hand-written module stand-in to drift
// ("Real types, never copies" in ts-runtypes/test/fuzz/README.md). Read once
// per worker; the dist is guaranteed fresh by `pretest` → `check:builds`.
const MARKER_PKG_DIR = path.resolve(ROOT, 'packages/run-types');
export const MARKER_PACKAGE_OVERLAY: Readonly<InlineSources> = (() => {
  const files: InlineSources = {};
  files['node_modules/@mionjs/run-types/package.json'] = fs.readFileSync(path.join(MARKER_PKG_DIR, 'package.json'), 'utf8');
  const walk = (dir: string, rel: string): void => {
    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
      if (entry.isDirectory()) walk(path.join(dir, entry.name), `${rel}${entry.name}/`);
      else if (entry.name.endsWith('.d.ts')) {
        files[`node_modules/@mionjs/run-types/dist/${rel}${entry.name}`] = fs.readFileSync(path.join(dir, entry.name), 'utf8');
      }
    }
  };
  walk(path.join(MARKER_PKG_DIR, 'dist'), '');
  return files;
})();

// The canonical minimal `Temporal` ambient (ts-go-runtypes/internal/
// testfixtures/temporal.d.ts, the same file the Go suites embed), for
// fixtures that USE Temporal types. Kept OUT of MARKER_PACKAGE_OVERLAY
// itself so tsconfig-lib-sensitive suites can mount the package without a
// Temporal ambient — the package's own declaration graph degrades gracefully
// without it (the guarded fallbacks in formats/datetime/temporalFormats.ts,
// pinned by test/types/dataonlyTemporalPosture.test.ts).
export const TEMPORAL_DTS = fs.readFileSync(path.resolve(ROOT, 'ts-go-runtypes/internal/testfixtures/temporal.d.ts'), 'utf8');

/** Writes MARKER_PACKAGE_OVERLAY to REAL disk under `dir` — for suites whose
 *  fixtures live in a scratch directory the daemon resolves from disk. **/
export function writeMarkerPackage(dir: string): void {
  for (const [rel, content] of Object.entries(MARKER_PACKAGE_OVERLAY)) {
    const abs = path.join(dir, rel);
    fs.mkdirSync(path.dirname(abs), {recursive: true});
    fs.writeFileSync(abs, content);
  }
}

// Shape of the daemon-response capture attached to `task.meta.mionRunTypes`.
// Read by `scripts/runtypes-logs-reporter.mjs` when `pnpm test:logs` runs.
// `responses` is an array because a single test may call `evalCacheFor`
// multiple times; outside that path the field is silently absent.
export interface RunTypesMeta {
  title: string;
  sources: InlineSources;
  mode: 'inline' | 'file';
  paths?: Record<string, string>;
  responses: unknown[];
}

// AsyncLocalStorage bridge between runTest/runFiles (which know the test's
// `task.meta` object) and evalCacheFor (which knows the daemon response).
// The helpers run `fn(sources)` inside `metaStore.run(meta, ...)`, so any
// await-chained call from inside the test can read the same meta via
// `metaStore.getStore()` and push onto its `responses` array.
const metaStore = new AsyncLocalStorage<RunTypesMeta>();

function recordResponse(response: unknown): void {
  const meta = metaStore.getStore();
  if (meta) meta.responses.push(response);
}

// Per-worker singleton stash. Survives vitest's per-file module isolation
// because `globalThis` lives on the underlying Node process. Two slots:
//   client      — the spawned ResolverClient (or null if not yet spawned).
//   atExitWired — process-exit hook only registered once per worker.
interface WorkerStash {
  client: ResolverClient | null;
  atExitWired: boolean;
}
const STASH_KEY = '__tsGoRunTypesWorkerStash' as const;
type GlobalWithStash = typeof globalThis & {[STASH_KEY]?: WorkerStash};

function workerStash(): WorkerStash {
  const g = globalThis as GlobalWithStash;
  if (!g[STASH_KEY]) {
    g[STASH_KEY] = {client: null, atExitWired: false};
  }
  return g[STASH_KEY]!;
}

function getClient(): ResolverClient {
  const stash = workerStash();
  if (stash.client) return stash.client;
  if (!hasBinary()) throw new Error(`ts-runtypes binary not built: ${BIN}`);
  // serve --sources ops: no startup Program, no handshake. cwd = repo root so
  // setSources keys like "user.ts" resolve to <repo>/user.ts.
  // emitMode:'both' mirrors the sibling `ts-runtypes` vitest config —
  // every cache module rendered during the test run carries BOTH the body
  // string AND the inline `createRTFn` closure so the helper's
  // diagnostic-style tests can assert against either form. Per-test cases that
  // need the production default ('code', no inline factory) spin up a one-shot
  // client with that mode when needed.
  stash.client = new ResolverClient(BIN, BARE_CWD, '', {serverMode: true, emitMode: 'both'});
  if (!stash.atExitWired) {
    stash.atExitWired = true;
    // Best-effort cleanup if the worker exits without going through the
    // setupFiles afterAll hook (uncaught throws, vitest forcing termination).
    process.once('exit', () => {
      const s = (globalThis as GlobalWithStash)[STASH_KEY];
      if (s?.client) s.client.close();
    });
  }
  return stash.client;
}

// resetSharedClient wipes resolver state between test files. Invoked by
// the setupFiles entry's afterAll — kept here so the setup module doesn't
// reach into the stash directly.
export async function resetSharedClient(): Promise<void> {
  const {client} = workerStash();
  if (client) await client.reset();
}

export interface WithInlineOpts {
  // When true, sends a `reset` op before installing the new sources.
  // `reset` wipes EVERYTHING (cache, sites, Program, overlay). With
  // per-request projection, most tests don't need it: scanFiles already
  // scopes its runTypes / entryModules response to the request's
  // files, independent of anything else in the cache. Kept for tests
  // that want a guaranteed-empty global cache (e.g. dump assertions).
  reset?: boolean;
}

export async function withInlineSources<T>(
  sources: InlineSources,
  fn: (ctx: {client: ResolverClient; sources: InlineSources}) => Promise<T>,
  opts: WithInlineOpts = {}
): Promise<T> {
  const client = getClient();
  if (opts.reset) await client.reset();
  // The real marker package rides along as virtual node_modules so caller
  // fixtures stay terse. A caller-supplied "runtypes.d.ts" ambient (the
  // deliberate shape-probe suites) replaces it entirely — same guard as the
  // Go twin (setupInlineWith) so the two lanes keep one contract.
  const augmented: InlineSources =
    'runtypes.d.ts' in sources ? {...sources} : {...MARKER_PACKAGE_OVERLAY, 'temporal.d.ts': TEMPORAL_DTS, ...sources};
  await client.setSources(augmented);
  // The callback sees only the caller's own files: the node_modules overlay
  // is resolution input for the daemon, never something a test should scan.
  return fn({client, sources});
}

// rewrite drives the compiler-driven transform (OpTransform) for a single
// inline source and returns the patched code + recorded sites/replacements +
// source map — the same shape the old JS rewrite() returned, so the call-site
// tests stay unchanged. The Go binary now owns the rewrite + map generation.
export async function rewrite(
  file: string,
  code: string,
  client: ResolverClient
): Promise<{code: string; map?: SourceMap | null; sites: Site[]; replacements: Replacement[]}> {
  const result = await client.transform([file]);
  const fileResult = result.transformed[file];
  return {
    code: fileResult?.code ?? code,
    map: fileResult?.map ?? undefined,
    sites: result.sites,
    replacements: result.replacements ?? [],
  };
}

// Convenience: rewrite a single inline source and return both the patched
// code and the recorded sites. Uses the shared per-worker client.
export async function rewriteInline(
  file: string,
  code: string,
  opts: WithInlineOpts = {}
): Promise<{out: string; sites: Site[]}> {
  return withInlineSources(
    {[file]: code},
    async ({client, sources}) => {
      const {code: out, sites} = await rewrite(file, sources[file], client);
      return {out, sites};
    },
    opts
  );
}

// Cache shape produced by evaluating the rendered runtypes-cache module.
// `byHash` is the module-local `cache` object returned by `initCache()` —
// flat `{[rawHash]: RunType}`. `sites` is pulled straight off the
// daemon response.
export interface EvaluatedCache {
  byHash: Record<string, RunType>;
  sites: Site[];
}

// Full pipeline: scan every test source in ONE scanFiles request. The
// Go side projects the per-entry virtual modules over exactly those
// files, independent of anything else in the cache. Every entry module is
// evaluated (see evalEntryModules), the runtype tuples are instantiated
// against a stub registry, and the populated cache object is returned.
export async function evalCacheFor(sources: InlineSources, opts: WithInlineOpts = {}): Promise<EvaluatedCache> {
  return withInlineSources(
    sources,
    async ({client, sources: augmented}) => {
      const files = Object.keys(augmented).filter((file) => file !== 'runtypes.d.ts');
      if (files.length === 0) throw new Error('evalCacheFor: no source files to scan');
      const response = await client.scanFiles(files, {includeEntryModules: true});
      recordResponse(response);
      const {entryModules} = response;
      if (!entryModules) throw new Error('evalCacheFor: resolver returned no entryModules');
      const tuples = evalEntryModules(entryModules);
      return {byHash: instantiateRunTypes(tuples), sites: response.sites ?? []};
    },
    opts
  );
}

// One evaluated entry-module tuple, indexed positionally — slot 0 the kind /
// family tag, slot 1 the deps thunk (undefined when dep-less; never self),
// slot 2 the ini fn, slot 3 the cache key, slot 4+ the legacy positional
// args. Mirrors the layout contract in
// packages/run-types/src/runtypes/entryTuple.ts.
export type EntryTuple = readonly unknown[];

const IMPORT_LINE = /^import \{(__rt_[A-Za-z0-9_$]+)\} from 'rtmod:\/(.+)\.js';\n/gm;
const EXPORT_LINE = /^export const (__rt_[A-Za-z0-9_$]+)=/m;

// evalEntryModules evaluates every per-entry virtual module source into its
// exported tuple, keyed by basename. Imports between entry modules are
// emulated with LIVE bindings: each module body runs inside a `with` scope
// whose proxy resolves the imported binding identifiers (`__rt_<dep>`) lazily
// at access time — by the time any deps() thunk dereferences them, every
// module has evaluated, so recursive type graphs behave exactly as real ESM
// cycles do. The module's own export (also `__rt_`-named) shadows the proxy
// as a local, and the factory `code` strings are never touched (no
// identifier rewriting).
export function evalEntryModules(modules: Record<string, string>): Record<string, EntryTuple> {
  const tuples: Record<string, EntryTuple> = {};
  for (const [basename, source] of Object.entries(modules)) {
    const importsByBinding = new Map<string, string>();
    const stripped = source.replace(IMPORT_LINE, (_whole, binding: string, dep: string) => {
      importsByBinding.set(binding, dep);
      return '';
    });
    const exportName = stripped.match(EXPORT_LINE)?.[1];
    if (!exportName) throw new Error(`evalEntryModules: no entry export in ${basename}:\n${source}`);
    const body = stripped.replace(EXPORT_LINE, `const ${exportName}=`);
    const scope = new Proxy(
      {},
      {
        has: (_target, prop) => typeof prop === 'string' && importsByBinding.has(prop),
        get: (_target, prop) => tuples[importsByBinding.get(prop as string)!],
      }
    );
    // Sloppy-mode `new Function` body so `with` is legal; entry modules are
    // emitted without a 'use strict' prologue on purpose.
    const factory = new Function('__scope', `with(__scope){${body}\nreturn ${exportName};}`);
    tuples[basename] = factory(scope) as EntryTuple;
  }
  return tuples;
}

// instantiateRunTypes builds the RunType records from every row of the
// runtype data-bundle tuple (slot 0 === 4; headless rows in slot 4), wires each
// node's ref slots from the parallel `rels` array (slot 5, by row index), and
// runs any residual footer initializer (slot 2 — the rare expression-specials)
// against a stub registry — the same two-phase shape the marker package's
// initFromTuple performs against the real rtUtils. Facade tuples (slot 0 === 5)
// carry no data and are skipped. Returns the flat {[id]: RunType} table.
export function instantiateRunTypes(tuples: Record<string, EntryTuple>): Record<string, RunType> {
  const registered: Record<string, RunType> = {};
  const stub = {
    useRunType(id: string): RunType {
      const entry = registered[id];
      if (!entry) throw new Error(`stub useRunType: no entry for ${id}`);
      return entry;
    },
  };
  const bundles: EntryTuple[] = [];
  for (const tuple of Object.values(tuples)) {
    if (!Array.isArray(tuple) || tuple[0] !== 4) continue;
    for (const row of (tuple[4] ?? []) as readonly (readonly unknown[])[]) {
      registered[row[0] as string] = buildRunTypeFromRow(row);
    }
    bundles.push(tuple);
  }
  for (const tuple of bundles) {
    wireBundleRels(tuple, registered);
    if (typeof tuple[2] === 'function') (tuple[2] as (rtu: typeof stub) => void)(stub);
  }
  return registered;
}

// Relation-slot order + single/array split — duplicated from
// RUN_TYPE_REL_KEYS / RUN_TYPE_REL_IS_ARRAY in
// packages/run-types/src/runtypes/entryTuple.ts (kept local so this test
// helper doesn't drag the whole ts-runtypes type graph into the devtools
// typecheck). Mirrors Go's runtype.renderRelations; the tests that walk the
// reflected graph catch any drift.
const REL_KEYS = [
  'child',
  'children',
  'index',
  'return',
  'indexType',
  'parameters',
  'safeUnionChildren',
  'unionDiscriminators',
  'typeMeta',
  'typeArguments',
  'arguments',
  'extendsArguments',
  'implements',
  'extends',
] as const;
const REL_IS_ARRAY = [false, true, false, false, false, true, true, true, true, true, true, true, true, true] as const;

// wireBundleRels mirrors entryTuple.ts's wireBundleRelations: patch each node's
// ref slots from the parallel `rels` array (slot 5) by ROW INDEX. A number is a
// row index, a string a foreign id (registry lookup), anything else an inline
// non-ref RunType. Runs after every row is registered, so cycles resolve.
function wireBundleRels(tuple: EntryTuple, registered: Record<string, RunType>): void {
  const rows = (tuple[4] ?? []) as readonly (readonly unknown[])[];
  const rels = (tuple[5] ?? []) as readonly (readonly unknown[] | undefined)[];
  const byIndex = rows.map((row) => registered[row[0] as string]);
  const resolve = (rel: unknown): unknown =>
    typeof rel === 'number' ? byIndex[rel] : typeof rel === 'string' ? registered[rel] : rel;
  for (let i = 0; i < rels.length; i++) {
    const relRow = rels[i];
    if (!relRow) continue;
    const target = byIndex[i] as unknown as Record<string, unknown>;
    if (!target) continue;
    for (let slot = 0; slot < REL_KEYS.length; slot++) {
      const value = relRow[slot];
      if (value === undefined) continue;
      target[REL_KEYS[slot]] = REL_IS_ARRAY[slot] ? (value as readonly unknown[]).map(resolve) : resolve(value);
    }
  }
}

// buildRunTypeFromRow mirrors the 20-slot row construction in
// packages/run-types/src/runtypes/entryTuple.ts (registerRunTypeBundle):
// every ref-bearing slot starts undefined and is patched by the ini pass.
function buildRunTypeFromRow(row: readonly unknown[]): RunType {
  const arg = (offset: number) => row[offset];
  return {
    id: arg(0),
    kind: arg(1),
    subKind: arg(2),
    typeName: arg(3),
    name: arg(4),
    literal: arg(5),
    optional: arg(6),
    readonly: arg(7),
    isAbstract: arg(8),
    isStatic: arg(9),
    visibility: arg(10),
    isSafeName: arg(11),
    position: arg(12),
    isCircular: arg(13),
    flags: arg(14),
    description: arg(15),
    defaultVal: arg(16),
    enumVal: arg(17),
    values: arg(18),
    notSupported: arg(19),
    child: undefined,
    index: undefined,
    return: undefined,
    indexType: undefined,
    parameters: undefined,
    children: undefined,
    safeUnionChildren: undefined,
    unionDiscriminators: undefined,
    typeMeta: undefined,
    typeArguments: undefined,
    arguments: undefined,
    extendsArguments: undefined,
    implements: undefined,
    extends: undefined,
    classType: undefined,
  } as unknown as RunType;
}

// Look up the resolved RunType for a given source file in an evaluated cache.
// Throws if no site was recorded or the id is missing — both indicate the
// source under test didn't match the marker the way the test expected.
export function getTypeFor(cache: EvaluatedCache, file: string): RunType {
  const site = cache.sites.find((s) => s.file === file);
  if (!site) throw new Error(`no site recorded for ${file}`);
  const t = cache.byHash[site.id];
  if (!t) throw new Error(`type ${site.id} not in cache for ${file}`);
  return t;
}

// Sugar so each test file doesn't repeat the gating boilerplate.
export const runIfBinary = (it: TestAPI): TestAPI['skip'] | TestAPI => (hasBinary() ? it : it.skip);

// name -> absolute path on disk. Used by runFiles to load real fixture
// files instead of inline string literals.
export type FilePaths = Record<string, string>;

/** Skip-gated test that hoists (title, sources) so they are addressable as data for future docs generation. */
export function runTest(title: string, sources: InlineSources, fn: (sources: InlineSources) => void | Promise<void>): void {
  const register = runIfBinary(it);
  register(title, async ({task}) => {
    const meta: RunTypesMeta = {title, sources, mode: 'inline', responses: []};
    (task.meta as Record<string, unknown>).mionRunTypes = meta;
    await metaStore.run(meta, () => Promise.resolve(fn(sources)));
  });
}

/** Like runTest, but each value is an absolute path to a fixture file. Missing files fail loudly. */
export function runFiles(title: string, files: FilePaths, fn: (sources: InlineSources) => void | Promise<void>): void {
  const register = runIfBinary(it);
  register(title, async ({task}) => {
    const resolved: InlineSources = {};
    for (const [name, abs] of Object.entries(files)) {
      if (!fs.existsSync(abs)) throw new Error(`runFiles: missing fixture file for "${name}": ${abs}`);
      resolved[name] = fs.readFileSync(abs, 'utf8');
    }
    const meta: RunTypesMeta = {title, sources: resolved, mode: 'file', paths: files, responses: []};
    (task.meta as Record<string, unknown>).mionRunTypes = meta;
    await metaStore.run(meta, () => Promise.resolve(fn(resolved)));
  });
}
