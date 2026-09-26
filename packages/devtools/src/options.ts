/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Everything the mion PRESETS share, so the vite and Next lanes cannot drift apart: the same `runTypes`
// options and `client` pointer, mapped to the same resolver options. What stays behind in each preset is only
// what its host has, so vite keeps the Vue SFC pass, middleware mode and module-graph invalidation, and Next
// keeps nothing extra (the broker's typeDeps + stamp cover staleness, and Next runs its own dev server).

import type {PluginOptions as TsRuntypesPluginOptions} from './core/unplugin.ts';

/** Options for the mion powered type transformation. */
export interface MionRunTypesOptions {
  /** Path to tsconfig.json (absolute, or relative to the vite root). */
  tsConfig?: string;
  /** Explicit path to the mion resolver binary; unset, @mionjs/bin-compiler getExePath() takes MION_BIN, then
   *  the published platform binary. MION_BIN also covers the ESLint lane, so prefer it when both must match. */
  binary?: string;
  /** RunTypes generated-output root: gitignored modules under `<genDir>/types/`, committed enrichment under
   *  `<genDir>/enriched/`. */
  genDir?: string;
  /** @deprecated use `genDir` — kept as an alias for existing configs. */
  outDir?: string;
  /** What generated fn entries ship: 'code' (default) | 'both'.
   *
   *  ⚠️ EDGE TARGETS MUST USE 'both'. 'code' ships only the compiled fn's source string, which
   *  @mionjs/run-types turns into a function with `new Function` on first use; workerd, Vercel Edge and any CSP
   *  without 'unsafe-eval' refuse that, so initRoutes dies on the first route with "Code generation from
   *  strings disallowed for this context". 'both' emits the live factory ALONGSIDE the string, so nothing is
   *  compiled at runtime and the string is still there for the methods-metadata route to serialize to clients.
   *  It costs bundle size, roughly +30% raw and +15% gzipped.
   *
   *  RunTypes' third mode, 'functions', omits `code` and throws here at config time: mion's client story is
   *  serializing compiled fns to the browser as strings, so an entry with no body cannot cross the wire.
   *  Guaranteeing `code` is what lets `MionTypeFn` type it as required (packages/core/src/types/general.types.ts). */
  emitMode?: 'code' | 'both';
  /** Cache-module grouping, see the runtypes core docs. 'default' | 'allModules' | 'allSingle'. */
  moduleMode?: TsRuntypesPluginOptions['moduleMode'];
  inlineMode?: TsRuntypesPluginOptions['inlineMode'];
  transformMode?: TsRuntypesPluginOptions['transformMode'];
  /** Diagnostic codes to report as warnings instead of halting the build, or `'*'` for all of them. Strict by
   *  default: the RunTypes adapter is scanner-clean, so strict mode is safe monorepo-wide. */
  downgradeErrors?: TsRuntypesPluginOptions['downgradeErrors'];
  /** How many mockSamples to generate for a TypeFormat pattern that declares none. Declared mockSamples always
   *  win over generation, and a pattern the generator cannot handle (usually lookarounds) fails the build with
   *  FMT005, asking for explicit mockSamples. */
  patternSampleCount?: TsRuntypesPluginOptions['patternSampleCount'];
  /** How many times to retry sample generation before failing with FMT005; the total budget is
   *  `patternSampleCount * patternSampleRetries`. Raise it for constrained patterns whose draws often miss. */
  patternSampleRetries?: TsRuntypesPluginOptions['patternSampleRetries'];
  /** Derive every route's request size limit from its types (default true): the compiler emits the largest
   *  JSON a bounded type allows and the router refuses anything past it. `false` turns the feature off, so every
   *  route takes its own `maxBodySize` or the platform adapter's number. Maps onto the resolver's
   *  `jsonMaxBytes` option (also settable in tsconfig). */
  derivedPayloadLimits?: boolean;
  /** JS runtime for the pattern-checking sidecar; node and bun are found on PATH, so set this (or
   *  `MION_JS_RUNTIME`) only for another runtime. With no runtime the build fails closed with FMT004. */
  jsRuntime?: TsRuntypesPluginOptions['jsRuntime'];
  /** Transform typed mion code inside Vue SFC `<script>` blocks (default true), the script being registered
   *  under a virtual path next to the .vue file and injected before @vitejs/plugin-vue compiles it (see
   *  vite/sfcTransform.ts). Off, a marker call inside an SFC gets no compiled fns and fails at runtime. */
  sfc?: boolean;
}

/** A SEPARATE mion client project this API's build generates the batch transport from.
 *
 *  A batch is written in client code, but the server must know its id, its routes and its inline `inputFrom()`
 *  mappers before it runs one. The SERVER build reads them: its resolver builds the client project's tsconfig
 *  program next to its own, writes `<genDir>/rpc/batches.generated.js` plus one `<genDir>/rpc/pf/…` module per
 *  inline mapper with relative imports only, and appends the table's import to whichever module calls
 *  createMionRouter. Nothing is written into another project and no path leaks into a generated file. A server
 *  sharing its program with its client (fullstack, middleware mode) needs no pointer. The same pointer is the
 *  tsconfig plugin key `clientTsconfig` and the CLI flag `--client-tsconfig`. */
