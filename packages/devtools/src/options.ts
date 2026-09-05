/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Everything the mion PRESETS share, so the vite lane and the Next lane cannot
// drift apart. Both take the same `runTypes` options, map them to the same
// resolver options, reject the same removed keys and harvest the batches (and
// their inputFrom mappers) the same way. What stays behind in each preset is only what its host actually has:
// vite keeps the Vue SFC pass, middleware mode and module-graph invalidation;
// Next keeps nothing extra, because the broker's typeDeps + stamp already cover
// staleness and Next runs its own dev server.

import path from 'node:path';
import {createHash} from 'node:crypto';
import {existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync} from 'node:fs';
import type {PluginOptions as TsRuntypesPluginOptions} from './core/unplugin.ts';

/** One report record from the mion pure-fn build report (structural subset). */
export type RtPureFnSite = Parameters<NonNullable<TsRuntypesPluginOptions['onPureFnReport']>>[0][number];
/** One report record from the mion batch build report (structural subset). */
export type RtBatchSite = Parameters<NonNullable<TsRuntypesPluginOptions['onBatchReport']>>[0][number];

/** Options for the mion powered type transformation. */
export interface MionRunTypesOptions {
  /** Path to tsconfig.json (absolute, or relative to the vite root). */
  tsConfig?: string;
  /** Explicit path to the mion resolver binary. Default resolution:
   *  MION_BIN env var → the published platform binary, both via @mionjs/bin-compiler getExePath().
   *  MION_BIN also covers the ESLint lane, so prefer it over a per-plugin path when both must match. */
  binary?: string;
  /** RunTypes generated-output root (generated modules under `<genDir>/types/` gitignored,
   *  committed enrichment under `<genDir>/enriched/`). Renamed from `outDir` in RunTypes 0.10.0. */
  genDir?: string;
  /** @deprecated use `genDir` — kept as an alias for existing configs. */
  outDir?: string;
  /** What generated fn entries ship: 'code' (default) | 'both'.
   *
   *  ⚠️ EDGE TARGETS MUST USE 'both'. With 'code' an entry carries only the compiled fn's SOURCE
   *  STRING, which @mionjs/run-types turns into a real function with `new Function` on first use.
   *  Cloudflare Workers (workerd), Vercel Edge and any CSP without 'unsafe-eval' refuse that, so
   *  initRoutes dies on the first route with "Code generation from strings disallowed for this
   *  context". 'both' emits the live factory ALONGSIDE the code string: nothing is compiled at
   *  runtime (also a faster cold start), and the string is still there for the methods-metadata
   *  route to serialize to clients. Cost is bundle size — roughly +30% raw, +15% gzipped.
   *
   *  mion deliberately does NOT support RunTypes' third mode, 'functions'. That mode ships a
   *  live `createRTFn` closure and omits `code` — but mion's whole client story is serializing
   *  compiled fns to the browser as strings and rebuilding them there, so an entry with no body
   *  cannot cross the wire. Allowing it would silently ship clients that throw on first validate.
   *  Guaranteeing `code` here is what lets `MionTypeFn` type it as required (see
   *  packages/core/src/types/general.types.ts). Passing 'functions' throws at config time. */
  emitMode?: 'code' | 'both';
  /** Cache-module grouping, see the runtypes core docs. 'default' | 'allModules' | 'allSingle'.
   *
   *  'allSingle' was rejected at config time until RunTypes 0.12.2: that mode emits one import
   *  per family bundle, and the transform used to name them all from the first bundle, so most fn
   *  bindings resolved to nothing. Fixed upstream, so the mode is usable again. */
  moduleMode?: TsRuntypesPluginOptions['moduleMode'];
  inlineMode?: TsRuntypesPluginOptions['inlineMode'];
  transformMode?: TsRuntypesPluginOptions['transformMode'];
  /** Halt the build on Error-severity mion diagnostics (default true — the
   *  RunTypes adapter is scanner-clean since the pure-fn helpers moved onto the
   *  untracked runtime-key APIs, so strict mode is safe monorepo-wide). */
  failOnError?: TsRuntypesPluginOptions['failOnError'];
  /** How many mockSamples to generate for a TypeFormat pattern that declares none.
   *  Pattern checks run on a real JS engine (the same `new RegExp` the emitted validator
   *  uses), so any JS regex is checkable — there is nothing to opt out of. Declared
   *  mockSamples always win over generation. A pattern the generator cannot handle
   *  (lookarounds are the usual case) fails the build with FMT005, asking for explicit
   *  mockSamples. */
  patternSampleCount?: TsRuntypesPluginOptions['patternSampleCount'];
  /** How many times to retry sample generation before failing with FMT005. The total
   *  budget is `patternSampleCount * patternSampleRetries` — raise this for heavily
   *  constrained patterns whose random draws often miss. */
  patternSampleRetries?: TsRuntypesPluginOptions['patternSampleRetries'];
  /** JS runtime used to run the pattern-checking sidecar. node and bun are found
   *  automatically on PATH; set this (or the upstream `MION_JS_RUNTIME` env var) only to
   *  point at another runtime. When no runtime can be started the build fails closed
   *  with FMT004 rather than shipping unverified patterns. */
  jsRuntime?: TsRuntypesPluginOptions['jsRuntime'];
  /** Transform typed mion code inside Vue SFC `<script>` blocks (default true). The script is
   *  registered with the resolver under a virtual path next to the .vue file and injected before
   *  @vitejs/plugin-vue compiles it — see sfcTransform.ts. Turn it off only to rule the SFC pass
   *  out while debugging: with it off, a marker call inside an SFC gets no compiled fns and fails
   *  at runtime. */
  sfc?: boolean;
}

