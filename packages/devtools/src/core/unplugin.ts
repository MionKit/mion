import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createUnplugin} from 'unplugin';
import {getExePath} from '@mionjs/bin-compiler';
import {DIAGNOSTIC_CATALOG} from './go-generated/diagnosticCatalog.generated.ts';
import {ResolverClient, type GenerateResult} from './resolver-client.ts';
import {applyEdits, sourceHash} from './apply-edits.ts';
import {Level, type BatchSite, type Diagnostic, type PureFnSite} from './protocol.ts';
import {PURE_FN_ARTIFACT_DIR, type ClientRoutes, type ModuleMode} from './go-generated/runtypes-constants.generated.ts';
import {assertValidClientRoutes, assertValidModuleMode} from './option-guards.ts';
import {mayHoldDrizzleSchemas, mayHoldMarkerCalls} from './markerImports.ts';
import {isDowngraded, resolveDowngradeErrors, DOWNGRADE_ALL, type DowngradeSet} from './downgradeErrors.ts';
import {LEVELS_ALL, resolveGrouped, resolveShowInfo} from './levels.ts';
import {haltError, hostHalt, hostWarn, printFindings, surfaceDiagnostics, type HostContext} from './surface.ts';
import type {Finding, LogStyle} from './types.ts';
import {DevReporter} from './devReporter.ts';
import {createTypeDepsIndex, depKey} from './type-deps.ts';
import {warnBelowTypeScriptFloor} from './typescript-floor.ts';

// Host-facing plugin name, shared by every adapter entry (the bun one needs it before it builds the inner plugin).
export const PLUGIN_NAME = '@mionjs/devtools';

// Shares the SHAPE of the tsconfig `i18n` plugin entry but drives a different lane: the plugin's
// per-locale translation-mirror auto-sync. `strict` is accepted for shape-parity and never gated on.
export interface EnrichI18nSyncOptions {
  sourceLocale?: string;
  locales?: string[];
  strict?: boolean;
}

// Opt-in (default OFF): from dev/watch, the committed mirrors under <genDir>/enriched/** get the same
// value-preserving scaffold + reconcile `mion enrich --update` does, never translated content, never an LLM.
// A production build never writes; it runs a read-only gate that warns and fails on a stale, missing or unfilled mirror.
export interface EnrichSyncOptions {
  // FriendlyText mirrors, under <genDir>/enriched/friendly/.
  friendly?: boolean;
  // MockData mirrors, under <genDir>/enriched/mock/.
  mock?: boolean;
  // Presence enables per-locale mirrors under <genDir>/enriched/i18n/<locale>/ — SCAFFOLD + SYNC only.
  i18n?: EnrichI18nSyncOptions;
  // Defaults to "any enrich family enabled", since the mirrors are write-only outputs.
  // false restores reloads for debugging; true suppresses even with auto-gen off (hand / CLI edits during a dev run).
  suppressHmr?: boolean;
}

/** What one generate produced, as handed to `onGenerate`. Paths are absolute. */
export interface GenerateInfo {
  outDir: string;
  // `<outDir>/rpc/batches.generated.js`, or '' when no batch table was written.
  batchesModule: string;
  routerInitFiles: string[];
}

