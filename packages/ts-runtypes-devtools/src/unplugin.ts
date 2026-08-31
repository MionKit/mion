import fs from 'node:fs';
import path from 'node:path';
import {createUnplugin} from 'unplugin';
import {getExePath} from '@ts-runtypes/bin';
import {renderHeadline} from './diagnosticCatalog.ts';
import {ResolverClient} from './resolver-client.ts';
import {applyEdits, sourceHash} from './apply-edits.ts';
import {Family, Severity, type Diagnostic, type PureFnSite} from './protocol.ts';
import type {ModuleMode} from './go-generated/runtypes-constants.generated.ts';
import {assertValidModuleMode} from './module-mode.ts';
import {createTypeDepsIndex, depKey} from './type-deps.ts';
import {warnBelowTypeScriptFloor} from './typescript-floor.ts';

// PluginOptions is the host-plugin surface. The CANONICAL place to configure
// the compiler's PROJECT knobs (emitMode, moduleMode, inlineMode, cacheDir,
// hashLength, parallelScan/Render, singleThreaded) is the `ts-runtypes` entry
// under compilerOptions.plugins in tsconfig.json — see the Configuration guide.
// Those keys are accepted here too as a per-build OVERRIDE (forwarded as a flag,
// so they win over tsconfig, tsc-style); reach for them only when one build
// must differ. `binary` / `cwd` / `tsconfig` / `genDir` are genuinely
// host-specific and have no tsconfig equivalent.
// EnrichI18nSyncOptions is the plugin's i18n sync config. It intentionally
// shares the SHAPE of the tsconfig `i18n` plugin entry (sourceLocale / locales /
// strict), but drives a DIFFERENT lane: the CLI `i18n` entry configures
// `enrich --i18n`, while this one drives the plugin's per-locale
// translation-mirror auto-sync. `strict` is accepted for shape-parity; the
// auto-sync never gates on it (it only scaffolds + reconciles).
// The plugin's host-facing name, shared by every adapter entry (the bun one
// needs it before it constructs the inner plugin).
export const PLUGIN_NAME = '@ts-runtypes/devtools';

export interface EnrichI18nSyncOptions {
  sourceLocale?: string;
  locales?: string[];
  strict?: boolean;
}

// EnrichSyncOptions is the opt-in enrichment auto-sync surface (default OFF).
// When any family is enabled the plugin keeps the committed enrichment mirrors
// under <genDir>/enriched/** in sync from dev/watch, running the SAME
// value-preserving scaffold + reconcile the `ts-runtypes enrich --update` CLI
// does — NEVER translated content, NEVER an LLM. A production `vite build` never
// writes: it runs a read-only completeness gate (the plugin analog of `enrich
// --require-complete`) that warns, and under failOnError fails the build, when a
// mirror is stale/missing OR still carries an unfilled @todo / blank value.
export interface EnrichSyncOptions {
  // Auto gen + sync the FriendlyText mirrors under <genDir>/enriched/friendly/.
  friendly?: boolean;
  // Auto gen + sync the MockData mirrors under <genDir>/enriched/mock/.
  mock?: boolean;
  // Presence enables per-locale translation-mirror sync under
  // <genDir>/enriched/i18n/<locale>/ — SCAFFOLD + SYNC only.
  i18n?: EnrichI18nSyncOptions;
  // HMR for <genDir>/enriched/** is AUTO-SUPPRESSED whenever any enrich family is
  // enabled (the mirrors are write-only outputs). Set false to restore reloads
  // for debugging; set true to suppress even when auto-gen is off (e.g. you edit
  // the mirrors by hand or via the CLI while the dev server runs). Effective
  // suppression = suppressHmr ?? (any enrich family enabled).
  suppressHmr?: boolean;
}

