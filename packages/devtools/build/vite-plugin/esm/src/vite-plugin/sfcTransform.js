import path from "node:path";
import { createRequire } from "node:module";
const MARKER_PROBE = /['"]@ts-runtypes\/core|['"]@mionjs\/|registerPureFn/;
const BLOCK_SPLIT = "\n// #mion-sfc-block\n";
const VUE_PLUGIN_NAME = "vite:vue";
function mionSfcPlugins(rt, inject = true) {
  let root = "";
  let vuePlugins = [];
  let fallbackCompiler;
  const warned = /* @__PURE__ */ new Set();
  const injected = /* @__PURE__ */ new Set();
  const warnOnce = (key, message) => {
    if (warned.has(key)) return;
    warned.add(key);
    console.warn(`[mion] ${message}`);
  };
  const resolveCompiler = () => {
    for (const plugin of vuePlugins) {
      const compiler = plugin.api?.options?.compiler;
      if (compiler?.parse) return compiler;
    }
    if (fallbackCompiler) return fallbackCompiler;
    try {
      const require2 = createRequire(path.join(root || process.cwd(), "index.js"));
      fallbackCompiler = require2("vue/compiler-sfc");
    } catch {
      return void 0;
    }
    return fallbackCompiler;
  };
  async function injectFns(ctx, source, virtualPath) {
    const plugin = rt;
    const register = plugin?.handleHotUpdate ?? plugin?.vite?.handleHotUpdate;
    if (typeof register !== "function" || typeof plugin?.transform !== "function") {
      warnOnce(
        "no-delegate",
        `the ts-runtypes plugin exposes no transform/handleHotUpdate — Vue SFCs cannot be type-transformed.`
      );
      return void 0;
    }
    await register.call(ctx, { file: virtualPath, read: async () => source, modules: [], timestamp: 0 });
    const result = await plugin.transform.call(ctx, source, virtualPath);
    const code = typeof result === "string" ? result : result?.code;
    return typeof code === "string" ? foldImportBlock(source, code) : void 0;
  }
  const injector = {
    name: "mion-sfc",
    // before @vitejs/plugin-vue: it is the last point where the script still carries its types
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
        warnOnce(
          "no-compiler",
          `@vue/compiler-sfc is not resolvable, so typed mion code in .vue files is NOT transformed.`
        );
        return null;
      }
      const { descriptor } = compiler.parse(code, { filename: file });
      const blocks = [descriptor.script, descriptor.scriptSetup].filter((b) => !!b && !b.src);
      if (!blocks.length) return null;
      const lang = blocks.find((block) => block.lang)?.lang ?? "js";
      const virtualPath = `${file}.${lang}`;
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
      return { code: next, map: null };
    }
  };
  const audit = {
    name: "mion-sfc-audit",
    enforce: "post",
    transform(code, id) {
      const file = bareVueFile(id);
      if (!file || injected.has(file) || !MARKER_PROBE.test(code)) return null;
      if (code.includes("__rt_")) return null;
      warnOnce(
        `${file}:audit`,
        `${file} calls a mion/ts-runtypes marker but was compiled WITHOUT its generated functions. They would fail at runtime. Make sure @vitejs/plugin-vue is in this vite config and that no plugin transforms .vue files before mion does.`
      );
      return null;
    }
  };
  return inject ? [injector, audit] : [audit];
}
function bareVueFile(id) {
  const [file, query] = id.split("?");
  if (query !== void 0 || !file.endsWith(".vue")) return void 0;
  return file;
}
function foldImportBlock(source, transformed) {
  const extra = transformed.split("\n").length - source.split("\n").length;
  if (extra <= 0) return transformed;
  const lines = transformed.split("\n");
  const importBlock = lines.slice(0, extra).join(" ");
  const rest = lines.slice(extra);
  rest[0] = `${importBlock} ${rest[0]}`;
  return rest.join("\n");
}
export {
  mionSfcPlugins
};
//# sourceMappingURL=sfcTransform.js.map
