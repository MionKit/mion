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

// ############# in-process (middleware) server mode #############
// The entry is `ssrLoadModule`d, sharing the app's module graph, and its handler mounted as connect middleware.
// The router's host flag, set before the entry loads, makes any adapter it starts skip listening and hand over
// its handler, so an unchanged `initRoutes(routes); startNodeServer();` entry works as written.

/** Node-style handler, as exported by @mionjs/platform-node. */
type NodeHandler = (req: IncomingMessage, res: ServerResponse) => void;
/** Fetch-style handler, as exported by @mionjs/platform-bun and buildable from the edge adapters. */
type FetchHandler = (req: Request) => Response | Promise<Response>;
type RequestHandlers = {node?: NodeHandler; fetch?: FetchHandler};

/** Export names searched for a handler on the entry module, and on the node adapter when nothing else gave one. */
const NODE_HANDLER_EXPORTS = ['httpRequestHandler'];
const FETCH_HANDLER_EXPORTS = ['requestHandler', 'bunRequestHandler', 'fetch'];
/** Serves an entry that registers routes but starts no adapter. */
const DEFAULT_PLATFORM = '@mionjs/platform-node';

/** Paths never sent to mion when the router has no basePath, the same shape as @hono/vite-dev-server's
 *  defaults: vite internals, HMR pings and static assets must reach vite's own middlewares. */
export const DEFAULT_MIDDLEWARE_EXCLUDE: RegExp[] = [
  /^\/@/, // /@vite/client, /@fs/…, /@id/…
  /^\/__vite/,
  /^\/node_modules\//,
  /[?&]t=\d+/, // HMR cache-busting
  /[?&](import|worker|url|raw)(&|=|$)/,
  /^\/favicon\.ico($|\?)/,
  /\.(m?[jt]sx?|vue|svelte|astro|css|scss|sass|less|styl|html|map|svg|png|jpe?g|gif|webp|avif|ico|woff2?|ttf|otf|eot|wasm)($|\?)/,
];

/** Signals handed back to the plugin: they drive the 503 path, nothing leaves the preset. */
export interface MiddlewareReadySignals {
  onReady: () => void;
  onError: (err: Error) => void;
}

/** The plugin plus the one hook the preset needs: a change no watcher event reports (the batch table appearing
 *  or vanishing, a type edit re-transforming files) marks the API stale through it. */
export type MionMiddlewarePlugin = Plugin & {markStale: () => void};

