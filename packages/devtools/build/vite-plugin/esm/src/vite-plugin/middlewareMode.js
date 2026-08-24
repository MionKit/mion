import { serveFetchHandler } from "./nodeWebBridge.js";
import path from "node:path";
import fs from "node:fs";
//#region src/vite-plugin/middlewareMode.ts
/** Export names searched for a handler, entry module first, then the platform module. */
var NODE_HANDLER_EXPORTS = ["httpRequestHandler"];
var FETCH_HANDLER_EXPORTS = [
	"requestHandler",
	"bunRequestHandler",
	"fetch"
];
/** Paths never sent to mion when the router has no basePath (mion serving at the root). Same shape
*  as @hono/vite-dev-server's defaults: vite internals, HMR pings and static assets must reach
*  vite's own middlewares. Override with `server.exclude`. */
var DEFAULT_MIDDLEWARE_EXCLUDE = [
	/^\/@/,
	/^\/__vite/,
	/^\/node_modules\//,
	/[?&]t=\d+/,
	/[?&](import|worker|url|raw)(&|=|$)/,
	/^\/favicon\.ico($|\?)/,
	/\.(m?[jt]sx?|vue|svelte|astro|css|scss|sass|less|styl|html|map|svg|png|jpe?g|gif|webp|avif|ico|woff2?|ttf|otf|eot|wasm)($|\?)/
];
/** The vite plugin that mounts the mion API in-process (`server.runMode: 'middleware'`). */
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
	/** Loads the entry through vite's SSR pipeline and resolves its handler + mount path. */
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
	/** Single init chain — every request awaits this one before matching. */
	function init(server) {
		initPromise ??= load(server).then(() => signals.onReady(), (err) => {
			initError = err instanceof Error ? err : new Error(String(err));
			console.error(`[mion] middleware mode failed to load ${startScript}:`, initError);
			signals.onError(initError);
		});
		return initPromise;
	}
	/** Re-loads the entry after a source change: mion's router is global state, so it is reset
	*  first — `initMionRouter` throws "Router has already been initialized" otherwise. */
	async function reload(server) {
		const graph = server.environments?.ssr?.moduleGraph ?? server.moduleGraph;
		const entryModule = await graph.getModuleByUrl(startScript, true);
		if (entryModule) invalidateOwnModules(server, graph, entryModule);
		(await server.ssrLoadModule("@mionjs/router")).resetRouter?.();
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
					return fail(res, /* @__PURE__ */ new Error("no mion request handler was resolved"));
				} catch (err) {
					console.error("[mion] middleware error:", err);
					if (!res.writableEnded) fail(res, err instanceof Error ? err : new Error(String(err)));
				}
			});
			if (!process.env.VITEST) init(server);
			if (options.hotReload === false) return;
			server.watcher.on("change", (file) => {
				if (!initPromise || staleSince !== void 0) return;
				if (!isOwnFile(server, file)) return;
				let realFile = file;
				try {
					realFile = fs.realpathSync(file);
				} catch {}
				const candidates = realFile === file ? [file] : [file, realFile];
				if (!(server.environments ? Object.values(server.environments).map((env) => env.moduleGraph) : [server.moduleGraph]).some((graph) => candidates.some((f) => graph?.getModulesByFile?.(f)?.size))) return;
				staleSince = Date.now();
			});
		}
	};
}
/** Tells the platform adapter the HOST owns the socket, before the entry can call it. */
function setAsMiddleware(platform, platformId) {
	const setter = Object.keys(platform).find((key) => /^set[A-Za-z]*Opts$/.test(key) && typeof platform[key] === "function");
	if (!setter) throw new Error(`[mionVitePlugin] ${platformId} exports no set…Opts() function, so middleware mode cannot tell it to skip listen(). Point server.platform at a mion platform adapter (@mionjs/platform-node by default).`);
	platform[setter]({ asMiddleware: true });
}
/** Fails loudly when the entry opened a port anyway — which means the plugin and the entry got
*  DIFFERENT copies of the adapter module, so the flag above never reached the one that listened. */
function assertNotListening(router, platformId) {
	const platformConfig = router.getPlatformConfig?.();
	if (!platformConfig) return;
	if (platformConfig.asMiddleware === true) return;
	throw new Error(`[mionVitePlugin] middleware mode: the server entry opened its own port — ${platformId} was loaded twice, so the asMiddleware option never reached the copy the entry used. Make sure ssr.noExternal keeps @mionjs/* in one instance (the plugin adds /@mionjs\\// for you; a custom ssr.noExternal must not drop it).`);
}
/** Node-style handler wins when both exist: no Request/Response is materialized for it. */
function pickHandler(entry, platform, platformId) {
	for (const source of [entry, platform]) {
		const node = NODE_HANDLER_EXPORTS.map((name) => source[name]).find((fn) => typeof fn === "function");
		if (node) return { node };
		const fetch = FETCH_HANDLER_EXPORTS.map((name) => source[name]).find((fn) => typeof fn === "function");
		if (fetch) return { fetch };
	}
	throw new Error(`[mionVitePlugin] middleware mode found no request handler. Expected one of ${[...NODE_HANDLER_EXPORTS, ...FETCH_HANDLER_EXPORTS].join(", ")} exported by ${platformId} or by the server entry itself (export your adapter's handler as \`requestHandler\` to use any other platform).`);
}
/** '', 'api/v1' and '/api/v1/' all normalize to the prefix route paths actually carry ('/api/v1'). */
function normalizeMountPath(basePath) {
	if (typeof basePath !== "string" || !basePath) return "";
	const withLeading = basePath.startsWith("/") ? basePath : `/${basePath}`;
	return withLeading.endsWith("/") ? withLeading.slice(0, -1) : withLeading;
}
/** Boundary-aware prefix match: '/api' must not swallow '/apidocs'. */
function isUnderMountPath(url, mountPath) {
	if (!url.startsWith(mountPath)) return false;
	const rest = url.slice(mountPath.length);
	return rest === "" || rest.startsWith("/") || rest.startsWith("?");
}
/** With a basePath the prefix decides. Without one mion serves at the root, so vite's own internals
*  and static assets are what must be let through instead. */
function matches(url, mountPath, exclude) {
	if (mountPath) return isUnderMountPath(url, mountPath);
	return !exclude.some((pattern) => pattern.test(url));
}
/** Resolves symlinks, falling back to the given spelling for paths that no longer exist. */
function safeRealpath(p) {
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
function isOwnFile(server, file) {
	if (file.includes("node_modules")) return false;
	const resolved = path.resolve(file);
	const root = path.resolve(server.config.root);
	return resolved.startsWith(root) || safeRealpath(resolved).startsWith(safeRealpath(root));
}
/** Invalidates the entry's own source subtree in the given graph so the next load re-evaluates it.
*  The graph is the ssr environment's when it exists (vite 8) or the legacy mixed graph; their
*  module nodes name the imported set differently (importedModules vs ssrImportedModules). */
function invalidateOwnModules(server, graph, entryModule) {
	const seen = /* @__PURE__ */ new Set();
	const walk = (mod) => {
		if (seen.has(mod)) return;
		seen.add(mod);
		if (mod.file && !isOwnFile(server, mod.file)) return;
		graph.invalidateModule(mod);
		(mod.ssrImportedModules ?? mod.importedModules ?? []).forEach(walk);
	};
	walk(entryModule);
}
/** 503 with the real cause — a dev server that answers "something went wrong" is a wasted round. */
function fail(res, err) {
	res.statusCode = 503;
	res.setHeader("content-type", "text/plain; charset=utf-8");
	res.end(`mion API failed to initialize:\n${err.message}`);
}
/** Whether the dev server itself is on https, so bridged Requests carry the right scheme. */
function isSecure(server) {
	return !!server.config.server?.https;
}
//#endregion
export { DEFAULT_MIDDLEWARE_EXCLUDE, mionMiddlewarePlugin };

//# sourceMappingURL=middlewareMode.js.map