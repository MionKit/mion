import path from 'node:path';
import {createUnplugin} from 'unplugin';
import {getExePath} from '@ts-runtypes/bin';
import {renderHeadline} from './diagnosticCatalog.ts';
import {ResolverClient} from './resolver-client.ts';
import {applyEdits, sourceHash} from './apply-edits.ts';
import {Family, Severity, type Diagnostic, type PureFnSite} from './protocol.ts';
import {
  MODULE_MODE_ALL_MODULES,
  MODULE_MODE_ALL_SINGLE,
  MODULE_MODE_DEFAULT,
  type ModuleMode,
} from './go-generated/runtypes-constants.generated.ts';

// PluginOptions is the host-plugin surface. The CANONICAL place to configure
// the compiler's PROJECT knobs (emitMode, moduleMode, inlineMode, cacheDir,
// hashLength, parallelScan/Render, singleThreaded) is the `ts-runtypes` entry
// under compilerOptions.plugins in tsconfig.json — see the Configuration guide.
// Those keys are accepted here too as a per-build OVERRIDE (forwarded as a flag,
// so they win over tsconfig, tsc-style); reach for them only when one build
// must differ. `binary` / `cwd` / `tsconfig` / `genDir` are genuinely
// host-specific and have no tsconfig equivalent.
export interface PluginOptions {
  // Absolute path to the compiled ts-runtypes binary. Optional: when omitted,
  // the plugin resolves the prebuilt binary for the host platform via the
  // `ts-runtypes-bin` launcher (its `ts-runtypes-binary-<os>-<arch>` optional
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
  //   - sizeBias (0..1, default 0.8): 0 = tightest (more grows), 1 = most generous.
  //   - sizeItems (default 100): assumed element count for an unbounded collection.
  //   - sizeStringBytes (default 32): assumed byte length of an unbounded string.
  //   - sizeMaxBytes (default 65536): per-type cap so a huge declared bound
  //     never seeds a multi-MB cold buffer.
  //   All four ride the single `size` object (like the tsconfig `size` key):
  //   {bias, items, stringBytes, maxBytes}.
  size?: {bias?: number; items?: number; stringBytes?: number; maxBytes?: number};
  // Project-wide defaults for the per-call-site ValidateOptions bag, grouped
  // under one `validate` object (like `size`). Merged per field into every
  // validate / validationErrors call site by the compiler (a per-call option
  // wins over the default for that field).
  //   - numberMode: the base `number` check every validator uses — 'isFinite'
  //     (default; rejects NaN/Infinity), 'typeof' (accepts them), or 'notNaN'
  //     (rejects NaN, accepts Infinity). Eases migration from a looser library.
  validate?: {numberMode?: 'isFinite' | 'typeof' | 'notNaN'};
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
  // Silence the fail-closed FMT004 build error for format patterns whose
  // mockSamples RE2 can't verify at build time (JS-only regex features:
  // lookarounds, backreferences). Default false — the build refuses what it
  // can't verify. Setting it asserts that the ts-runtypes lint plugin (which
  // evaluates the real RegExp) owns the check for those patterns, so wire the
  // linter into your editor + CI when you enable it. Build-lane only: the lint
  // plugin validates those samples regardless of this option.
  allowUncheckedPatterns?: boolean;
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
}

