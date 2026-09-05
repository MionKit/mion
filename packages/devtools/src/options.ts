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
import {mkdirSync, writeFileSync} from 'node:fs';
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
   *  initMionRouter dies on the first route with "Code generation from strings disallowed for this
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

export interface MionBatchesOptions {
  /** CLIENT builds: write the batches the build read out of `batch([...])` call sites, plus their
   *  inline inputFrom mappers, to this manifest path. `true` resolves '.mion/batches.json' against
   *  the process cwd; pass an absolute path in monorepo/vitest-workspace setups. */
  emit?: boolean | string;
  /** SERVER builds: entry file(s) to inject the generated module's import into, bypassing detection.
   *  Only needed when the module calling `initMionRouter` cannot be spotted from its source — it
   *  re-exports the router through a local barrel, or the entry lives under node_modules. Absolute,
   *  or relative to the vite root. */
  injectInto?: string | string[];
  /** SERVER builds: manifest path(s) compiled into `<root>/.mion/batches.generated.js`, which the
   *  plugin imports for you from whichever module calls initMionRouter — nothing to import by hand.
   *  In `vite build` the generated module registers the batch table as static data and IMPORTS each
   *  mapper's pure-fn module out of the client build's `.mion/types/` tree, so that tree must be
   *  reachable at server-BUILD time (missing manifests fail the build); the bundle itself stays
   *  self-contained, with no node:fs and no runtime dependency on it. In dev/serve the module reads
   *  the manifests at runtime, tolerating missing ones with a lazy re-read on the first unknown
   *  batch id or mapper (covers the race where the server boots before the client build finished). */
  consume?: string | string[];
}

let legacyBinEnvNoticeShown = false;

