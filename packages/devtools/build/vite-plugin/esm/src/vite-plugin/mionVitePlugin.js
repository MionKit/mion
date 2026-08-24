import { mionMiddlewarePlugin } from "./middlewareMode.js";
import { createVirtualSiteMap, mionSfcPlugins } from "./sfcTransform.js";
import { createRequire } from "node:module";
import path from "node:path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import tsRuntypes from "@ts-runtypes/devtools/vite";
//#region src/vite-plugin/mionVitePlugin.ts
var legacyBinEnvNoticeShown = false;
var REMOVED_PLUGIN_OPTIONS = {
	aotCaches: "AOT caches are obsolete — the ts-runtypes generated modules ARE the compiled artifact. Delete this option.",
	serverPureFunctions: "pure-fn extraction moved to the serverMapFrom transport. Use `serverMappers: {emit}` on the client build and `serverMappers: {consume}` on the server build."
};
var REMOVED_RUNTYPES_OPTIONS = {
	compilerOptions: "the deepkit type-compiler is gone; there is nothing to configure. Delete this option.",
	include: "scan scope comes from the tsconfig program — narrow `include` in the tsconfig instead.",
	exclude: "scan scope comes from the tsconfig program — narrow `exclude` in the tsconfig instead.",
	reflectionMode: "deepkit reflection is gone; types are resolved at build time and always compiled. Delete this option.",
	reflection: "deepkit reflection is gone; types are resolved at build time and always compiled. Delete this option."
};
/** Throws on any deepkit/AOT-era option a stale config still passes, naming the replacement.
*  Reads through an index signature so untyped JS/JSON configs are caught too, not just typed ones. */
function assertNoRemovedOptions(options) {
	const found = [];
	const root = options;
	for (const [key, hint] of Object.entries(REMOVED_PLUGIN_OPTIONS)) if (root[key] !== void 0) found.push(`  - ${key}: ${hint}`);
	const rt = options.runTypes ?? {};
	for (const [key, hint] of Object.entries(REMOVED_RUNTYPES_OPTIONS)) if (rt[key] !== void 0) found.push(`  - runTypes.${key}: ${hint}`);
	if (found.length === 0) return;
	throw new Error(`[mionVitePlugin] removed option${found.length > 1 ? "s" : ""} in your config (they stopped doing anything at the ts-runtypes migration and are now gone):\n${found.join("\n")}`);
}
/** Resolves the ts-runtypes resolver binary: explicit option → @ts-runtypes/bin getExePath(),
*  which honours the RT_BIN env var and then the published platform package.
*
*  mion deliberately reads NO env var of its own. RT_BIN (@ts-runtypes 0.11.0+) covers BOTH the
*  transform lane and the ESLint lane, whereas mion's old TS_RUNTYPES_BIN reached only this one —
*  and since the two lanes run in SEPARATE processes, a mion-side variable can never make them
*  agree. One variable, both lanes, no divergence.
*
*  ⚠️ No sibling-checkout fallback: the binary VERSION is folded into every typeId, so a locally
*  built binary at a different version silently produces caches that diverge from CI/user installs
*  (the `<typeId>` half of every `<fnHash>_<typeId>` key stops matching; the fnHash prefixes
*  themselves are version-stable since @ts-runtypes 0.9.3). The same caution applies to RT_BIN. */
function resolveRtBinary(explicit) {
	if (explicit) return explicit;
	if (process.env.TS_RUNTYPES_BIN && !process.env.RT_BIN && !legacyBinEnvNoticeShown) {
		legacyBinEnvNoticeShown = true;
		console.warn("[mion] TS_RUNTYPES_BIN is no longer read and is being IGNORED. Use RT_BIN instead — it is honoured by @ts-runtypes/bin for both the vite transform and the ESLint lane, so they cannot end up on different binaries (whose typeIds would diverge).");
	}
}
/**
* Creates the mion Vite plugin (ts-runtypes powered).
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
function mionVitePlugin(options = {}) {
	const rt = options.runTypes ?? {};
	assertNoRemovedOptions(options);
	const manifestPath = resolveManifestPath(options.serverMappers?.emit);
	const harvestedMappers = /* @__PURE__ */ new Map();
	let viteRoot = "";
	const resolveGenDir = () => path.resolve(viteRoot || process.cwd(), rt.genDir ?? rt.outDir ?? "__runtypes");
	const harvestReport = (sites, phase) => {
		if (phase === "build") harvestedMappers.clear();
		for (const site of sites) {
			if (site.calleeName !== "serverMapFrom" || site.calleeModule !== "@mionjs/client") continue;
			harvestedMappers.set(site.key, {
				key: site.key,
				module: site.module ? path.resolve(resolveGenDir(), "types", `${site.module}.js`) : void 0,
				paramNames: site.paramNames,
				code: site.code,
				pureFnDependencies: site.pureFnDependencies
			});
		}
		writeMapperManifest(manifestPath, harvestedMappers);
	};
	if (rt.emitMode === "functions") throw new Error("[mion] emitMode: 'functions' is not supported. mion serializes compiled fns to the client as code strings, and 'functions' omits the code, so every client would fail on first validate. Use 'code' (default) or 'both'.");
	const virtualSites = createVirtualSiteMap();
	let devServer;
	/** Re-transforms the files whose compiled fns just changed, after a type edit elsewhere. */
	const invalidateStaleSites = (siteFiles) => {
		const graph = devServer?.moduleGraph;
		if (!graph?.getModuleById || !graph.invalidateModule) return;
		for (const siteFile of siteFiles) {
			const id = virtualSites.resolve(siteFile) ?? siteFile;
			const mod = graph.getModuleById(id);
			if (mod) graph.invalidateModule(mod);
		}
	};
	const plugins = tsRuntypes({
		binary: resolveRtBinary(rt.binary),
		tsconfig: rt.tsConfig,
		genDir: rt.genDir ?? rt.outDir,
		emitMode: rt.emitMode,
		moduleMode: rt.moduleMode,
		inlineMode: rt.inlineMode,
		transformMode: rt.transformMode,
		failOnError: rt.failOnError ?? true,
		patternSampleCount: rt.patternSampleCount,
		patternSampleRetries: rt.patternSampleRetries,
		jsRuntime: rt.jsRuntime,
		...manifestPath ? {
			pureFnReport: "callback",
			onPureFnReport: harvestReport
		} : {},
		onSiteFilesChanged: invalidateStaleSites
	});
	const extraPlugins = [];
	if (manifestPath) extraPlugins.push({
		name: "mion-server-mappers-root",
		configResolved(config) {
			viteRoot = config.root;
		}
	});
	if (options.serverMappers?.consume) extraPlugins.push(serverMappersConsumePlugin(options.serverMappers.consume, options.serverMappers.injectInto));
	extraPlugins.push(...mionSfcPlugins(findRtPlugin(plugins), rt.sfc !== false, virtualSites));
	extraPlugins.push({
		name: "mion-rt-invalidate",
		configureServer(server) {
			devServer = server;
		}
	});
	if (options.server) {
		const server = options.server;
		const runMode = server.runMode ?? "middleware";
		if (runMode !== "middleware" && runMode !== "childProcess") throw new Error(`[mionVitePlugin] unknown server.runMode '${runMode}'. Use 'middleware' (default: the API runs inside the vite dev server) or 'childProcess' (spawned beside it for e2e). 'buildOnly' is gone — it WAS the AOT harvest mode, and AOT is gone.`);
		if (runMode === "middleware") extraPlugins.unshift(mionMiddlewarePlugin(server, {
			onReady: () => serverReadyResolve?.(),
			onError: (err) => serverReadyReject?.(err)
		}));
		else extraPlugins.unshift({
			name: "mion-server-orchestrator",
			buildStart() {
				startManagedServer(server);
			}
		});
	}
	return [...extraPlugins, plugins];
}
/** The ts-runtypes plugin instance out of whatever `tsRuntypes()` returned (one plugin, or an
*  array of them). The SFC pass delegates to its transform, so it must be the very instance vite
*  runs — a second one would mean a second resolver process and a second program scan. */
function findRtPlugin(created) {
	const queue = [created];
	while (queue.length) {
		const next = queue.shift();
		if (Array.isArray(next)) queue.push(...next);
		else if (typeof next?.transform === "function") return next;
	}
}
/** Resolves the emit option to an absolute manifest path (undefined = harvest disabled). */
function resolveManifestPath(emit) {
	if (!emit) return void 0;
	return path.resolve(emit === true ? ".mion/server-mappers.json" : emit);
}
/** Writes the harvested mappers deterministically (sorted by key; empty array = harvested, none found). */
function writeMapperManifest(manifestPath, mappers) {
	const entries = [...mappers.values()].sort((a, b) => a.key < b.key ? -1 : 1);
	mkdirSync(path.dirname(manifestPath), { recursive: true });
	writeFileSync(manifestPath, JSON.stringify(entries, null, 2) + "\n");
}
/** Filename of the module generated from the consumed manifests, written into `<root>/.mion/`
*  (already gitignored, and the same directory the harvest writes its JSON to). */
var GENERATED_MAPPERS_FILE = "server-mappers.generated.js";
var ROUTER_IMPORT = /from\s*['"]@mionjs\/router['"]/;
var ROUTER_INIT_NAME = /\binitMionRouter\b/;
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
function serverMappersConsumePlugin(consume, injectInto) {
	const manifests = (Array.isArray(consume) ? consume : [consume]).map((manifest) => path.resolve(manifest));
	let isBuildCommand = false;
	let generatedFile = "";
	let targets = [];
	let injected = 0;
	return {
		name: "mion-server-mappers",
		configResolved(config) {
			isBuildCommand = config.command === "build";
			generatedFile = path.resolve(config.root, ".mion", GENERATED_MAPPERS_FILE);
			targets = (Array.isArray(injectInto) ? injectInto : injectInto ? [injectInto] : []).map((target) => path.resolve(config.root, target));
		},
		buildStart() {
			injected = 0;
			mkdirSync(path.dirname(generatedFile), { recursive: true });
			writeFileSync(generatedFile, renderMappersModule(manifests, isBuildCommand));
		},
		transform(code, id) {
			if (id === generatedFile) return;
			if (!(targets.length ? targets.includes(id) : !id.includes("node_modules") && ROUTER_IMPORT.test(code) && ROUTER_INIT_NAME.test(code))) return;
			injected++;
			const from = path.relative(path.dirname(id), generatedFile).split(path.sep).join("/");
			return {
				code: `${code}\nimport '${from.startsWith(".") ? from : `./${from}`}';\n`,
				map: null
			};
		},
		buildEnd() {
			if (!isBuildCommand || injected > 0) return;
			throw new Error("[mionVitePlugin] serverMappers.consume is configured but no module was found to register the mappers into: nothing in this build imports @mionjs/router and calls initMionRouter. Point serverMappers.injectInto at your server entry (it also covers entries reached through a local barrel, or from node_modules).");
		}
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
function renderMappersModule(manifests, isBuildCommand) {
	const header = "// GENERATED by @mionjs/devtools — serverMapFrom transport. Do not edit.\n";
	if (isBuildCommand) {
		const entries = readMapperManifests(manifests);
		const lines = [`import {registerServerMapperTuple, registerServerMappers} from '@mionjs/core';`];
		const withoutModule = [];
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
			lines.push(`registerServerMapperTuple(${key}, Object.values(__mionMapper${index}).find((t) => Array.isArray(t) && t[3] === ${key}));`);
		});
		if (withoutModule.length) lines.push(`registerServerMappers(${JSON.stringify(withoutModule)});`);
		return header + lines.join("\n") + "\n";
	}
	return header + [
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
		""
	].join("\n");
}
/** Absolute path → an import specifier rollup will resolve. Windows separators become '/', and a
*  path is left absolute so it resolves regardless of where the generated module ends up. */
function toImportSpecifier(absolutePath) {
	return absolutePath.split(path.sep).join("/");
}
/** Reads + merges the mapper manifests at BUILD time (missing files fail loud in build mode —
*  a production bundle silently missing its mappers would only fail at request time). */
function readMapperManifests(manifests) {
	const entries = [];
	for (const manifestPath of manifests) {
		if (!existsSync(manifestPath)) throw new Error(`[mionVitePlugin] serverMappers manifest not found at build time: ${manifestPath}. Run the client build (serverMappers.emit) before the server build, or fix the configured path.`);
		entries.push(...JSON.parse(readFileSync(manifestPath, "utf8")));
	}
	return entries;
}
var serverReadyResolve;
var serverReadyReject;
var serverStarted = false;
var serverChild;
/** Resolves once the managed mion server (options.server) accepts connections.
*  Only ever resolves in processes whose running project configured `server` —
*  await it from that project's globalSetup (the old plugin's contract). */
var serverReady = new Promise((resolve, reject) => {
	serverReadyResolve = resolve;
	serverReadyReject = reject;
});
serverReady.catch(() => {});
/** Resolves vite-node's CLI from THIS package's own dependency tree.
*
*  Not `pnpm exec vite-node`: vite-node is a dependency of @mionjs/devtools, not of the consumer,
*  so under a strict (non-hoisting) install it never reaches the consumer's node_modules/.bin and
*  the spawn dies with "Command vite-node not found". It also assumed every consumer runs pnpm.
*  Resolving from here and spawning it with the current node binary is package-manager agnostic
*  and finds the exact vite-node this package was published against. */
function resolveViteNodeCli() {
	const manifestPath = createRequire(import.meta.url).resolve("vite-node/package.json");
	const bin = JSON.parse(readFileSync(manifestPath, "utf8")).bin;
	const relative = typeof bin === "string" ? bin : bin?.["vite-node"];
	if (!relative) throw new Error("[mionVitePlugin] vite-node is installed but declares no `vite-node` bin.");
	return path.resolve(path.dirname(manifestPath), relative);
}
/** Spawns the server entry through vite-node (its own vite config → its own marker injection). */
function startManagedServer(server) {
	if (serverStarted) return;
	serverStarted = true;
	const port = parseInt(server.env?.MION_TEST_PORT ?? process.env.MION_TEST_PORT ?? "8076", 10);
	const waitTimeout = server.waitTimeout ?? 3e4;
	const args = [resolveViteNodeCli()];
	if (server.viteConfig) args.push("--config", server.viteConfig);
	args.push(server.startScript);
	const child = spawn(process.execPath, args, {
		cwd: server.viteConfig ? path.dirname(server.viteConfig) : path.dirname(server.startScript),
		env: {
			...process.env,
			...server.env,
			MION_TEST_SERVER_AUTO_START: "true"
		},
		stdio: [
			"ignore",
			"inherit",
			"inherit"
		]
	});
	child.unref();
	serverChild = child;
	const killChild = () => {
		if (serverChild && !serverChild.killed) serverChild.kill("SIGTERM");
	};
	process.once("exit", killChild);
	child.once("error", (err) => {
		serverChild = void 0;
		serverReadyReject?.(/* @__PURE__ */ new Error(`[mionVitePlugin] failed to spawn managed server: ${err.message}`));
	});
	child.once("exit", (code) => {
		serverChild = void 0;
		if (code && code !== 0) serverReadyReject?.(/* @__PURE__ */ new Error(`[mionVitePlugin] managed server exited with code ${code}`));
	});
	waitForPort(port, waitTimeout).then(() => serverReadyResolve?.(), (err) => {
		killChild();
		serverReadyReject?.(err);
	});
}
/** Polls the port until something accepts a TCP connection (any HTTP response counts). */
async function waitForPort(port, timeoutMs) {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) try {
		await fetch(`http://127.0.0.1:${port}/`, { method: "GET" });
		return;
	} catch {
		await new Promise((resolve) => setTimeout(resolve, 250));
	}
	throw new Error(`[mionVitePlugin] managed server did not accept connections on port ${port} within ${timeoutMs}ms`);
}
//#endregion
export { mionVitePlugin, resolveRtBinary, serverReady };

//# sourceMappingURL=mionVitePlugin.js.map