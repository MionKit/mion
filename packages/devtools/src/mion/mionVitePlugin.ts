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
import tsRuntypes from '../runtypes/vite.ts';
import {mionMiddlewarePlugin} from './middlewareMode.ts';
import {createVirtualSiteMap, mionSfcPlugins} from './sfcTransform.ts';
import type {PluginOptions as TsRuntypesPluginOptions} from '../core/unplugin.ts';
import type {Plugin, PluginOption} from 'vite';
// Shared with the Next preset — see ./options.ts for why these live outside this file.
import {
  assertNoRemovedOptions,
  createMapperHarvest,
  resolveGenDir,
  resolveRtBinary,
  toRunTypesOptions,
  type MionRunTypesOptions,
  type MionServerMappersOptions,
  type ServerMapperManifestEntry,
} from './options.ts';

export {resolveRtBinary};
export type {MionRunTypesOptions, MionServerMappersOptions};

// ############# mion vite plugin — mion migration #############
// The old plugin ran the deepkit type-compiler + pure-fn extraction + AOT cache
// generation. All of that is replaced by the runtypes core: the resolver binary
// scans the program, rewrites route()/middleFn()/createX call sites with precompiled
// function tuples and writes the generated cache modules under <srcDir>/__runtypes/.
//
// This wrapper keeps the old `mionVitePlugin({runTypes: {tsConfig}})` call shape so the
// existing vite/vitest configs across the monorepo keep working unchanged. The legacy
// deepkit/AOT/pure-fn options are REMOVED — see the migration guard below.

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
 *  RunTypes already emitted for them. Wire carries only the `rt::<hash>` key — the server
 *  registers exactly the mappers its own build baked in, and never runs code received over it. */

/** Options for the unified mion vite plugin. */
export interface MionPluginOptions {
  /** mion type transformation options. */
  runTypes?: MionRunTypesOptions;
  /** serverMapFrom mapper transport between the client and server builds. */
  serverMappers?: MionServerMappersOptions;
  /** Managed mion server process for client tests/e2e (spawned with vite-node, awaited via serverReady). */
  server?: MionServerOptions;
}

/**
 * Creates the mion Vite plugin (mion powered).
 *
 * @example
 * ```ts
 * // vitest.config.ts / vite.config.ts
 * import {mionVitePlugin} from '@mionjs/devtools/vite';
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
  let viteRoot = '';
  const {manifestPath, harvest: harvestReport} = createMapperHarvest(options.serverMappers?.emit, () =>
    resolveGenDir(viteRoot, rt)
  );
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

  const rtPluginOptions: TsRuntypesPluginOptions = {
    ...toRunTypesOptions(rt),
    // Pure-fn build report feeds the serverMapFrom transport; in-process only (the
    // mion manifest is the artifact, no need for a separate JSON file).
    ...(manifestPath ? {pureFnReport: 'callback' as const, onPureFnReport: harvestReport} : {}),
    // Editing a type in ANOTHER file leaves every file reflecting it serving a validator for
    // the old shape, because the import that named it was erased and vite has no edge to
    // follow. The resolver works out which files went stale and reports them here; mion maps
    // its virtual SFC paths back to the real .vue modules and invalidates those.
    //
    // Vite-only: Turbopack gets the same guarantee from the broker's typeDeps + stamp.
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
 *  missing, and matches where RunTypes already landed with its own generated output.
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
 *  entry arrives with RunTypes' real bodyHash and its whole dep closure, and rollup inlines the
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
    // (older RunTypes, or a hand-written manifest). Fall back to the code payload rather than
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
