/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import path from 'node:path';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {spawn, type ChildProcess} from 'node:child_process';
import {createRequire} from 'node:module';
import tsRuntypes from '@ts-runtypes/devtools/vite';
import {mionMiddlewarePlugin} from './middlewareMode.ts';
import {createVirtualSiteMap, mionSfcPlugins} from './sfcTransform.ts';
import type {PluginOptions as TsRuntypesPluginOptions} from '@ts-runtypes/devtools';
import type {Plugin, PluginOption} from 'vite';

/** One report record from the mion pure-fn build report (structural subset). */
type RtPureFnSite = Parameters<NonNullable<TsRuntypesPluginOptions['onPureFnReport']>>[0][number];

// ############# mion vite plugin — mion migration #############
// The old plugin ran the deepkit type-compiler + pure-fn extraction + AOT cache
// generation. All of that is replaced by @ts-runtypes/devtools: the resolver binary
// scans the program, rewrites route()/middleFn()/createX call sites with precompiled
// function tuples and writes the generated cache modules under <srcDir>/__runtypes/.
//
// This wrapper keeps the old `mionVitePlugin({runTypes: {tsConfig}})` call shape so the
// existing vite/vitest configs across the monorepo keep working unchanged. The legacy
// deepkit/AOT/pure-fn options are REMOVED — see the migration guard below.