export interface MionClientPointer {
  /** Path to the client project's tsconfig (absolute, or relative to the vite root / Next cwd). */
  tsConfig: string;
}

/** Resolves the mion resolver binary: explicit option, else @mionjs/bin-compiler getExePath(), which honours
 *  MION_BIN and then the published platform package.
 *
 *  mion reads NO env var of its own: MION_BIN covers the transform lane and the ESLint lane, which run in
 *  SEPARATE processes, so a mion-side variable could never make the two agree.
 *
 *  ⚠️ No sibling-checkout fallback: the binary VERSION is folded into every typeId, so a locally built binary at
 *  another version silently produces caches that diverge from CI/user installs (the `<typeId>` half of every
 *  `<fnHash>_<typeId>` key stops matching). The same caution applies to MION_BIN. */
export function resolveRtBinary(explicit?: string): string | undefined {
  return explicit; // otherwise @mionjs/bin-compiler getExePath() takes over (MION_BIN → platform binary)
}

/** The SEPARATE project that declares the mion API this client calls, the mirror of MionClientPointer.
 *
 *  A client built with `bundleApi` compiles, for every route it calls, the same validators and serializers the
 *  server holds. They come from the route's TypeScript types, and a type resolved under different compiler
 *  settings (another `lib`, `strictNullChecks` off, other path mappings) can differ from what the server
 *  compiled, so this pointer makes the resolver read the routes' types in a program built over THAT tsconfig.
 *  A client sharing its program with the API needs no pointer. The same pointer is the tsconfig plugin key
 *  `apiTsconfig` and the CLI flag `--api-tsconfig`. */
export interface MionApiPointer {
  /** Path to the API project's tsconfig (absolute, or relative to the vite root / Next cwd). */
  tsConfig: string;
}

/** Bundled at build time (the default), bundled with fetching for routes the bundle lacks, or `false` to fetch all.
 *  Fetching needs `useMethodsMetadata` on the client and `mionMethodsMetadata` in the server's routes. */
export type MionBundleApiMode = NonNullable<TsRuntypesPluginOptions['bundleApi']>;

/** The subset of a mion preset's options that both lanes read. */
export interface MionPresetOptions {
  runTypes?: MionRunTypesOptions;
  /** The separate client project this API serves batches to. See MionClientPointer. */
  client?: MionClientPointer;
  /** The separate project declaring the API this client calls. See MionApiPointer. */
  api?: MionApiPointer;
  /** Bundle the metadata and compiled functions of every route this client calls. See MionBundleApiMode. */
  bundleApi?: MionBundleApiMode;
}

/** The client-side half of MionPresetOptions: what a client build bundles and where its API lives. */
export type MionClientBundleOptions = Pick<MionPresetOptions, 'api' | 'bundleApi'>;

/** Maps mion's `runTypes` block and `client` pointer onto the resolver's own options. Shared by BOTH presets,
 *  so a knob added here reaches the vite lane and the Next lane in the same commit.
 *
 *  Host-specific hooks are NOT set here: `onSiteFilesChanged` and `onGenerate` are vite's module-graph
 *  invalidation, and the Next lane needs no equivalent (the broker declares typeDeps plus a stamp instead). */
export function toRunTypesOptions(
  rt: MionRunTypesOptions = {},
  client?: MionClientPointer,
  bundle: MionClientBundleOptions = {}
): TsRuntypesPluginOptions {
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
  if (bundle.api !== undefined && !bundle.api.tsConfig) {
    throw new Error(`[mion] api.tsConfig must name the API project's tsconfig (absolute, or relative to the root).`);
  }
  if (
    bundle.bundleApi !== undefined &&
    bundle.bundleApi !== 'bundled' &&
    bundle.bundleApi !== 'mixed' &&
    bundle.bundleApi !== false
  ) {
    throw new Error(`[mion] bundleApi must be 'bundled', 'mixed' or false (got '${String(bundle.bundleApi)}').`);
  }
  // Project `references` in the tsconfig are fine: the resolver drops them when building its scan program.
  return {
    binary: resolveRtBinary(rt.binary),
    tsconfig: rt.tsConfig,
    // Forwarded as given: the resolver resolves a relative path against its own cwd, like `tsconfig` above.
    clientTsconfig: client?.tsConfig,
    // The client-side pair, forwarded as given like the client pointer above.
    apiTsconfig: bundle.api?.tsConfig,
    bundleApi: bundle.bundleApi,
    genDir: rt.genDir ?? rt.outDir,
    emitMode: rt.emitMode,
    moduleMode: rt.moduleMode,
    inlineMode: rt.inlineMode,
    transformMode: rt.transformMode,
    // Strict by default: Error-severity mion diagnostics halt the build, the documented contract. Passed
    // through UNDEFINED when unset, never defaulted, so a tsconfig-only `downgradeErrors` still reaches the
    // host: the echo can only win over an absent option.
    downgradeErrors: rt.downgradeErrors,
    patternSampleCount: rt.patternSampleCount,
    patternSampleRetries: rt.patternSampleRetries,
    jsonMaxBytes: rt.derivedPayloadLimits,
    jsRuntime: rt.jsRuntime,
  };
}