export interface PluginOptions {
  // Absolute path to the compiled ts-runtypes binary. Optional: when omitted,
  // the plugin resolves the prebuilt binary for the host platform via the
  // `@ts-runtypes/bin` launcher (its `@ts-runtypes/binary-<os>-<arch>` optional
  // dependency). Set this only to point at a custom or local build — e.g.
  // in-repo development passes `bin/ts-runtypes`.
  binary?: string;
  // Project root (where tsconfig.json lives). Defaults to the bundler root —
  // Vite's resolved root when running under Vite, else process.cwd().
  cwd?: string;
  // Path to tsconfig.json, relative to cwd. Defaults to "tsconfig.json".
  tsconfig?: string;
  // RunTypes generated-output root, resolved relative to cwd. The build writes
  // the generated cache modules under `<genDir>/types/` (gitignored) and the
  // committed enrichment under `<genDir>/enriched/`; each folder gets a README
  // saying what it is. When omitted, the resolver infers `<srcDir>/__runtypes`
  // from the tsconfig (rootDir → common-ancestor of the program's files →
  // baseUrl → cwd). The folder lives in the project (not node_modules) so a
  // dev watcher sees regenerated modules.
  genDir?: string;
  // What the Go binary ships in each RT cache entry's code/factory slots:
  //   - 'code' (default): only the body `code` string; the JS-side
  //     `materializeRTFn` rebuilds the factory via `new Function('utl', code)`
  //     on first lookup. Smallest output for runtimes that allow dynamic code.
  //   - 'functions': only the live `function g_<hash>(utl){…}` factory; the
  //     code string is derived lazily from it only if read. Smallest
  //     factory-bearing output for runtimes that disallow `new Function`
  //     (Cloudflare WorkerD, sandboxed iframes, CSP without `unsafe-eval`).
  //   - 'both': code string AND live factory (the body twice) — for runtimes
  //     that disallow `new Function` yet read `.code`. Test setups use this so
  //     suites cover both materialisation paths on every case.
  emitMode?: 'code' | 'functions' | 'both';
  // Binary `dynamic` cold-start buffer-size estimate knobs. The compiler walks
  // each binary-encoder type at build time and bakes a buffer-size estimate
  // into the entry; `createBinaryEncoderFn({sizeStrategy: 'dynamic'})` uses it as
  // the initial buffer size (instead of a 16 MiB default) until per-key history
  // warms up. All are optional and fold into the disk cache fingerprint.
  //   - bias (0..1, default 0.8): 0 = tightest (more grows), 1 = most generous.
  //   - items (default 100): assumed element count for an unbounded collection.
  //   - stringBytes (default 32): assumed byte length of an unbounded string.
  //   - maxBytes (default 65536): per-type cap so a huge declared bound
  //     never seeds a multi-MB cold buffer.
  //   All four ride the single `binarySizing` object (same shape and name as the
  //   tsconfig `binarySizing` key): {bias, items, stringBytes, maxBytes}.
  binarySizing?: {bias?: number; items?: number; stringBytes?: number; maxBytes?: number};
  // Project-wide defaults for the per-call-site ValidateOptions bag, grouped
  // under one `validate` object (like `binarySizing`). Merged per field into every
  // validate / validationErrors call site by the compiler (a per-call option
  // wins over the default for that field).
  //   - numberMode: the base `number` check every validator uses — 'isFinite'
  //     (default; rejects NaN/Infinity), 'typeof' (accepts them), or 'notNaN'
  //     (rejects NaN, accepts Infinity). Eases migration from a looser library.
  validate?: {numberMode?: 'isFinite' | 'typeof' | 'notNaN'};
  // Project-wide default for createParseFn's per-call-site strategy, grouped
  // under one `parse` object like `validate`. A per-call `strategy` wins.
  //   - strategy: what a parsed value does with properties the type does not
  //     declare — 'preserve' (default; keeps them), 'strip' (blanks them before
  //     the restore), or 'fail' (rejects the value). Set it once when a project
  //     wants every payload cleaned, or every stray key refused, rather than
  //     repeating the option at each call.
  parse?: {strategy?: 'preserve' | 'strip' | 'fail'};
  // NB: there is deliberately NO cacheDir option. The on-disk RT artifact cache
  // (the incremental build cache under node_modules/.cache/ts-runtypes, separate
  // from `genDir`) follows TypeScript's own `incremental` / `composite` switch —
  // on when the project's tsconfig is incremental, off otherwise. There is no
  // knob to set here; align it with tsc by toggling `incremental` in tsconfig.
  // (The internal RT_CACHE_DIR env var overrides it for tests / direct use.)
  //
  // Parallelism opt-outs. The Go binary parallelizes its marker scan
  // (across the tsgo checker pool) and its per-family entry collection
  // by default; pass `false` to force the corresponding serial path
  // (--no-parallel-scan / --no-parallel-render). Output is equivalent
  // either way — these exist for benchmarking baselines and debugging.
  parallelScan?: boolean;
  parallelRender?: boolean;
  // Force single-checker, fully-serial scan/render. Output is equivalent; the
  // child is lighter. The canonical home is the tsconfig `singleThreaded` knob —
  // set it here to override one build in EITHER direction: `true` forces it on
  // (--single-threaded), `false` forces it off (--no-single-threaded) over a
  // tsconfig `singleThreaded: true`.
  singleThreaded?: boolean;
  // Length of the short structural-hash ids in generated names (--hash-length;
  // undefined = the binary default, 7). The canonical home is the tsconfig
  // `hashLength` knob; set it here to override one build.
  hashLength?: number;
  // How many mockSamples the build auto-generates for a format pattern that
  // declares none (--pattern-sample-count; undefined = the binary default,
  // 100; 0 disables generation, making sample-less patterns a build error).
  // Deterministic per pattern. The canonical home is the tsconfig
  // `patternSampleCount` knob; set it here to override one build.
  patternSampleCount?: number;
  // Per-sample draw multiplier for pattern sample generation
  // (--pattern-sample-retries; undefined = the binary default, 10): the
  // whole budget is patternSampleCount × patternSampleRetries draws before
  // a pattern is declared ungeneratable. Raise it for heavily constrained
  // patterns whose candidates often miss the declared length bounds. The
  // canonical home is the tsconfig `patternSampleRetries` knob.
  patternSampleRetries?: number;
  // Which packages are allowed to declare the marker types (InjectRunTypeId,
  // InjectTypeFnArgs, CompTimeArgs, PureFunction, …). Lets a library ship the
  // brands itself instead of depending on ts-runtypes just for types.
  //   packages     — extra package names to accept. Additive: '@mionjs/run-types'
  //                  stays accepted, and this list is UNIONED with the tsconfig
  //                  `markers.packages` entry rather than replacing it.
  //   checkPackage — false drops the package check entirely, matching a marker
  //                  on its type NAME alone. Escape hatch: a local
  //                  `type InjectRunTypeId<T> = …` then drives rewrites too.
  // The canonical home is the tsconfig `markers` key; set it here to override
  // or extend it for one build.
  markers?: {packages?: string[]; checkPackage?: boolean};
  // How cache entries group into modules:
  //   'default'    — runtype nodes ride ONE data bundle (+ per-root facade
  //                  modules); every fn-family / composite / pure-fn entry
  //                  is its own per-entry module. Best chunk-splitting
  //                  granularity in production builds.
  //   'allSingle'  — bundle everything: one module per fn family
  //                  (`fns/<tag>`), one `pf` pure-fn bundle, facades folded
  //                  into the runtypes bundle. Fewest modules / requests;
  //                  family bundles re-fetch wholesale on type edits.
  //   'allModules' — split everything: per-entry fn modules AND per-node
  //                  runtype modules. Escape hatch; measurably slower on
  //                  dense reflection graphs.
  moduleMode?: ModuleMode;
  // Child-inlining policy:
  //   'default'     — the name rule: UNNAMED compounds (arrays, tuples,
  //                   object literals, unions, classes) inline into their
  //                   parents (statement bodies hoist to per-factory context
  //                   fns); NAMED types (alias/interface) and circular types
  //                   stay external as dedupe-worthy shared entries.
  //                   Date/Temporal builtins always inline (atomic emits).
  //   'allInternal' — name-blind: everything except circular types inlines.
  //                   One function per call-site type per family, at the
  //                   cost of duplicating shapes shared across roots.
  inlineMode?: 'default' | 'allInternal';
  // How the per-file rewrite crosses the wire (host-level, NOT a project
  // semantic — it must never fold into any disk-cache fingerprint; the
  // artifacts are identical either way):
  //   'edits' (default) — the resolver returns the raw edit list (import block
  //             + call-site splices + a source-content hash) and the plugin
  //             applies it here, generating the source map JS-side. O(sites)
  //             on the wire, so it wins the dev loop on large / many-marker
  //             files. Requires this plugin to see pristine source (run it
  //             first among enforce:'pre' plugins); on source drift it detects
  //             the mismatch, re-syncs via setSources, and warns.
  //   'go'    — the resolver applies the rewrite and returns the whole
  //             rewritten file + source map. Heavier wire, but the only option
  //             for a non-JS / plugin-free host, and the safe fallback when an
  //             upstream pre-plugin rewrites the source before us.
  transformMode?: 'go' | 'edits';
  // 'go' mode only — whether the returned source map embeds the original source
  // in `sourcesContent`. Default true (self-contained maps). Set false to drop
  // it: the bundler composes the chained map and fills original content itself,
  // so this trims the heaviest single wire item at no cost to debuggability in
  // a normal build. No effect in 'edits' mode (the FE generates its own map).
  sourcesContent?: boolean;
  // Whether Error-severity build diagnostics (FMT002 param contradictions,
  // root-position non-serializable types, …) FAIL the build/transform in every
  // lane — `vite build`, vitest, dev serve — matching the documented contract
  // ("Error = will throw at runtime, build must fail"). Default true. Set
  // false for programs that deliberately contain error-case types (e.g. a
  // test suite pinning the runtime alwaysThrow behavior): diagnostics then
  // surface as bundler warnings only. Pure-fn extraction errors always halt
  // regardless — files-mode has no fallback for a failed generation, so
  // proceeding would break the build anyway. HMR updates never hard-fail
  // mid-edit either way; the halt re-applies on the next build/test run.
  failOnError?: boolean;
  // JS runtime (node/bun path) the resolver runs format-pattern checks on
  // (--js-runtime). Host-specific like `binary` — no tsconfig key. Default:
  // this plugin's own process.execPath, so the serve lane always has a
  // runtime with zero configuration; set it only to pin a different one.
  jsRuntime?: string;
  // Unref the resolver child once it is up, so it never holds the host process
  // open. Host bootstrap, not a project semantic — no tsconfig key.
  //
  // Set by @ts-runtypes/devtools/bun for Bun's RUNTIME loader, which keeps one
  // resolver for the whole process lifetime and gets no buildEnd to close it:
  // without this a `bun run` script finishes its work and then hangs forever on
  // the live child. Leave it off for a bundler host, where the pending read of a
  // resolver response can be the build's only live handle and an unref'd child
  // would let the process exit mid-build.
  detachResolver?: boolean;
  // Pure-fn build report — the structured, layout-independent record of every
  // pure fn this build generated (call-site span, callee attribution, registry
  // key, and the self-contained entry payload). For host tooling that relocates
  // pure-fn bodies across bundles (mion's cross-bundle serverMapFrom transport).
  // One tri-state switch selects where the report goes:
  //   - `'file'`     → write it to the HARDCODED
  //                    `<genDir>/types/pure-fns-report.json` on every generate.
  //                    The location is not configurable (like every path under
  //                    genDir), so it inherits types/'s gitignore + regenerate
  //                    lifecycle. For plugin-free / separate-process / CLI-batch
  //                    consumers. The `onPureFnReport` handler, if set, also fires.
  //   - `'callback'` → deliver it ONLY in-process to `onPureFnReport`, no file.
  //   - `false` / unset → off. (Providing `onPureFnReport` without setting this
  //                    defaults to `'callback'`, so "just add a handler" works;
  //                    an explicit `false` wins and nothing fires.)
  // Both channels carry identical records; the report shape is identical across
  // every `moduleMode`.
  pureFnReport?: 'file' | 'callback' | false;
  // In-process pure-fn report callback, fired on EVERY adapter (it rides the
  // universal buildStart hook, not a vite-only one): once after the
  // whole-program buildStart scan + generate with the full report (phase
  // 'build'), and — under Vite's HMR — again with the changed file's delta
  // (phase 'update'). Fires whenever the report is on ('file' or 'callback');
  // setting it with `pureFnReport` unset implies 'callback' (data, no file).
  onPureFnReport?: (sites: PureFnSite[], phase: 'build' | 'update') => void;
  // Fired after an incremental update, with the site files whose injected fns
  // just changed — the ones the host must re-transform so they stop serving a
  // validator for the previous shape.
  //
  // The plugin already invalidates what it can resolve itself (Vite's module
  // graph), so a plain bundler host needs nothing here. This exists because NOT
  // EVERY SITE FILE IS A REAL MODULE: sources registered through `setSources`
  // may be virtual — mion registers a Vue SFC's <script> as `Comp.vue.ts` while
  // the module Vite serves is `Comp.vue`. Invalidating by site-file path alone
  // silently misses those (`.ts` files recover, `.vue` files stay stale), so the
  // set is REPORTED and the host maps its own virtual paths back.
  //
  // Paths are absolute and forward-slashed.
  onSiteFilesChanged?: (siteFiles: string[]) => void;
  // Enrichment auto-sync (opt-in, default OFF — omit for exactly today's
  // behavior). Bundler-plugin-only (a host/dev-loop behavior, so it has no
  // tsconfig counterpart). See EnrichSyncOptions: friendly/mock enable per-family
  // gen+sync, an i18n object enables per-locale translation-mirror sync (scaffold
  // + reconcile only, never translated content), and suppressHmr overrides the
  // auto-suppression of HMR for <genDir>/enriched/**.
  enrich?: EnrichSyncOptions;
}