/** Where the mion API lives, as both presets read it. The batch transport writes the module the
 *  server build imports into the API's project root, so a client whose API is a SEPARATE project
 *  (its own vite config, package or repo) points here. A client that shares its root with the API
 *  (fullstack, middleware mode, one package with two entries) needs nothing: the module lands in
 *  that shared root. The vite preset's `server` block extends this with the run-mode knobs; the Next
 *  preset takes only these two fields, as a pointer, and never spawns anything. */
export interface MionServerPointer {
  /** Absolute path to the server entry script. */
  startScript: string;
  /** The server's own vite config. Its directory is the server root; without it the nearest
   *  package.json above `startScript` decides. */
  viteConfig?: string;
}

let legacyBinEnvNoticeShown = false;

// ############# removed-option migration guard (0.8 → 0.9) #############
// These deepkit/AOT-era options were accepted-and-ignored through the mion migration and are
// now gone from the types. Deleting them from the interfaces alone only fails a TYPED config; a plain
// vite.config.js would silently drop them, which is worse than the notice it replaces. So the keys are
// still detected at config time and throw with what to do instead — loud in both lanes, which is the
// end state the deprecation was aiming at. Remove this guard at 1.0.
const TRANSPORT_HINT =
  'The batch transport is automatic: the client build writes `.mion/rpc/batches.generated.js` into the ' +
  'server root and the server build imports it. Delete this option; when the API is a separate project, ' +
  'point `server.startScript` / `server.viteConfig` at it.';
const REMOVED_PLUGIN_OPTIONS: Record<string, string> = {
  aotCaches: 'AOT caches are obsolete — the mion generated modules ARE the compiled artifact. Delete this option.',
  serverPureFunctions: `pure-fn extraction rides the batch transport now. ${TRANSPORT_HINT}`,
  serverMappers: `the serverMapFrom transport became the batch transport. ${TRANSPORT_HINT}`,
  batches: TRANSPORT_HINT,
};
const REMOVED_RUNTYPES_OPTIONS: Record<string, string> = {
  compilerOptions: 'the deepkit type-compiler is gone; there is nothing to configure. Delete this option.',
  include: 'scan scope comes from the tsconfig program — narrow `include` in the tsconfig instead.',
  exclude: 'scan scope comes from the tsconfig program — narrow `exclude` in the tsconfig instead.',
  reflectionMode: 'deepkit reflection is gone; types are resolved at build time and always compiled. Delete this option.',
  reflection: 'deepkit reflection is gone; types are resolved at build time and always compiled. Delete this option.',
};