// The host-plugin surface. tsconfig's `mion` plugin entry is the canonical home of the PROJECT knobs
// (emitMode, moduleMode, inlineMode, hashLength, parallelScan/Render, singleThreaded); set here they
// override one build, tsc-style. `binary` / `cwd` / `tsconfig` / `genDir` have no tsconfig equivalent.
export interface PluginOptions {
  // Defaults to the host platform's prebuilt binary via the `@mionjs/bin-compiler` launcher.
  // Set it only to point at a custom or local build — in-repo development passes `mion-bin/mion`.
  binary?: string;
  // Project root (where tsconfig.json lives). Defaults to Vite's resolved root, else process.cwd().
  cwd?: string;
  // Relative to cwd; unset, searched upward from cwd like tsc.
  tsconfig?: string;
  // Default 'bundle'; 'fetch' fetches every route. Same key as tsconfig `clientRoutes` and CLI `--client-routes`.
  // Under 'bundle', a route the build did not see is reported, and fetched only if the client sets up `useFetchMetadata`.
  clientRoutes?: ClientRoutes;
  // Generated-output root, relative to cwd: cache modules under `<genDir>/types/` (gitignored), committed
  // enrichment under `<genDir>/enriched/`. Omitted, the resolver infers `<srcDir>/.mion` from the tsconfig.
  // It lives in the project rather than node_modules so a dev watcher sees regenerated modules.
  genDir?: string;
  // What each RT cache entry ships in its code/factory slots:
  //   - 'code' (default): body string only; `materializeRTFn` rebuilds the factory via `new Function` on first lookup.
  //   - 'functions': live factory only, for runtimes that disallow `new Function` (WorkerD, CSP without `unsafe-eval`).
  //   - 'both': code string AND factory; test setups use it so suites cover both materialisation paths.
  emitMode?: 'code' | 'functions' | 'both';
  // Project-wide defaults for the per-call-site ValidateOptions bag, merged per field (a per-call option wins).
  //   - numberMode: the base `number` check — 'isFinite' (default; rejects NaN/Infinity), 'typeof' (accepts
  //     them), or 'notNaN' (rejects NaN, accepts Infinity). Eases migration from a looser library.
  validate?: {numberMode?: 'isFinite' | 'typeof' | 'notNaN'};
  // NB: there is deliberately NO cacheDir option. The on-disk RT artifact cache (under node_modules/.cache/mion,
  // separate from `genDir`) follows the project's tsconfig `incremental` / `composite` switch.
  // (The internal MION_CACHE_DIR env var overrides it for tests / direct use.)
  //
  // Pass `false` to force the serial marker scan / entry collection (--no-parallel-scan / --no-parallel-render).
  // Output is equivalent either way — these exist for benchmarking baselines and debugging.
  parallelScan?: boolean;
  parallelRender?: boolean;
  // Force single-checker, fully-serial scan/render. Output is equivalent; the child is lighter.
  // Overrides the tsconfig `singleThreaded` in EITHER direction (--single-threaded / --no-single-threaded).
  singleThreaded?: boolean;
  // Length of the short structural-hash ids in generated names (--hash-length; undefined = the binary
  // default, 7). Canonical home is the tsconfig `hashLength` knob; set here it overrides one build.
  hashLength?: number;
  // How many mockSamples the build auto-generates for a format pattern that declares none
  // (--pattern-sample-count; undefined = 100; 0 makes a sample-less pattern a build error). Deterministic
  // per pattern. Canonical home is the tsconfig `patternSampleCount` knob.
  patternSampleCount?: number;
  // Per-sample draw multiplier (--pattern-sample-retries; undefined = 10): the budget is
  // patternSampleCount × patternSampleRetries draws before a pattern is declared ungeneratable.
  // Raise it for heavily constrained patterns. Canonical home is the tsconfig `patternSampleRetries` knob.
  patternSampleRetries?: number;
  // Emit, on every reflection root whose type is fully bounded, the largest compact-JSON size a valid value
  // can have, which a framework turns into per-route request and response limits. On by default; `false`
  // emits none, so a project that keeps its own limits pays nothing. Canonical home is the tsconfig `jsonMaxBytes` key.
  jsonMaxBytes?: boolean;
  // Which packages may declare the marker types, so a library can ship the brands itself instead of
  // depending on mion just for types. Canonical home is the tsconfig `markers` key.
  //   packages     — extra package names. Additive: '@mionjs/run-types' stays accepted, and the list is
  //                  UNIONED with the tsconfig `markers.packages` entry rather than replacing it.
  //   checkPackage — false drops the package check, matching a marker on its type NAME alone, so a local
  //                  `type InjectRunTypeId<T> = …` drives rewrites too.
  markers?: {packages?: string[]; checkPackage?: boolean};
  // How cache entries group into modules:
  //   'default'    — runtype nodes ride one data module per source file (`rt/<hash>`), rows several files reach
  //                  one shared module (`rt/shared/<hash>`); every fn-family / composite / pure-fn entry is its
  //                  own module. Best chunk-splitting granularity.
  //   'allSingle'  — one module per fn family (`fns/<tag>`), one `pf` pure-fn bundle, one runtypes module for
  //                  the whole program. Fewest requests; family bundles re-fetch wholesale on type edits.
  //   'allModules' — per-entry fn modules AND per-node runtype modules. Escape hatch; measurably slower
  //                  on dense reflection graphs.
  moduleMode?: ModuleMode;
  // Child-inlining policy:
  //   'default'     — the name rule: UNNAMED compounds (arrays, tuples, object literals, unions, classes)
  //                   inline into their parents (statement bodies hoist to per-factory context fns); NAMED
  //                   types (alias/interface) and circular types stay external as dedupe-worthy shared
  //                   entries. Date/Temporal builtins always inline (atomic emits).
  //   'allInternal' — name-blind: everything except circular types inlines, at the cost of duplicating
  //                   shapes shared across roots.
  inlineMode?: 'default' | 'allInternal';
  // How the per-file rewrite crosses the wire. Host-level: it must never fold into a disk-cache
  // fingerprint, the artifacts are identical either way.
  //   'edits' (default) — the plugin applies the resolver's edit list and generates the source map JS-side.
  //             O(sites) on the wire, so it wins the dev loop on large / many-marker files. Requires
  //             pristine source (run this plugin first among enforce:'pre'); on drift it re-syncs and warns.
  //   'go'    — the resolver returns the whole rewritten file + source map. Heavier wire, but the only
  //             option for a non-JS / plugin-free host, and the safe fallback when an upstream pre-plugin
  //             rewrites the source before us.
  transformMode?: 'go' | 'edits';
  // 'go' mode only — default true (self-contained maps). False drops `sourcesContent`: the bundler composes
  // the chained map and fills original content itself, trimming the heaviest single wire item.
  // No effect in 'edits' mode (the FE generates its own map).
  sourcesContent?: boolean;
  // Error-severity diagnostics fail the build/transform in every build lane, matching the documented
  // contract ("Error = will throw at runtime, build must fail"); a DEV SERVER is the one lane a
  // RuntimeError never halts (see `devServer`). This names the codes to report as WARNINGS instead, so a
  // project blocked on one finding keeps failing on every other; the finding is still printed, which is
  // the difference between unblocking and hiding.
  //
  // `'*'` (and `['*']`) downgrades the lot: the adoption setting, for a project that cannot yet name the
  // codes it has not met. Naming codes is what to reach for once they are known.
  //
  // For a bad call site in your OWN source prefer a comment on the line above it, precise and reported
  // when unused: `@mion-expect-error` removes the finding, `@mion-downgrade-error` keeps it printing and
  // stops it halting. This option is for findings you cannot annotate — raised inside a dependency, or
  // carrying no source line at all.
  //
  // Pure-fn extraction errors halt regardless, `'*'` included: files-mode has no fallback for a failed
  // generation. HMR updates never hard-fail mid-edit either way; the halt re-applies on the next run.
  downgradeErrors?: string[] | typeof DOWNGRADE_ALL;
  // Unset hides Info findings, `'all'` prints them; never changes what halts. Overrides the tsconfig plugin key.
  levels?: typeof LEVELS_ALL;
  // Unset or `'grouped'` groups findings by name, each message once; `'lines'` prints one each. Overrides tsconfig.
  logStyle?: LogStyle;
  // JS runtime the resolver runs format-pattern checks on (--js-runtime); defaults to this plugin's own
  // process.execPath, so the serve lane needs no configuration. Host-specific like `binary` — no tsconfig key.
  jsRuntime?: string;
  // Unref the resolver child so it never holds the host process open. Host bootstrap — no tsconfig key.
  // Set by @mionjs/devtools/runtypes/bun for Bun's RUNTIME loader, which keeps one resolver for the whole
  // process and gets no buildEnd, so a `bun run` script would otherwise hang forever on the live child.
  // Leave it off for a bundler host, where a pending resolver read can be the build's only live handle
  // and an unref'd child would let the process exit mid-build.
  detachResolver?: boolean;
  // Whether this host is a DEV SERVER, the one lane a RuntimeError never halts: it is reported and the
  // generated function throws when called. Every build lane halts on it, so a production bundle never
  // ships one. A fatal Error halts everywhere regardless: no code was produced for that piece.
  //
  // Vite fills it in from its resolved config (`serve`, and not vitest's `test` mode: a test run is a
  // build lane). The Next broker, which has no config hook, sets it from `next dev`. No tsconfig key.
  devServer?: boolean;
  // The structured, layout-independent record of every pure fn this build generated (call-site span,
  // callee attribution, registry key, entry payload), for host tooling that relocates pure-fn bodies
  // across bundles (mion's cross-bundle serverMapFrom transport). Where the report goes:
  //   - `'file'`     → `<genDir>/types/pure-fns-report.json` on every generate. The path is hardcoded, like
  //                    every path under genDir, so it inherits types/'s gitignore + regenerate lifecycle.
  //                    For plugin-free / separate-process / CLI-batch consumers; `onPureFnReport` also fires.
  //   - `'callback'` → in-process to `onPureFnReport` only, no file.
  //   - `false` / unset → off. Providing `onPureFnReport` without setting this implies `'callback'`;
  //                    an explicit `false` wins and nothing fires.
  // Both channels carry identical records, and the shape is identical across every `moduleMode`.
  pureFnReport?: 'file' | 'callback' | false;
  // Fires on EVERY adapter (it rides the universal buildStart hook): once with the whole-program report
  // (phase 'build'), and under Vite's HMR again with the changed file's delta (phase 'update').
  // Fires whenever the report is on; setting it with `pureFnReport` unset implies 'callback' (data, no file).
  onPureFnReport?: (sites: PureFnSite[], phase: 'build' | 'update') => void;
  // One record per `batch([...])` call site the build read (ordered route ids, `inputFrom()` mappings, the
  // injected batch id), so the server build can register each plan under the id the client bundle carries.
  // Same phases and hook as `onPureFnReport`, and setting it turns the report data on the same way
  // (`pureFnReport` still decides whether the JSON file is written); the id is injected regardless.
  // On 'update', `scannedFiles` lists the files the scan covered (absolute paths), so a consumer
  // can drop the batches those files no longer define: an empty `sites` is a real answer there.
  onBatchReport?: (sites: BatchSite[], phase: 'build' | 'update', scannedFiles?: string[]) => void;
  // Fired after an incremental update, with the site files whose injected fns just changed — the ones the
  // host must re-transform so they stop serving a validator for the previous shape.
  //
  // The plugin already invalidates what it can resolve itself (Vite's module graph), so a plain bundler
  // host needs nothing here. This exists because NOT EVERY SITE FILE IS A REAL MODULE: sources registered
  // through `setSources` may be virtual — mion registers a Vue SFC's <script> as `Comp.vue.ts` while the
  // module Vite serves is `Comp.vue`, so the set is REPORTED and the host maps its virtual paths back.
  //
  // Paths are absolute and forward-slashed.
  onSiteFilesChanged?: (siteFiles: string[]) => void;
  // Fired after every generate; a host re-transforms router-init modules loaded before the batch module appeared.
  onGenerate?: (info: GenerateInfo) => void;
  // Enrichment auto-sync (opt-in, default OFF). Bundler-plugin-only, a host/dev-loop behavior, so it has
  // no tsconfig counterpart. See EnrichSyncOptions.
  enrich?: EnrichSyncOptions;
}

