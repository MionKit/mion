/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import path from 'node:path';
import {readFileSync} from 'node:fs';
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
  batchesModulePath,
  createBatchHarvest,
  readBatchesModule,
  resolveGenDir,
  resolveRtBinary,
  resolveServerRoot,
  toRunTypesOptions,
  type MionRunTypesOptions,
  type MionServerPointer,
} from '../options.ts';

export {resolveRtBinary};
export type {MionRunTypesOptions, MionServerPointer};

// ############# mion vite plugin — mion migration #############
// The old plugin ran the deepkit type-compiler + pure-fn extraction + AOT cache
// generation. All of that is replaced by the runtypes core: the resolver binary
// scans the program, rewrites route()/middleFn()/createX call sites with precompiled
// function tuples and writes the generated cache modules under <srcDir>/.mion/.
//
// This wrapper keeps the old `mionVitePlugin({runTypes: {tsConfig}})` call shape so the
// existing vite/vitest configs across the monorepo keep working unchanged. The legacy
// deepkit/AOT/pure-fn options are REMOVED — see the migration guard below.

/** The mion server that backs a vite dev/test run — either mounted INSIDE the vite process
 *  ('middleware', the default) or spawned beside it via vite-node ('childProcess'). The two
 *  pointer fields (`startScript`, `viteConfig`) also tell the batch transport where the API's root
 *  is; in middleware mode the API rides THIS config's pipeline, so the root is this one. */