// MARKER_MODULE backs the transform's textual FALLBACK pre-filter. The primary
// gate is the resolver's own site-file set (populated from the whole-program
// scan at buildStart, maintained per-file on HMR): a file is handed to the
// per-file rewrite when the scan actually found marker sites in it, so wrapper
// frameworks re-exposing the markers behind their own factories (e.g. mion's
// `route()` from '@mionkit/router') work with ZERO configuration — their
// users' files never import '@ts-runtypes/core' by name. The textual check
// only catches files the last scan couldn't have seen (created mid-session,
// before their first HMR scan lands them in the set).
const MARKER_MODULE = '@ts-runtypes/core';

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
    if (
      options.moduleMode !== undefined &&
      options.moduleMode !== MODULE_MODE_DEFAULT &&
      options.moduleMode !== MODULE_MODE_ALL_SINGLE &&
      options.moduleMode !== MODULE_MODE_ALL_MODULES
    ) {
      throw new Error(
        `[@ts-runtypes/devtools] unknown moduleMode ${JSON.stringify(options.moduleMode)} — expected '${MODULE_MODE_DEFAULT}' | '${MODULE_MODE_ALL_SINGLE}' | '${MODULE_MODE_ALL_MODULES}'`
      );
    }
    // Explicit path wins; otherwise resolve the host-platform binary from the
    // ts-runtypes-bin launcher (throws with a clear message if none is installed).
    const binaryPath = options.binary ?? getExePath();
    // Forward ONLY an explicit options.tsconfig (strict: the Go side hard
    // errors when it is missing or broken). When unset, the Go side resolves
    // the config exactly as tsc does — searching upward from cwd — so the
    // plugin carries no config logic of its own.
    resolver = new ResolverClient(binaryPath, cwdAbs, options.tsconfig ?? '', {
      ...(options.emitMode ? {emitMode: options.emitMode} : {}),
      ...(options.size?.bias !== undefined ? {sizeBias: options.size.bias} : {}),
      ...(options.size?.items !== undefined ? {sizeItems: options.size.items} : {}),
      ...(options.size?.stringBytes !== undefined ? {sizeStringBytes: options.size.stringBytes} : {}),
      ...(options.size?.maxBytes !== undefined ? {sizeMaxBytes: options.size.maxBytes} : {}),
      ...(options.validate?.numberMode ? {numberMode: options.validate.numberMode} : {}),
      ...(options.inlineMode ? {inlineMode: options.inlineMode} : {}),
      ...(options.parallelScan !== undefined ? {parallelScan: options.parallelScan} : {}),
      ...(options.parallelRender !== undefined ? {parallelRender: options.parallelRender} : {}),
      ...(options.moduleMode ? {moduleMode: options.moduleMode} : {}),
      ...(options.singleThreaded !== undefined ? {singleThreaded: options.singleThreaded} : {}),
      ...(options.hashLength !== undefined ? {hashLength: options.hashLength} : {}),
      ...(options.allowUncheckedPatterns ? {allowUncheckedPatterns: true} : {}),
      // Tri-state → the two low-level resolver flags: report on the wire for
      // both 'file' and 'callback'; the JSON file written only for 'file' (at
      // the hardcoded genDir/types path).
      ...(reportEnabled ? {pureFnReportWire: true} : {}),
      ...(writeReportFile ? {pureFnReportFile: true} : {}),
    });
  }

  // siteKey canonicalizes a source path for the siteFiles set. The resolver
  // reports whole-program scan paths (absolute) while per-file ops and the
  // transform hook use cwd-relative ids — both collapse to one cwd-relative,
  // forward-slashed key so membership checks match across the two shapes
  // (and across platform separators).
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
    // Default keeps self-contained maps; an explicit `sourcesContent: false`
    // trims the embedded original source from the map.
    const goOpts = options.sourcesContent === false ? {omitSourcesContent: true} : undefined;
    const result = await resolver!.transform([rel], genDirAbs, goOpts);
    // A file outside the buildStart Program may surface new types / pure fns;
    // regenerate so the modules its injected imports point at exist on disk
    // before the bundler resolves them. (write-only-on-change keeps it cheap.)
    if (result.addedRunTypes || result.addedPureFns) await resolver!.generate(genDirAbs);
    // A file the buildStart scan couldn't have seen can introduce NEW
    // Error-severity diagnostics — surface them here so the transform fails
    // per the failOnError contract (warnings already surfaced program-wide).
    surfaceDiagnostics(ctx, result.diagnostics ?? [], (d) => d.severity === Severity.Error, {halt: failOnError});
    if (result.sites.length === 0 && (result.replacements?.length ?? 0) === 0) return null;
    const fileResult = result.transformed[rel];
    if (!fileResult || typeof fileResult.code !== 'string') return null;
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
    let result = await resolver!.transform([rel], genDirAbs, {emitEdits: true});
    if (result.addedRunTypes || result.addedPureFns) await resolver!.generate(genDirAbs);
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
        result = await resolver!.transform([rel], genDirAbs, {emitEdits: true});
        if (result.addedRunTypes || result.addedPureFns) await resolver!.generate(genDirAbs);
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

    try {
      const applied = applyEdits(rel, code, fileResult.importBlock ?? '', fileResult.edits ?? []);
      return {code: applied.code, map: applied.map as any};
    } catch (error) {
      // A malformed edit set (should be impossible) must not break the build.
      ctx.warn?.(`@ts-runtypes/devtools: 'edits' apply failed on ${rel} (${String(error)}) — falling back to 'go' mode.`);
      return transformViaGo(ctx, rel);
    }
  }

  return {
    name: '@ts-runtypes/devtools',
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
      ensureResolver();
      // generate writes the modules and, when genDirAbs is empty, returns the
      // resolver-inferred <srcDir>/__runtypes. Adopt that resolved path so
      // every later transform/HMR call reuses it. The VCS-hygiene files
      // (per-folder READMEs, the types/.gitignore) are written by the Go side
      // inside generate, so the CLI compile lane gets them too.
      const gen = await resolver!.generate(genDirAbs || undefined);
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
      // specifier (`'@ts-runtypes/core`, `"@ts-runtypes/core`, incl.
      // subpaths) — a bare `includes(...)` also fires on path mentions in
      // comments (e.g. `packages/ts-runtypes/…`), which would force the
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
        const importsMarkerModule = code.includes(`'${MARKER_MODULE}`) || code.includes(`"${MARKER_MODULE}`);
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
      configResolved(cfg: {root: string}) {
        viteRoot = cfg.root;
        ensureResolver();
      },

      // handleHotUpdate is the HMR pivot. When a user file changes: push the
      // new contents into the resolver (full Program rebuild — the biggest HMR
      // cost; tracked in docs/ROADMAP.md), re-scan it, then regenerate the
      // cache modules to disk. Generated module names are content-addressed and
      // written only-on-change, so the watcher reloads exactly the modules whose
      // bytes moved; the re-transformed user file imports any new ones.
      async handleHotUpdate(this: any, ctx: any) {
        if (!resolver) return;
        const file: string = ctx.file;
        if (!file || !/\.[mc]?[jt]sx?$/.test(file)) return;

        const rel = path.relative(cwdAbs || process.cwd(), file);
        const content = typeof ctx.read === 'function' ? await ctx.read() : undefined;
        if (typeof content === 'string') {
          try {
            await resolver.setSources({[rel]: content});
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            // A CFG001-tagged failure is the project tsconfig refusing to
            // load (strict like tsc) — say so loudly instead of silently
            // skipping updates; the daemon re-parses on the next edit, so a
            // fixed config heals without a dev-server restart.
            if (message.includes('CFG001')) {
              console.error(`[@ts-runtypes/devtools] HMR update skipped — ${message}`);
            }
            // Otherwise setSources failed because the changed file is outside
            // the resolver's known set (e.g. a config file). Fall through to
            // default HMR — nothing for the resolver to do here.
            return;
          }
        }

        let result;
        try {
          result = await resolver.scanFiles([rel]);
        } catch {
          return;
        }
        // Keep the transform gate current: the edit may have added this
        // file's first marker site (files created after buildStart enter the
        // set here) or removed its last one.
        if (result.sites.length > 0) siteFiles.add(siteKey(rel));
        else siteFiles.delete(siteKey(rel));
        // Pure-fn report update lane: fire the callback with THIS file's delta
        // (the changed sites) before regenerating, so an in-process consumer
        // learns of a body edit as it happens. The JSON file is rewritten by
        // the generate() below.
        if (reportEnabled && options.onPureFnReport && result.pureFnSites) options.onPureFnReport(result.pureFnSites, 'update');
        // Regenerate so any new/changed modules hit disk; the watcher reloads
        // them (the folder lives in the project root, which Vite watches).
        try {
          await resolver.generate(genDirAbs);
        } catch {
          // A regenerate failure shouldn't tear down the dev server mid-edit.
        }

        // Re-emit diagnostics so the editor's problem panel updates as the user
        // types. `halt: false` because HMR shouldn't tear down the dev server on
        // a single bad type — the user is mid-edit; the runtime alwaysThrow
        // factory still carries source context if the type stays bad.
        surfaceDiagnostics(this, result.diagnostics ?? [], () => true, {halt: false});
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
