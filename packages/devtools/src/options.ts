/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// What the mion PRESETS share, so vite and Next cannot drift: the same options mapped to the same resolver options.
// Each preset keeps only what its host has: vite the Vue SFC pass, middleware mode and module-graph invalidation;
// Next nothing (the broker's typeDeps + stamp cover staleness, and Next runs its own dev server).

import {type PluginOptions as TsRuntypesPluginOptions} from './core/unplugin.ts';
import {assertValidClientRoutes} from './core/option-guards.ts';
import {MODULE_MODE_ALL_SINGLE} from './core/go-generated/runtypes-constants.generated.ts';

/** Options for the mion powered type transformation. */
export interface MionRunTypesOptions {
  /** Explicit path to the mion resolver binary; unset, @mionjs/bin-compiler getExePath() takes MION_BIN, then
   *  the published platform binary. MION_BIN also covers the ESLint lane, so prefer it when both must match. */
  binary?: string;
  /** RunTypes generated-output root: gitignored modules under `<genDir>/types/`, committed enrichment under
   *  `<genDir>/enriched/`. */
  genDir?: string;
  /** What generated fn entries ship: 'code' (default) | 'both'.
   *
   *  ⚠️ EDGE TARGETS MUST USE 'both'. 'code' ships only the compiled fn's source string, which
   *  @mionjs/run-types turns into a function with `new Function` on first use; workerd, Vercel Edge and any CSP
   *  without 'unsafe-eval' refuse that, so initRoutes dies on the first route with "Code generation from
   *  strings disallowed for this context". 'both' emits the live factory ALONGSIDE the string, so nothing is
   *  compiled at runtime and the string is still there for the fetch-metadata middleware to serialize to clients.
   *  It costs bundle size, roughly +30% raw and +15% gzipped.
   *
   *  RunTypes' third mode, 'functions', omits `code` and throws here at config time: mion's client story is
   *  serializing compiled fns to the browser as strings, so an entry with no body cannot cross the wire.
   *  Guaranteeing `code` is what lets `MionTypeFn` type it as required (packages/core/src/types/general.types.ts). */
  emitMode?: 'code' | 'both';
  /** Cache-module grouping, see the runtypes core docs. 'default' | 'allModules'; 'allSingle' throws (one module would carry both sides). */
  moduleMode?: Exclude<TsRuntypesPluginOptions['moduleMode'], typeof MODULE_MODE_ALL_SINGLE>;
  inlineMode?: TsRuntypesPluginOptions['inlineMode'];
  transformMode?: TsRuntypesPluginOptions['transformMode'];
  /** Diagnostic codes to report as warnings instead of halting the build, or `'*'` for all of them. Strict by
   *  default: the RunTypes adapter is scanner-clean, so strict mode is safe monorepo-wide. */
  downgradeErrors?: TsRuntypesPluginOptions['downgradeErrors'];
  /** `'all'` also prints Info findings (a skipped method, a validator on `any`), hidden by default; never changes what stops the build. */
  levels?: TsRuntypesPluginOptions['levels'];
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

/** How the client gets each route's metadata and compiled functions. */
export interface MionClientOptions {
  /** 'bundle' (default) bundles every called route; an unseen one is fetched only with client `useFetchMetadata`.
   *  'fetch' gets every route from the server on first use: needs `useFetchMetadata` and server `mionFetchMetadata`. */
  routes?: TsRuntypesPluginOptions['clientRoutes'];
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

/** The options both mion presets read. */
export interface MionPresetOptions {
  /** The ONE tsconfig holding client and server code (absolute, or relative to the vite root / Next cwd).
   *  Unset, `tsconfig.json` is searched upward from there, like tsc. */
  tsConfig?: string;
  client?: MionClientOptions;
  runTypes?: MionRunTypesOptions;
}

/** Maps the preset options onto the resolver's own; shared by BOTH presets so a new knob reaches vite and Next at once.
 *
 *  Host-specific hooks are NOT set here: `onSiteFilesChanged` and `onGenerate` are vite's module-graph
 *  invalidation, and the Next lane needs no equivalent (the broker declares typeDeps plus a stamp instead). */
export function toRunTypesOptions(options: MionPresetOptions = {}): TsRuntypesPluginOptions {
  const rt = options.runTypes ?? {};
  // The type says 'code' | 'both', but configs are plain JS/JSON often written by hand.
  if ((rt.emitMode as string) === 'functions') {
    throw new Error(
      `[mion] emitMode: 'functions' is not supported. mion serializes compiled fns to the client as ` +
        `code strings, and 'functions' omits the code, so every client would fail on first validate. ` +
        `Use 'code' (default) or 'both'.`
    );
  }
  if ((rt.moduleMode as string) === MODULE_MODE_ALL_SINGLE) {
    throw new Error(
      `[mion] moduleMode: 'allSingle' is not supported. It puts every type of the program in one module per ` +
        `family, so the client bundle would carry the server's types. Use 'default' or 'allModules'.`
    );
  }
  assertValidClientRoutes(options.client?.routes);
  // Project `references` in the tsconfig are fine: the resolver drops them when building its scan program.
  return {
    binary: resolveRtBinary(rt.binary),
    tsconfig: options.tsConfig,
    clientRoutes: options.client?.routes,
    genDir: rt.genDir,
    emitMode: rt.emitMode,
    moduleMode: rt.moduleMode,
    inlineMode: rt.inlineMode,
    transformMode: rt.transformMode,
    // Strict by default: Error-severity mion diagnostics halt the build, the documented contract. Passed
    // through UNDEFINED when unset, never defaulted, so a tsconfig-only `downgradeErrors` still reaches the
    // host: the echo can only win over an absent option.
    downgradeErrors: rt.downgradeErrors,
    // Undefined when unset, like downgradeErrors, so a tsconfig-only `levels` still reaches the host.
    levels: rt.levels,
    patternSampleCount: rt.patternSampleCount,
    patternSampleRetries: rt.patternSampleRetries,
    jsonMaxBytes: rt.derivedPayloadLimits,
    jsRuntime: rt.jsRuntime,
  };
}