export interface MionServerOptions extends MionServerPointer {
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

/** Batch transport, zero config: a CLIENT build HARVESTS its compiled batches (batch build
 *  report) and their inline inputFrom mappers (pure-fn build report) into ONE generated module
 *  written into the server root, `.mion/rpc/batches.generated.js`; a SERVER build IMPORTS that
 *  module from whichever file calls initMionRouter. The module registers the batch table and the
 *  pure-fn modules RunTypes already emitted for the mappers. The wire carries only the batch id:
 *  the server runs exactly the batches and mappers its own build baked in, and never runs anything
 *  received over it. See ../options.ts for the file layout and the checksum rule. */

/** Options for the unified mion vite plugin. */
export interface MionPluginOptions {
  /** mion type transformation options. */
  runTypes?: MionRunTypesOptions;
  /** The mion API behind this run: where the batch module is written, and (dev/test) how the API
   *  runs, mounted in-process or spawned with vite-node and awaited via serverReady. */
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
  // Batch harvest (CLIENT builds): read the batch build report and the pure-fn build report
  // (keeping only sites attributed to @mionjs/client's inputFrom wrapper), and write the
  // generated module after every report phase ('build' replaces, 'update' merges the HMR delta).
  // In middleware mode the API rides THIS pipeline, so the module lands in this root; otherwise
  // the `server` pointer names the API's root, and with no pointer the root is shared.
  let viteRoot = '';
  const runMode = options.server?.runMode ?? 'middleware';
  const serverRootOf = (): string =>
    options.server && runMode !== 'middleware' ? resolveServerRoot(options.server, viteRoot) : viteRoot;
  const {harvestMappers, harvestBatches} = createBatchHarvest(
    serverRootOf,
    () => viteRoot,
    () => resolveGenDir(viteRoot, rt)
  );
  // Settles once the first ('build' phase) batch report has been written out. The managed server
  // below waits for it before spawning: vite runs buildStart hooks in parallel, so nothing else
  // orders the child's entry transform after the harvest, and a child that started ahead of the
  // module would import nothing and answer every batch with an unknown id.
  let harvestedResolve: (() => void) | undefined;
  const harvested = new Promise<void>((resolve) => (harvestedResolve = resolve));
  const onBatchReport: NonNullable<TsRuntypesPluginOptions['onBatchReport']> = (sites, phase, scannedFiles) => {
    harvestBatches(sites, phase, scannedFiles);
    if (phase === 'build') harvestedResolve?.();
  };
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
    // The build reports feed the batch transport, in-process only: the generated module is the
    // artifact, there is no report file.
    pureFnReport: 'callback',
    onPureFnReport: harvestMappers,
    onBatchReport,
    // Editing a type in ANOTHER file leaves every file reflecting it serving a validator for
    // the old shape, because the import that named it was erased and vite has no edge to
    // follow. The resolver works out which files went stale and reports them here; mion maps
    // its virtual SFC paths back to the real .vue modules and invalidates those.
    //
    // Vite-only: Turbopack gets the same guarantee from the broker's typeDeps + stamp.
    onSiteFilesChanged: invalidateStaleSites,
  };
  const plugins = tsRuntypes(rtPluginOptions);
  const extraPlugins: Plugin[] = [];
  // configResolved runs for every plugin before any buildStart, so the root is set before the
  // mion report callback fires and neither serverRootOf() nor resolveGenDir() can read a stale value.
  extraPlugins.push({
    name: 'mion-batches-root',
    configResolved(config) {
      viteRoot = config.root;
    },
  } satisfies Plugin);
  // Always wired: it injects only when the module exists, so pipelines that merely import a server
  // module for its route types (specs, client builds) are untouched.
  extraPlugins.push(batchesImportPlugin());
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
    // Read through the union rather than trusting it: a plain vite.config.js still carrying
    // 'buildOnly' would otherwise fall into the childProcess branch and silently spawn a server
    // the config never asked for.
    if ((runMode as string) !== 'middleware' && (runMode as string) !== 'childProcess') {
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
      // spawns it (in vitest workspace mode every project config gets evaluated), and past the
      // harvest, so the batch module is in the server root before the child transforms its
      // entry and looks for it. A scan that never reports (it failed) must not hang the build:
      // after the server's own wait budget the child is spawned anyway and serverReady says why.
      extraPlugins.unshift({
        name: 'mion-server-orchestrator',
        async buildStart() {
          const budget = new Promise<void>((resolve) => setTimeout(resolve, server.waitTimeout ?? 30000).unref());
          await Promise.race([harvested, budget]);
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

// ############# batch transport, server side #############

// Detecting the injection target: the module that imports @mionjs/router AND names initMionRouter.
// Deliberately two loose tests rather than one regex over a specific import shape — a namespace import
// (`import * as router from '@mionjs/router'`), an alias (`{initMionRouter as init}`) and a multi-line
// import list all have to match, and matching only braced named imports silently skipped them. Kept
// text-based: this runs on every transformed module, so no AST parse.
const ROUTER_IMPORT = /from\s*['"]@mionjs\/router['"]/;
const ROUTER_INIT_NAME = /\binitMionRouter\b/;

/** Injects a side-effect import of `<root>/.mion/rpc/batches.generated.js` into the server entry,
 *  when the client build wrote one there.
 *
 *  A real file, never a virtual module: virtual modules lose to `rollupOptions.external` (rollup
 *  tests external against the RESOLVED id, and `\0virtual:…` still matches a catch-all like
 *  /^[^./]/), so the import was externalized and survived verbatim into production bundles. A file
 *  on disk has no such failure mode, is inspectable when a mapper goes missing, and is what makes
 *  dev reload free: once imported it is a node in vite's graph, so the client rewriting it fires
 *  `change` and vite invalidates it by itself.
 *
 *  The checksum inside the file is verified before the import is injected (readBatchesModule). In
 *  `vite build` a bad file fails the build; in serve it is logged and nothing is registered, so the
 *  next rewrite gets a fresh look. */
// Exported for the middleware spec, which mounts it beside the middleware plugin without the resolver.
export function batchesImportPlugin(): Plugin {
  let root = '';
  let isBuildCommand = false;
  let moduleFile = '';
  // Every router entry seen, injected or not: the race fallback below invalidates them when the
  // module appears after they were transformed without it.
  const entries = new Set<string>();
  let injected = 0;
  return {
    name: 'mion-batches',
    configResolved(config) {
      root = config.root;
      isBuildCommand = config.command === 'build';
      moduleFile = batchesModulePath(root);
    },
    buildStart() {
      injected = 0;
    },
    transform(code, id) {
      if (id === moduleFile) return;
      if (id.includes('node_modules') || !ROUTER_IMPORT.test(code) || !ROUTER_INIT_NAME.test(code)) return;
      entries.add(id);
      let info;
      try {
        info = readBatchesModule(root);
      } catch (err) {
        if (isBuildCommand) throw err;
        console.error(`[mion batches] ${(err as Error).message}`);
        return;
      }
      if (!info) return;
      injected++;
      const from = path.relative(path.dirname(id), info.file).split(path.sep).join('/');
      // `./` or `../`, never a bare first-byte dot check: a root-level importer relates to the
      // generated file as `.mion/rpc/batches.generated.js`, a dot-folder path that is still a
      // BARE specifier until prefixed.
      const specifier = from.startsWith('./') || from.startsWith('../') ? from : `./${from}`;
      // APPENDED, not prepended: ESM import declarations are hoisted and evaluated before the
      // importing module's body wherever they sit, so the batches still register before any route
      // runs — and no existing line moves, which is what makes `map: null` (rollup's "this
      // transform did not move code, keep the existing map") true rather than a one-line lie.
      return {code: `${code}\nimport '${specifier}';\n`, map: null};
    },
    buildEnd(error) {
      // Build mode only: serve has no meaningful end, and a dev miss surfaces immediately as an
      // unknown batch id. A BUILD that has the module but injected it nowhere ships an artifact
      // whose batches are silently absent, the exact failure the transport exists to remove.
      // A build that already failed (a bad checksum thrown from transform) keeps its own error.
      if (error || !isBuildCommand || injected > 0) return;
      let present = false;
      try {
        present = readBatchesModule(root) !== undefined;
      } catch {
        present = true;
      }
      if (!present) return;
      throw new Error(
        `[mionVitePlugin] ${moduleFile} exists but no module was found to import it from: nothing in this ` +
          `build imports @mionjs/router and calls initMionRouter. Import @mionjs/router directly in the module ` +
          `that calls initMionRouter (a re-export through a local barrel is not detected).`
      );
    },
    configureServer(server) {
      // Race fallback only: the entry was transformed before the client build wrote the module
      // (a server started ahead of its client). A later `change` needs nothing here, the module
      // is in the graph by then and vite invalidates it itself.
      server.watcher.on('add', (file) => {
        if (path.resolve(file) !== moduleFile || entries.size === 0) return;
        const graphs = server.environments
          ? Object.values(server.environments).map((env: any) => env.moduleGraph)
          : [server.moduleGraph];
        for (const entry of entries) {
          for (const graph of graphs) {
            for (const mod of graph?.getModulesByFile?.(entry) ?? []) graph.invalidateModule(mod);
          }
        }
      });
    },
  };
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