/** Throws on any deepkit/AOT-era option a stale config still passes, naming the replacement.
 *  Reads through an index signature so untyped JS/JSON configs are caught too, not just typed ones. */
export function assertNoRemovedOptions(options: MionPresetOptions): void {
  const found: string[] = [];
  const root = options as Record<string, unknown>;
  for (const [key, hint] of Object.entries(REMOVED_PLUGIN_OPTIONS)) {
    if (root[key] !== undefined) found.push(`  - ${key}: ${hint}`);
  }
  const rt = (options.runTypes ?? {}) as Record<string, unknown>;
  for (const [key, hint] of Object.entries(REMOVED_RUNTYPES_OPTIONS)) {
    if (rt[key] !== undefined) found.push(`  - runTypes.${key}: ${hint}`);
  }
  if (found.length === 0) return;
  throw new Error(
    `[mionVitePlugin] removed option${found.length > 1 ? 's' : ''} in your config (they stopped doing anything ` +
      `at the mion migration and are now gone):\n${found.join('\n')}`
  );
}

/** Resolves the mion resolver binary: explicit option → @mionjs/bin-compiler getExePath(),
 *  which honours the MION_BIN env var and then the published platform package.
 *
 *  mion deliberately reads NO env var of its own. MION_BIN (RunTypes 0.11.0+) covers BOTH the
 *  transform lane and the ESLint lane, whereas mion's old TS_RUNTYPES_BIN reached only this one —
 *  and since the two lanes run in SEPARATE processes, a mion-side variable can never make them
 *  agree. One variable, both lanes, no divergence.
 *
 *  ⚠️ No sibling-checkout fallback: the binary VERSION is folded into every typeId, so a locally
 *  built binary at a different version silently produces caches that diverge from CI/user installs
 *  (the `<typeId>` half of every `<fnHash>_<typeId>` key stops matching; the fnHash prefixes
 *  themselves are version-stable since RunTypes 0.9.3). The same caution applies to MION_BIN. */
export function resolveRtBinary(explicit?: string): string | undefined {
  if (explicit) return explicit;
  // TS_RUNTYPES_BIN is retired. Warn rather than ignore it silently: a user who set it would
  // otherwise be switched to a different binary (the platform package) without being told.
  if (process.env.TS_RUNTYPES_BIN && !process.env.MION_BIN && !process.env.RT_BIN && !legacyBinEnvNoticeShown) {
    legacyBinEnvNoticeShown = true;
    console.warn(
      '[mion] TS_RUNTYPES_BIN is no longer read and is being IGNORED. Use MION_BIN instead — ' +
        'it is honoured by @mionjs/bin-compiler for both the vite transform and the ESLint lane, ' +
        'so they cannot end up on different binaries (whose typeIds would diverge).'
    );
  }
  return undefined; // @mionjs/bin-compiler getExePath() takes over (MION_BIN → published platform binary)
}

/** The subset of a mion preset's options that both lanes read. */
export interface MionPresetOptions {
  runTypes?: MionRunTypesOptions;
  /** The mion API this client talks to. See MionServerPointer. */
  server?: MionServerPointer;
}

/** Maps mion's `runTypes` block onto the resolver's own options, and rejects the one
 *  emitMode mion cannot support. Shared by BOTH presets: a knob added here reaches the
 *  vite lane and the Next lane in the same commit, which is the whole point of the split.
 *
 *  Host-specific hooks are NOT set here. `onSiteFilesChanged` is vite's (it invalidates
 *  the module graph); the Next lane needs no equivalent because the broker declares
 *  typeDeps plus a stamp to Turbopack instead. */
