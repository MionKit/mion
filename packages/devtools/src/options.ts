/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Everything the mion PRESETS share, so the vite lane and the Next lane cannot
// drift apart. Both take the same `runTypes` options and the same `client`
// pointer, map them to the same resolver options and reject the same removed
// keys. What stays behind in each preset is only what its host actually has:
// vite keeps the Vue SFC pass, middleware mode and module-graph invalidation;
// Next keeps nothing extra, because the broker's typeDeps + stamp already cover
// staleness and Next runs its own dev server.

import type {PluginOptions as TsRuntypesPluginOptions} from './core/unplugin.ts';

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
  /** Diagnostic codes to report as warnings instead of halting the build, or
   *  `'*'` for all of them. Strict by default: the RunTypes adapter is
   *  scanner-clean since the pure-fn helpers moved onto the untracked
   *  runtime-key APIs, so strict mode is safe monorepo-wide. */
  downgradeErrors?: TsRuntypesPluginOptions['downgradeErrors'];
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

/** A SEPARATE mion client project this API's build generates the batch transport from.
 *
 *  A batch is written in client code, but the server must know its id, its routes and its inline
 *  `inputFrom()` mappers before it runs one. The SERVER build reads them: its resolver builds the
 *  client project's tsconfig program next to its own, writes `<genDir>/rpc/batches.generated.js`
 *  (the table) plus `<genDir>/rpc/pf/…` (one module per inline mapper) with relative imports only,
 *  and appends the table's import to whichever module calls createMionRouter. Nothing is written
 *  into another project and no path leaks into a generated file. A server that shares its program
 *  with its client (fullstack, middleware mode, one package with two entries) needs no pointer:
 *  its own program is the batch source. The same pointer is the tsconfig plugin key
 *  `clientTsconfig` and the CLI flag `--client-tsconfig`. */
export interface MionClientPointer {
  /** Path to the client project's tsconfig (absolute, or relative to the vite root / Next cwd). */
  tsConfig: string;
}

/** Resolves the mion resolver binary: explicit option → @mionjs/bin-compiler getExePath(),
 *  which honours the MION_BIN env var and then the published platform package.
 *
 *  mion reads NO env var of its own. MION_BIN covers BOTH the transform lane and the ESLint lane,
 *  and since the two run in SEPARATE processes, a mion-side variable could never make them agree.
 *  One variable, both lanes, no divergence.
 *
 *  ⚠️ No sibling-checkout fallback: the binary VERSION is folded into every typeId, so a locally
 *  built binary at a different version silently produces caches that diverge from CI/user installs
 *  (the `<typeId>` half of every `<fnHash>_<typeId>` key stops matching; the fnHash prefixes
 *  themselves are version-stable). The same caution applies to MION_BIN. */
export function resolveRtBinary(explicit?: string): string | undefined {
  return explicit; // otherwise @mionjs/bin-compiler getExePath() takes over (MION_BIN → platform binary)
}

/** The subset of a mion preset's options that both lanes read. */
export interface MionPresetOptions {
  runTypes?: MionRunTypesOptions;
  /** The separate client project this API serves batches to. See MionClientPointer. */
  client?: MionClientPointer;
}

/** Maps mion's `runTypes` block and `client` pointer onto the resolver's own options, and rejects
 *  the one emitMode mion cannot support. Shared by BOTH presets: a knob added here reaches the
 *  vite lane and the Next lane in the same commit, which is the whole point of the split.
 *
 *  Host-specific hooks are NOT set here. `onSiteFilesChanged` and `onGenerate` are vite's (they
 *  invalidate the module graph); the Next lane needs no equivalent because the broker declares
 *  typeDeps plus a stamp to Turbopack instead. */
export function toRunTypesOptions(rt: MionRunTypesOptions = {}, client?: MionClientPointer): TsRuntypesPluginOptions {
  // Fail loudly rather than shipping a client whose validators have no body to rebuild from.
  // The type says 'code' | 'both', but configs are plain JS/JSON often written by hand.
  if ((rt.emitMode as string) === 'functions') {
    throw new Error(
      `[mion] emitMode: 'functions' is not supported. mion serializes compiled fns to the client as ` +
        `code strings, and 'functions' omits the code, so every client would fail on first validate. ` +
        `Use 'code' (default) or 'both'.`
    );
  }
  if (client !== undefined && !client.tsConfig) {
    throw new Error(`[mion] client.tsConfig must name the client project's tsconfig (absolute, or relative to the root).`);
  }
  // NOTE: project `references` in the tsconfig are fine — the mion resolver
  // drops them when building its scan program (they are a tsc --build concept).
  return {
    binary: resolveRtBinary(rt.binary),
    tsconfig: rt.tsConfig,
    // Forwarded as given: the resolver resolves a relative path against its own cwd (the root
    // this plugin runs at), exactly like `tsconfig` above.
    clientTsconfig: client?.tsConfig,
    genDir: rt.genDir ?? rt.outDir,
    emitMode: rt.emitMode,
    moduleMode: rt.moduleMode,
    inlineMode: rt.inlineMode,
    transformMode: rt.transformMode,
    // Strict by default: Error-severity mion diagnostics halt the build. The
    // RunTypes adapter no longer trips the scanner (its runtime-key wrappers ride
    // the untracked *ByKey APIs / the raw cache), so consumers get the documented
    // "Error = build must fail" contract. Passed through UNDEFINED when unset,
    // never defaulted, so a tsconfig-only `downgradeErrors` still reaches the
    // host — the echo can only win over an absent option.
    downgradeErrors: rt.downgradeErrors,
    patternSampleCount: rt.patternSampleCount,
    patternSampleRetries: rt.patternSampleRetries,
    jsRuntime: rt.jsRuntime,
  };
}