/** The vite plugin that mounts the mion API in-process — the one way the preset runs it. */
export function mionMiddlewarePlugin(options: MionServerOptions, signals: MiddlewareReadySignals): MionMiddlewarePlugin {
  // A relative entry is the vite root's, settled in configResolved.
  let entryPath = path.resolve(options.entry);
  const exclude = options.exclude ?? DEFAULT_MIDDLEWARE_EXCLUDE;
  let mounted = false;
  let initPromise: Promise<void> | undefined;
  let initError: Error | undefined;
  let nodeHandler: NodeHandler | undefined;
  let fetchHandler: FetchHandler | undefined;
  let mountPath = '';
  let isStale = false;
  let reloading: Promise<void> | undefined;
  /** Every file the last load evaluated for the API: a change to one of them is what makes the API stale. */
  let apiFiles = new Set<string>();
  let routerModule: Record<string, any> | undefined;
  let closed = false;
  let inFlight: Promise<unknown> = Promise.resolve();

  /** Remembers the latest load, so closing waits for an entry that may still start an adapter. */
  function track(loading: Promise<void>): Promise<void> {
    inFlight = loading.catch(() => undefined);
    return loading;
  }

  /** Loads the entry through vite's SSR pipeline and resolves its handler + mount path. */
  async function load(server: ViteDevServer): Promise<void> {
    const router = await server.ssrLoadModule('@mionjs/router');
    // A warm-up load still in flight when the server closes must not leave the process-wide flag set.
    if (closed) return;
    routerModule = router;
    router.setHostOwnsSocket(true);
    const entry = await server.ssrLoadModule(entryPath);
    // `mion.initRoutes()` is synchronous, but an entry may still export a promise of its own (a
    // platform start it did not await); awaiting those keeps the first request from racing it.
    await Promise.all(Object.values(entry).filter((value): value is Promise<unknown> => value instanceof Promise));
    assertNotListening(router);
    mountPath = normalizeMountPath(router.getRouterOptions?.().basePath);
    const handlers = await pickHandler(server, entry, router.getHostRequestHandler?.());
    nodeHandler = handlers.node;
    fetchHandler = handlers.fetch;
  }

  /** Records the entry's module tree once it loaded (or failed half-way: what did load is still watched). */
  async function collectApiFiles(server: ViteDevServer): Promise<void> {
    const graph = ssrGraphOf(server);
    const entryModule = await graph.getModuleByUrl(entryPath, true);
    const files = new Set<string>([path.resolve(entryPath)]);
    if (entryModule) for (const mod of moduleTreeOf(entryModule)) if (mod.file) files.add(path.resolve(mod.file));
    apiFiles = files;
  }

  /** Loads the entry and records the outcome: initError holds the last failure, cleared by a good load. */
  async function loadAndSettle(server: ViteDevServer): Promise<void> {
    try {
      await track(load(server));
      initError = undefined;
      signals.onReady();
    } catch (err) {
      initError = err instanceof Error ? err : new Error(String(err));
      console.error(`[mion] middleware mode failed to load ${entryPath}:`, initError);
      signals.onError(initError);
    }
    if (!closed) await collectApiFiles(server).catch(() => undefined);
  }

  /** Single init chain — every request awaits this one before matching. */
  function init(server: ViteDevServer): Promise<void> {
    initPromise ??= loadAndSettle(server);
    return initPromise;
  }

  /** A reload is a fresh copy of the API, mion's own modules included, so no shared state needs a reset. */
  async function reload(server: ViteDevServer): Promise<void> {
    const graph = ssrGraphOf(server);
    const entryModule = await graph.getModuleByUrl(entryPath, true);
    if (entryModule) for (const mod of moduleTreeOf(entryModule)) graph.invalidateModule(mod);
    await loadAndSettle(server);
  }

  /** Init, then any pending reload: every request waits on the SAME reload, none sees it half done. */
  async function ready(server: ViteDevServer): Promise<void> {
    await init(server);
    if (isStale && !reloading) {
      isStale = false;
      reloading = reload(server).finally(() => (reloading = undefined));
    }
    if (reloading) await reloading;
  }

  function markStale(): void {
    if (initPromise && options.hotReload !== false) isStale = true;
  }

  return {
    name: 'mion-middleware-server',
    markStale,

    configResolved(config) {
      entryPath = path.resolve(config.root, options.entry);
    },

    // The flag is process-wide, so a later server started in the same process (a test runner) listens again.
    // Cleared only once a loading entry finished: its adapter would otherwise see no host and listen.
    async closeBundle() {
      closed = true;
      await inFlight;
      routerModule?.setHostOwnsSocket(false);
    },

    config() {
      // The API and the app share one SSR module graph here, and two @mionjs/core instances mean two route
      // registries (core's own dual-load warning is the signal).
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
          await ready(server);
          if (!matches(req.url || '/', mountPath, exclude)) return next();
          if (initError) {
            // No load ever got far enough to read the basePath: a page navigation is the app's, not the API's.
            if (!mountPath && isPageNavigation(req)) return next();
            return fail(res, initError);
          }
          if (nodeHandler) return nodeHandler(req, res);
          if (fetchHandler) return await serveFetchHandler(fetchHandler, req, res, isSecure(server));
          return fail(res, new Error('no mion request handler was resolved'));
        } catch (err) {
          console.error('[mion] middleware error:', err);
          if (!res.writableEnded) fail(res, err instanceof Error ? err : new Error(String(err)));
        }
      });

      // Warm up so a broken API is reported at boot rather than at the first request. Skipped under vitest:
      // its vite server fires configureServer too, and the mion router is global state in that process.
      if (!process.env.VITEST) void init(server);

      if (options.hotReload === false) return;
      // Lazy reload: mark on change, re-load on the next API request. Reloading eagerly would
      // re-run initRoutes for every unrelated frontend edit.
      server.watcher.on('change', (file) => {
        if (!initPromise || isStale) return;
        // A failed load may have stopped before reaching the edited file: any source edit is worth a retry.
        if (initError ? !file.includes('node_modules') : isApiFile(apiFiles, file)) isStale = true;
      });
    },
  };
}

