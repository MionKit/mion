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
import type {GenerateInfo, PluginOptions as TsRuntypesPluginOptions} from '../core/unplugin.ts';
import type {Plugin, PluginOption} from 'vite';
// Shared with the Next preset — see ./options.ts for why these live outside this file.
import {
  assertNoRemovedOptions,
  resolveRtBinary,
  toRunTypesOptions,
  type MionClientPointer,
  type MionRunTypesOptions,
} from '../options.ts';

export {resolveRtBinary};
export type {MionClientPointer, MionRunTypesOptions};

// ############# mion vite plugin — mion migration #############
// The old plugin ran the deepkit type-compiler + pure-fn extraction + AOT cache
// generation. All of that is replaced by the runtypes core: the resolver binary
// scans the program, rewrites mion.route()/mion.middleFn()/createX call sites with precompiled
// function tuples and writes the generated cache modules under <srcDir>/.mion/.
//
// This wrapper keeps the old `mionVitePlugin({runTypes: {tsConfig}})` call shape so the
// existing vite/vitest configs across the monorepo keep working unchanged. The legacy
// deepkit/AOT/pure-fn options are REMOVED — see the migration guard below.

/** The mion server that backs a vite dev/test run — either mounted INSIDE the vite process
 *  ('middleware', the default) or spawned beside it via vite-node ('childProcess'). A dev and test
 *  convenience only: an API that is started on its own never sets it, and the batch transport
 *  needs nothing from it (the SERVER build generates that from its own or its client's program). */
export interface MionServerOptions {
  /** Absolute path to the server entry script: loaded through this vite server's SSR pipeline in
   *  middleware mode, spawned with vite-node in childProcess mode. */
  startScript: string;
  /** The server's own vite config, the one vite-node runs `startScript` under (childProcess mode);
   *  its directory is the child's working directory. */
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
   *  the router first, since `initRoutes` refuses to run twice. */
  hotReload?: boolean;
}

/** Batch transport, zero config: the SERVER build's resolver reads every `batch([...])` call and
 *  inline inputFrom mapper out of the batch source program (its own, or the `client.tsConfig` one),
 *  writes `<genDir>/rpc/batches.generated.js` plus the mapper modules beside it, and appends that
 *  module's import to whichever file calls createMionRouter — all inside the transform, so this
 *  preset only forwards the pointer and handles vite's module graph. The wire carries only the
 *  batch id: the server runs exactly the batches and mappers its own build baked in, and never runs
 *  anything received over it. See ../options.ts (MionClientPointer). */

/** Options for the unified mion vite plugin. */
export interface MionPluginOptions {
  /** mion type transformation options. */
  runTypes?: MionRunTypesOptions;
  /** The separate client project this API serves batches to; unset when client and server share
   *  this program. See MionClientPointer. */
  client?: MionClientPointer;
  /** Dev/test only: how the mion API behind this run is started, mounted in-process or spawned
   *  with vite-node and awaited via serverReady. */
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
/** What the vite preset keeps of the batch transport: the resolver's generate echo, folded into
 *  the three things vite needs. `generated` settles once the first (buildStart) generate reported,
 *  which the managed child server waits for: vite runs buildStart hooks in parallel, so nothing
 *  else orders the child's entry transform after the table is on disk, and a child that started
 *  ahead of it would import nothing and answer every batch with an unknown id. `batchesModuleOf`
 *  is the table's current path ('' when there is none), which the middleware's `add` listener
 *  compares against. And a later generate where the module APPEARS or VANISHES (a client adds its
 *  first batch, or drops its last one, while the dev server runs) calls `invalidate` with the
 *  router-init modules: they were transformed without (or with) the import, so they must be
 *  transformed again. Exported for its spec; the preset is its only other caller. */
export function createBatchTransportSignals(invalidate: (files: string[]) => void): {
  onGenerate: (info: GenerateInfo) => void;
  generated: Promise<void>;
  batchesModuleOf: () => string;
} {
  let generatedResolve: (() => void) | undefined;
  const generated = new Promise<void>((resolve) => (generatedResolve = resolve));
  let batchesModule = '';
  return {
    generated,
    batchesModuleOf: () => batchesModule,
    onGenerate: (info) => {
      const presenceChanged = (info.batchesModule !== '') !== (batchesModule !== '');
      batchesModule = info.batchesModule;
      if (presenceChanged && generatedResolve === undefined) invalidate(info.routerInitFiles);
      generatedResolve?.();
      generatedResolve = undefined;
    },
  };
}

export function mionVitePlugin(options: MionPluginOptions = {}): PluginOption[] {
  const rt = options.runTypes ?? {};
  assertNoRemovedOptions(options);
  const runMode = options.server?.runMode ?? 'middleware';
  const transport = createBatchTransportSignals((files) => invalidateFiles(files));
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

  /** Invalidates the modules of `files` in every environment graph (the API entry is loaded through
   *  the ssr environment under vite 8, which the mixed legacy graph no longer reaches). */
  const invalidateFiles = (files: string[]): void => {
    const server = devServer as any;
    if (!server) return;
    const graphs = server.environments
      ? Object.values(server.environments).map((env: any) => env.moduleGraph)
      : [server.moduleGraph];
    for (const file of files) {
      for (const graph of graphs) {
        for (const mod of graph?.getModulesByFile?.(file) ?? []) graph.invalidateModule(mod);
      }
    }
  };

  const rtPluginOptions: TsRuntypesPluginOptions = {
    ...toRunTypesOptions(rt, options.client),
    onGenerate: transport.onGenerate,
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
          batchesModuleOf: transport.batchesModuleOf,
        })
      );
    } else {
      // Server startup is deferred to buildStart so only the project actually RUNNING
      // spawns it (in vitest workspace mode every project config gets evaluated), and past the
      // first generate, so a batch table this program generates is on disk before the child
      // transforms its entry (the child's own resolver generates the child's table; this wait is
      // for the shared-program case). A generate that never reports (it failed) must not hang the
      // build: after the server's own wait budget the child is spawned anyway and serverReady says why.
      extraPlugins.unshift({
        name: 'mion-server-orchestrator',
        async buildStart() {
          const budget = new Promise<void>((resolve) => setTimeout(resolve, server.waitTimeout ?? 30000).unref());
          await Promise.race([transport.generated, budget]);
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