export function toRunTypesOptions(rt: MionRunTypesOptions = {}): TsRuntypesPluginOptions {
  // Fail loudly rather than shipping a client whose validators have no body to rebuild from.
  // The type says 'code' | 'both', but configs are plain JS/JSON often written by hand.
  if ((rt.emitMode as string) === 'functions') {
    throw new Error(
      `[mion] emitMode: 'functions' is not supported. mion serializes compiled fns to the client as ` +
        `code strings, and 'functions' omits the code, so every client would fail on first validate. ` +
        `Use 'code' (default) or 'both'.`
    );
  }
  // NOTE: project `references` in the tsconfig are fine — the mion resolver
  // drops them when building its scan program (they are a tsc --build concept).
  return {
    binary: resolveRtBinary(rt.binary),
    tsconfig: rt.tsConfig,
    genDir: rt.genDir ?? rt.outDir,
    emitMode: rt.emitMode,
    moduleMode: rt.moduleMode,
    inlineMode: rt.inlineMode,
    transformMode: rt.transformMode,
    // Strict by default: Error-severity mion diagnostics halt the build. The
    // RunTypes adapter no longer trips the scanner (its runtime-key wrappers ride
    // the untracked *ByKey APIs / the raw cache), so consumers get the documented
    // "Error = build must fail" contract. Opt out per package with `failOnError: false`.
    failOnError: rt.failOnError ?? true,
    patternSampleCount: rt.patternSampleCount,
    patternSampleRetries: rt.patternSampleRetries,
    jsRuntime: rt.jsRuntime,
  };
}

// ############# batch transport #############
//
// A batch is written in client code, but the server must know its id, its routes and its
// `inputFrom` mappings before it runs one. The CLIENT build reads every `batch([...])` call site
// out of the resolver's batch report (the id is already hashed from routes + mappings there) and
// the inline mappers out of the pure-fn report, and renders ONE module into the SERVER root:
//
//     <serverRoot>/.mion/rpc/batches.generated.js
//
// The SERVER build (vite preset) imports that module from whichever file calls createMionRouter, so
// nothing is configured on either side. The module imports each mapper's generated pure-fn module
// straight out of the client's `.mion/types/pf/` tree (one source of truth, real bodyHash; rollup
// inlines it, so the artifact stays self-contained) and calls `replaceBatches(table)`, so every
// evaluation, first or reloaded, yields exactly the table in the file.
//
// The file name is STABLE on purpose. Once the server entry imports it, the module is a node in
// vite's graph: a rewrite fires `change`, vite invalidates it, and the middleware reload
// re-evaluates it. A checksum-named file would be a never-imported path nothing reloads. The
// checksum lives INSIDE the file instead, and the server side recomputes it from the ids in the
// file before importing, so a hand edit or a corrupted file fails loud instead of registering.

/** Folder under the server root that holds the module, and the module's name. */
export const BATCHES_DIR = '.mion/rpc';
export const BATCHES_FILE = 'batches.generated.js';

/** One harvested inline mapper: the registry key a batch mapping names, and the pure-fn module
 *  RunTypes generated for it. `module` is resolved from the report's `module` field, never from an
 *  assumed `pf/<ns>/<key>` layout: under `moduleMode: 'allSingle'` every pure fn collapses into a
 *  single `types/pf.js` and that assumption breaks. */
export interface BatchMapperEntry {
  key: string;
  module: string;
}

/** One compiled batch as the table carries it (mirrors @mionjs/core BatchDefinition). */
export interface BatchTableEntry {
  routes: string[];
  mappings?: {fromId: string; toId: string; paramIndex: number; mapperKey: string}[];
}

/** What the server side learns from the module on disk. `clientRoot` is the vite root (or Next
 *  cwd) of the build that wrote it: in a shared root the server build's own harvest sees the same
 *  program and the same batches, but a SEPARATE server project's harvest sees none, and must not
 *  mistake the client's module for its own stale output. */
