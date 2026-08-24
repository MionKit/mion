import { createRequire } from "node:module";
import path from "node:path";
//#region src/vite-plugin/sfcTransform.ts
/** Cheap gate before any parsing — mirrors @ts-runtypes/devtools' own marker probes, so an SFC with
*  no mion/ts-runtypes code costs one regex and nothing else. */
var MARKER_PROBE = /['"]@ts-runtypes\/core|['"]@mionjs\/|registerPureFn/;
/** Marks the boundary when an SFC has BOTH <script> and <script setup>: they are registered as ONE
*  module so a type declared in one resolves for a marker call in the other (Vue merges them too),
*  then split apart again. A comment line is never touched by the transform's edits. */
var BLOCK_SPLIT = "\n// #mion-sfc-block\n";
/** Vue's plugin, whose resolved compiler mion borrows so it always parses with the project's own
*  @vue/compiler-sfc version. */
var VUE_PLUGIN_NAME = "vite:vue";
/** Builds the virtual->real map shared by the SFC pass and the invalidation handler.
*
*  It has to exist BEFORE the ts-runtypes plugin is constructed (the handler is one of its
*  options) and before the SFC pass runs (it fills the map), so neither can own it. Paths are
*  normalised to forward slashes because ts-runtypes reports site files that way. */
function createVirtualSiteMap() {
	const toReal = /* @__PURE__ */ new Map();
	const key = (file) => file.replace(/\\/g, "/");
	return {
		register(virtualPath, realFile) {
			toReal.set(key(virtualPath), realFile);
		},
		resolve(siteFile) {
			return toReal.get(key(siteFile));
		}
	};
}
function mionSfcPlugins(rt, inject = true, virtualSites) {
	let root = "";
	let vuePlugins = [];
	let fallbackCompiler;
	const warned = /* @__PURE__ */ new Set();
	/** Files this run injected into, so the audit only reports what really slipped through. */
	const injected = /* @__PURE__ */ new Set();
	const warnOnce = (key, message) => {
		if (warned.has(key)) return;
		warned.add(key);
		console.warn(`[mion] ${message}`);
	};
	/** plugin-vue's own compiler first (same version the project compiles with), then a plain
	*  resolve from the vite root. */
	const resolveCompiler = () => {
		for (const plugin of vuePlugins) {
			const compiler = plugin.api?.options?.compiler;
			if (compiler?.parse) return compiler;
		}
		if (fallbackCompiler) return fallbackCompiler;
		try {
			fallbackCompiler = createRequire(path.join(root || process.cwd(), "index.js"))("vue/compiler-sfc");
		} catch {
			return;
		}
		return fallbackCompiler;
	};
	/** Registers the script with the resolver, then transforms it through the ts-runtypes plugin.
	*
	*  `rtHotUpdate` is ts-runtypes' documented escape hatch for exactly this: "the escape hatch a
	*  host with no HMR hook of its own uses to absorb an edit" — it takes {file, content} pairs and
	*  runs setSources → scanFiles → generate, which is all mion needs to make a source that exists
	*  nowhere on disk visible to the resolver. mion used to fabricate a vite HMR context and call
	*  `handleHotUpdate` instead, which reached the same shared leaf but used a hook for something
	*  other than what it is named for. Kept as a fallback so an older plugin still works. */
	async function injectFns(ctx, source, virtualPath) {
		const plugin = rt;
		const absorb = plugin?.rtHotUpdate;
		const legacyRegister = plugin?.handleHotUpdate ?? plugin?.vite?.handleHotUpdate;
		if (typeof absorb !== "function" && typeof legacyRegister !== "function" || typeof plugin?.transform !== "function") {
			warnOnce("no-delegate", `the ts-runtypes plugin exposes no transform/rtHotUpdate — Vue SFCs cannot be type-transformed.`);
			return;
		}
		if (typeof absorb === "function") await absorb(ctx, [{
			file: virtualPath,
			content: source
		}]);
		else await legacyRegister.call(ctx, {
			file: virtualPath,
			read: async () => source,
			modules: [],
			timestamp: 0
		});
		const result = await plugin.transform.call(ctx, source, virtualPath);
		const code = typeof result === "string" ? result : result?.code;
		return typeof code === "string" ? foldImportBlock(source, code) : void 0;
	}
	const injector = {
		name: "mion-sfc",
		enforce: "pre",
		configResolved(config) {
			root = config.root;
			vuePlugins = config.plugins.filter((plugin) => plugin.name === VUE_PLUGIN_NAME);
		},
		async transform(code, id) {
			const file = bareVueFile(id);
			if (!file || !MARKER_PROBE.test(code)) return null;
			const relative = path.relative(root, file);
			if (relative.startsWith("..") || path.isAbsolute(relative)) {
				warnOnce(file, `${file} is outside the vite root, so its typed mion code cannot be transformed.`);
				return null;
			}
			const compiler = resolveCompiler();
			if (!compiler) {
				warnOnce("no-compiler", `@vue/compiler-sfc is not resolvable, so typed mion code in .vue files is NOT transformed.`);
				return null;
			}
			const { descriptor } = compiler.parse(code, { filename: file });
			const blocks = [descriptor.script, descriptor.scriptSetup].filter((b) => !!b && !b.src);
			if (!blocks.length) return null;
			const virtualPath = `${file}.${blocks.find((block) => block.lang)?.lang ?? "js"}`;
			virtualSites?.register(virtualPath, file);
			const source = blocks.map((block) => block.content).join(BLOCK_SPLIT);
			const result = await injectFns(this, source, virtualPath);
			if (!result) return null;
			const parts = result.split(BLOCK_SPLIT);
			if (parts.length !== blocks.length) {
				warnOnce(`${file}:split`, `could not map the transformed script back onto ${file} — leaving it untransformed.`);
				return null;
			}
			let next = code;
			for (let index = blocks.length - 1; index >= 0; index--) {
				const block = blocks[index];
				next = next.slice(0, block.loc.start.offset) + parts[index] + next.slice(block.loc.end.offset);
			}
			injected.add(file);
			return {
				code: next,
				map: null
			};
		}
	};
	const audit = {
		name: "mion-sfc-audit",
		enforce: "post",
		transform(code, id) {
			const file = bareVueFile(id);
			if (!file || injected.has(file) || !MARKER_PROBE.test(code)) return null;
			if (code.includes("__rt_")) return null;
			warnOnce(`${file}:audit`, `${file} calls a mion/ts-runtypes marker but was compiled WITHOUT its generated functions. They would fail at runtime. Make sure @vitejs/plugin-vue is in this vite config and that no plugin transforms .vue files before mion does.`);
			return null;
		}
	};
	return inject ? [injector, audit] : [audit];
}
/** The SFC module itself — not `?vue&type=…` sub-requests, and not framework passes like Nuxt's
*  `?macro=true`, which are separate transforms of the same file. */
function bareVueFile(id) {
	const [file, query] = id.split("?");
	if (query !== void 0 || !file.endsWith(".vue")) return void 0;
	return file;
}
/** Keeps the injected code on the SAME number of lines as the source it replaces: the transform
*  prepends its import block, which would otherwise shift every line of the SFC below the script and
*  break plugin-vue's source map. Folding that block onto the first line keeps every line number. */
function foldImportBlock(source, transformed) {
	const extra = transformed.split("\n").length - source.split("\n").length;
	if (extra <= 0) return transformed;
	const lines = transformed.split("\n");
	const importBlock = lines.slice(0, extra).join(" ");
	const rest = lines.slice(extra);
	rest[0] = `${importBlock} ${rest[0]}`;
	return rest.join("\n");
}
//#endregion
export { createVirtualSiteMap, mionSfcPlugins };

//# sourceMappingURL=sfcTransform.js.map