// ONE unplugin factory behind every bundler entry point (@mionjs/devtools/runtypes/vite, /rollup, /webpack,
// /rspack, /esbuild are `unplugin.<bundler>` from this instance). Files-mode: the resolver writes the cache
// modules to real files under <genDir>/types/ at buildStart and the transform injects relative imports, so
// every bundler resolves them natively, no virtual-module hooks. Vite-only hooks ride the `vite` escape hatch.

/** The registration lane @mionjs/client imports through; answered with a real file rather than a `load`
 *  hook, which would change how esbuild and Bun read every other file too. */
const BUNDLED_API_ID = '#bundled-api';
const bundledApiStubPath = (): string => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const compiled = path.join(here, 'bundledApiStub.js');
  return fs.existsSync(compiled) ? compiled : path.join(here, 'bundledApiStub.ts');
};

export const unplugin = createUnplugin<PluginOptions | undefined>((rawOptions, meta) => {
  const options = rawOptions ?? {};
  // Validated below at the host boundary, so a config typo fails loudly.
  const transformMode: 'go' | 'edits' = options.transformMode ?? 'edits';
  // Precedence is tsc-style: the explicit plugin option wins, else the tsconfig `downgradeErrors` echoed on
  // the generate response (adopted in buildStart below), else nothing downgraded. Seeded from the option
  // alone so the transform lane behaves even if buildStart never ran on this host.
  let downgrade: DowngradeSet = resolveDowngradeErrors(options.downgradeErrors);
  // Same precedence as downgrade: the option, else the tsconfig echo adopted in buildStart.
  let showInfo = resolveShowInfo(options.levels);
  let grouped = resolveGrouped(options.logStyle);
  // An explicit `false` wins even when a handler is set; a handler with no setting means 'callback'.
  const reportMode: 'file' | 'callback' | false =
    options.pureFnReport ?? (options.onPureFnReport || options.onBatchReport ? 'callback' : false);
  if (reportMode !== false && reportMode !== 'file' && reportMode !== 'callback') {
    throw new Error(
      `[@mionjs/devtools] unknown pureFnReport ${JSON.stringify(options.pureFnReport)} — expected 'file' | 'callback' | false`
    );
  }
  // reportEnabled turns the report DATA on (the callback source, and the file's precondition).
  const reportEnabled: boolean = reportMode !== false;
  const writeReportFile: boolean = reportMode === 'file';
  if (transformMode !== 'go' && transformMode !== 'edits') {
    throw new Error(
      `[@mionjs/devtools] unknown transformMode ${JSON.stringify(options.transformMode)} — expected 'go' | 'edits'`
    );
  }
  // The i18n object's PRESENCE, not a flag inside it, enables per-locale translation-mirror sync.
  const enrichOptions = options.enrich;
  const enrichFriendly = enrichOptions?.friendly === true;
  const enrichMock = enrichOptions?.mock === true;
  const enrichI18n = enrichOptions?.i18n;
  const enrichI18nEnabled = enrichI18n !== undefined;
  const enrichLocales = enrichI18n?.locales ?? [];
  const enrichSourceLocale = enrichI18n?.sourceLocale;
  const anyEnrichFamily = enrichFriendly || enrichMock || enrichI18nEnabled;
  // The mirrors are write-only outputs, so any enrich family on suppresses HMR unless suppressHmr says otherwise.
  const suppressEnrichHmr = enrichOptions?.suppressHmr ?? anyEnrichFamily;
  let resolver: ResolverClient | null = null;
  // Live buildStart/buildEnd pairs across this instance's plugin containers (vite spawns one per
  // environment); the shared resolver closes only when the LAST container tears down — see buildEnd.
  let activeBuilds = 0;
  // The transform gate: cwd-relative, forward-slashed paths of every file the scan found marker sites in.
  // Rebuilt from generate()'s siteFiles at buildStart, kept current per-file by handleHotUpdate.
  let siteFiles = new Set<string>();
  let cwdAbs = '';
  // The resolved output root (<cwd>/.mion by default); modules land under <genDirAbs>/types.
  let genDirAbs = '';
  // Held until writePureFnArtifact: generate runs at buildStart, before a bundler empties its output dir.
  let pureFnArtifact: Record<string, string> = {};
  // Stays empty under every other bundler (no equivalent hook), where ensureResolver falls back to cwd.
  let viteRoot = '';
  // Empty under every other bundler. Gates enrichment auto-sync: 'serve' WRITES the mirrors, anything
  // else runs the read-only drift gate, since a production build must never mutate committed source.
  let viteCommand = '';
  // Vitest runs the serve command in `test` mode, and a test run is a build lane, not a dev server.
  let viteMode = '';
  // The dev server's logger; its `warn` takes `clear: false`, where a plugin's this.warn clears the terminal.
  let viteLogger: {warn: (message: string, options?: {clear?: boolean; timestamp?: boolean}) => void} | undefined;
  // The lane question for RuntimeErrors (see PluginOptions.devServer): halting everywhere but here.
  const isDevServer = (): boolean => options.devServer ?? (viteCommand === 'serve' && viteMode !== 'test');
  // A RuntimeError spares only the dev server, where the generated function throws when called.
  const halts = (diagnostic: Diagnostic): boolean =>
    diagnostic.level === Level.Error || (diagnostic.level === Level.RuntimeError && !isDevServer());
  const devPrint = (block: string): void =>
    viteLogger ? viteLogger.warn(block, {clear: false, timestamp: true}) : console.warn(`[@mionjs/devtools] ${block}`);
  const devReporter = new DevReporter(
    devPrint,
    () => cwdAbs || process.cwd(),
    () => grouped
  );
  // A regenerate failure mid-edit must neither stop the dev server nor pass silently.
  const devRegenerateFailed = (error: unknown): void =>
    devPrint(`@mionjs/devtools: regenerating after an edit failed: ${error instanceof Error ? error.message : String(error)}`);

  // Idempotent, and called from two places: under Vite configResolved calls it early (to capture Vite's
  // resolved root), under every other bundler buildStart does.
  function ensureResolver() {
    if (resolver) return;
    cwdAbs = path.resolve(options.cwd ?? (viteRoot || process.cwd()));
    // Left empty when unset: the plugin can't parse tsconfig without a dep, so the Go side owns the
    // <srcDir>/.mion default and echoes the resolved path back from generate().
    genDirAbs = options.genDir ? path.resolve(cwdAbs, options.genDir) : '';
    // Every knob below is forwarded ONLY when set explicitly here, so an unset one falls through to the
    // tsconfig mion plugin entry and then the binary default — tsc-style precedence.
    //
    // Surface a config typo at the host boundary (the binary validates the merged value too).
    assertValidModuleMode(options.moduleMode);
    assertValidClientRoutes(options.clientRoutes);
    // getExePath throws with a clear message when no platform binary is installed.
    const binaryPath = options.binary ?? getExePath();
    // Forward ONLY an explicit options.tsconfig: the Go side hard errors when it is missing or broken,
    // and when unset it resolves the config exactly as tsc does, searching upward from cwd.
    resolver = new ResolverClient(binaryPath, cwdAbs, options.tsconfig ?? '', {
      ...(options.emitMode ? {emitMode: options.emitMode} : {}),
      ...(options.validate?.numberMode ? {numberMode: options.validate.numberMode} : {}),
      ...(options.inlineMode ? {inlineMode: options.inlineMode} : {}),
      ...(options.parallelScan !== undefined ? {parallelScan: options.parallelScan} : {}),
      ...(options.parallelRender !== undefined ? {parallelRender: options.parallelRender} : {}),
      ...(options.moduleMode ? {moduleMode: options.moduleMode} : {}),
      ...(options.singleThreaded !== undefined ? {singleThreaded: options.singleThreaded} : {}),
      ...(options.hashLength !== undefined ? {hashLength: options.hashLength} : {}),
      ...(options.patternSampleCount !== undefined ? {patternSampleCount: options.patternSampleCount} : {}),
      ...(options.patternSampleRetries !== undefined ? {patternSampleRetries: options.patternSampleRetries} : {}),
      ...(options.jsonMaxBytes !== undefined ? {jsonMaxBytes: options.jsonMaxBytes} : {}),
      ...(options.markers?.packages?.length ? {markerPackages: options.markers.packages} : {}),
      ...(options.markers?.checkPackage === false ? {markerPackageCheck: false} : {}),
      ...(options.jsRuntime ? {jsRuntime: options.jsRuntime} : {}),
      // Report on the wire for both 'file' and 'callback'; the JSON file only for 'file'.
      ...(reportEnabled ? {pureFnReportWire: true} : {}),
      ...(writeReportFile ? {pureFnReportFile: true} : {}),
      // Session config the wire deliberately does not carry: an explicit genDir rides --gen-dir so EVERY op
      // (generate, transform, enrich) roots identically, the plugin lane always relativizes transform
      // imports (the generated modules are real files on disk), and locales/sourceLocale default from the
      // tsconfig i18n block.
      ...(genDirAbs ? {genDir: genDirAbs} : {}),
      ...(options.clientRoutes ? {clientRoutes: options.clientRoutes} : {}),
      transformRelative: true,
      ...(options.sourcesContent === false ? {omitSourcesContent: true} : {}),
      ...(enrichFriendly ? {enrichFriendly: true} : {}),
      ...(enrichMock ? {enrichMock: true} : {}),
      ...(enrichI18nEnabled ? {enrichI18n: true} : {}),
      ...(enrichLocales.length > 0 ? {enrichLocales} : {}),
      ...(enrichSourceLocale ? {enrichSourceLocale} : {}),
    });
    // Unref right after spawn: the resolver stays usable, and losing the parent closes its stdin so the
    // Go serve loop exits on EOF.
    if (options.detachResolver) resolver.unref();
  }

  // Site file -> the files declaring the types it reflects, and the reverse. Fed by every transform (the
  // Next broker included, since it drives the same hook), read by the incremental-update path. See type-deps.ts.
  const typeDeps = createTypeDepsIndex(cwdAbs || process.cwd());

  // `addWatchFile` is unplugin's universal shape (rollup/vite's addWatchFile, the webpack/rspack loader's
  // addDependency), so this one call is what gives webpack, rspack, rollup, rolldown, esbuild, bun and
  // `vite build --watch` an edge they never had. Vite's dev server ignores it for src-module HMR, which is
  // why handleHotUpdate additionally invalidates through the module graph.
  function declareTypeDeps(ctx: any, rel: string, deps: string[] | undefined): void {
    // The index records EVERY dep, virtual ones included: they are real edges for invalidation, even when
    // no bundler can watch them.
    typeDeps.record(rel, deps);
    if (!deps || deps.length === 0) return;
    for (const dep of deps) {
      // ⚠️ Only deps that EXIST ON DISK. A dep can sit on a virtual path (a Vue SFC's <script> registered
      // as `Comp.vue.ts`), and Vite's dev-mode addWatchFile records it as an extra IMPORT of the module
      // being transformed, failing the request with "Failed to resolve import ./Comp.vue.ts".
      if (!fileExists(dep)) continue;
      try {
        ctx.addWatchFile?.(dep);
      } catch {
        // A host that exposes the hook but rejects the path (outside its root) must not break the build.
      }
    }
  }

  // Memoized because a dev session re-transforms constantly and each transform declares the same deps.
  // Entries are never evicted: a dep that vanishes stops mattering the moment the file naming it is
  // re-transformed, which is when the resolver stops reporting it.
  const fileExistsCache = new Map<string, boolean>();
  function fileExists(file: string): boolean {
    const cached = fileExistsCache.get(file);
    if (cached !== undefined) return cached;
    let exists = false;
    try {
      exists = fs.existsSync(file);
    } catch {
      exists = false;
    }
    fileExistsCache.set(file, exists);
    return exists;
  }

  // The resolver reports absolute scan paths while per-file ops and the transform hook use cwd-relative
  // ids; both collapse to one cwd-relative, forward-slashed key so membership checks match.
  function siteKey(file: string): string {
    const rel = path.isAbsolute(file) ? path.relative(cwdAbs || process.cwd(), file) : file;
    return rel.split(path.sep).join('/');
  }

  // A file the buildStart scan couldn't have seen can introduce NEW error-level diagnostics (warnings were
  // already surfaced program-wide). Same lane rule as buildStart: a fatal Error fails the transform
  // everywhere, a RuntimeError everywhere but the dev server.
  function surfaceNewErrors(ctx: HostContext, diagnostics: Diagnostic[], activeFile: string): void {
    const cwd = cwdAbs || process.cwd();
    if (isDevServer()) {
      // Thrown unprinted, as the host prints the throw; generate's whole-program Errors throw from their file too.
      const fatal = devReporter.fatalIn(activeFile, diagnostics);
      devReporter.add(
        diagnostics.filter((diagnostic) => diagnostic.level !== Level.Error),
        downgrade
      );
      if (fatal.length > 0) hostHalt(ctx, haltError(fatal[0], fatal.length, activeFile, cwd));
      return;
    }
    const errors = diagnostics.filter(
      (diagnostic) => diagnostic.level === Level.Error || diagnostic.level === Level.RuntimeError
    );
    surfaceDiagnostics(ctx, errors, {halts, downgrade, activeFile, cwd, grouped});
  }

  // The 'go'-mode path, and the safe fallback for 'edits' mode when the source-consistency guard fails.
  // driftCheck is passed only when 'go' is the PRIMARY mode: 'go' rebuilds from the resolver's view and so
  // silently clobbers an upstream enforce:'pre' plugin's edit, and the returned sourceHash at least warns.
  async function transformViaGo(ctx: any, rel: string, driftCheck?: {code: string}) {
    const result = await resolver!.transform([rel]);
    // A file outside the buildStart Program may add types or pure fns, whose modules must be on disk
    // before the bundler resolves the injected imports.
    if (result.addedRunTypes || result.addedPureFns) await regenerate();
    surfaceNewErrors(ctx, result.diagnostics ?? [], rel);
    if (result.sites.length === 0 && (result.replacements?.length ?? 0) === 0) return null;
    const fileResult = result.transformed[rel];
    if (!fileResult || typeof fileResult.code !== 'string') return null;
    declareTypeDeps(ctx, rel, fileResult.typeDeps);
    if (driftCheck && fileResult.sourceHash !== undefined && fileResult.sourceHash !== sourceHash(driftCheck.code)) {
      hostWarn(
        ctx,
        `@mionjs/devtools: transform 'go' source drift on ${rel} — the rewrite was applied to the resolver's copy, not the source another plugin handed us. ` +
          `Order @mionjs/devtools first among enforce:'pre' plugins so it sees pristine source.`
      );
    }
    // The wire SourceMap is structurally valid but typed `sources: (string|null)[]` where the bundler
    // input wants string[], hence the cast.
    return {code: fileResult.code, map: (fileResult.map ?? undefined) as any};
  }

  // The 'edits'-mode path. Its source-consistency guard protects against an upstream pre-plugin that edited
  // the source out from under the resolver's byte offsets: on a hash mismatch the source is re-uploaded and
  // re-requested once, and if it still diverges, or the applier throws, it falls back to 'go' mode.
  async function transformViaEdits(ctx: any, rel: string, code: string) {
    const incomingHash = sourceHash(code);
    let result = await resolver!.transform([rel], {emitEdits: true});
    if (result.addedRunTypes || result.addedPureFns) await regenerate();
    surfaceNewErrors(ctx, result.diagnostics ?? [], rel);
    if (result.sites.length === 0 && (result.replacements?.length ?? 0) === 0) return null;
    let fileResult = result.transformed[rel];
    if (!fileResult) return null;

    if (fileResult.sourceHash !== undefined && fileResult.sourceHash !== incomingHash) {
      hostWarn(
        ctx,
        `@mionjs/devtools: transform 'edits' source drift on ${rel} — re-syncing via setSources. ` +
          `An enforce:'pre' plugin likely edited this file before @mionjs/devtools; order @mionjs/devtools first to avoid the extra round-trip.`
      );
      try {
        await resolver!.setSources({[rel]: code});
        result = await resolver!.transform([rel], {emitEdits: true});
        if (result.addedRunTypes || result.addedPureFns) await regenerate();
      } catch {
        return transformViaGo(ctx, rel);
      }
      // Outside the try: a halt must throw, never fall back to 'go' mode.
      surfaceNewErrors(ctx, result.diagnostics ?? [], rel);
      if (result.sites.length === 0 && (result.replacements?.length ?? 0) === 0) return null;
      fileResult = result.transformed[rel];
      // Still divergent after a fresh upload — bail to 'go' mode for correctness.
      if (!fileResult || (fileResult.sourceHash !== undefined && fileResult.sourceHash !== incomingHash)) {
        return transformViaGo(ctx, rel);
      }
    }

    declareTypeDeps(ctx, rel, fileResult.typeDeps);

    try {
      const applied = applyEdits(rel, code, fileResult.importBlock ?? '', fileResult.edits ?? []);
      return {code: applied.code, map: applied.map as any};
    } catch (error) {
      // A malformed edit set (should be impossible) must not break the build.
      hostWarn(ctx, `@mionjs/devtools: 'edits' apply failed on ${rel} (${String(error)}) — falling back to 'go' mode.`);
      return transformViaGo(ctx, rel);
    }
  }

  // Write-only-on-change, so a converged mirror never churns the watcher, and best-effort per file, since
  // one write failure must not tear down the dev loop. The created / updated split feeds the first-sync summary.
  async function writeMirrorFiles(
    files: {path: string; content: string; added?: boolean}[]
  ): Promise<{created: number; updated: number}> {
    let created = 0;
    let updated = 0;
    for (const file of files) {
      try {
        const existing = await fs.promises.readFile(file.path, 'utf8').catch(() => null);
        if (existing === file.content) continue;
        await fs.promises.mkdir(path.dirname(file.path), {recursive: true});
        await fs.promises.writeFile(file.path, file.content);
        if (file.added) created += 1;
        else updated += 1;
      } catch {
        // best-effort; keep going with the remaining mirrors
      }
    }
    return {created, updated};
  }

  // Scaffolds + reconciles the demanded mirrors for `files`, the whole program when [] is passed. The wire
  // carries only the files: which families / locales to sync is the resolver session's spawn-time config.
  // The daemon enriches every EXPORTED type a file declares that a marker call also demands.
  // Dev/watch only (a production build takes the read-only drift gate), and never throws.
  async function syncEnrich(files: string[]): Promise<void> {
    if (!resolver || !anyEnrichFamily) return;
    try {
      const result = await resolver.enrich(files);
      const written = await writeMirrorFiles(result.files);
      // Only the whole-program pass speaks, so a fresh opt-in is never a silent burst of new files;
      // per-file HMR syncs stay quiet, the diff in the editor being the feedback there.
      if (files.length === 0 && written.created + written.updated > 0) {
        console.log(
          `[@mionjs/devtools] enrich sync: scaffolded ${written.created} new mirror file(s), reconciled ${written.updated} — review & commit; fill the blanks before a production build (its completeness gate fails on unfilled scaffolds).`
        );
      }
    } catch {
      // A resolver hiccup mid-edit heals on the next pass — swallow it.
    }
  }

  // The production-build lane, the plugin analog of the CLI `enrich --require-complete`: the committed
  // enrichment must be IN SYNC and COMPLETE, checked WITHOUT writing, since mutating committed source
  // mid-build would break reproducibility. Two halves, both warning and both failing the build:
  //
  //   - DRIFT: an on-disk mirror missing or differing from the freshly computed one.
  //   - INCOMPLETE or STALE: unfilled @todo scaffolds, blank values (empty label / message / pool) and
  //     parked @rtOrphan carcasses — the daemon's hygiene findings.
  //
  // Dev/watch takes syncEnrich instead, which writes the scaffolds and tolerates the blanks.
  async function enrichDriftGate(ctx: any): Promise<void> {
    if (!resolver || !anyEnrichFamily) return;
    let stale: string[];
    let incomplete: Diagnostic[];
    try {
      const result = await resolver.enrich([]);
      stale = [];
      for (const file of result.files) {
        const existing = await fs.promises.readFile(file.path, 'utf8').catch(() => null);
        if (existing !== file.content) stale.push(file.path);
      }
      // EVERY hygiene finding is kept, with no level filter: these codes are all LevelWarning (a mirror
      // with a blank label still runs), so filtering by level silently let the @rtOrphan carcasses
      // through. Downgraded ones stay too — a downgrade lowers a finding, it never hides it; only the
      // halt count below drops them.
      incomplete = result.diagnostics ?? [];
    } catch {
      return;
    }
    if (stale.length === 0 && incomplete.length === 0) return;
    for (const stalePath of stale) {
      hostWarn(
        ctx,
        `@mionjs/devtools: enrichment mirror out of date or missing: ${stalePath} — run \`mion enrich --update\` and commit it.`
      );
    }
    let fatal = 0;
    const findings: Finding[] = [];
    for (const diagnostic of incomplete) {
      // isDowngraded never lowers a completeness Warning, yet it halts here, so apply `downgradeErrors` by code or `*`.
      const standDown =
        isDowngraded(downgrade, diagnostic) ||
        (DIAGNOSTIC_CATALOG[diagnostic.code]?.completeness === true && (downgrade.all || downgrade.codes.has(diagnostic.code)));
      findings.push({diagnostic, downgraded: standDown});
      if (!standDown) fatal += 1;
    }
    printFindings(ctx, findings, grouped, cwdAbs || process.cwd());
    // The stale-mirror half carries no diagnostic code, so only the wildcard lowers it.
    const staleCount = downgrade.all ? 0 : stale.length;
    if (staleCount === 0 && fatal === 0) return;
    const parts: string[] = [];
    if (staleCount > 0) parts.push(`${staleCount} out of date or missing`);
    if (fatal > 0) parts.push(`${fatal} incomplete or stale (unfilled @todo / blank value / @rtOrphan carcass)`);
    hostHalt(
      ctx,
      new Error(
        `@mionjs/devtools: enrichment is not production-ready — ${parts.join(', ')}. ` +
          `Run \`mion enrich --update\`, fill the blanks, and commit. (mirrors are never written during a production build)`
      )
    );
  }

  // Every generate goes through here, so the artifact always tracks the last whole-program render.
  async function regenerate(): Promise<GenerateResult> {
    const gen = await resolver!.generate();
    pureFnArtifact = gen.pureFnArtifact;
    return gen;
  }

  // `<dir>/mion-pure-fns/` is the build's alone; a file with unchanged bytes is skipped so a watch build is not retriggered.
  // Each bundler's own post-bundle hook calls it, since unplugin's arg-less writeBundle carries no output dir.
  async function writePureFnArtifact(dir: string): Promise<void> {
    if (!dir) return;
    const artifactDir = path.join(dir, PURE_FN_ARTIFACT_DIR);
    const files = Object.keys(pureFnArtifact);
    if (files.length === 0) {
      await fs.promises.rm(artifactDir, {recursive: true, force: true});
      return;
    }
    const live = new Set<string>();
    for (const rel of files) {
      const target = path.join(artifactDir, ...rel.split('/'));
      live.add(target);
      const content = pureFnArtifact[rel];
      const existing = await fs.promises.readFile(target, 'utf8').catch(() => null);
      if (existing === content) continue;
      await fs.promises.mkdir(path.dirname(target), {recursive: true});
      await fs.promises.writeFile(target, content);
    }
    await pruneArtifactDir(artifactDir, live);
  }

  async function pruneArtifactDir(dir: string, live: Set<string>): Promise<boolean> {
    let empty = true;
    for (const entry of await fs.promises.readdir(dir, {withFileTypes: true})) {
      const target = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (await pruneArtifactDir(target, live)) await fs.promises.rmdir(target);
        else empty = false;
      } else if (live.has(target)) empty = false;
      else await fs.promises.rm(target, {force: true});
    }
    return empty;
  }

  function outputDirOf(output: {dir?: string; file?: string; outdir?: string; outfile?: string; absWorkingDir?: string}): string {
    const base = output.absWorkingDir ?? process.cwd();
    const dir = output.dir ?? output.outdir;
    if (dir) return path.resolve(base, dir);
    const file = output.file ?? output.outfile;
    return file ? path.dirname(path.resolve(base, file)) : '';
  }

  // Fires once per output, so a multi-environment vite build gets a copy in every output dir.
  async function writeArtifactForOutput(this: unknown, output: {dir?: string; file?: string}): Promise<void> {
    await writePureFnArtifact(outputDirOf(output));
  }

  // afterEmit runs once the bundle is on disk.
  function writeArtifactAfterEmit(compiler: {
    options: {output: {path?: string}};
    hooks: {afterEmit: {tapPromise: (name: string, fn: () => Promise<void>) => void}};
  }): void {
    compiler.hooks.afterEmit.tapPromise(PLUGIN_NAME, () => writePureFnArtifact(compiler.options.output.path ?? ''));
  }

  function reportGenerate(gen: GenerateResult): void {
    options.onGenerate?.({
      outDir: gen.outDir,
      batchesModule: gen.batchesModule,
      routerInitFiles: gen.routerInitFiles.map((file) => path.resolve(file)),
    });
  }

  // The in-memory mirror of the project's sources, seeded on the FIRST incremental update rather than at
  // buildStart, which would tax every production build for something only a watch session needs.
  const sourceOverlay = new Map<string, string>();
  let overlaySeeded = false;

  function overlayKey(rel: string): string {
    return rel.split(path.sep).join('/');
  }

  function seedOverlay(): void {
    if (overlaySeeded) return;
    overlaySeeded = true;
    const skip = new Set(['node_modules', '.git', '.next', 'dist', 'coverage']);
    const walk = (dir: string): void => {
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(dir, {withFileTypes: true});
      } catch {
        return;
      }
      for (const entry of entries) {
        if (skip.has(entry.name)) continue;
        const full = path.join(dir, entry.name);
        if (genDirAbs && full === genDirAbs) continue;
        if (entry.isDirectory()) {
          walk(full);
          continue;
        }
        if (!/\.[mc]?[jt]sx?$/.test(entry.name)) continue;
        try {
          sourceOverlay.set(overlayKey(path.relative(cwdAbs, full)), fs.readFileSync(full, 'utf8'));
        } catch {
          // unreadable file — leave it to the on-disk program
        }
      }
    };
    walk(cwdAbs || process.cwd());
  }

  // The SHARED incremental-update leaf: Vite's handleHotUpdate and the Next broker's watcher both call it,
  // so the two hosts can never drift in how an edit is absorbed.
  //
  // Taking a BATCH is load-bearing, not a convenience: one file at a time means one setSources + generate
  // PER FILE, and each rewrite is a window in which a module another file's rewrite already imports is
  // briefly absent from disk, where a bundler fails with "can't resolve <hash>.js".
  async function applyHotUpdate(ctx: any, updates: {file: string; content?: string}[]): Promise<string[]> {
    if (!resolver) return [];
    const relevant = updates.filter((update) => /\.[mc]?[jt]sx?$/.test(update.file));
    if (relevant.length === 0) return [];
    const rels = relevant.map((update) => path.relative(cwdAbs || process.cwd(), update.file));

    // setSources gets the WHOLE overlay, never just the edited files: OpSetSources REPLACES the overlay and
    // rebuilds the Program against exactly what it is handed, so pushing one file collapses the Program to
    // that file. The next generate() then DELETES every other entry's module from disk, and any other
    // marker file fails with "source file not in program" (measured: a 63-module project down to 2).
    seedOverlay();
    relevant.forEach((update, index) => {
      if (typeof update.content === 'string') sourceOverlay.set(overlayKey(rels[index]), update.content);
    });
    const sources: Record<string, string> = Object.fromEntries(sourceOverlay);
    if (Object.keys(sources).length > 0) {
      try {
        await resolver.setSources(sources);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        // config-tsconfig-not-loaded is the project tsconfig refusing to load, worth saying out loud rather than skipping
        // updates silently; the daemon re-parses on the next edit, so a fix needs no dev-server restart.
        if (message.includes('config-tsconfig-not-loaded')) console.error(`[@mionjs/devtools] HMR update skipped — ${message}`);
        // Otherwise the changed file is outside the resolver's known set (a config file, say): nothing was
        // regenerated, so nothing went stale.
        return [];
      }
    }

    let result;
    try {
      result = await resolver.scanFiles(rels);
    } catch {
      return [];
    }
    // Keeps the transform gate current: an edit may add a file's first marker site (a file created after
    // buildStart enters the set here) or remove its last. A file counts when it carries a runtype site, a
    // pure-fn replacement OR a batch site, since a file whose only markers are `batch()` calls is
    // rewritten too (its id splice).
    const withSites = new Set([
      ...(result.sites ?? []).map((site) => siteKey(site.file)),
      ...(result.replacements ?? []).map((replacement) => siteKey(replacement.file)),
      ...(result.batchSites ?? []).map((site) => siteKey(site.file)),
    ]);
    for (const rel of rels) {
      if (withSites.has(siteKey(rel))) siteFiles.add(siteKey(rel));
      else siteFiles.delete(siteKey(rel));
    }
    // Fired before regenerating, so an in-process consumer learns of a body edit as it happens; the JSON
    // file is rewritten by the generate() below.
    if (reportEnabled && options.onPureFnReport && result.pureFnSites) options.onPureFnReport(result.pureFnSites, 'update');
    // The batch lane fires on EVERY update, empty list included: the wire omits an empty list,
    // and "this file defines no batch any more" is exactly what the consumer must hear.
    if (reportEnabled && options.onBatchReport)
      options.onBatchReport(
        result.batchSites ?? [],
        'update',
        relevant.map((update) => path.resolve(update.file))
      );
    // Regenerate so any new/changed modules hit disk before anything resolves them.
    try {
      const gen = await regenerate();
      // The whole-program echo keeps a file in the gate whose only rewrite the per-file scan cannot see:
      // a router-init module gets the batch import appended at transform time, never a scan site, so the
      // loop above would have just dropped it.
      for (const file of gen.siteFiles) siteFiles.add(siteKey(file));
      reportGenerate(gen);
      // generate's list includes the edited file's scan, so it is the one the dev reporter reads.
      if (isDevServer()) devReporter.update(gen.diagnostics ?? [], downgrade);
    } catch (error) {
      // The edited file's own scan findings still print.
      if (isDevServer()) {
        devRegenerateFailed(error);
        devReporter.add(result.diagnostics ?? [], downgrade);
      }
    }

    // AFTER generate, so the resolver's Program already reflects the edit.
    if (anyEnrichFamily) await syncEnrich(rels);

    // The Vue SFC pass of a build drives this leaf too.
    if (!isDevServer())
      surfaceDiagnostics(ctx, result.diagnostics ?? [], {
        halts: () => false,
        downgrade,
        showInfo,
        cwd: cwdAbs || process.cwd(),
        grouped,
      });

    const stale = staleSiteFiles(relevant.map((update) => update.file));
    // Reported from the SHARED leaf, so the contract does not depend on which host drove the update.
    if (stale.length > 0 && options.onSiteFilesChanged) {
      try {
        options.onSiteFilesChanged(stale);
      } catch (error) {
        hostWarn(ctx, `@mionjs/devtools: onSiteFilesChanged threw — ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return stale;
  }

  // Which ALREADY-TRANSFORMED files now serve a validator for a type that just changed. The bundler cannot
  // work this out: the edge from the using file to the type file is erased (`import type`, or an import
  // used only in type position) or never existed (an ambient `.d.ts`).
  //
  // The edited files are excluded because the host invalidates those on its own.
  //
  // ⚠️ A file transformed but holding no deps is UNKNOWN, never "no deps" — the resolver may predate the
  // field, or have reported nothing for a type it could not attribute. Those files join the stale set, so
  // the worst case degrades to re-transforming every marker-bearing file, not to a stale validator.
  function staleSiteFiles(changed: string[]): string[] {
    const edited = new Set(changed.map((file) => depKey(file, cwdAbs || process.cwd())));
    const stale = new Set<string>();
    for (const siteFile of typeDeps.affectedSiteFiles(changed)) stale.add(siteFile);
    for (const siteFile of typeDeps.unknownSiteFiles()) stale.add(siteFile);
    for (const file of edited) stale.delete(file);
    return [...stale].sort();
  }

  // <genDirAbs>/enriched/ is the committed mirror tree the plugin writes (and the CLI or a developer may
  // hand-edit); its changes are write-only outputs, which handleHotUpdate suppresses HMR for.
  function isUnderEnrichedDir(file: string): boolean {
    if (!genDirAbs) return false;
    const enrichedRoot = path.join(genDirAbs, 'enriched');
    const rel = path.relative(enrichedRoot, path.resolve(file));
    return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
  }

  return {
    name: PLUGIN_NAME,
    // Not an unplugin hook: the escape hatch a host with no HMR hook of its own
    // uses to absorb an edit. Turbopack gives loaders no update callback, so the
    // Next broker watches the source tree and calls this itself.
    rtHotUpdate: applyHotUpdate,
    // Not an unplugin hook either: Turbopack has no post-bundle hook, so the Next broker writes the artifact itself.
    rtWritePureFnArtifact: writePureFnArtifact,
    // Not an unplugin hook: the Next broker cannot infer the resolved genDir it keeps its stamp in.
    rtGenDir: (): string => genDirAbs,
    // Must run BEFORE vite/esbuild's built-in TypeScript transform: the resolver returns byte offsets into
    // the ORIGINAL source, so code with its type syntax already stripped puts every offset past the new EOF.
    enforce: 'pre' as const,

    // Generates the WHOLE program's cache modules to disk before any module resolution runs, so every
    // relative import the transform injects already resolves to a real file. Under Vite, configResolved
    // spawned the resolver earlier, so ensureResolver is a no-op here.
    async buildStart(this: any) {
      // Counted BEFORE any await: a sibling container's buildEnd must never observe a zero count while
      // this container's startup work is running.
      activeBuilds += 1;
      warnBelowTypeScriptFloor(options.cwd ?? process.cwd(), PLUGIN_NAME);
      ensureResolver();
      // The echoed root is adopted because the resolver's inferred <srcDir>/.mion cannot be computed here,
      // and the enriched-dir HMR suppression needs it. The VCS-hygiene files (per-folder READMEs, the
      // types/.gitignore) are written by the Go side inside generate, so the CLI compile lane gets them too.
      const gen = await regenerate();
      if (gen.outDir) genDirAbs = gen.outDir;
      // Adopting the echo under the explicit option is how a tsconfig-only setting reaches this dependency-free host.
      downgrade = resolveDowngradeErrors(options.downgradeErrors ?? gen.downgradeErrors);
      showInfo = resolveShowInfo(options.levels ?? gen.levels);
      grouped = resolveGrouped(options.logStyle ?? gen.logStyle);
      // A universal hook, so every adapter gets the report; a watch-mode rebuild re-runs buildStart and
      // re-fires 'build' with the fresh one.
      if (reportEnabled && options.onPureFnReport) options.onPureFnReport(gen.pureFnSites ?? [], 'build');
      if (reportEnabled && options.onBatchReport) options.onBatchReport(gen.batchSites ?? [], 'build');
      // The scan's site-file set is the transform gate, wrapper call sites included.
      // Rebuilt rather than merged, so a watch-mode rebuild drops files whose sites are gone.
      siteFiles = new Set(gen.siteFiles.map(siteKey));
      reportGenerate(gen);
      // A fatal Error ALWAYS halts and no setting reaches it: the build produced no code for the thing (no
      // cache entry, no injected id, no extracted body), so carrying on would ship a call that throws.
      // Every RuntimeError halts per the downgradeErrors contract in a build lane and only reports on a dev
      // server. The split is the LEVEL, never the diagnostic family: a fatal marker or batch code is not
      // pure-fn, and a purity violation still ships the compiled body, so it is a RuntimeError.
      if (isDevServer()) devReporter.update(gen.diagnostics ?? [], downgrade);
      else surfaceDiagnostics(this, gen.diagnostics ?? [], {halts, downgrade, showInfo, cwd: cwdAbs || process.cwd(), grouped});
      // Dev/watch WRITES the mirrors up front, a whole-program pass so they exist before the first edit;
      // every other lane (a production build, a non-Vite bundler) takes the read-only drift gate instead.
      if (anyEnrichFamily) {
        if (viteCommand === 'serve') await syncEnrich([]);
        else await enrichDriftGate(this);
      }
    },

    // buildEnd fires once per plugin CONTAINER and one instance (one resolver child) serves several: vite
    // runs a container per environment, and hosts like vitest close them at different times. Closing on the
    // FIRST buildEnd killed the shared child under the others' in-flight requests ("generate: resolver
    // exited"), so the close waits for the LAST. Nulling it lets a later buildStart respawn.
    buildEnd() {
      if (activeBuilds > 0) activeBuilds -= 1;
      if (activeBuilds > 0) return;
      resolver?.close();
      resolver = null;
    },

    // esbuild has NO transform phase: unplugin emulates one with onLoad, which reads the file and guesses
    // a loader from the extension. Without this filter that guess is `js` for every extension esbuild
    // would have loaded some other way, so adding this plugin made a build fail to PARSE a `.sql` or
    // `.graphql` file. Rollup and vite are unaffected, so it is one filter for all hosts.
    transformInclude(id: string) {
      return /\.[mc]?[jt]sx?$/.test(id);
    },

    // NEVER declared on bun: unplugin registers one `onResolve({filter: /.*/})` for the whole plugin as soon
    // as any resolveId hook exists, and bun's loader then fails every module this plugin returns null for,
    // entry point included. The stub is only a size win, so bun keeps the real module.
    ...(meta.framework !== 'bun' && options.clientRoutes === 'fetch'
      ? {
          // nothing injected reaches a dispatch point, so stubbing the dead registration lane drops core's marker reflection too
          resolveId(id: string) {
            return id === BUNDLED_API_ID ? bundledApiStubPath() : null;
          },
        }
      : {}),

    async transform(this: any, code: string, id: string) {
      if (!resolver) return null;
      if (!/\.[mc]?[jt]sx?$/.test(id)) return null;
      const rel = path.relative(cwdAbs || process.cwd(), id);
      // The site-file set is the real gate, so wrapper frameworks need no configuration.
      // A file created since the last scan falls back to the text gate the linter shares.
      const inSiteSet = siteFiles.has(siteKey(rel));
      if (!inSiteSet && !mayHoldMarkerCalls(code, id, options.markers) && !mayHoldDrizzleSchemas(code)) return null;

      try {
        // `await` keeps the rejection inside this try — `return promise` would let it escape.
        return await (transformMode === 'edits' ? transformViaEdits(this, rel, code) : transformViaGo(this, rel, {code}));
      } catch (error) {
        // A text-fallback file may be a false positive outside the resolver's program, with no sites to inject.
        // Site-set files keep failing loud: there a program miss would silently lose real injections.
        if (!inSiteSet && error instanceof Error && error.message.includes('source file not in program')) return null;
        throw error;
      }
    },

    rollup: {writeBundle: writeArtifactForOutput},
    rolldown: {writeBundle: writeArtifactForOutput},
    esbuild: {
      setup(build: {
        initialOptions: {outdir?: string; outfile?: string; absWorkingDir?: string};
        onEnd: (callback: () => Promise<void>) => void;
      }) {
        build.onEnd(() => writePureFnArtifact(outputDirOf(build.initialOptions)));
      },
    },
    webpack: writeArtifactAfterEmit,
    rspack: writeArtifactAfterEmit,
    bun: {
      setup(build: {config?: {outdir?: string}; onEnd?: (callback: () => Promise<void>) => void}) {
        // The runtime loader (`--preload`) has no bundle, so no onEnd.
        if (typeof build.onEnd === 'function')
          build.onEnd(() => writePureFnArtifact(outputDirOf({outdir: build.config?.outdir})));
      },
    },

    vite: {
      writeBundle: writeArtifactForOutput,

      // An APP build (`vite build` with a `builder` block) builds its environments SEQUENTIALLY, so each
      // buildEnd would drop the refcount to zero and make the next buildStart respawn the resolver, a
      // second full program scan of an unchanged program. One reference held across the whole app build
      // keeps it to one resolver.
      //
      // The `isBuilt` guard is Vite's own, so a host or plugin that already built the environments is left
      // alone (as is every legacy single-environment build, which never calls this hook).
      buildApp: {
        order: 'post' as const,
        async handler(builder: any) {
          const environments: {isBuilt?: boolean}[] = Object.values(builder?.environments ?? {});
          if (environments.length === 0 || environments.some((environment) => environment.isBuilt)) return;
          activeBuilds += 1;
          try {
            for (const environment of environments) await builder.build(environment);
          } finally {
            activeBuilds -= 1;
            if (activeBuilds <= 0) {
              resolver?.close();
              resolver = null;
            }
          }
        },
      },

      // The resolver is spawned eagerly here because the marker package's vitest relies on it existing as
      // soon as the workspace project initialises, before any test transform.
      configResolved(cfg: {root: string; command?: string; mode?: string; logger?: typeof viteLogger}) {
        viteRoot = cfg.root;
        viteLogger = cfg.logger;
        if (cfg.command) viteCommand = cfg.command;
        if (cfg.mode) viteMode = cfg.mode;
        ensureResolver();
      },

      // The HMR pivot: pushing the new contents into the resolver rebuilds the whole Program, the biggest
      // HMR cost. Generated module names are content-addressed and written only-on-change, so the watcher
      // reloads exactly the modules whose bytes moved and the re-transformed user file imports any new ones.
      async handleHotUpdate(this: any, ctx: any) {
        if (!resolver) return;
        const file: string = ctx.file;
        if (!file) return;
        // A change under <genDir>/enriched/** is the plugin's own mirror write (or a hand / CLI edit), so
        // reloading nothing is what keeps the auto-sync writes out of a reload loop.
        if (suppressEnrichHmr && isUnderEnrichedDir(file)) return [];
        if (!/\.[mc]?[jt]sx?$/.test(file)) return;
        const content = typeof ctx.read === 'function' ? await ctx.read() : undefined;
        const stale = await applyHotUpdate(this, [{file, content}]);
        if (stale.length === 0) return;

        // applyHotUpdate already reported the set through onSiteFilesChanged, which is what a host with
        // VIRTUAL sources (mion's `Comp.vue.ts` for a Vue SFC's <script>) relies on, since those never
        // appear in the module graph below. What is left here is what this plugin can resolve itself:
        // returning the modules updates exactly these on top of the ones Vite worked out for the edited
        // file. A stale site file with no module here is either not yet served or virtual.
        const graph = ctx.server?.moduleGraph;
        if (!graph?.getModulesByFile) return;
        const modules = new Map<unknown, unknown>();
        for (const existing of ctx.modules ?? []) modules.set(existing, existing);
        for (const siteFile of stale) {
          for (const mod of graph.getModulesByFile(siteFile) ?? []) {
            graph.invalidateModule?.(mod);
            modules.set(mod, mod);
          }
        }
        return [...modules.values()] as any;
      },
    },
  };
});

export default unplugin;

export {formatDowngraded, formatTscDiagnostic} from './surface.ts';
export type {PluginOptions as Options};
export type {BatchMapping, BatchSite, PureFnSite} from './protocol.ts';
export {
  ENTRY_MODULE_PREFIX,
  ENTRY_MODULE_SUFFIX,
  ENTRY_BINDING_PREFIX,
  CACHE_MODULES,
  type CacheModuleSettings,
} from './go-generated/runtypes-constants.generated.ts';