export interface BatchesModuleInfo {
  file: string;
  checksum: string;
  clientRoot: string;
}

/** The checksum of a batch table: sha256 of the sorted unique ids, first 16 hex chars. Ids already
 *  hash routes plus mappings, so this is cheap, deterministic and independent of source order. */
export function batchChecksum(ids: Iterable<string>): string {
  const sorted = [...new Set(ids)].sort();
  return createHash('sha256').update(sorted.join('\n')).digest('hex').slice(0, 16);
}

/** Absolute path of the module for a server root. */
export function batchesModulePath(serverRoot: string): string {
  return path.join(serverRoot, BATCHES_DIR, BATCHES_FILE);
}

/** The server root a client build writes into: the server's vite config directory, else the
 *  nearest package.json above its entry, else the client's own root (shared-root setups). */
export function resolveServerRoot(server: MionServerPointer | undefined, ownRoot: string): string {
  if (server?.viteConfig) return path.dirname(path.resolve(server.viteConfig));
  if (server?.startScript) return nearestPackageRoot(path.dirname(path.resolve(server.startScript))) ?? ownRoot;
  return ownRoot;
}

function nearestPackageRoot(dir: string): string | undefined {
  let current = dir;
  for (;;) {
    if (existsSync(path.join(current, 'package.json'))) return current;
    const parent = path.dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

/** Renders the module. Mapper imports come first; the tuple is matched on its key slot rather than
 *  taken by export name: `PURE_FN_TUPLE_KEYS[3]` is `key` in every module mode, whereas the export
 *  name is a mangled encoding of the module's logical path (`__rt_pf$2Frt$2F<hash>`) whose escaping
 *  rules are not public, and "the single export" only holds until someone sets
 *  `moduleMode: 'allSingle'`, which puts every pure fn in one file. */
export function renderBatchesModule(
  clientRoot: string,
  batches: Record<string, BatchTableEntry>,
  mappers: BatchMapperEntry[]
): string {
  const lines = [
    '// GENERATED by @mionjs/devtools, the batch transport. Do not edit.',
    `import {registerInputMapperTuple} from '@mionjs/core';`,
    `import {replaceBatches} from '@mionjs/router';`,
  ];
  mappers.forEach((entry, index) => {
    lines.push(`import * as __mionMapper${index} from ${JSON.stringify(toImportSpecifier(entry.module))};`);
  });
  mappers.forEach((entry, index) => {
    const key = JSON.stringify(entry.key);
    lines.push(
      `registerInputMapperTuple(${key}, Object.values(__mionMapper${index}).find((t) => Array.isArray(t) && t[3] === ${key}));`
    );
  });
  lines.push(`export const clientRoot = ${JSON.stringify(clientRoot)};`);
  lines.push(`export const checksum = ${JSON.stringify(batchChecksum(Object.keys(batches)))};`);
  lines.push(`replaceBatches(${JSON.stringify(batches)});`);
  return lines.join('\n') + '\n';
}

/** Absolute path → an import specifier rollup will resolve. Windows separators become '/', and a
 *  path is left absolute so it resolves regardless of where the generated module ends up. */
function toImportSpecifier(absolutePath: string): string {
  return absolutePath.split(path.sep).join('/');
}

/** Writes the module for a server root: batches sorted by id, only the mappers those batches
 *  reference, sorted by key. Atomic (temp name + rename) so a reader never sees a partial file; a
 *  byte-identical rewrite is skipped so vite sees no spurious change. An empty table removes the
 *  file, since a server without batches must import nothing, but ONLY a file this same client
 *  root wrote: a separate server project's harvest also runs, sees no batches in its program, and
 *  must leave the client's module alone. */
export function writeBatchesModule(
  serverRoot: string,
  clientRoot: string,
  batches: Map<string, BatchTableEntry>,
  mappers: Map<string, BatchMapperEntry>
): void {
  const file = batchesModulePath(serverRoot);
  if (batches.size === 0) {
    let existing: BatchesModuleInfo | undefined;
    try {
      existing = readBatchesModule(serverRoot);
    } catch {
      existing = undefined; // not ours to judge; the server side reports it
    }
    if (existing?.clientRoot === clientRoot) rmSync(file, {force: true});
    return;
  }
  const table = Object.fromEntries([...batches.entries()].sort(([a], [b]) => (a < b ? -1 : 1)));
  const referenced = new Set<string>();
  for (const entry of batches.values()) for (const mapping of entry.mappings ?? []) referenced.add(mapping.mapperKey);
  const used = [...mappers.values()].filter((mapper) => referenced.has(mapper.key)).sort((a, b) => (a.key < b.key ? -1 : 1));
  const source = renderBatchesModule(clientRoot, table, used);
  if (existsSync(file) && readFileSync(file, 'utf8') === source) return;
  mkdirSync(path.dirname(file), {recursive: true});
  const temp = `${file}.${process.pid}.tmp`;
  writeFileSync(temp, source);
  renameSync(temp, file);
}

const CLIENT_LINE = /^export const clientRoot = ("(?:[^"\\]|\\.)*");$/m;
const CHECKSUM_LINE = /^export const checksum = "([0-9a-f]{16})";$/m;
const TABLE_LINE = /^replaceBatches\((\{.*\})\);$/m;

/** Reads the module a client build wrote into `root`, or undefined when there is none. The
 *  checksum the file declares is recomputed from the ids it registers, so a hand-edited or
 *  corrupted module fails here, before anything imports it. */
export function readBatchesModule(root: string): BatchesModuleInfo | undefined {
  const file = batchesModulePath(root);
  if (!existsSync(file)) return undefined;
  const source = readFileSync(file, 'utf8');
  const declared = CHECKSUM_LINE.exec(source)?.[1];
  const table = TABLE_LINE.exec(source)?.[1];
  const client = CLIENT_LINE.exec(source)?.[1];
  let ids: string[] | undefined;
  let clientRoot: string | undefined;
  try {
    ids = table ? Object.keys(JSON.parse(table) as Record<string, unknown>) : undefined;
    clientRoot = client ? (JSON.parse(client) as string) : undefined;
  } catch {
    ids = undefined;
  }
  if (!declared || !ids || clientRoot === undefined) {
    throw new Error(
      `[mion batches] ${file} is not a module the mion client build wrote (no checksum or no batch table). ` +
        `Delete it and run the client build again.`
    );
  }
  const actual = batchChecksum(ids);
  if (actual !== declared) {
    throw new Error(
      `[mion batches] ${file} was edited or is corrupted: it declares checksum ${declared} but its batch ids ` +
        `hash to ${actual}. Delete it and run the client build again.`
    );
  }
  return {file, checksum: declared, clientRoot};
}

/** The batch HARVEST half, shared by both presets.
 *
 *  Harvest runs in the CLIENT build. `harvestMappers` filters the pure-fn report down to
 *  @mionjs/client's `inputFrom` wrapper; `harvestBatches` takes the batch report as the build
 *  read it. Both write the one module the SERVER build later imports. The import half is
 *  vite-only and stays in the vite preset, because the module it injects into is the mion API
 *  server, which vite builds in its own process. In a Next app, Next IS the client build, so this
 *  half is the only one that has to reach Turbopack.
 *
 *  The id is hashed from the routes AND the mappings, so two call sites that agree on both are one
 *  batch and two that differ are two batches. Two different definitions under one id can only be a
 *  hash collision, reported as a build error here (the only place that sees every file under HMR).
 *
 *  The three roots are callbacks rather than values: vite only knows its root at configResolved,
 *  after this is constructed. `clientRootOf` is this build's own root, recorded in the module so
 *  an empty harvest only ever removes a file it wrote itself. */
export function createBatchHarvest(
  serverRootOf: () => string,
  clientRootOf: () => string,
  genDirOf: () => string
): {
  harvestMappers: (sites: RtPureFnSite[], phase: 'build' | 'update') => void;
  harvestBatches: (sites: RtBatchSite[], phase: 'build' | 'update', scannedFiles?: string[]) => void;
} {
  const mappers = new Map<string, BatchMapperEntry>();
  const batches = new Map<string, BatchTableEntry>();
  const batchFiles = new Map<string, string>();
  return {
    harvestMappers: (sites, phase) => {
      if (phase === 'build') mappers.clear();
      for (const site of sites) {
        if (site.calleeName !== 'inputFrom' || site.calleeModule !== '@mionjs/client') continue;
        if (!site.module) {
          throw new Error(
            `[mion batches] the build report names no generated module for mapper '${site.key}'. ` +
              `The resolver binary is older than this @mionjs/devtools; update @mionjs/bin-compiler.`
          );
        }
        mappers.set(site.key, {key: site.key, module: path.resolve(genDirOf(), 'types', `${site.module}.js`)});
      }
      writeBatchesModule(serverRootOf(), clientRootOf(), batches, mappers);
    },
    harvestBatches: (sites, phase, scannedFiles) => {
      if (phase === 'build') {
        batches.clear();
        batchFiles.clear();
      } else if (scannedFiles) {
        // a re-scanned file that no longer reports one of its batches has removed it (or broke
        // it): the table must not keep serving a plan the client can no longer send
        const scanned = new Set(scannedFiles.map((file) => path.resolve(file)));
        const reported = new Set(sites.map((site) => site.batchId));
        const gone: string[] = [];
        for (const [id, file] of batchFiles) if (scanned.has(path.resolve(file)) && !reported.has(id)) gone.push(id);
        for (const id of gone) {
          batches.delete(id);
          batchFiles.delete(id);
        }
      }
      for (const site of sites) {
        const entry: BatchTableEntry = {routes: [...site.routeIds]};
        if (site.mappings?.length) entry.mappings = site.mappings.map((mapping) => ({...mapping}));
        const known = batches.get(site.batchId);
        const knownFile = batchFiles.get(site.batchId);
        if (known && knownFile !== site.file && !sameBatch(known, entry)) {
          throw new Error(
            `[mion batches] batch id '${site.batchId}' is shared by two different batches, in ${knownFile} ` +
              `(${known.routes.join(', ')}) and ${site.file} (${site.routeIds.join(', ')}). The id is a short hash of ` +
              `the routes and the mappings, so this is a hash collision: reorder the routes of one of them.`
          );
        }
        batches.set(site.batchId, entry);
        batchFiles.set(site.batchId, site.file);
      }
      writeBatchesModule(serverRootOf(), clientRootOf(), batches, mappers);
    },
  };
}

/** Two batch entries are the same batch when their routes and mappings match, order included. */
function sameBatch(a: BatchTableEntry, b: BatchTableEntry): boolean {
  return JSON.stringify(canonicalBatch(a)) === JSON.stringify(canonicalBatch(b));
}

function canonicalBatch(entry: BatchTableEntry): BatchTableEntry {
  const mappings = [...(entry.mappings ?? [])].sort((a, b) =>
    a.toId === b.toId ? a.paramIndex - b.paramIndex : a.toId < b.toId ? -1 : 1
  );
  return {routes: entry.routes, mappings};
}

/** Where the resolver wrote its generated tree, mirroring the resolver's own default so a
 *  report `module` can be turned into an importable path. `cwd` defaults to the caller's
 *  root and an unset genDir defaults to `<cwd>/.mion`. */
export function resolveGenDir(root: string, rt: MionRunTypesOptions = {}): string {
  return path.resolve(root || process.cwd(), rt.genDir ?? rt.outDir ?? '.mion');
}