// ############# removed-option migration guard (0.8 → 0.9) #############
// These deepkit/AOT-era options were accepted-and-ignored through the mion migration and are
// now gone from the types. Deleting them from the interfaces alone only fails a TYPED config; a plain
// vite.config.js would silently drop them, which is worse than the notice it replaces. So the keys are
// still detected at config time and throw with what to do instead — loud in both lanes, which is the
// end state the deprecation was aiming at. Remove this guard at 1.0.
const REMOVED_PLUGIN_OPTIONS: Record<string, string> = {
  aotCaches: 'AOT caches are obsolete — the mion generated modules ARE the compiled artifact. Delete this option.',
  serverPureFunctions:
    'pure-fn extraction moved to the batch transport. Use `batches: {emit}` on the client build and `batches: {consume}` on the server build.',
  serverMappers:
    'the serverMapFrom transport became the batch transport: the manifest now carries the compiled batches too. Rename to `batches: {emit}` on the client build and `batches: {consume}` on the server build.',
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

/** Manifest row: one harvested inputFrom mapper (mirrors @mionjs/core InputMapperEntry). */
export interface InputMapperManifestEntry {
  key: string;
  /** Absolute path to the pure-fn module RunTypes generated for this mapper. The BUILD-mode
   *  transport imports this and registers the tuple inside it, so the body has one source of
   *  truth and arrives with its real bodyHash. Resolved from the report's `module` field, never
   *  from an assumed `pf/<ns>/<key>` layout — under `moduleMode: 'allSingle'` every pure fn
   *  collapses into a single `types/pf.js` and that assumption breaks. */
  module?: string;
  paramNames?: string[];
  /** Factory body. Kept for the DEV/SERVE lane only — see renderBatchesModule. */
  code?: string;
  pureFnDependencies?: string[];
}

/** One compiled batch as the manifest carries it (mirrors @mionjs/core BatchDefinition). */
export interface BatchManifestEntry {
  routes: string[];
  mappings?: {fromId: string; toId: string; paramIndex: number; mapperKey: string}[];
}

/** The batches manifest: the batch table keyed by id, plus the mappers those batches reference. */
export interface BatchManifest {
  batches: Record<string, BatchManifestEntry>;
  mappers: InputMapperManifestEntry[];
}

/** Resolves the emit option to an absolute manifest path (undefined = harvest disabled). */
function resolveManifestPath(emit: MionBatchesOptions['emit']): string | undefined {
  if (!emit) return undefined;
  return path.resolve(emit === true ? '.mion/batches.json' : emit);
}

/** Writes the manifest deterministically (batches sorted by id, mappers by key). */
function writeBatchManifest(
  manifestPath: string,
  batches: Map<string, BatchManifestEntry>,
  mappers: Map<string, InputMapperManifestEntry>
): void {
  const manifest: BatchManifest = {
    batches: Object.fromEntries([...batches.entries()].sort(([a], [b]) => (a < b ? -1 : 1))),
    mappers: [...mappers.values()].sort((a, b) => (a.key < b.key ? -1 : 1)),
  };
  mkdirSync(path.dirname(manifestPath), {recursive: true});
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
}

/** The subset of a mion preset's options that both lanes read. */
export interface MionPresetOptions {
  runTypes?: MionRunTypesOptions;
  batches?: MionBatchesOptions;
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

/** The batch HARVEST half, shared by both presets.
 *
 *  Harvest runs in the CLIENT build. `harvestMappers` filters the pure-fn report down to
 *  @mionjs/client's `inputFrom` wrapper; `harvestBatches` takes the batch report as the build
 *  read it. Both write the one manifest the SERVER build later consumes. The consume half is
 *  vite-only and stays in the vite preset, because the module it injects into is the mion API
 *  server, which vite builds in its own process. In a Next app, Next IS the client build, so this
 *  half is the only one that has to reach Turbopack.
 *
 *  The id is hashed from the routes AND the mappings, so two call sites that agree on both are one
 *  batch and two that differ are two batches. Two different definitions under one id can only be a
 *  hash collision, reported as a build error here (the only place that sees every file under HMR).
 *
 *  `genDirOf` is a callback rather than a value: vite only knows its root at configResolved,
 *  after this is constructed. */
export function createBatchHarvest(
  emit: MionBatchesOptions['emit'],
  genDirOf: () => string
): {
  manifestPath: string | undefined;
  harvestMappers: (sites: RtPureFnSite[], phase: 'build' | 'update') => void;
  harvestBatches: (sites: RtBatchSite[], phase: 'build' | 'update') => void;
} {
  const manifestPath = resolveManifestPath(emit);
  const mappers = new Map<string, InputMapperManifestEntry>();
  const batches = new Map<string, BatchManifestEntry>();
  const batchFiles = new Map<string, string>();
  if (!manifestPath) return {manifestPath, harvestMappers: () => {}, harvestBatches: () => {}};
  return {
    manifestPath,
    harvestMappers: (sites, phase) => {
      if (phase === 'build') mappers.clear();
      for (const site of sites) {
        if (site.calleeName !== 'inputFrom' || site.calleeModule !== '@mionjs/client') continue;
        mappers.set(site.key, {
          key: site.key,
          module: site.module ? path.resolve(genDirOf(), 'types', `${site.module}.js`) : undefined,
          paramNames: site.paramNames,
          code: site.code,
          pureFnDependencies: site.pureFnDependencies,
        });
      }
      writeBatchManifest(manifestPath, batches, mappers);
    },
    harvestBatches: (sites, phase) => {
      if (phase === 'build') {
        batches.clear();
        batchFiles.clear();
      }
      for (const site of sites) {
        const entry: BatchManifestEntry = {routes: [...site.routeIds]};
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
      writeBatchManifest(manifestPath, batches, mappers);
    },
  };
}

/** Two batch entries are the same batch when their routes and mappings match, order included. */
function sameBatch(a: BatchManifestEntry, b: BatchManifestEntry): boolean {
  return JSON.stringify(canonicalBatch(a)) === JSON.stringify(canonicalBatch(b));
}

function canonicalBatch(entry: BatchManifestEntry): BatchManifestEntry {
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
