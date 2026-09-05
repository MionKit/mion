/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import fs from 'node:fs';
import path from 'node:path';
import type {IncomingMessage, ServerResponse} from 'node:http';
import type {ModuleNode, Plugin, ViteDevServer} from 'vite';
import {serveFetchHandler} from './nodeWebBridge.ts';
import type {MionServerOptions} from './mionVitePlugin.ts';
import {batchesModulePath} from '../options.ts';

// ############# in-process (middleware) server mode #############
// Runs the mion API INSIDE the vite dev server: the entry is loaded through vite's own SSR pipeline
// (`ssrLoadModule`, so it shares the module graph with the app) and its request handler is mounted
// as connect middleware. This is the idiomatic "backend of a frontend" setup for Nuxt/SSR — one
// process, one port, no child server.
//
// It is a restore, not an invention: the pre-migration plugin did the same thing, except the
// "don't open a port" half rode `MION_COMPILE=middleware` + `isMionCompileMode()`, both deleted with
// the AOT sweep. It is now an ordinary platform option (`asMiddleware`) the plugin sets on the
// adapter before loading the entry, so an unchanged entry — `mion.initRoutes(routes); startNodeServer();` —
// works in both run modes.

/** Node-style handler, as exported by @mionjs/platform-node. */
type NodeHandler = (req: IncomingMessage, res: ServerResponse) => void;
/** Fetch-style handler, as exported by @mionjs/platform-bun and buildable from the edge adapters. */
type FetchHandler = (req: Request) => Response | Promise<Response>;

/** Export names searched for a handler, entry module first, then the platform module. */
const NODE_HANDLER_EXPORTS = ['httpRequestHandler'];
const FETCH_HANDLER_EXPORTS = ['requestHandler', 'bunRequestHandler', 'fetch'];

/** Paths never sent to mion when the router has no basePath (mion serving at the root). Same shape
 *  as @hono/vite-dev-server's defaults: vite internals, HMR pings and static assets must reach
 *  vite's own middlewares. Override with `server.exclude`. */
export const DEFAULT_MIDDLEWARE_EXCLUDE: RegExp[] = [
  /^\/@/, // /@vite/client, /@fs/…, /@id/…
  /^\/__vite/,
  /^\/node_modules\//,
  /[?&]t=\d+/, // HMR cache-busting
  /[?&](import|worker|url|raw)(&|=|$)/,
  /^\/favicon\.ico($|\?)/,
  /\.(m?[jt]sx?|vue|svelte|astro|css|scss|sass|less|styl|html|map|svg|png|jpe?g|gif|webp|avif|ico|woff2?|ttf|otf|eot|wasm)($|\?)/,
];

/** Signals handed back to the plugin so `serverReady` settles from whichever lane is active. */
export interface MiddlewareReadySignals {
  onReady: () => void;
  onError: (err: Error) => void;
}