/** ssrLoadModule runs in the ssr environment, so invalidation must hit THAT graph: under vite 8 the legacy mixed
 *  graph's node leaves the next ssrLoadModule serving the cached, stale entry. */
function ssrGraphOf(server: ViteDevServer): {
  getModuleByUrl: (url: string, ssr?: boolean) => Promise<ModuleNode | undefined>;
  invalidateModule: (mod: any) => void;
} {
  return (server as any).environments?.ssr?.moduleGraph ?? server.moduleGraph;
}

/** The entry and every module it imports. The ssr environment's graph and the legacy mixed one name the
 *  imported set differently (ssrImportedModules vs importedModules). */
function moduleTreeOf(entryModule: ModuleNode): Set<ModuleNode> {
  const seen = new Set<ModuleNode>();
  const walk = (mod: ModuleNode): void => {
    if (seen.has(mod)) return;
    seen.add(mod);
    ((mod as any).ssrImportedModules ?? (mod as any).importedModules ?? []).forEach(walk);
  };
  walk(entryModule);
  return seen;
}

/** vite 8 keys its module graphs by real path while watcher events can carry the symlinked spelling
 *  (macOS /var vs /private/var), so both are looked up. */
function isApiFile(apiFiles: Set<string>, file: string): boolean {
  const resolved = path.resolve(file);
  return apiFiles.has(resolved) || apiFiles.has(safeRealpath(resolved));
}

/** A browser asking for a page: GET or HEAD that accepts html. mion's client never sends that. */
function isPageNavigation(req: IncomingMessage): boolean {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false;
  return String(req.headers.accept ?? '').includes('text/html');
}

/** An entry that opened a port anyway got a DIFFERENT router copy than the one the host flag was set on. */
function assertNotListening(router: Record<string, any>): void {
  const platformConfig = router.getPlatformConfig?.();
  // No adapter was started at all (a pure initRoutes entry): nothing to check.
  if (!platformConfig) return;
  if (platformConfig.asMiddleware === true) return;
  throw new Error(
    `[mionVitePlugin] middleware mode: the server entry opened its own port. @mionjs/router was loaded twice, ` +
      `so the platform adapter never saw that vite owns the socket. Make sure ssr.noExternal keeps @mionjs/* ` +
      `in one instance (the plugin adds /@mionjs\\// for you; a custom ssr.noExternal must not drop it).`
  );
}

/** A node-style handler wins when both exist: no Request/Response is built for it. */
async function pickHandler(
  server: ViteDevServer,
  entry: Record<string, any>,
  hostHandler: RequestHandlers | undefined
): Promise<RequestHandlers> {
  const fromEntry = handlerExportOf(entry);
  if (fromEntry) return fromEntry;
  if (hostHandler?.node || hostHandler?.fetch) return hostHandler;
  let loadError: unknown;
  const nodeAdapter = await server.ssrLoadModule(DEFAULT_PLATFORM).catch((error: unknown) => void (loadError = error));
  const fromAdapter = nodeAdapter && handlerExportOf(nodeAdapter);
  if (fromAdapter) return fromAdapter;
  throw new Error(
    `[mionVitePlugin] middleware mode found no request handler. Start a mion platform adapter in the server ` +
      `entry, or export one of ${[...NODE_HANDLER_EXPORTS, ...FETCH_HANDLER_EXPORTS].join(', ')} from it.`,
    {cause: loadError}
  );
}

function handlerExportOf(source: Record<string, any>): RequestHandlers | undefined {
  const node = NODE_HANDLER_EXPORTS.map((name) => source[name]).find((fn) => typeof fn === 'function');
  if (node) return {node};
  const fetch = FETCH_HANDLER_EXPORTS.map((name) => source[name]).find((fn) => typeof fn === 'function');
  if (fetch) return {fetch};
  return undefined;
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
