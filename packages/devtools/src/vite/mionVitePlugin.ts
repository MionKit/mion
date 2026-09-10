/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import tsRuntypes from '../runtypes/vite.ts';
import {mionMiddlewarePlugin} from './middlewareMode.ts';
import {createVirtualSiteMap, mionSfcPlugins} from './sfcTransform.ts';
import type {GenerateInfo, PluginOptions as TsRuntypesPluginOptions} from '../core/unplugin.ts';
import type {Plugin, PluginOption} from 'vite';
// Shared with the Next preset — see ./options.ts for why these live outside this file.
import {
  resolveRtBinary,
  toRunTypesOptions,
  type MionApiPointer,
  type MionBundleApiMode,
  type MionClientPointer,
  type MionRunTypesOptions,
} from '../options.ts';

export {resolveRtBinary};
export type {MionApiPointer, MionBundleApiMode, MionClientPointer, MionRunTypesOptions};

// ############# mion vite plugin #############
// A thin preset over the runtypes core: the resolver binary scans the program, rewrites
// mion.route()/mion.middleFn()/createX call sites with precompiled function tuples, and writes
// the generated cache modules under <srcDir>/.mion/. This file adds mion's own choices on top —
// the in-process API, the server bundle, and the batch transport's module-graph wiring.

/** The mion API behind this vite run: ONE program, ONE process. In `vite dev` the entry is loaded
 *  through this vite server's own SSR pipeline and mounted as middleware (no port of its own), and
 *  `build` emits it as a second bundle beside the client one. A test that needs a real socket
 *  starts the API itself in its globalSetup. */
export interface MionServerOptions {
  /** Absolute path to the server entry script: loaded through this vite server's SSR pipeline in
   *  dev, and the server bundle's input when `build` is set. */
  startScript: string;
  /** Opt in to the SERVER bundle: `vite build` then emits BOTH the client static files and the API,
   *  from this one config. Off by default, so a `build.lib` project is untouched. */
  build?: MionServerBuildOptions;
  /** DEV: mount prefix for the API. Defaults to the router's own `basePath`, which is
   *  what route paths already carry — set this only to mount somewhere else. With no basePath at
   *  all mion serves at the root and `exclude` decides what reaches vite instead. */
  basePath?: string;
  /** DEV: platform adapter module to take the request handler from
   *  (default '@mionjs/platform-node' — node-style, no Request is materialized). A fetch-style
   *  adapter (e.g. '@mionjs/platform-bun') is bridged from node req/res automatically. */
  platform?: string;
  /** DEV + no basePath: paths NOT served by mion, so vite's own internals and static
   *  assets still work. Defaults to DEFAULT_MIDDLEWARE_EXCLUDE. */
  exclude?: RegExp[];
  /** DEV: re-load the API when its sources change (default true). The reload resets
   *  the router first, since `initRoutes` refuses to run twice. */
  hotReload?: boolean;
}

/** The SERVER half of a two-bundle build (`server.build`). */
export interface MionServerBuildOptions {
  /** Where the server bundle lands, relative to the vite root (default 'dist-server'). The client
   *  bundle keeps `build.outDir`, so the two never share a directory. */
  outDir?: string;
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
  /** The separate project declaring the API this client calls; unset when they share this program.
   *  See MionApiPointer. */
  api?: MionApiPointer;
  /** Bundle the metadata and compiled functions of every route this client calls into the bundle.
   *  See MionBundleApiMode. */
  bundleApi?: MionBundleApiMode;
  /** The mion API this run hosts: mounted inside the dev server, and optionally emitted as a second
   *  bundle by `vite build`. One program, one process. */
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
 *  the two things vite needs. `batchesModuleOf` is the table's current path ('' when there is none),
 *  which the middleware's `add` listener compares against. And a later generate where the module
 *  APPEARS or VANISHES (a client adds its first batch, or drops its last one, while the dev server
 *  runs) calls `invalidate` with the router-init modules: they were transformed without (or with)
 *  the import, so they must be transformed again. The FIRST generate never invalidates — nothing has
 *  been transformed yet at that point. Exported for its spec; the preset is its only other caller. */
export function createBatchTransportSignals(invalidate: (files: string[]) => void): {
  onGenerate: (info: GenerateInfo) => void;
  batchesModuleOf: () => string;
} {
  let firstGenerateDone = false;
  let batchesModule = '';
  return {
    batchesModuleOf: () => batchesModule,
    onGenerate: (info) => {
      const presenceChanged = (info.batchesModule !== '') !== (batchesModule !== '');
      batchesModule = info.batchesModule;
      if (presenceChanged && firstGenerateDone) invalidate(info.routerInitFiles);
      firstGenerateDone = true;
    },
  };
}

export function mionVitePlugin(options: MionPluginOptions = {}): PluginOption[] {
  const rt = options.runTypes ?? {};
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
    ...toRunTypesOptions(rt, options.client, {api: options.api, bundleApi: options.bundleApi}),
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
    // In-process: the API is loaded through THIS vite server's SSR pipeline and mounted as
    // dev-server middleware. Nothing is spawned, and nothing happens outside `vite dev`.
    // `onReady`/`onError` only feed the 503 path now — no promise leaves this preset.
    extraPlugins.unshift(
      mionMiddlewarePlugin(server, {
        onReady: () => {},
        onError: () => {},
        batchesModuleOf: transport.batchesModuleOf,
      })
    );
    if (server.build) extraPlugins.unshift(serverBundlePlugin(server, server.build));
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

// ############# server bundle (`server.build`) #############

/** Declares the SERVER half of a two-bundle build, so one `vite build` emits the client static files
 *  AND the API.
 *
 *  It rides vite's built-in `ssr` environment rather than a third one of its own: `buildApp()` builds
 *  EVERY environment in the config, and the defaults already carry `client` + `ssr`, so a third named
 *  environment would emit three bundles. `ssr` is already `consumer: 'server'` — it IS the server half.
 *
 *  `builder` is what switches `vite build` off its legacy single-environment path onto `buildApp()`;
 *  its two shared flags are what keep the run to ONE resolver. Without `sharedConfigBuild` vite
 *  re-resolves the config FILE once per environment, which calls `mionVitePlugin()` again and spawns a
 *  second resolver in configResolved that is then discarded and never closed. */
function serverBundlePlugin(server: MionServerOptions, build: MionServerBuildOptions): Plugin {
  return {
    name: 'mion-server-bundle',
    config() {
      return {
        builder: {sharedConfigBuild: true, sharedPlugins: true},
        environments: {
          ssr: {
            // One @mionjs instance across both bundles: two copies mean two route registries.
            resolve: {noExternal: [/@mionjs\//]},
            build: {
              outDir: build.outDir ?? 'dist-server',
              emptyOutDir: true,
              rollupOptions: {input: server.startScript},
            },
          },
        },
      };
    },
  } satisfies Plugin;
}
