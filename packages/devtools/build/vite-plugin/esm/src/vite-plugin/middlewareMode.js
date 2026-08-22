import path from "node:path";
import { serveFetchHandler } from "./nodeWebBridge.js";
const NODE_HANDLER_EXPORTS = ["httpRequestHandler"];
const FETCH_HANDLER_EXPORTS = ["requestHandler", "bunRequestHandler", "fetch"];
const DEFAULT_MIDDLEWARE_EXCLUDE = [
  /^\/@/,
  // /@vite/client, /@fs/…, /@id/…
  /^\/__vite/,
  /^\/node_modules\//,
  /[?&]t=\d+/,
  // HMR cache-busting
  /[?&](import|worker|url|raw)(&|=|$)/,
  /^\/favicon\.ico($|\?)/,
  /\.(m?[jt]sx?|vue|svelte|astro|css|scss|sass|less|styl|html|map|svg|png|jpe?g|gif|webp|avif|ico|woff2?|ttf|otf|eot|wasm)($|\?)/
];
function mionMiddlewarePlugin(options, signals) {
  const startScript = path.resolve(options.startScript);
  const platformId = options.platform ?? "@mionjs/platform-node";
  const exclude = options.exclude ?? DEFAULT_MIDDLEWARE_EXCLUDE;
  let mounted = false;
  let initPromise;
  let initError;
  let nodeHandler;
  let fetchHandler;
  let mountPath = "";
  let staleSince;
  async function load(server) {
    const platform = await server.ssrLoadModule(platformId);
    setAsMiddleware(platform, platformId);
    const entry = await server.ssrLoadModule(startScript);
    await Promise.all(Object.values(entry).filter((value) => value instanceof Promise));
    const router = await server.ssrLoadModule("@mionjs/router");
    assertNotListening(router, platformId);
    mountPath = normalizeMountPath(options.basePath ?? router.getRouterOptions?.().basePath);
    const handlers = pickHandler(entry, platform, platformId);
    nodeHandler = handlers.node;
    fetchHandler = handlers.fetch;
  }
  function init(server) {
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
  async function reload(server) {
    const entryModule = await server.moduleGraph.getModuleByUrl(startScript, true);
    if (entryModule) invalidateOwnModules(server, entryModule);
    const router = await server.ssrLoadModule("@mionjs/router");
    router.resetRouter?.();
    await load(server);
  }
  return {
    name: "mion-middleware-server",
    config() {
      return { ssr: { noExternal: [/@mionjs\//] } };
    },
    configureServer(server) {
      if (mounted) return;
      mounted = true;
      server.middlewares.use(async (req, res, next) => {
        try {
          const url = req.url || "/";
          if (mountPath && !isUnderMountPath(url, mountPath)) return next();
          await init(server);
          if (staleSince !== void 0) {
            staleSince = void 0;
            await reload(server);
          }
          if (!matches(req.url || "/", mountPath, exclude)) return next();
          if (initError) return fail(res, initError);
          if (nodeHandler) return nodeHandler(req, res);
          if (fetchHandler) return await serveFetchHandler(fetchHandler, req, res, isSecure(server));
          return fail(res, new Error("no mion request handler was resolved"));
        } catch (err) {
          console.error("[mion] middleware error:", err);
          if (!res.writableEnded) fail(res, err instanceof Error ? err : new Error(String(err)));
        }
      });
      if (!process.env.VITEST) void init(server);
      if (options.hotReload === false) return;
      server.watcher.on("change", (file) => {
        if (!initPromise || staleSince !== void 0) return;
        if (!isOwnFile(server, file)) return;
        const modules = server.moduleGraph.getModulesByFile(file);
        if (!modules?.size) return;
        staleSince = Date.now();
      });
    }
  };
}
function setAsMiddleware(platform, platformId) {
  const setter = Object.keys(platform).find((key) => /^set[A-Za-z]*Opts$/.test(key) && typeof platform[key] === "function");
  if (!setter) {
    throw new Error(
      `[mionVitePlugin] ${platformId} exports no set…Opts() function, so middleware mode cannot tell it to skip listen(). Point server.platform at a mion platform adapter (@mionjs/platform-node by default).`
    );
  }
  platform[setter]({ asMiddleware: true });
}
function assertNotListening(router, platformId) {
  const platformConfig = router.getPlatformConfig?.();
  if (!platformConfig) return;
  if (platformConfig.asMiddleware === true) return;
  throw new Error(
    `[mionVitePlugin] middleware mode: the server entry opened its own port — ${platformId} was loaded twice, so the asMiddleware option never reached the copy the entry used. Make sure ssr.noExternal keeps @mionjs/* in one instance (the plugin adds /@mionjs\\// for you; a custom ssr.noExternal must not drop it).`
  );
}
function pickHandler(entry, platform, platformId) {
  for (const source of [entry, platform]) {
    const node = NODE_HANDLER_EXPORTS.map((name) => source[name]).find((fn) => typeof fn === "function");
    if (node) return { node };
    const fetch = FETCH_HANDLER_EXPORTS.map((name) => source[name]).find((fn) => typeof fn === "function");
    if (fetch) return { fetch };
  }
  throw new Error(
    `[mionVitePlugin] middleware mode found no request handler. Expected one of ${[...NODE_HANDLER_EXPORTS, ...FETCH_HANDLER_EXPORTS].join(", ")} exported by ${platformId} or by the server entry itself (export your adapter's handler as \`requestHandler\` to use any other platform).`
  );
}
function normalizeMountPath(basePath) {
  if (typeof basePath !== "string" || !basePath) return "";
  const withLeading = basePath.startsWith("/") ? basePath : `/${basePath}`;
  return withLeading.endsWith("/") ? withLeading.slice(0, -1) : withLeading;
}
function isUnderMountPath(url, mountPath) {
  if (!url.startsWith(mountPath)) return false;
  const rest = url.slice(mountPath.length);
  return rest === "" || rest.startsWith("/") || rest.startsWith("?");
}
function matches(url, mountPath, exclude) {
  if (mountPath) return isUnderMountPath(url, mountPath);
  return !exclude.some((pattern) => pattern.test(url));
}
function isOwnFile(server, file) {
  if (file.includes("node_modules")) return false;
  return path.resolve(file).startsWith(path.resolve(server.config.root));
}
function invalidateOwnModules(server, entryModule) {
  const seen = /* @__PURE__ */ new Set();
  const walk = (mod) => {
    if (seen.has(mod)) return;
    seen.add(mod);
    if (mod.file && !isOwnFile(server, mod.file)) return;
    server.moduleGraph.invalidateModule(mod);
    mod.ssrImportedModules.forEach(walk);
  };
  walk(entryModule);
}
function fail(res, err) {
  res.statusCode = 503;
  res.setHeader("content-type", "text/plain; charset=utf-8");
  res.end(`mion API failed to initialize:
${err.message}`);
}
function isSecure(server) {
  return !!server.config.server?.https;
}
export {
  DEFAULT_MIDDLEWARE_EXCLUDE,
  mionMiddlewarePlugin
};
//# sourceMappingURL=middlewareMode.js.map