/** The vite plugin that mounts the mion API in-process (`server.runMode: 'middleware'`). */
export function mionMiddlewarePlugin(options: MionServerOptions, signals: MiddlewareReadySignals): Plugin {
  const startScript = path.resolve(options.startScript);
  const platformId = options.platform ?? '@mionjs/platform-node';
  const exclude = options.exclude ?? DEFAULT_MIDDLEWARE_EXCLUDE;
  let mounted = false;
  let initPromise: Promise<void> | undefined;
  let initError: Error | undefined;
  let nodeHandler: NodeHandler | undefined;
  let fetchHandler: FetchHandler | undefined;
  let mountPath = '';
  let staleSince: number | undefined;

  /** Loads the entry through vite's SSR pipeline and resolves its handler + mount path. */
  async function load(server: ViteDevServer): Promise<void> {
    const platform = await server.ssrLoadModule(platformId);
    setAsMiddleware(platform, platformId);
    const entry = await server.ssrLoadModule(startScript);
    // `mion.initRoutes()` is synchronous, but an entry may still export a promise of its own (a
    // platform start it did not await); awaiting those keeps the first request from racing it.
    await Promise.all(Object.values(entry).filter((value): value is Promise<unknown> => value instanceof Promise));
    const router = await server.ssrLoadModule('@mionjs/router');
    assertNotListening(router, platformId);
    mountPath = normalizeMountPath(options.basePath ?? router.getRouterOptions?.().basePath);
    const handlers = pickHandler(entry, platform, platformId);
    nodeHandler = handlers.node;
    fetchHandler = handlers.fetch;
  }

  /** Single init chain — every request awaits this one before matching. */
  function init(server: ViteDevServer): Promise<void> {
    initPromise ??= load(server).then(
      () => signals.onReady(),
      (err) => {
        initError = err instanceof Error ? err : new Error(String(err));
        console.error(`[mion] middleware mode failed to load ${startScript}:`, initError);
        signals.onError(initError);
      }
    );
    return initPromise;
  }

  /** Re-loads the entry after a source change: mion's router is global state, so it is reset
   *  first — `initRoutes` throws "Router has already been initialized" otherwise. */
  async function reload(server: ViteDevServer): Promise<void> {
    // ssrLoadModule runs in the ssr environment, so the invalidation must hit THAT graph:
    // under vite 8 the legacy mixed-graph module node no longer reaches the ssr instance,
    // leaving the next ssrLoadModule serving the cached (stale) entry.
    const ssrGraph = (server as any).environments?.ssr?.moduleGraph;
    const graph = ssrGraph ?? server.moduleGraph;
    const entryModule = await graph.getModuleByUrl(startScript, true);
    if (entryModule) invalidateOwnModules(server, graph, entryModule);
    const router = await server.ssrLoadModule('@mionjs/router');
    router.resetRouter?.();
    await load(server);
  }

  return {
    name: 'mion-middleware-server',

    config() {
      // Single-instance state matters here in a way it does not in a plain build: the API and
      // the app share one SSR module graph, and two @mionjs/core instances mean two registries
      // (core's own dual-load warning is the signal).
      return {ssr: {noExternal: [/@mionjs\//]}};
    },

    configureServer(server) {
      // Nuxt (and any environment-API host) calls configureServer once per environment.
      if (mounted) return;
      mounted = true;

      // Registered from inside the hook body, so it runs BEFORE vite's transform/static
      // middlewares — a returned post-hook would sit after them.
      server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void) => {
        try {
          const url = req.url || '/';
          if (mountPath && !isUnderMountPath(url, mountPath)) return next();
          await init(server);
          if (staleSince !== undefined) {
            staleSince = undefined;
            await reload(server);
          }
          if (!matches(req.url || '/', mountPath, exclude)) return next();
          if (initError) return fail(res, initError);
          if (nodeHandler) return nodeHandler(req, res);
          if (fetchHandler) return await serveFetchHandler(fetchHandler, req, res, isSecure(server));
          return fail(res, new Error('no mion request handler was resolved'));
        } catch (err) {
          console.error('[mion] middleware error:', err);
          if (!res.writableEnded) fail(res, err instanceof Error ? err : new Error(String(err)));
        }
      });

      // Warm up so a broken API is reported at boot rather than at the first request. Skipped
      // under vitest: its vite server also fires configureServer, and loading the API into the
      // test process is neither wanted nor harmless (the mion router is global state).
      if (!process.env.VITEST) void init(server);

      if (options.hotReload === false) return;
      // The batch module the client build writes into this root (`.mion/rpc/batches.generated.js`)
      // is imported by the entry, so a REWRITE of it is an ordinary change below. Its first
      // APPEARANCE is not: the entry was loaded without it and nothing in the graph names it yet.
      const batchesModule = batchesModulePath(server.config.root);
      server.watcher.on('add', (file) => {
        if (!initPromise || staleSince !== undefined) return;
        if (path.resolve(file) === batchesModule) staleSince = Date.now();
      });
      // Lazy reload: mark on change, re-load on the next API request. Reloading eagerly would
      // re-run initRoutes for every unrelated frontend edit.
      server.watcher.on('change', (file) => {
        if (!initPromise || staleSince !== undefined) return;
        if (!isOwnFile(server, file)) return;
        // vite 8 keys its module graphs by real path while watcher events can carry the
        // symlinked spelling (macOS /var vs /private/var), so look both up; and the mixed
        // moduleGraph proxy no longer surfaces ssr-only modules (how this plugin loads the
        // API entry), so ask every environment graph too.
        let realFile = file;
        try {
          realFile = fs.realpathSync(file);
        } catch {
          // unresolvable path (deleted mid-event): fall through with the raw spelling
        }
        const candidates = realFile === file ? [file] : [file, realFile];
        const graphs = server.environments
          ? Object.values(server.environments).map((env: any) => env.moduleGraph)
          : [server.moduleGraph];
        if (!graphs.some((graph) => candidates.some((f) => graph?.getModulesByFile?.(f)?.size))) return;
        staleSince = Date.now();
      });
    },
  };
}

/** Tells the platform adapter the HOST owns the socket, before the entry can call it. */
function setAsMiddleware(platform: Record<string, any>, platformId: string): void {
  const setter = Object.keys(platform).find((key) => /^set[A-Za-z]*Opts$/.test(key) && typeof platform[key] === 'function');
  if (!setter) {
    throw new Error(
      `[mionVitePlugin] ${platformId} exports no set…Opts() function, so middleware mode cannot tell it to skip ` +
        `listen(). Point server.platform at a mion platform adapter (@mionjs/platform-node by default).`
    );
  }
  platform[setter]({asMiddleware: true});
}

/** Fails loudly when the entry opened a port anyway — which means the plugin and the entry got
 *  DIFFERENT copies of the adapter module, so the flag above never reached the one that listened. */
function assertNotListening(router: Record<string, any>, platformId: string): void {
  const platformConfig = router.getPlatformConfig?.();
  // No adapter was started at all (a pure initRoutes entry): nothing to check.
  if (!platformConfig) return;
  if (platformConfig.asMiddleware === true) return;
  throw new Error(
    `[mionVitePlugin] middleware mode: the server entry opened its own port — ${platformId} was loaded twice, so ` +
      `the asMiddleware option never reached the copy the entry used. Make sure ssr.noExternal keeps @mionjs/* ` +
      `in one instance (the plugin adds /@mionjs\\// for you; a custom ssr.noExternal must not drop it).`
  );
}

/** Node-style handler wins when both exist: no Request/Response is materialized for it. */
function pickHandler(
  entry: Record<string, any>,
  platform: Record<string, any>,
  platformId: string
): {node?: NodeHandler; fetch?: FetchHandler} {
  for (const source of [entry, platform]) {
    const node = NODE_HANDLER_EXPORTS.map((name) => source[name]).find((fn) => typeof fn === 'function');
    if (node) return {node};
    const fetch = FETCH_HANDLER_EXPORTS.map((name) => source[name]).find((fn) => typeof fn === 'function');
    if (fetch) return {fetch};
  }
  throw new Error(
    `[mionVitePlugin] middleware mode found no request handler. Expected one of ` +
      `${[...NODE_HANDLER_EXPORTS, ...FETCH_HANDLER_EXPORTS].join(', ')} exported by ${platformId} or by the ` +
      `server entry itself (export your adapter's handler as \`requestHandler\` to use any other platform).`
  );
}

/** '', 'api/v1' and '/api/v1/' all normalize to the prefix route paths actually carry ('/api/v1'). */
function normalizeMountPath(basePath: unknown): string {
  if (typeof basePath !== 'string' || !basePath) return '';
  const withLeading = basePath.startsWith('/') ? basePath : `/${basePath}`;
  return withLeading.endsWith('/') ? withLeading.slice(0, -1) : withLeading;
}

/** Boundary-aware prefix match: '/api' must not swallow '/apidocs'. */
function isUnderMountPath(url: string, mountPath: string): boolean {
  if (!url.startsWith(mountPath)) return false;
  const rest = url.slice(mountPath.length);
  return rest === '' || rest.startsWith('/') || rest.startsWith('?');
}

/** With a basePath the prefix decides. Without one mion serves at the root, so vite's own internals
 *  and static assets are what must be let through instead. */
function matches(url: string, mountPath: string, exclude: RegExp[]): boolean {
  if (mountPath) return isUnderMountPath(url, mountPath);
  return !exclude.some((pattern) => pattern.test(url));
}

/** Resolves symlinks, falling back to the given spelling for paths that no longer exist. */
function safeRealpath(p: string): string {
  try {
    return fs.realpathSync(p);
  } catch {
    return p;
  }
}

/** A file the user owns — dependencies keep their module instances (and their warm caches) across a
 *  reload, which is what lets `resetRouter()` do its job instead of a whole fresh graph.
 *  Compared through realpath as well: vite 8 keys module files by real path, so a symlinked root
 *  (macOS /var vs /private/var) would otherwise disown every module. */
function isOwnFile(server: ViteDevServer, file: string): boolean {
  if (file.includes('node_modules')) return false;
  const resolved = path.resolve(file);
  const root = path.resolve(server.config.root);
  return resolved.startsWith(root) || safeRealpath(resolved).startsWith(safeRealpath(root));
}

/** Invalidates the entry's own source subtree in the given graph so the next load re-evaluates it.
 *  The graph is the ssr environment's when it exists (vite 8) or the legacy mixed graph; their
 *  module nodes name the imported set differently (importedModules vs ssrImportedModules). */
function invalidateOwnModules(
  server: ViteDevServer,
  graph: {invalidateModule: (mod: any) => void},
  entryModule: ModuleNode
): void {
  const seen = new Set<ModuleNode>();
  const walk = (mod: ModuleNode): void => {
    if (seen.has(mod)) return;
    seen.add(mod);
    if (mod.file && !isOwnFile(server, mod.file)) return;
    graph.invalidateModule(mod);
    ((mod as any).ssrImportedModules ?? (mod as any).importedModules ?? []).forEach(walk);
  };
  walk(entryModule);
}

/** 503 with the real cause — a dev server that answers "something went wrong" is a wasted round. */
function fail(res: ServerResponse, err: Error): void {
  res.statusCode = 503;
  res.setHeader('content-type', 'text/plain; charset=utf-8');
  res.end(`mion API failed to initialize:\n${err.message}`);
}

/** Whether the dev server itself is on https, so bridged Requests carry the right scheme. */
function isSecure(server: ViteDevServer): boolean {
  return !!server.config.server?.https;
}