/** Options for the mion powered type transformation. */
export interface MionRunTypesOptions {
  /** Path to tsconfig.json (absolute, or relative to the vite root). */
  tsConfig?: string;
  /** Explicit path to the mion resolver binary. Default resolution:
   *  MION_BIN env var → the published platform binary, both via @ts-runtypes/bin getExePath().
   *  MION_BIN also covers the ESLint lane, so prefer it over a per-plugin path when both must match. */
  binary?: string;
  /** RunTypes generated-output root (generated modules under `<genDir>/types/` gitignored,
   *  committed enrichment under `<genDir>/enriched/`). Renamed from `outDir` in @ts-runtypes 0.10.0. */
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
   *  mion deliberately does NOT support @ts-runtypes' third mode, 'functions'. That mode ships a
   *  live `createRTFn` closure and omits `code` — but mion's whole client story is serializing
   *  compiled fns to the browser as strings and rebuilding them there, so an entry with no body
   *  cannot cross the wire. Allowing it would silently ship clients that throw on first validate.
   *  Guaranteeing `code` here is what lets `MionTypeFn` type it as required (see
   *  packages/core/src/types/general.types.ts). Passing 'functions' throws at config time. */
  emitMode?: 'code' | 'both';
  /** Cache-module grouping, see @ts-runtypes/devtools docs. 'default' | 'allModules' | 'allSingle'.
   *
   *  'allSingle' was rejected at config time until @ts-runtypes 0.12.2: that mode emits one import
   *  per family bundle, and the transform used to name them all from the first bundle, so most fn
   *  bindings resolved to nothing. Fixed upstream, so the mode is usable again. See
   *  docs/done/module-mode-allsingle-broken.md. */
  moduleMode?: TsRuntypesPluginOptions['moduleMode'];
  inlineMode?: TsRuntypesPluginOptions['inlineMode'];
  transformMode?: TsRuntypesPluginOptions['transformMode'];
  /** Halt the build on Error-severity mion diagnostics (default true — the
   *  mion run-types adapter is scanner-clean since the pure-fn helpers moved onto the
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

/** The mion server that backs a vite dev/test run — either mounted INSIDE the vite process
 *  ('middleware', the default) or spawned beside it via vite-node ('childProcess'). */
export interface MionServerOptions {
  /** Absolute path to the server entry script. */
  startScript: string;
  /** Vite config used to transform the server (defaults to vite-node's lookup from cwd).
   *  childProcess mode only — in middleware mode the entry rides THIS vite config's pipeline. */
  viteConfig?: string;
  /** How the API runs (default 'middleware'):
   *  - 'middleware': loaded in the SAME vite process through `ssrLoadModule` and mounted as
   *    dev-server middleware. One process, one port, shared module graph — the idiomatic
   *    Nuxt/SSR/fullstack setup, and the only mode where the API sees vite's SSR pipeline.
   *  - 'childProcess': spawned beside vite with vite-node and awaited through `serverReady`
   *    (port polling). Separate process and port — for e2e/client tests that need a real socket.
   *  ('buildOnly' is gone: it WAS the AOT harvest mode, and AOT is gone.) */
  runMode?: 'middleware' | 'childProcess';
  /** Max ms to wait for the server port to accept connections (default 30000). childProcess only. */
  waitTimeout?: number;
  /** Extra env vars for the server process (e.g. MION_TEST_PORT). childProcess only. */
  env?: Record<string, string>;
  /** MIDDLEWARE mode: mount prefix for the API. Defaults to the router's own `basePath`, which is
   *  what route paths already carry — set this only to mount somewhere else. With no basePath at
   *  all mion serves at the root and `exclude` decides what reaches vite instead. */
  basePath?: string;
  /** MIDDLEWARE mode: platform adapter module to take the request handler from
   *  (default '@mionjs/platform-node' — node-style, no Request is materialized). A fetch-style
   *  adapter (e.g. '@mionjs/platform-bun') is bridged from node req/res automatically. */
  platform?: string;
  /** MIDDLEWARE mode + no basePath: paths NOT served by mion, so vite's own internals and static
   *  assets still work. Defaults to DEFAULT_MIDDLEWARE_EXCLUDE. */
  exclude?: RegExp[];
  /** MIDDLEWARE mode: re-load the API when its sources change (default true). The reload resets
   *  the router first, since `initMionRouter` refuses to run twice. */
  hotReload?: boolean;
}

/** serverMapFrom build-time transport: client builds HARVEST inline mappers (from the
 *  mion pure-fn build report) into a manifest; server builds CONSUME it through
 *  the generated `.mion/server-mappers.generated.js` module, which registers the pure-fn modules
 *  @ts-runtypes already emitted for them. Wire carries only the `rt::<hash>` key — the server
 *  registers exactly the mappers its own build baked in, and never runs code received over it. */
export interface MionServerMappersOptions {
  /** CLIENT builds: write harvested serverMapFrom mappers to this manifest path.
   *  `true` resolves '.mion/server-mappers.json' against the process cwd — pass an
   *  absolute path in monorepo/vitest-workspace setups. */
  emit?: boolean | string;
  /** SERVER builds: entry file(s) to inject the generated module's import into, bypassing detection.
   *  Only needed when the module calling `initMionRouter` cannot be spotted from its source — it
   *  re-exports the router through a local barrel, or the entry lives under node_modules. Absolute,
   *  or relative to the vite root. */
  injectInto?: string | string[];
  /** SERVER builds: manifest path(s) compiled into `<root>/.mion/server-mappers.generated.js`,
   *  which the plugin imports for you from whichever module calls initMionRouter — nothing to
   *  import by hand. In `vite build` the generated module IMPORTS each mapper's pure-fn module out
   *  of the client build's `__runtypes/types/` tree, so that tree must be reachable at server-BUILD
   *  time (missing manifests fail the build) — the bundle itself stays self-contained, with no
   *  node:fs and no runtime dependency on it. In dev/serve the module reads the manifests at
   *  runtime, tolerating missing ones with a lazy re-read on the first unresolved mapping (covers
   *  the race where the server boots before the client build finished harvesting). */
  consume?: string | string[];
}

/** Options for the unified mion vite plugin. */
export interface MionPluginOptions {
  /** mion type transformation options. */
  runTypes?: MionRunTypesOptions;
  /** serverMapFrom mapper transport between the client and server builds. */
  serverMappers?: MionServerMappersOptions;
  /** Managed mion server process for client tests/e2e (spawned with vite-node, awaited via serverReady). */
  server?: MionServerOptions;
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
    'pure-fn extraction moved to the serverMapFrom transport. Use `serverMappers: {emit}` on the client build and `serverMappers: {consume}` on the server build.',
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
function assertNoRemovedOptions(options: MionPluginOptions): void {
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

/** Resolves the mion resolver binary: explicit option → @ts-runtypes/bin getExePath(),
 *  which honours the MION_BIN env var and then the published platform package.
 *
 *  mion deliberately reads NO env var of its own. MION_BIN (@ts-runtypes 0.11.0+) covers BOTH the
 *  transform lane and the ESLint lane, whereas mion's old TS_RUNTYPES_BIN reached only this one —
 *  and since the two lanes run in SEPARATE processes, a mion-side variable can never make them
 *  agree. One variable, both lanes, no divergence.
 *
 *  ⚠️ No sibling-checkout fallback: the binary VERSION is folded into every typeId, so a locally
 *  built binary at a different version silently produces caches that diverge from CI/user installs
 *  (the `<typeId>` half of every `<fnHash>_<typeId>` key stops matching; the fnHash prefixes
 *  themselves are version-stable since @ts-runtypes 0.9.3). The same caution applies to MION_BIN. */
export function resolveRtBinary(explicit?: string): string | undefined {
  if (explicit) return explicit;
  // TS_RUNTYPES_BIN is retired. Warn rather than ignore it silently: a user who set it would
  // otherwise be switched to a different binary (the platform package) without being told.
  if (process.env.TS_RUNTYPES_BIN && !process.env.MION_BIN && !process.env.RT_BIN && !legacyBinEnvNoticeShown) {
    legacyBinEnvNoticeShown = true;
    console.warn(
      '[mion] TS_RUNTYPES_BIN is no longer read and is being IGNORED. Use MION_BIN instead — ' +
        'it is honoured by @ts-runtypes/bin for both the vite transform and the ESLint lane, ' +
        'so they cannot end up on different binaries (whose typeIds would diverge).'
    );
  }
  return undefined; // @ts-runtypes/bin getExePath() takes over (MION_BIN → published platform binary)
}

/**
 * Creates the mion Vite plugin (mion powered).
 *
 * @example
 * ```ts
 * // vitest.config.ts / vite.config.ts
 * import {mionVitePlugin} from '@mionjs/devtools/vite-plugin';
 *
 * export default defineConfig({
 *   plugins: [mionVitePlugin({runTypes: {tsConfig: resolve(__dirname, 'tsconfig.json')}})],
 * });
 * ```
 */
export function mionVitePlugin(options: MionPluginOptions = {}): PluginOption[] {
  const rt = options.runTypes ?? {};
  assertNoRemovedOptions(options);
  // serverMapFrom harvest (CLIENT builds): consume the mion pure-fn build report,
  // keep only sites attributed to @mionjs/client's serverMapFrom wrapper, and write the
  // manifest after every report phase ('build' replaces, 'update' merges the HMR delta).
  const manifestPath = resolveManifestPath(options.serverMappers?.emit);
  const harvestedMappers = new Map<string, ServerMapperManifestEntry>();
  // Where @ts-runtypes wrote its generated tree, so a report `module` can be turned into a path the
  // SERVER build can import. The resolver reports its own genDir back (unplugin's `gen.outDir`) but
  // does not pass it to onPureFnReport, so mion mirrors the resolution: `cwd` defaults to the vite
  // root, and an unset genDir defaults to `<cwd>/__runtypes`. Pass `runTypes.genDir` explicitly if
  // your setup moves it — the manifest then carries the right paths and nothing else changes.
  let viteRoot = '';
  const resolveGenDir = (): string => path.resolve(viteRoot || process.cwd(), rt.genDir ?? rt.outDir ?? '__runtypes');
  const harvestReport = (sites: RtPureFnSite[], phase: 'build' | 'update'): void => {
    if (phase === 'build') harvestedMappers.clear();
    for (const site of sites) {
      if (site.calleeName !== 'serverMapFrom' || site.calleeModule !== '@mionjs/client') continue;
      harvestedMappers.set(site.key, {
        key: site.key,
        module: site.module ? path.resolve(resolveGenDir(), 'types', `${site.module}.js`) : undefined,
        paramNames: site.paramNames,
        code: site.code,
        pureFnDependencies: site.pureFnDependencies,
      });
    }
    writeMapperManifest(manifestPath as string, harvestedMappers);
  };
  // Fail loudly rather than shipping a client whose validators have no body to rebuild from.
  // The type says 'code' | 'both', but configs are plain JS/JSON often written by hand.
  if ((rt.emitMode as string) === 'functions') {
    throw new Error(
      `[mion] emitMode: 'functions' is not supported. mion serializes compiled fns to the client as ` +
        `code strings, and 'functions' omits the code, so every client would fail on first validate. ` +
        `Use 'code' (default) or 'both'.`
    );
  }
  // Vue SFC scripts are registered with the resolver under a VIRTUAL path (`Comp.vue.ts`),
  // while the module vite serves is `Comp.vue`. mion reports stale site files by the
  // path it knows, so mion has to translate before invalidating — see onSiteFilesChanged below.
  // Built here because the mion plugin (which takes the handler) and the SFC pass (which
  // fills the map) are both constructed further down.
  const virtualSites = createVirtualSiteMap();
  let devServer: {moduleGraph?: {getModuleById?: (id: string) => unknown; invalidateModule?: (mod: unknown) => void}} | undefined;

  /** Re-transforms the files whose compiled fns just changed, after a type edit elsewhere. */
  const invalidateStaleSites = (siteFiles: string[]): void => {
    const graph = devServer?.moduleGraph;
    if (!graph?.getModuleById || !graph.invalidateModule) return;
    for (const siteFile of siteFiles) {
      // A virtual site file resolves to the real .vue module; a real one is already the id.
      const id = virtualSites.resolve(siteFile) ?? siteFile;
      const mod = graph.getModuleById(id);
      if (mod) graph.invalidateModule(mod);
    }
  };

  // NOTE: project `references` in the tsconfig are fine — the mion resolver
  // drops them when building its scan program (they are a tsc --build concept).
  const rtPluginOptions: TsRuntypesPluginOptions = {
    binary: resolveRtBinary(rt.binary),
    tsconfig: rt.tsConfig,
    genDir: rt.genDir ?? rt.outDir,
    emitMode: rt.emitMode,
    moduleMode: rt.moduleMode,
    inlineMode: rt.inlineMode,
    transformMode: rt.transformMode,
    // Strict by default: Error-severity mion diagnostics halt the build. The
    // mion run-types adapter no longer trips the scanner (its runtime-key wrappers ride
    // the untracked *ByKey APIs / the raw cache), so consumers get the documented
    // "Error = build must fail" contract. Opt out per package with `failOnError: false`.
    failOnError: rt.failOnError ?? true,
    patternSampleCount: rt.patternSampleCount,
    patternSampleRetries: rt.patternSampleRetries,
    jsRuntime: rt.jsRuntime,
    // Pure-fn build report feeds the serverMapFrom transport; in-process only (the
    // mion manifest is the artifact, no need for mion' own JSON file).
    ...(manifestPath ? {pureFnReport: 'callback' as const, onPureFnReport: harvestReport} : {}),
    // Editing a type in ANOTHER file leaves every file reflecting it serving a validator for
    // the old shape, because the import that named it was erased and vite has no edge to
    // follow. mion works out which files went stale and reports them here; mion maps
    // its virtual SFC paths back to the real .vue modules and invalidates those.
    onSiteFilesChanged: invalidateStaleSites,
  };
  const plugins = tsRuntypes(rtPluginOptions);
  // Only wired when `consume` is configured: with no transport there is nothing to generate
  // and nothing to inject, so pipelines that merely import a server module for its route types
  // (specs, client builds) are untouched.
  const extraPlugins: Plugin[] = [];
  // configResolved runs for every plugin before any buildStart, so the root is set before the
  // mion report callback fires and resolveGenDir() can never read a stale value.
  if (manifestPath)
    extraPlugins.push({
      name: 'mion-server-mappers-root',
      configResolved(config) {
        viteRoot = config.root;
      },
    } satisfies Plugin);
  if (options.serverMappers?.consume)
    extraPlugins.push(serverMappersConsumePlugin(options.serverMappers.consume, options.serverMappers.injectInto));
  // Vue SFCs: the mion plugin only transforms plain TS/JS ids, so an SFC's <script> needs
  // to be handed to it under a virtual path. Wired off the SAME plugin instance — one resolver,
  // one program, one generated tree.
  extraPlugins.push(...mionSfcPlugins(findRtPlugin(plugins), rt.sfc !== false, virtualSites));
  // Captures the dev server so invalidateStaleSites can reach the module graph. Build lanes
  // never call configureServer, where a single transform pass makes staleness impossible.
  extraPlugins.push({
    name: 'mion-rt-invalidate',
    configureServer(server) {
      devServer = server as unknown as typeof devServer;
    },
  } satisfies Plugin);
  if (options.server) {
    const server = options.server;
    const runMode = server.runMode ?? 'middleware';
    // Read through the union rather than trusting it: a plain vite.config.js still carrying
    // 'buildOnly' would otherwise fall into the childProcess branch and silently spawn a server
    // the config never asked for.
    if (runMode !== 'middleware' && runMode !== 'childProcess') {
      throw new Error(
        `[mionVitePlugin] unknown server.runMode '${String(runMode)}'. Use 'middleware' (default: the API runs inside ` +
          `the vite dev server) or 'childProcess' (spawned beside it for e2e). 'buildOnly' is gone — it WAS ` +
          `the AOT harvest mode, and AOT is gone.`
      );
    }
    if (runMode === 'middleware') {
      // In-process: the API is loaded through THIS vite server's SSR pipeline and mounted as
      // dev-server middleware. Nothing is spawned, and nothing happens outside `vite dev`.
      extraPlugins.unshift(
        mionMiddlewarePlugin(server, {
          onReady: () => serverReadyResolve?.(),
          onError: (err) => serverReadyReject?.(err),
        })
      );
    } else {
      // Server startup is deferred to buildStart so only the project actually RUNNING
      // spawns it (in vitest workspace mode every project config gets evaluated).
      extraPlugins.unshift({
        name: 'mion-server-orchestrator',
        buildStart() {
          startManagedServer(server);
        },
      } satisfies Plugin);
    }
  }
  return [...extraPlugins, plugins];
}

/** The mion plugin instance out of whatever `tsRuntypes()` returned (one plugin, or an
 *  array of them). The SFC pass delegates to its transform, so it must be the very instance vite
 *  runs — a second one would mean a second resolver process and a second program scan. */
function findRtPlugin(created: unknown): Plugin | undefined {
  const queue: unknown[] = [created];
  while (queue.length) {
    const next = queue.shift();
    if (Array.isArray(next)) queue.push(...(next as unknown[]));
    else if (typeof (next as Plugin | undefined)?.transform === 'function') return next as Plugin;
  }
  return undefined;
}

// ############# serverMapFrom manifest transport #############

/** Manifest row: one harvested serverMapFrom mapper (mirrors @mionjs/core ServerMapperEntry). */
interface ServerMapperManifestEntry {
  key: string;
  /** Absolute path to the pure-fn module @ts-runtypes generated for this mapper. The BUILD-mode
   *  transport imports this and registers the tuple inside it, so the body has one source of
   *  truth and arrives with its real bodyHash. Resolved from the report's `module` field, never
   *  from an assumed `pf/<ns>/<key>` layout — under `moduleMode: 'allSingle'` every pure fn
   *  collapses into a single `types/pf.js` and that assumption breaks. */
  module?: string;
  paramNames?: string[];
  /** Factory body. Kept for the DEV/SERVE lane only — see renderMappersModule. */
  code?: string;
  pureFnDependencies?: string[];
}

/** Resolves the emit option to an absolute manifest path (undefined = harvest disabled). */
function resolveManifestPath(emit: MionServerMappersOptions['emit']): string | undefined {
  if (!emit) return undefined;
  return path.resolve(emit === true ? '.mion/server-mappers.json' : emit);
}

/** Writes the harvested mappers deterministically (sorted by key; empty array = harvested, none found). */
function writeMapperManifest(manifestPath: string, mappers: Map<string, ServerMapperManifestEntry>): void {
  const entries = [...mappers.values()].sort((a, b) => (a.key < b.key ? -1 : 1));
  mkdirSync(path.dirname(manifestPath), {recursive: true});
  writeFileSync(manifestPath, JSON.stringify(entries, null, 2) + '\n');
}

/** Filename of the module generated from the consumed manifests, written into `<root>/.mion/`
 *  (already gitignored, and the same directory the harvest writes its JSON to). */
const GENERATED_MAPPERS_FILE = 'server-mappers.generated.js';

// Detecting the injection target: the module that imports @mionjs/router AND names initMionRouter.
// Deliberately two loose tests rather than one regex over a specific import shape — a namespace import
// (`import * as router from '@mionjs/router'`), an alias (`{initMionRouter as init}`) and a multi-line
// import list all have to match, and matching only braced named imports silently skipped them. Kept
// text-based: this runs on every transformed module, so no AST parse.
const ROUTER_IMPORT = /from\s*['"]@mionjs\/router['"]/;
const ROUTER_INIT_NAME = /\binitMionRouter\b/;

/** Generates a REAL module registering the harvested serverMapFrom mappers, and injects a
 *  side-effect import of it into the server entry.
 *
 *  This used to be a `virtual:mion/server-mappers` module served from resolveId/load. Virtual
 *  modules lose to `rollupOptions.external`: rollup tests external against the RESOLVED id, and
 *  `\0virtual:mion/server-mappers` still matches a catch-all like /^[^./]/ — so the import was
 *  externalized and survived verbatim into production bundles, where nothing can resolve it. The
 *  build-time inlining this module documents therefore never happened. A real file on disk has no
 *  such failure mode, needs no ambient module declaration, is inspectable when a mapper goes
 *  missing, and matches where @ts-runtypes already landed with its own generated output.
 *
 *  Two modes, unchanged:
 *  - `vite build`: manifests are read AT BUILD TIME and inlined as static data — no node:fs, no
 *    build-machine paths in the artifact, deployable to lambda/docker/edge.
 *  - dev/serve: the module reads the manifests at runtime and installs the lazy re-reader, covering
 *    the race where the server boots before the client build finished harvesting. */
function serverMappersConsumePlugin(consume: string | string[], injectInto?: string | string[]): Plugin {
  const manifests = (Array.isArray(consume) ? consume : [consume]).map((manifest) => path.resolve(manifest));
  let isBuildCommand = false;
  let generatedFile = '';
  let targets: string[] = [];
  let injected = 0;
  return {
    name: 'mion-server-mappers',
    configResolved(config) {
      isBuildCommand = config.command === 'build';
      generatedFile = path.resolve(config.root, '.mion', GENERATED_MAPPERS_FILE);
      const explicit = Array.isArray(injectInto) ? injectInto : injectInto ? [injectInto] : [];
      targets = explicit.map((target) => path.resolve(config.root, target));
    },
    buildStart() {
      injected = 0;
      // written before any transform runs, so the injected import always resolves
      mkdirSync(path.dirname(generatedFile), {recursive: true});
      writeFileSync(generatedFile, renderMappersModule(manifests, isBuildCommand));
    },
    transform(code, id) {
      if (id === generatedFile) return;
      const isTarget = targets.length
        ? targets.includes(id)
        : !id.includes('node_modules') && ROUTER_IMPORT.test(code) && ROUTER_INIT_NAME.test(code);
      if (!isTarget) return;
      injected++;
      const from = path.relative(path.dirname(id), generatedFile).split(path.sep).join('/');
      const specifier = from.startsWith('.') ? from : `./${from}`;
      // APPENDED, not prepended: ESM import declarations are hoisted and evaluated before the
      // importing module's body wherever they sit, so the mappers still register before any route
      // runs — and no existing line moves, which is what makes `map: null` (rollup's "this
      // transform did not move code, keep the existing map") true rather than a one-line lie.
      return {code: `${code}\nimport '${specifier}';\n`, map: null};
    },
    buildEnd() {
      // Build mode only: serve has no meaningful end, and a dev miss surfaces immediately as a
      // rejected flow. A BUILD miss ships an artifact whose mappers are silently absent, which is
      // the exact failure the whole transport rewrite exists to remove — so fail loud here.
      if (!isBuildCommand || injected > 0) return;
      throw new Error(
        `[mionVitePlugin] serverMappers.consume is configured but no module was found to register the ` +
          `mappers into: nothing in this build imports @mionjs/router and calls initMionRouter. ` +
          `Point serverMappers.injectInto at your server entry (it also covers entries reached ` +
          `through a local barrel, or from node_modules).`
      );
    },
  };
}

/** Renders the generated module's source for the active mode (see serverMappersConsumePlugin).
 *
 *  BUILD mode imports each mapper's generated pure-fn module out of the CLIENT build's
 *  `__runtypes/types/` tree and registers the tuple inside it. mion keeps no copy of any body: the
 *  entry arrives with @ts-runtypes' real bodyHash and its whole dep closure, and rollup inlines the
 *  tuple into the artifact, so the client's generated tree is a BUILD-time input only — the bundle
 *  stays self-contained and edge/lambda safe, with no node:fs.
 *
 *  The tuple is matched on its key slot rather than taken by export name. `PURE_FN_TUPLE_KEYS[3]` is
 *  `key`, which holds in every module mode, whereas the export name is a mangled encoding of the
 *  module's logical path (`__rt_pf$2Frt$2F<hash>`) whose escaping rules are not public — and "the
 *  single export" only holds until someone sets `moduleMode: 'allSingle'`, which puts every pure fn
 *  in one file. */
function renderMappersModule(manifests: string[], isBuildCommand: boolean): string {
  const header = '// GENERATED by @mionjs/devtools — serverMapFrom transport. Do not edit.\n';
  if (isBuildCommand) {
    const entries = readMapperManifests(manifests);
    const lines = [`import {registerServerMapperTuple, registerServerMappers} from '@mionjs/core';`];
    const withoutModule: ServerMapperManifestEntry[] = [];
    entries.forEach((entry, index) => {
      if (!entry.module) {
        withoutModule.push(entry);
        return;
      }
      lines.push(`import * as __mionMapper${index} from ${JSON.stringify(toImportSpecifier(entry.module))};`);
    });
    entries.forEach((entry, index) => {
      if (!entry.module) return;
      const key = JSON.stringify(entry.key);
      lines.push(
        `registerServerMapperTuple(${key}, Object.values(__mionMapper${index}).find((t) => Array.isArray(t) && t[3] === ${key}));`
      );
    });
    // A row with no `module` means the harvest ran against a report that carried no module path
    // (older @ts-runtypes, or a hand-written manifest). Fall back to the code payload rather than
    // dropping the mapper, which would only surface as a rejected flow at request time.
    if (withoutModule.length) lines.push(`registerServerMappers(${JSON.stringify(withoutModule)});`);
    return header + lines.join('\n') + '\n';
  }
  return (
    header +
    [
      `import {installServerMapperReader} from '@mionjs/core';`,
      `import {existsSync, readFileSync} from 'node:fs';`,
      `const MANIFESTS = ${JSON.stringify(manifests)};`,
      `installServerMapperReader(() => {`,
      `    const entries = [];`,
      `    for (const manifestPath of MANIFESTS) {`,
      `        if (!existsSync(manifestPath)) continue;`,
      `        try {`,
      `            entries.push(...JSON.parse(readFileSync(manifestPath, 'utf8')));`,
      `        } catch {`,
      `            // partial write: the lazy on-miss re-read retries`,
      `        }`,
      `    }`,
      `    return entries;`,
      `});`,
      '',
    ].join('\n')
  );
}

/** Absolute path → an import specifier rollup will resolve. Windows separators become '/', and a
 *  path is left absolute so it resolves regardless of where the generated module ends up. */
function toImportSpecifier(absolutePath: string): string {
  return absolutePath.split(path.sep).join('/');
}

/** Reads + merges the mapper manifests at BUILD time (missing files fail loud in build mode —
 *  a production bundle silently missing its mappers would only fail at request time). */
function readMapperManifests(manifests: string[]): ServerMapperManifestEntry[] {
  const entries: ServerMapperManifestEntry[] = [];
  for (const manifestPath of manifests) {
    if (!existsSync(manifestPath)) {
      throw new Error(
        `[mionVitePlugin] serverMappers manifest not found at build time: ${manifestPath}. ` +
          `Run the client build (serverMappers.emit) before the server build, or fix the configured path.`
      );
    }
    entries.push(...(JSON.parse(readFileSync(manifestPath, 'utf8')) as ServerMapperManifestEntry[]));
  }
  return entries;
}

// ############# managed server process #############

let serverReadyResolve: (() => void) | undefined;
let serverReadyReject: ((err: Error) => void) | undefined;
let serverStarted = false;
let serverChild: ChildProcess | undefined;

/** Resolves once the managed mion server (options.server) accepts connections.
 *  Only ever resolves in processes whose running project configured `server` —
 *  await it from that project's globalSetup (the old plugin's contract). */
export const serverReady: Promise<void> = new Promise((resolve, reject) => {
  serverReadyResolve = resolve;
  serverReadyReject = reject;
});
// Nobody awaits this in a plain `vite dev` — it exists for test/e2e globalSetups. Without a handler
// attached HERE, a rejection has no consumer and node kills the process: in middleware mode that
// means one broken import in the API takes the whole dev server down instead of showing a 503 (seen
// for real). Attaching a no-op handler swallows nothing — a consumer's own `await serverReady`
// still rejects.
void serverReady.catch(() => {});

/** Resolves vite-node's CLI from THIS package's own dependency tree.
 *
 *  Not `pnpm exec vite-node`: vite-node is a dependency of @mionjs/devtools, not of the consumer,
 *  so under a strict (non-hoisting) install it never reaches the consumer's node_modules/.bin and
 *  the spawn dies with "Command vite-node not found". It also assumed every consumer runs pnpm.
 *  Resolving from here and spawning it with the current node binary is package-manager agnostic
 *  and finds the exact vite-node this package was published against. */
function resolveViteNodeCli(): string {
  // via package.json + its `bin` field: vite-node's exports map does not expose the CLI file
  // (only './package.json' and the library subpaths), so a direct subpath resolve is refused.
  const manifestPath = createRequire(import.meta.url).resolve('vite-node/package.json');
  const bin = (JSON.parse(readFileSync(manifestPath, 'utf8')) as {bin?: string | Record<string, string>}).bin;
  const relative = typeof bin === 'string' ? bin : bin?.['vite-node'];
  if (!relative) throw new Error('[mionVitePlugin] vite-node is installed but declares no `vite-node` bin.');
  return path.resolve(path.dirname(manifestPath), relative);
}

/** Spawns the server entry through vite-node (its own vite config → its own marker injection). */
function startManagedServer(server: MionServerOptions): void {
  if (serverStarted) return;
  serverStarted = true;
  const port = parseInt(server.env?.MION_TEST_PORT ?? process.env.MION_TEST_PORT ?? '8076', 10);
  const waitTimeout = server.waitTimeout ?? 30000;
  const args = [resolveViteNodeCli()];
  if (server.viteConfig) args.push('--config', server.viteConfig);
  args.push(server.startScript);
  const child = spawn(process.execPath, args, {
    cwd: server.viteConfig ? path.dirname(server.viteConfig) : path.dirname(server.startScript),
    env: {...process.env, ...server.env, MION_TEST_SERVER_AUTO_START: 'true'},
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  // unref so the child never keeps the parent's event loop alive (vitest must be able
  // to exit when tests finish); the exit hook below still tears the server down.
  child.unref();
  serverChild = child;
  const killChild = () => {
    if (serverChild && !serverChild.killed) serverChild.kill('SIGTERM');
  };
  process.once('exit', killChild);
  child.once('error', (err) => {
    serverChild = undefined;
    serverReadyReject?.(new Error(`[mionVitePlugin] failed to spawn managed server: ${err.message}`));
  });
  child.once('exit', (code) => {
    serverChild = undefined;
    if (code && code !== 0) serverReadyReject?.(new Error(`[mionVitePlugin] managed server exited with code ${code}`));
  });
  void waitForPort(port, waitTimeout).then(
    () => serverReadyResolve?.(),
    (err) => {
      killChild();
      serverReadyReject?.(err);
    }
  );
}

/** Polls the port until something accepts a TCP connection (any HTTP response counts). */
async function waitForPort(port: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await fetch(`http://127.0.0.1:${port}/`, {method: 'GET'});
      return; // any response means the server is listening
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error(`[mionVitePlugin] managed server did not accept connections on port ${port} within ${timeoutMs}ms`);
}
