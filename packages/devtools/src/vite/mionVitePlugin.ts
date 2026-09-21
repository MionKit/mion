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
// A thin preset over the runtypes core, adding mion's own choices: the in-process API, the server bundle,
// and the batch transport's module-graph wiring.

/** The mion API behind this vite run: ONE program, ONE process. In dev it is mounted as middleware with no
 *  port of its own, so a test that needs a real socket starts the API itself in its globalSetup. */
export interface MionServerOptions {
  /** Absolute path to the server entry: SSR-loaded in dev, the server bundle's input when `build` is set. */
  startScript: string;
  /** Opt in to the SERVER bundle: `vite build` then emits BOTH the client files and the API, from this one
   *  config. Off by default, so a `build.lib` project is untouched. */
  build?: MionServerBuildOptions;
  /** DEV: mount prefix, defaulting to the router's own `basePath`, which is what route paths already carry.
   *  With no basePath at all mion serves at the root and `exclude` decides what reaches vite instead. */
  basePath?: string;
  /** DEV: where the request handler comes from (default '@mionjs/platform-node', node-style, no Request is
   *  materialized). A fetch-style adapter such as '@mionjs/platform-bun' is bridged from node req/res. */
  platform?: string;
  /** DEV + no basePath: paths NOT served by mion, so vite's internals and static assets still work. */
  exclude?: RegExp[];
  /** DEV: re-load the API when its sources change (default true); the reload resets the router first, since
   *  `initRoutes` refuses to run twice. */
  hotReload?: boolean;
}

/** The SERVER half of a two-bundle build (`server.build`). */
export interface MionServerBuildOptions {
  /** Where the server bundle lands, relative to the vite root (default 'dist-server'). The client bundle
   *  keeps `build.outDir`, so the two never share a directory. */
  outDir?: string;
}

// Batch transport needs no config: the SERVER build's resolver does it all inside the transform, so this
// preset only forwards the pointer and handles vite's module graph.
// The wire carries only the batch id, so the server runs exactly the batches and mappers its own build baked in.

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
/** The resolver's generate echo folded into the two things vite needs. `batchesModuleOf` is the table's
 *  current path ('' when there is none), which the middleware's `add` listener compares against. A later
 *  generate where the module APPEARS or VANISHES invalidates the router-init modules: they were transformed
 *  with the opposite import. The FIRST generate never invalidates, nothing has been transformed yet.
 *  Exported for its spec; the preset is its only other caller. */
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
  // Vue SFC scripts are registered with the resolver under a VIRTUAL path (`Comp.vue.ts`) while vite serves
  // `Comp.vue`, and stale site files are reported by the path the resolver knows, so they need translating
  // before invalidating. Built here because the mion plugin and the SFC pass are both constructed below.
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
    // Editing a type in ANOTHER file leaves every file reflecting it serving a validator for the old shape:
    // the import that named it was erased, so vite has no edge to follow and the resolver reports the stale
    // files here instead. Vite-only, Turbopack gets the same guarantee from the broker's typeDeps + stamp.
    onSiteFilesChanged: invalidateStaleSites,
  };
  const plugins = tsRuntypes(rtPluginOptions);
  const extraPlugins: Plugin[] = [];
  // The mion plugin only transforms plain TS/JS ids, so an SFC's <script> is handed to it under a virtual
  // path, wired off the SAME plugin instance: one resolver, one program, one generated tree.
  extraPlugins.push(...mionSfcPlugins(findRtPlugin(plugins), rt.sfc !== false, virtualSites));
  // Captures the dev server so invalidateStaleSites can reach the module graph. Build lanes never call
  // configureServer, and their single transform pass makes staleness impossible anyway.
  extraPlugins.push({
    name: 'mion-rt-invalidate',
    configureServer(server) {
      devServer = server as unknown as typeof devServer;
    },
  } satisfies Plugin);
  if (options.server) {
    const server = options.server;
    // In-process: nothing is spawned, and nothing happens outside `vite dev`. `onReady`/`onError` only feed
    // the 503 path, no promise leaves this preset.
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

/** The SFC pass delegates to this plugin's transform, so it must be the very instance vite runs: a second one
 *  would mean a second resolver process and a second program scan. */
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

/** The SERVER half of a two-bundle build, so one `vite build` emits the client files AND the API. It uses
 *  vite's built-in `ssr` environment, already `consumer: 'server'`, rather than a third one: `buildApp()`
 *  builds EVERY environment in the config, so a third named one would emit three bundles. `builder` is what
 *  switches `vite build` off its legacy single-environment path onto `buildApp()`, and its two shared flags
 *  keep the run to ONE resolver: without `sharedConfigBuild` vite re-resolves the config FILE per
 *  environment, calling `mionVitePlugin()` again and spawning a second resolver that is never closed. */
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