// MARKER_MODULE backs the transform's textual FALLBACK pre-filter. The primary
// gate is the resolver's own site-file set (populated from the whole-program
// scan at buildStart, maintained per-file on HMR): a file is handed to the
// per-file rewrite when the scan actually found marker sites in it, so wrapper
// frameworks re-exposing the markers behind their own factories (e.g. mion's
// `route()` from '@mionkit/router') work with ZERO configuration — their
// users' files never import '@mionjs/run-types' by name. The textual check
// only catches files the last scan couldn't have seen (created mid-session,
// before their first HMR scan lands them in the set).
const MARKER_MODULE = '@mionjs/run-types';

// markerImportProbes builds the quoted-specifier probes the fallback pre-filter
// matches on: the default marker package plus whatever the project configured
// (`markers.packages`). Returns null when the package gate is disabled — a
// marker can then be declared anywhere, so no import-specifier probe is sound
// and the fallback has to let every file through.
function markerImportProbes(markers: PluginOptions['markers']): string[] | null {
  if (markers?.checkPackage === false) return null;
  return [MARKER_MODULE, ...(markers?.packages ?? [])].flatMap((mod) => [`'${mod}`, `"${mod}`]);
}

// @ts-runtypes/devtools is built on unplugin: ONE factory, many bundler entry
// points (@ts-runtypes/devtools/vite, /rollup, /webpack, /rspack, /esbuild are
// `unplugin.<bundler>` from this instance). Files-mode: the resolver writes
// the cache modules to real files under <genDir>/types/ at buildStart and the
// transform injects relative imports to them, so every bundler resolves them
// natively — no virtual-module hooks. The Vite-only config + HMR hooks ride
// the `vite` escape hatch.
export const unplugin = createUnplugin<PluginOptions | undefined>((rawOptions) => {
  const options = rawOptions ?? {};
  // Wire mode for the per-file rewrite. Default 'edits' (the light path that
  // wins the bundler dev loop); 'go' is the full-transform fallback. Validated
  // at the host boundary so a config typo fails loudly.
  const transformMode: 'go' | 'edits' = options.transformMode ?? 'edits';
  // Computed once per plugin instance: the fallback pre-filter's import probes
  // for the project's marker packages (null = package gate disabled).
  const markerProbes = markerImportProbes(options.markers);
  // Error-severity diagnostics fail the build/transform in every lane unless
  // explicitly opted out (see PluginOptions.failOnError). Precedence is
  // tsc-style: the explicit plugin option wins, else the tsconfig `failOnError`
  // echoed on the generate response (adopted in buildStart below), else the
  // built-in true. Seeded with the option-or-true default so the transform lane
  // is safe even if buildStart never ran on this host.
  let failOnError: boolean = options.failOnError ?? true;
  // Resolve the pure-fn report tri-state into the two low-level resolver flags.
  // An explicit `false` wins even when a handler is set; an unset value with a
  // handler defaults to 'callback' (data, no file). Validated at the host
  // boundary so a config typo fails loudly.
  const reportMode: 'file' | 'callback' | false = options.pureFnReport ?? (options.onPureFnReport ? 'callback' : false);
  if (reportMode !== false && reportMode !== 'file' && reportMode !== 'callback') {
    throw new Error(
      `[@ts-runtypes/devtools] unknown pureFnReport ${JSON.stringify(options.pureFnReport)} — expected 'file' | 'callback' | false`
    );
  }
  // reportEnabled turns the report DATA on (the callback source + the file's
  // precondition); writeReportFile additionally writes the JSON.
  const reportEnabled: boolean = reportMode !== false;
  const writeReportFile: boolean = reportMode === 'file';
  if (transformMode !== 'go' && transformMode !== 'edits') {
    throw new Error(
      `[@ts-runtypes/devtools] unknown transformMode ${JSON.stringify(options.transformMode)} — expected 'go' | 'edits'`
    );
  }
  // Enrichment auto-sync config (default OFF). friendly/mock enable per-family
  // gen+sync; the i18n object's PRESENCE enables per-locale translation-mirror
  // sync (scaffold + reconcile only, never translated content).
  const enrichOptions = options.enrich;
  const enrichFriendly = enrichOptions?.friendly === true;
  const enrichMock = enrichOptions?.mock === true;
  const enrichI18n = enrichOptions?.i18n;
  const enrichI18nEnabled = enrichI18n !== undefined;
  const enrichLocales = enrichI18n?.locales ?? [];
  const enrichSourceLocale = enrichI18n?.sourceLocale;
  const anyEnrichFamily = enrichFriendly || enrichMock || enrichI18nEnabled;
  // HMR for <genDir>/enriched/** auto-suppresses whenever any enrich family is on
  // (the mirrors are write-only outputs); suppressHmr overrides in EITHER
  // direction — false restores reloads for debugging, true suppresses even with
  // auto-gen off (hand / CLI edits while the dev server runs).
  const suppressEnrichHmr = enrichOptions?.suppressHmr ?? anyEnrichFamily;
  let resolver: ResolverClient | null = null;
  // Live buildStart/buildEnd pairs across this instance's plugin containers
  // (vite spawns one per environment). The shared resolver closes only when
  // the LAST container tears down — see the buildEnd hook.
  let activeBuilds = 0;
  // The transform gate: cwd-relative paths (forward-slashed) of every source
  // file the resolver's scan found marker sites in. Rebuilt from generate()'s
  // siteFiles at buildStart, kept current per-file by handleHotUpdate.
  let siteFiles = new Set<string>();
  let cwdAbs = '';
  // The resolved RunTypes output root (<cwd>/__runtypes by default). Set by
  // ensureResolver once cwdAbs is known; modules land under <genDirAbs>/types.
  let genDirAbs = '';
  // Vite's resolved root, captured in configResolved. Stays empty under every
  // other bundler (no equivalent hook), where ensureResolver falls back to
  // options.cwd ?? process.cwd().
  let viteRoot = '';
  // Vite's command ('serve' | 'build'), captured in configResolved. Empty under
  // every other bundler. Gates enrichment auto-sync: 'serve' WRITES the mirrors
  // (dev/watch), anything else runs the read-only drift gate (a production build
  // must never mutate committed source).
  let viteCommand = '';

  // ensureResolver spawns the resolver subprocess + wires the disk cache on
  // first use. Idempotent: under Vite the configResolved hook calls it early
  // (so it can capture Vite's resolved root); under every other bundler
  // buildStart calls it. The resolver's Program root (cwdAbs) is options.cwd
  // when set, else the Vite root, else process.cwd().
  function ensureResolver() {
    if (resolver) return;
    cwdAbs = path.resolve(options.cwd ?? (viteRoot || process.cwd()));
    // Explicit genDir is resolved up front; otherwise leave it empty and let
    // the resolver infer <srcDir>/__runtypes from the tsconfig at buildStart —
    // the plugin can't parse tsconfig without a dep, so the Go side owns the
    // default and echoes the resolved path back from generate().
    genDirAbs = options.genDir ? path.resolve(cwdAbs, options.genDir) : '';
    // tsconfig is the canonical config surface for the Go compiler's project
    // knobs (emitMode, moduleMode, inlineMode, hashLength, …). The plugin
    // forwards a flag ONLY for an option set explicitly here, so an unset
    // option falls through to the tsconfig ts-runtypes plugin entry and the
    // binary's defaults — tsc-style precedence: a forwarded flag overrides
    // tsconfig overrides the default. The RT disk cache has no knob here: it
    // follows the project's `incremental` / `composite` tsconfig setting.
    //
    // Surface a config typo at the host boundary (the binary validates the
    // merged value too) — only when the user actually set moduleMode.
    assertValidModuleMode(options.moduleMode);
    // Explicit path wins; otherwise resolve the host-platform binary from the
    // ts-runtypes-bin launcher (throws with a clear message if none is installed).
    const binaryPath = options.binary ?? getExePath();
    // Forward ONLY an explicit options.tsconfig (strict: the Go side hard
    // errors when it is missing or broken). When unset, the Go side resolves
    // the config exactly as tsc does — searching upward from cwd — so the
    // plugin carries no config logic of its own.
    resolver = new ResolverClient(binaryPath, cwdAbs, options.tsconfig ?? '', {
      ...(options.emitMode ? {emitMode: options.emitMode} : {}),
      ...(options.binarySizing?.bias !== undefined ? {binarySizingBias: options.binarySizing.bias} : {}),
      ...(options.binarySizing?.items !== undefined ? {binarySizingItems: options.binarySizing.items} : {}),
      ...(options.binarySizing?.stringBytes !== undefined ? {binarySizingStringBytes: options.binarySizing.stringBytes} : {}),
      ...(options.binarySizing?.maxBytes !== undefined ? {binarySizingMaxBytes: options.binarySizing.maxBytes} : {}),
      ...(options.validate?.numberMode ? {numberMode: options.validate.numberMode} : {}),
      ...(options.parse?.strategy ? {parseStrategy: options.parse.strategy} : {}),
      ...(options.inlineMode ? {inlineMode: options.inlineMode} : {}),
      ...(options.parallelScan !== undefined ? {parallelScan: options.parallelScan} : {}),
      ...(options.parallelRender !== undefined ? {parallelRender: options.parallelRender} : {}),
      ...(options.moduleMode ? {moduleMode: options.moduleMode} : {}),
      ...(options.singleThreaded !== undefined ? {singleThreaded: options.singleThreaded} : {}),
      ...(options.hashLength !== undefined ? {hashLength: options.hashLength} : {}),
      ...(options.patternSampleCount !== undefined ? {patternSampleCount: options.patternSampleCount} : {}),
      ...(options.patternSampleRetries !== undefined ? {patternSampleRetries: options.patternSampleRetries} : {}),
      ...(options.markers?.packages?.length ? {markerPackages: options.markers.packages} : {}),
      ...(options.markers?.checkPackage === false ? {markerPackageCheck: false} : {}),
      ...(options.jsRuntime ? {jsRuntime: options.jsRuntime} : {}),
      // Tri-state → the two low-level resolver flags: report on the wire for
      // both 'file' and 'callback'; the JSON file written only for 'file' (at
      // the hardcoded genDir/types path).
      ...(reportEnabled ? {pureFnReportWire: true} : {}),
      ...(writeReportFile ? {pureFnReportFile: true} : {}),
      // Session config the wire deliberately does not carry. An explicit genDir
      // rides --gen-dir so EVERY op (generate, transform, enrich) roots
      // identically; the plugin lane always relativizes transform imports (the
      // generated modules are real files on disk); sourcesContent:false becomes
      // the map trim. Families + i18n select what the enrich daemon syncs, with
      // locales/sourceLocale defaulting from the tsconfig i18n block.
      ...(genDirAbs ? {genDir: genDirAbs} : {}),
      transformRelative: true,
      ...(options.sourcesContent === false ? {omitSourcesContent: true} : {}),
      ...(enrichFriendly ? {enrichFriendly: true} : {}),
      ...(enrichMock ? {enrichMock: true} : {}),
      ...(enrichI18nEnabled ? {enrichI18n: true} : {}),
      ...(enrichLocales.length > 0 ? {enrichLocales} : {}),
      ...(enrichSourceLocale ? {enrichSourceLocale} : {}),
    });
    // Runtime-loader hosts (Bun's Bun.plugin preload) keep the resolver for the
    // whole process and never get a buildEnd, so the live child would keep the
    // host alive forever. Unref right after spawn — the resolver stays usable,
    // and losing the parent closes its stdin so the Go serve loop exits on EOF.
    if (options.detachResolver) resolver.unref();
  }

  // siteKey canonicalizes a source path for the siteFiles set. The resolver
  // reports whole-program scan paths (absolute) while per-file ops and the
  // transform hook use cwd-relative ids — both collapse to one cwd-relative,
  // forward-slashed key so membership checks match across the two shapes
  // (and across platform separators).
  // The type-dependency index: site file -> the files declaring the types it
  // reflects, and the reverse. Fed by every transform (the Next broker included,
  // since it drives the same hook), read by the incremental-update path to work
  // out exactly which files went stale. See type-deps.ts.
  const typeDeps = createTypeDepsIndex(cwdAbs || process.cwd());

  // declareTypeDeps records a file's type dependencies and declares them to the
  // bundler. `addWatchFile` is unplugin's universal shape — it maps to
  // rollup/vite's addWatchFile and to the webpack/rspack loader's
  // addDependency — so this single call is what gives webpack, rspack, rollup,
  // rolldown, esbuild, bun and `vite build --watch` an edge they never had.
  // Vite's dev server ignores it for src-module HMR, which is why
  // handleHotUpdate additionally invalidates through the module graph.
  function declareTypeDeps(ctx: any, rel: string, deps: string[] | undefined): void {
    // The index records EVERY dep, virtual ones included — they are real
    // dependency edges for invalidation, even when no bundler can watch them.
    typeDeps.record(rel, deps);
    if (!deps || deps.length === 0) return;
    for (const dep of deps) {
      // ⚠️ Only declare deps that EXIST ON DISK. A source registered through
      // setSources may be virtual — a host can hand us a Vue SFC's <script> as
      // `Comp.vue.ts`, a path with no file behind it — and a type declared in
      // that script is reported as a dep on the virtual path. Vite's dev-mode
      // addWatchFile records the path as an extra IMPORT of the module being
      // transformed, so declaring one fails the request outright with
      // "Failed to resolve import ./Comp.vue.ts ... Does the file exist?".
      // Watching a path that cannot change on disk buys nothing anyway.
      if (!fileExists(dep)) continue;
      try {
        ctx.addWatchFile?.(dep);
      } catch {
        // A host that exposes the hook but rejects the path (outside its root)
        // must never break the build over a watch edge.
      }
    }
  }

  // fileExists memoizes existsSync per path. A transform declares the same deps
  // on every re-run, and a dev session re-transforms constantly, so the check
  // must not become a stat per dep per transform. Entries are only ever added:
  // a dep that vanishes stops mattering the moment the file that named it is
  // re-transformed, which is exactly when the resolver stops reporting it.
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

  function siteKey(file: string): string {
    const rel = path.isAbsolute(file) ? path.relative(cwdAbs || process.cwd(), file) : file;
    return rel.split(path.sep).join('/');
  }

  // transformViaGo is the 'go'-mode path: the resolver applies the rewrite and
  // returns the whole rewritten file + source map; the plugin just plumbs
  // {code, map} to the bundler. Also the safe fallback for 'edits' mode when the
  // source-consistency guard can't be satisfied.
  //
  // driftCheck is set only when 'go' is the PRIMARY mode: 'go' rebuilds from the
  // resolver's view and so silently clobbers an upstream enforce:'pre' plugin's
  // edit, but the returned sourceHash lets us at least DETECT and warn. It is
  // omitted on the 'edits'-mode fallback path (the drift is already known there).
  async function transformViaGo(ctx: any, rel: string, driftCheck?: {code: string}) {
    const result = await resolver!.transform([rel]);
    // A file outside the buildStart Program may surface new types / pure fns;
    // regenerate so the modules its injected imports point at exist on disk
    // before the bundler resolves them. (write-only-on-change keeps it cheap.)
    if (result.addedRunTypes || result.addedPureFns) await resolver!.generate();
    // A file the buildStart scan couldn't have seen can introduce NEW
    // Error-severity diagnostics — surface them here so the transform fails
    // per the failOnError contract (warnings already surfaced program-wide).
    surfaceDiagnostics(ctx, result.diagnostics ?? [], (d) => d.severity === Severity.Error, {halt: failOnError});
    if (result.sites.length === 0 && (result.replacements?.length ?? 0) === 0) return null;
    const fileResult = result.transformed[rel];
    if (!fileResult || typeof fileResult.code !== 'string') return null;
    declareTypeDeps(ctx, rel, fileResult.typeDeps);
    if (driftCheck && fileResult.sourceHash !== undefined && fileResult.sourceHash !== sourceHash(driftCheck.code)) {
      ctx.warn?.(
        `@ts-runtypes/devtools: transform 'go' source drift on ${rel} — the rewrite was applied to the resolver's copy, not the source another plugin handed us. ` +
          `Order @ts-runtypes/devtools first among enforce:'pre' plugins so it sees pristine source.`
      );
    }
    // fileResult.map is our wire SourceMap — structurally valid but typed with
    // `sources: (string|null)[]` where the bundler input wants string[]; cast.
    return {code: fileResult.code, map: (fileResult.map ?? undefined) as any};
  }

  // transformViaEdits is the 'edits'-mode path: the resolver returns the raw
  // edit list, the plugin applies it to the bundler-supplied `code` and
  // generates the map JS-side (lighter wire). The source-consistency guard
  // protects against an upstream pre-plugin that edited the source out from
  // under the resolver's byte offsets: on a hash mismatch we re-upload the
  // source and re-request once; if it still diverges, or the applier throws,
  // we fall back to 'go' mode so a build is never broken by this optimization.
  async function transformViaEdits(ctx: any, rel: string, code: string) {
    const incomingHash = sourceHash(code);
    let result = await resolver!.transform([rel], {emitEdits: true});
    if (result.addedRunTypes || result.addedPureFns) await resolver!.generate();
    // New Error-severity diagnostics from a file the buildStart scan couldn't
    // have seen — fail the transform per the failOnError contract.
    surfaceDiagnostics(ctx, result.diagnostics ?? [], (d) => d.severity === Severity.Error, {halt: failOnError});
    if (result.sites.length === 0 && (result.replacements?.length ?? 0) === 0) return null;
    let fileResult = result.transformed[rel];
    if (!fileResult) return null;

    if (fileResult.sourceHash !== undefined && fileResult.sourceHash !== incomingHash) {
      ctx.warn?.(
        `@ts-runtypes/devtools: transform 'edits' source drift on ${rel} — re-syncing via setSources. ` +
          `An enforce:'pre' plugin likely edited this file before @ts-runtypes/devtools; order @ts-runtypes/devtools first to avoid the extra round-trip.`
      );
      try {
        await resolver!.setSources({[rel]: code});
        result = await resolver!.transform([rel], {emitEdits: true});
        if (result.addedRunTypes || result.addedPureFns) await resolver!.generate();
        if (result.sites.length === 0 && (result.replacements?.length ?? 0) === 0) return null;
        fileResult = result.transformed[rel];
      } catch {
        return transformViaGo(ctx, rel);
      }
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
      ctx.warn?.(`@ts-runtypes/devtools: 'edits' apply failed on ${rel} (${String(error)}) — falling back to 'go' mode.`);
      return transformViaGo(ctx, rel);
    }
  }

  // writeMirrorFiles writes each computed enrichment mirror to disk
  // write-only-on-change (skip when the bytes already match), so a converged
  // mirror never churns the watcher. Best-effort per file: one write failure must
  // not tear down the dev loop. Returns what it actually wrote — freshly
  // scaffolded (added) vs reconciled — for the first-sync summary.
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

  // syncEnrich scaffolds + reconciles the demanded enrichment mirrors for `files`
  // (the whole program when [] is passed) and writes them to disk. The wire
  // carries only the files — which families / locales to sync and where the tree
  // roots are the resolver session's spawn-time config. The daemon does the
  // (type name → source file) mapping: for each file it enriches every EXPORTED
  // type that file declares which is ALSO demanded by a marker call. Dev/watch
  // only — a production build takes the read-only drift gate instead. Never
  // throws: enrichment sync must not break the dev loop.
  async function syncEnrich(files: string[]): Promise<void> {
    if (!resolver || !anyEnrichFamily) return;
    try {
      const result = await resolver.enrich(files);
      const written = await writeMirrorFiles(result.files);
      // First-sync visibility: the whole-program pass says what it created, so a
      // fresh opt-in is never a silent burst of new files. Per-file HMR syncs
      // stay quiet (the diff in the editor is the feedback there).
      if (files.length === 0 && written.created + written.updated > 0) {
        console.log(
          `[@ts-runtypes/devtools] enrich sync: scaffolded ${written.created} new mirror file(s), reconciled ${written.updated} — review & commit; fill the blanks before a production build (its completeness gate fails on unfilled scaffolds).`
        );
      }
    } catch {
      // A resolver hiccup mid-edit heals on the next pass — swallow it.
    }
  }

  // enrichDriftGate is the production-build lane: it computes the desired mirrors
  // (whole program) and enforces that the committed enrichment is both IN SYNC and
  // COMPLETE, WITHOUT writing (mutating committed source mid-build would break
  // reproducibility). This is the plugin analog of the CLI `enrich
  // --require-complete`, so a release can never ship blank labels/mocks:
  //
  //   - DRIFT: an on-disk mirror missing or differing from the freshly computed
  //     one (a source type moved and the mirror wasn't reconciled).
  //   - INCOMPLETE: unfilled @todo scaffolds or blank values (empty label /
  //     message / pool) over the computed mirrors — the daemon's hygiene findings.
  //
  // Both warn; under failOnError both fail the build. Dev/watch takes syncEnrich
  // instead, which writes the scaffolds and tolerates the blanks (the developer is
  // mid-authoring). Never mutates committed source.
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
      // Unfilled @todo scaffolds + blank values over the computed mirrors. These
      // are Error-severity here (unlike dev): a production build must not ship an
      // app with blank labels/translations.
      incomplete = (result.diagnostics ?? []).filter((d) => d.severity === Severity.Error);
    } catch {
      return;
    }
    if (stale.length === 0 && incomplete.length === 0) return;
    for (const stalePath of stale) {
      ctx.warn?.(
        `@ts-runtypes/devtools: enrichment mirror out of date or missing: ${stalePath} — run \`ts-runtypes enrich --update\` and commit it.`
      );
    }
    for (const diagnostic of incomplete) ctx.warn?.(formatTscDiagnostic(diagnostic));
    if (failOnError) {
      const parts: string[] = [];
      if (stale.length > 0) parts.push(`${stale.length} out of date or missing`);
      if (incomplete.length > 0) parts.push(`${incomplete.length} incomplete (unfilled @todo / blank value)`);
      ctx.error?.(
        `@ts-runtypes/devtools: enrichment is not production-ready — ${parts.join(', ')}. ` +
          `Run \`ts-runtypes enrich --update\`, fill the blanks, and commit. (mirrors are never written during a production build)`
      );
    }
  }

  // The in-memory mirror of the project's sources, seeded lazily on the FIRST
  // incremental update (never at buildStart, which would tax every production
  // build for something only a watch session needs) and kept current from there.
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

  // applyHotUpdate is the SHARED incremental-update leaf: push changed sources
  // into the resolver, re-scan them, regenerate the cache modules, then surface
  // diagnostics. Vite's handleHotUpdate hook and the Next broker's watcher both
  // call it, so the two hosts can never drift in how an edit is absorbed.
  //
  // It takes a BATCH, and that is load-bearing rather than a convenience. Doing
  // one file at a time means one setSources + one generate PER FILE, so a single
  // edit that touches several files rewrites the generated module set several
  // times over. Each of those rewrites is a window in which a module another
  // file's rewrite already imports is briefly absent from disk, and a bundler
  // resolving in that window fails with "can't resolve <hash>.js". One batch is
  // one regenerate, which closes the window.
  async function applyHotUpdate(ctx: any, updates: {file: string; content?: string}[]): Promise<string[]> {
    if (!resolver) return [];
    const relevant = updates.filter((update) => /\.[mc]?[jt]sx?$/.test(update.file));
    if (relevant.length === 0) return [];
    const rels = relevant.map((update) => path.relative(cwdAbs || process.cwd(), update.file));

    // setSources gets the WHOLE overlay, never just the edited files. OpSetSources
    // REPLACES the overlay and rebuilds the Program against exactly what it is
    // handed, so pushing one file collapses the Program to that file: the next
    // generate() then emits only its demand and DELETES every other entry's
    // module from disk, and any other marker file fails with "source file not in
    // program". Measured on a 63-module project, a one-file update took it to 2.
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
        // A CFG001-tagged failure is the project tsconfig refusing to load
        // (strict like tsc) — say so loudly instead of silently skipping
        // updates; the daemon re-parses on the next edit, so a fixed config
        // heals without a dev-server restart.
        if (message.includes('CFG001')) console.error(`[@ts-runtypes/devtools] HMR update skipped — ${message}`);
        // Otherwise the changed file is outside the resolver's known set (e.g. a
        // config file) — nothing for the resolver to do here. Nothing was
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
    // Keep the transform gate current: an edit may have added a file's first
    // marker site (files created after buildStart enter the set here) or
    // removed its last one. scanFiles reports sites across the whole batch, so
    // membership is decided per file from the reported site paths.
    const withSites = new Set((result.sites ?? []).map((site) => siteKey(site.file)));
    for (const rel of rels) {
      if (withSites.has(siteKey(rel))) siteFiles.add(siteKey(rel));
      else siteFiles.delete(siteKey(rel));
    }
    // Pure-fn report update lane: fire the callback with the changed sites
    // before regenerating, so an in-process consumer learns of a body edit as it
    // happens. The JSON file is rewritten by the generate() below.
    if (reportEnabled && options.onPureFnReport && result.pureFnSites) options.onPureFnReport(result.pureFnSites, 'update');
    // Regenerate so any new/changed modules hit disk before anything resolves them.
    try {
      await resolver.generate();
    } catch {
      // A regenerate failure shouldn't tear down the dev server mid-edit.
    }

    // Sync the changed files' demanded enrichment mirrors (opt-in). Runs AFTER
    // generate so the resolver's Program already reflects the edit.
    if (anyEnrichFamily) await syncEnrich(rels);

    // Re-emit diagnostics so the editor's problem panel updates as the user
    // types. `halt: false` because HMR shouldn't tear down the dev server on a
    // single bad type — the user is mid-edit.
    surfaceDiagnostics(ctx, result.diagnostics ?? [], () => true, {halt: false});

    const stale = staleSiteFiles(relevant.map((update) => update.file));
    // Report from the SHARED leaf, so every host gets it: Vite's
    // handleHotUpdate, the Next broker's watcher and a direct rtHotUpdate
    // caller all land here. Reporting from one host's hook only would make the
    // contract depend on which bundler happened to drive the update.
    if (stale.length > 0 && options.onSiteFilesChanged) {
      try {
        options.onSiteFilesChanged(stale);
      } catch (error) {
        ctx.warn?.(`@ts-runtypes/devtools: onSiteFilesChanged threw — ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return stale;
  }

  // staleSiteFiles answers the question the whole mechanism exists for: which
  // ALREADY-TRANSFORMED files are now serving a validator for a type that just
  // changed? The bundler cannot work this out — the edge from the using file to
  // the type file is erased (`import type`, or a plain import used only in type
  // position) or never existed (an ambient `.d.ts`).
  //
  // The edited files themselves are excluded: the host invalidates those on its
  // own, and returning them would be redundant at best.
  //
  // ⚠️ A file we transformed but hold no deps for is UNKNOWN, never "no deps" —
  // the resolver may predate this field, or have reported nothing for a type it
  // could not attribute. Those files join the stale set, so the worst case
  // degrades to the coarse behaviour (re-transform every marker-bearing file)
  // rather than to a silently stale validator.
  function staleSiteFiles(changed: string[]): string[] {
    const edited = new Set(changed.map((file) => depKey(file, cwdAbs || process.cwd())));
    const stale = new Set<string>();
    for (const siteFile of typeDeps.affectedSiteFiles(changed)) stale.add(siteFile);
    for (const siteFile of typeDeps.unknownSiteFiles()) stale.add(siteFile);
    for (const file of edited) stale.delete(file);
    return [...stale].sort();
  }

  // isUnderEnrichedDir reports whether an absolute file path lives under
  // <genDirAbs>/enriched/ — the committed enrichment mirror tree the plugin writes
  // (and the CLI / a developer may hand-edit). Its changes are write-only outputs,
  // so handleHotUpdate suppresses HMR for them when suppression is effective.
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
    // Must run BEFORE vite/esbuild's built-in TypeScript transform. The
    // resolver returns byte offsets into the ORIGINAL source — if the
    // plugin saw code after esbuild stripped type syntax, every offset
    // would land past the new EOF. enforce: 'pre' guarantees the
    // resolver sees the raw .ts file.
    enforce: 'pre' as const,

    // buildStart generates the WHOLE program's cache modules to disk up front,
    // before any module resolution runs — so every relative import the
    // transform injects already resolves to a real file. Unified across
    // bundlers; under Vite, configResolved spawns the resolver earlier, so the
    // ensureResolver call here is then a no-op.
    async buildStart(this: any) {
      // Counted BEFORE any await: a sibling container's buildEnd must never
      // observe a zero count while this container's startup work is running.
      activeBuilds += 1;
      warnBelowTypeScriptFloor(options.cwd ?? process.cwd(), PLUGIN_NAME);
      ensureResolver();
      // generate writes the modules and echoes the SESSION-resolved root back.
      // When no explicit genDir was set that is the resolver's inferred
      // <srcDir>/__runtypes, which this dependency-free plugin cannot compute
      // for itself — adopt it so the enriched-dir HMR suppression knows where
      // the tree lives. The VCS-hygiene files (per-folder READMEs, the
      // types/.gitignore) are written by the Go side inside generate, so the
      // CLI compile lane gets them too.
      const gen = await resolver!.generate();
      if (gen.outDir) genDirAbs = gen.outDir;
      // Adopt the tsconfig-echoed failOnError as the halt default (the explicit
      // plugin option still wins, then this echo, then the built-in true), so a
      // tsconfig-only `failOnError: false` reaches the dependency-free host.
      failOnError = options.failOnError ?? gen.failOnError ?? true;
      // Pure-fn build report — fire the in-process callback with the whole
      // program's report (phase 'build'). Universal hook, so every adapter
      // (vite/rollup/rolldown/esbuild/rspack/webpack) gets it; a watch-mode
      // rebuild re-runs buildStart and re-fires 'build' with the fresh report.
      if (reportEnabled && options.onPureFnReport) options.onPureFnReport(gen.pureFnSites ?? [], 'build');
      // Adopt the whole-program scan's site-file set as the transform gate
      // (see MARKER_MODULE): exactly the files with rewritable marker sites,
      // wrapper call sites included. Rebuilt (not merged) so watch-mode
      // rebuilds drop files whose sites are gone.
      siteFiles = new Set(gen.siteFiles.map(siteKey));
      // Pure-fn extraction errors ALWAYS halt the build (files-mode has no
      // virtual fallback, so a generation error is fatal). Every other family
      // (the RT render diagnostics — FMT002 param contradictions, root-position
      // non-serializable types, …) surfaces here too and halts per the
      // failOnError contract, so dev/test lanes fail as loudly as `vite build`.
      surfaceDiagnostics(this, gen.diagnostics ?? [], (d) => d.family === Family.PureFn, {halt: true});
      surfaceDiagnostics(this, gen.diagnostics ?? [], (d) => d.family !== Family.PureFn, {halt: failOnError});
      // Enrichment auto-sync (opt-in). Dev/watch (vite serve) WRITES the demanded
      // mirrors up front — a whole-program pass so they exist before the first
      // edit; every other lane (a production build, a non-Vite bundler) runs the
      // read-only drift gate instead, which never mutates committed source. Both
      // no-op when no enrich family is enabled.
      if (anyEnrichFamily) {
        if (viteCommand === 'serve') await syncEnrich([]);
        else await enrichDriftGate(this);
      }
    },

    // buildEnd fires once per plugin CONTAINER, and one plugin instance (one
    // resolver child) serves several: vite runs a container per environment
    // (client + ssr) over the same instance, and hosts like vitest close them
    // at different times. Closing on the FIRST buildEnd killed the shared
    // child under the other containers' in-flight requests ("generate:
    // resolver exited"), so the close waits for the LAST paired buildEnd.
    // The resolver is nulled so a later buildStart (watch rebuild, dev-server
    // restart) respawns via ensureResolver.
    buildEnd() {
      if (activeBuilds > 0) activeBuilds -= 1;
      if (activeBuilds > 0) return;
      resolver?.close();
      resolver = null;
    },

    // esbuild has NO transform phase: unplugin emulates one with an onLoad hook,
    // and an onLoad that fires reads the file and hands esbuild a loader guessed
    // from the extension. Without this filter that guess is `js` for every
    // extension esbuild would otherwise have loaded some other way, so a build
    // that loads a `.sql` or `.graphql` file as text failed to PARSE it as
    // JavaScript the moment this plugin was added. The transform below already
    // ignores those files; unplugin just needs to be told before it opens them.
    // Rollup and vite are unaffected either way (they only call transform), so
    // this is one filter for all hosts rather than an esbuild special case.
    transformInclude(id: string) {
      return /\.[mc]?[jt]sx?$/.test(id);
    },

    async transform(this: any, code: string, id: string) {
      if (!resolver) return null;
      if (!/\.[mc]?[jt]sx?$/.test(id)) return null;
      const rel = path.relative(cwdAbs || process.cwd(), id);
      // Gate: the buildStart scan already knows exactly which files carry
      // rewritable marker sites (siteFiles) — wrapper call sites included,
      // whatever package declared the wrapper. Files outside the set can't
      // need a rewrite, EXCEPT ones the last scan couldn't have seen (created
      // mid-session, before their first HMR scan): those fall back to cheap
      // textual checks. We match the marker package only as a quoted import
      // specifier (`'@mionjs/run-types`, `"@mionjs/run-types`, incl.
      // subpaths) — a bare `includes(...)` also fires on path mentions in
      // comments (e.g. `packages/run-types/…`), which would force the
      // resolver to scan files that never import the markers.
      // The pure-fn registrars are checked separately because the marker
      // package's OWN sources call them via relative imports (no package-name
      // string in the file). `registerPureFn` catches both named registrars
      // (`registerPureFn` + `registerPureFnFactory`) and `registerAnonymousPureFn`
      // catches both anonymous ones (`registerAnonymousPureFn` +
      // `registerAnonymousPureFnFactory`) — a substring probe over all four. Both
      // pure-fn lanes emit Replacements, not Sites, so a file created mid-session
      // (before its first HMR scan lands it in siteFiles) needs this textual catch.
      const inSiteSet = siteFiles.has(siteKey(rel));
      if (!inSiteSet) {
        const importsMarkerModule = markerProbes === null || markerProbes.some((probe) => code.includes(probe));
        const callsPureFnRegistrar = code.includes('registerPureFn') || code.includes('registerAnonymousPureFn');
        if (!importsMarkerModule && !callsPureFnRegistrar) return null;
      }

      try {
        // `await` keeps the rejection inside this try — `return promise` would let it escape.
        return await (transformMode === 'edits' ? transformViaEdits(this, rel, code) : transformViaGo(this, rel, {code}));
      } catch (error) {
        // A textual-fallback candidate can be a FALSE POSITIVE: a host-project file
        // that merely contains one of the probed names (e.g. its own function named
        // `registerPureFnFactory`) while living OUTSIDE the resolver's program — the
        // resolver rejects it with "source file not in program". Such a file was never
        // scanned, so it cannot carry injectable sites: skip it instead of failing the
        // host build. Files in the SITE SET keep failing loud — there a program miss
        // means real marker sites would silently lose their injection.
        if (!inSiteSet && error instanceof Error && error.message.includes('source file not in program')) return null;
        throw error;
      }
    },

    vite: {
      // configResolved captures Vite's resolved root, then spawns the
      // resolver eagerly. The marker package's vitest relies on the resolver
      // existing as soon as the workspace project initialises (before any
      // test transform), which is exactly when configResolved fires.
      configResolved(cfg: {root: string; command?: string}) {
        viteRoot = cfg.root;
        if (cfg.command) viteCommand = cfg.command;
        ensureResolver();
      },

      // handleHotUpdate is the HMR pivot. When a user file changes: push the
      // new contents into the resolver (full Program rebuild — the biggest HMR
      // cost), re-scan it, then regenerate the
      // cache modules to disk. Generated module names are content-addressed and
      // written only-on-change, so the watcher reloads exactly the modules whose
      // bytes moved; the re-transformed user file imports any new ones.
      async handleHotUpdate(this: any, ctx: any) {
        if (!resolver) return;
        const file: string = ctx.file;
        if (!file) return;
        // HMR suppression for write-only enrichment outputs: a change under
        // <genDir>/enriched/** is the plugin's own mirror write (or a hand / CLI
        // edit). Return [] so Vite reloads nothing when suppression is effective —
        // this is what keeps the auto-sync writes from triggering reload loops.
        if (suppressEnrichHmr && isUnderEnrichedDir(file)) return [];
        if (!/\.[mc]?[jt]sx?$/.test(file)) return;
        const content = typeof ctx.read === 'function' ? await ctx.read() : undefined;
        const stale = await applyHotUpdate(this, [{file, content}]);
        if (stale.length === 0) return;

        // applyHotUpdate already reported the set through onSiteFilesChanged —
        // that is the shared leaf's job, and it is what a host with VIRTUAL
        // sources (mion's `Comp.vue.ts` for a Vue SFC's <script>) relies on,
        // since those never appear in the module graph below.
        //
        // Here we invalidate what we can resolve ourselves. Returning the modules
        // from handleHotUpdate is the idiomatic Vite shape: it updates exactly
        // these on top of the ones Vite already worked out for the edited file.
        // A stale site file with no module here is either not yet served or
        // virtual — the report above is what covers it.
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

// surfaceDiagnostics routes a diagnostic list through the bundler's plugin
// context based on each entry's severity. The split is the rule that
// makes the build fail (or not) on unsupported types:
//
//   - SeverityError diagnostics ALWAYS get `ctx.warn` so the user sees
//     every error in the build log (not just the first one). When
//     `halt: true` AND at least one error was collected, the function
//     then calls `ctx.error()` ONCE with a summary so the build fails
//     with the full error list still visible above the failure.
//   - SeverityWarning / SeverityInfo emit as `ctx.warn` only — these
//     are intentional behaviours the user should know about but that
//     do not require a hard build halt.
//
// `halt: false` is the HMR mode: a bad type during dev shouldn't kill
// the server; the user is mid-edit. The diagnostic still flows to the
// editor's Problems panel via `ctx.warn`.
function surfaceDiagnostics(
  ctx: any,
  diagnostics: Diagnostic[],
  filter: (d: Diagnostic) => boolean,
  options: {halt: boolean}
): void {
  let errorCount = 0;
  for (const diagnostic of diagnostics) {
    if (!filter(diagnostic)) continue;
    ctx.warn?.(formatTscDiagnostic(diagnostic));
    if (diagnostic.severity === Severity.Error) errorCount += 1;
  }
  if (options.halt && errorCount > 0) {
    const noun = errorCount === 1 ? 'unsupported-type error' : 'unsupported-type errors';
    ctx.error?.(`@ts-runtypes/devtools: ${errorCount} ${noun} — build halted. See warnings above for the call sites.`);
  }
}

// formatTscDiagnostic renders a Diagnostic in the canonical
// `tsc --pretty=false` line format so VS Code's $tsc problem matcher
// recognises it:
//   /abs/path(line,col): error PFE9004: headline text
//     Related: /abs/path(line,col): related message
//
// The user-facing headline is resolved from the generated catalog
// (`./diagnosticCatalog.generated.ts`, sourced from internal/diagnostics) — the
// wire only carries the diagnostic code + optional positional args. Severity
// is numeric on the wire — switch on it to pick the human label since
// the canonical line format requires the word, not the digit.
export function formatTscDiagnostic(d: Diagnostic): string {
  const label = severityLabel(d.severity);
  const headline = renderHeadline(d.code, d.args);
  let line = `${d.site.filePath}(${d.site.startLine},${d.site.startCol}): ${label} ${d.code}: ${headline}`;
  if (d.related && d.related.length > 0) {
    for (const r of d.related) {
      line += `\n  Related: ${r.filePath}(${r.startLine},${r.startCol}): ${r.message}`;
    }
  }
  return line;
}

function severityLabel(s: Severity): string {
  switch (s) {
    case Severity.Error:
      return 'error';
    case Severity.Warning:
      return 'warning';
    case Severity.Info:
      return 'info';
    default:
      return 'info';
  }
}

export type {PluginOptions as Options};
export type {PureFnSite} from './protocol.ts';
export {
  ENTRY_MODULE_PREFIX,
  ENTRY_MODULE_SUFFIX,
  ENTRY_BINDING_PREFIX,
  CACHE_MODULES,
  type CacheModuleSettings,
} from './go-generated/runtypes-constants.generated.ts';
