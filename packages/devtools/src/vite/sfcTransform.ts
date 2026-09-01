/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import path from 'node:path';
import {createRequire} from 'node:module';
import type {Plugin} from 'vite';

// ############# Vue SFC support #############
// Typed mion code inside a `.vue` <script> used to be silently untransformed: the runtypes core
// only transforms plain TS/JS ids, so a marker call in an SFC never got its compiled fns and failed
// at RUNTIME (missing fns, or a route that never validates) instead of at build time.
//
// The engine was never the problem. The resolver holds ONE whole-program view built from the
// tsconfig and resolves imports through it — including files outside the tsconfig `include` and
// types from node_modules. What it cannot do is transform a module that exists nowhere on disk,
// which is exactly what an SFC's <script> is. The fix is to REGISTER that script under a virtual
// path first, which is the same thing the package's own ESLint lane does with the text ESLint hands
// it (`dist/lint/lint-worker.js`: setSources → scanFiles):
//
//     rt.handleHotUpdate({file: '<Comp.vue>.ts', read: () => script})   setSources + scanFiles + generate
//     rt.transform(script, '<Comp.vue>.ts')                            → injected code
//
// The virtual path sits NEXT TO the .vue file, so the relative import the transform emits
// (`./__runtypes/types/<hash>.js`) resolves from the .vue module unchanged.
//
// Why this runs BEFORE @vitejs/plugin-vue rather than inside it: plugin-vue exposes its compiler
// through `api.options`, but `compileScript` is SYNCHRONOUS and the resolver round-trip is not, so
// there is no way to await inside it. Everything after plugin-vue is too late — it hands the script
// to esbuild, and by the time any later plugin sees the module the generics and type imports are
// already erased. So mion injects into the SFC source itself; plugin-vue then compiles a script that
// already carries its compiled fns.

/** Structural subset of @vue/compiler-sfc that this file uses (borrowed from plugin-vue). */
interface SfcBlock {
  content: string;
  lang?: string;
  src?: string;
  loc: {start: {offset: number}; end: {offset: number}};
}
interface SfcParseResult {
  descriptor: {script: SfcBlock | null; scriptSetup: SfcBlock | null};
}
interface SfcCompiler {
  parse(source: string, options?: {filename?: string}): SfcParseResult;
}

/** Cheap gate before any parsing — mirrors the runtypes core' own marker probes, so an SFC with
 *  no mion code costs one regex and nothing else. */
const MARKER_PROBE = /['"]@mionjs\/|registerPureFn/;
/** Marks the boundary when an SFC has BOTH <script> and <script setup>: they are registered as ONE
 *  module so a type declared in one resolves for a marker call in the other (Vue merges them too),
 *  then split apart again. A comment line is never touched by the transform's edits. */
const BLOCK_SPLIT = '\n// #mion-sfc-block\n';

/** Vue's plugin, whose resolved compiler mion borrows so it always parses with the project's own
 *  @vue/compiler-sfc version. */
const VUE_PLUGIN_NAME = 'vite:vue';

/** The mion SFC plugins: the injector (runs before plugin-vue) and the audit (runs after it).
 *  The audit is wired even when the injector is off — an SFC shipping a marker with no compiled fns
 *  is precisely the silent failure this feature exists to end, and turning the pass off does not
 *  make it safe, only quiet. */
/** Maps the virtual script path an SFC is registered under back to the real `.vue` file. */
export interface VirtualSiteMap {
  /** Records that `virtualPath` stands in for `realFile`. */
  register(virtualPath: string, realFile: string): void;
  /** The real module id for a site file, or undefined when it is already real. */
  resolve(siteFile: string): string | undefined;
}

/** Builds the virtual->real map shared by the SFC pass and the invalidation handler.
 *
 *  It has to exist BEFORE the mion plugin is constructed (the handler is one of its
 *  options) and before the SFC pass runs (it fills the map), so neither can own it. Paths are
 *  normalised to forward slashes because mion reports site files that way. */
export function createVirtualSiteMap(): VirtualSiteMap {
  const toReal = new Map<string, string>();
  // Normalise BOTH separators, not just this platform's. The two sides come from different
  // producers — mion builds the virtual path from a vite id, mion reports its own program
  // paths — so keying on `path.sep` alone leaves the match dependent on which of them happened to
  // use which separator. A miss here is silent: the .vue file just stays stale.
  const key = (file: string): string => file.replace(/\\/g, '/');
  return {
    register(virtualPath, realFile) {
      toReal.set(key(virtualPath), realFile);
    },
    resolve(siteFile) {
      return toReal.get(key(siteFile));
    },
  };
}

export function mionSfcPlugins(rt: Plugin | undefined, inject = true, virtualSites?: VirtualSiteMap): Plugin[] {
  let root = '';
  let vuePlugins: {api?: {options?: {compiler?: SfcCompiler}}}[] = [];
  let fallbackCompiler: SfcCompiler | undefined;
  const warned = new Set<string>();
  /** Files this run injected into, so the audit only reports what really slipped through. */
  const injected = new Set<string>();

  const warnOnce = (key: string, message: string): void => {
    if (warned.has(key)) return;
    warned.add(key);
    console.warn(`[mion] ${message}`);
  };

  /** plugin-vue's own compiler first (same version the project compiles with), then a plain
   *  resolve from the vite root. */
  const resolveCompiler = (): SfcCompiler | undefined => {
    for (const plugin of vuePlugins) {
      const compiler = plugin.api?.options?.compiler;
      if (compiler?.parse) return compiler;
    }
    if (fallbackCompiler) return fallbackCompiler;
    try {
      const require = createRequire(path.join(root || process.cwd(), 'index.js'));
      fallbackCompiler = require('vue/compiler-sfc') as SfcCompiler;
    } catch {
      return undefined;
    }
    return fallbackCompiler;
  };

  /** Registers the script with the resolver, then transforms it through the mion plugin.
   *
   *  `rtHotUpdate` is mion' documented escape hatch for exactly this: "the escape hatch a
   *  host with no HMR hook of its own uses to absorb an edit" — it takes {file, content} pairs and
   *  runs setSources → scanFiles → generate, which is all mion needs to make a source that exists
   *  nowhere on disk visible to the resolver. mion used to fabricate a vite HMR context and call
   *  `handleHotUpdate` instead, which reached the same shared leaf but used a hook for something
   *  other than what it is named for. Kept as a fallback so an older plugin still works. */
  async function injectFns(ctx: unknown, source: string, virtualPath: string): Promise<string | undefined> {
    const plugin = rt as unknown as Record<string, any>;
    const absorb = plugin?.rtHotUpdate;
    const legacyRegister = plugin?.handleHotUpdate ?? plugin?.vite?.handleHotUpdate;
    if ((typeof absorb !== 'function' && typeof legacyRegister !== 'function') || typeof plugin?.transform !== 'function') {
      warnOnce('no-delegate', `the mion plugin exposes no transform/rtHotUpdate — Vue SFCs cannot be type-transformed.`);
      return undefined;
    }
    if (typeof absorb === 'function') await absorb(ctx, [{file: virtualPath, content: source}]);
    else await legacyRegister.call(ctx, {file: virtualPath, read: async () => source, modules: [], timestamp: 0});
    const result = await plugin.transform.call(ctx, source, virtualPath);
    const code = typeof result === 'string' ? result : result?.code;
    return typeof code === 'string' ? foldImportBlock(source, code) : undefined;
  }

  const injector: Plugin = {
    name: 'mion-sfc',
    // before @vitejs/plugin-vue: it is the last point where the script still carries its types
    enforce: 'pre',

    configResolved(config) {
      root = config.root;
      vuePlugins = config.plugins.filter((plugin) => plugin.name === VUE_PLUGIN_NAME) as typeof vuePlugins;
    },

    async transform(code, id) {
      const file = bareVueFile(id);
      if (!file || !MARKER_PROBE.test(code)) return null;
      const relative = path.relative(root, file);
      if (relative.startsWith('..') || path.isAbsolute(relative)) {
        warnOnce(file, `${file} is outside the vite root, so its typed mion code cannot be transformed.`);
        return null;
      }
      const compiler = resolveCompiler();
      if (!compiler) {
        warnOnce('no-compiler', `@vue/compiler-sfc is not resolvable, so typed mion code in .vue files is NOT transformed.`);
        return null;
      }

      const {descriptor} = compiler.parse(code, {filename: file});
      // `src` blocks point at a real file the resolver already sees through the program.
      const blocks = [descriptor.script, descriptor.scriptSetup].filter((b): b is SfcBlock => !!b && !b.src);
      if (!blocks.length) return null;

      const lang = blocks.find((block) => block.lang)?.lang ?? 'js';
      const virtualPath = `${file}.${lang}`;
      // Record the stand-in BEFORE delegating: mion reports stale site files by the
      // path it knows them under (the virtual one), and the module vite actually serves is
      // `file`. Without this the .ts files in a project recover from a type edit while the
      // .vue files keep serving a validator for the old shape.
      virtualSites?.register(virtualPath, file);
      const source = blocks.map((block) => block.content).join(BLOCK_SPLIT);
      const result = await injectFns(this, source, virtualPath);
      if (!result) return null;

      const parts = result.split(BLOCK_SPLIT);
      if (parts.length !== blocks.length) {
        warnOnce(`${file}:split`, `could not map the transformed script back onto ${file} — leaving it untransformed.`);
        return null;
      }
      // last block first: splicing from the end keeps the earlier block's offsets valid
      let next = code;
      for (let index = blocks.length - 1; index >= 0; index--) {
        const block = blocks[index];
        next = next.slice(0, block.loc.start.offset) + parts[index] + next.slice(block.loc.end.offset);
      }
      injected.add(file);
      return {code: next, map: null};
    },
  };

  // Silence is the defect this whole feature fixes, so a marker that reaches the browser without
  // its compiled fns must be audible — whatever the cause (plugin ordering, a plugin-vue change,
  // an SFC shape the injector skipped).
  const audit: Plugin = {
    name: 'mion-sfc-audit',
    enforce: 'post',

    transform(code, id) {
      const file = bareVueFile(id);
      if (!file || injected.has(file) || !MARKER_PROBE.test(code)) return null;
      if (code.includes('__rt_')) return null;
      warnOnce(
        `${file}:audit`,
        `${file} calls a mion marker but was compiled WITHOUT its generated functions. ` +
          `They would fail at runtime. Make sure @vitejs/plugin-vue is in this vite config and that no ` +
          `plugin transforms .vue files before mion does.`
      );
      return null;
    },
  };

  return inject ? [injector, audit] : [audit];
}

/** The SFC module itself — not `?vue&type=…` sub-requests, and not framework passes like Nuxt's
 *  `?macro=true`, which are separate transforms of the same file. */
function bareVueFile(id: string): string | undefined {
  const [file, query] = id.split('?');
  if (query !== undefined || !file.endsWith('.vue')) return undefined;
  return file;
}

/** Keeps the injected code on the SAME number of lines as the source it replaces: the transform
 *  prepends its import block, which would otherwise shift every line of the SFC below the script and
 *  break plugin-vue's source map. Folding that block onto the first line keeps every line number. */
function foldImportBlock(source: string, transformed: string): string {
  const extra = transformed.split('\n').length - source.split('\n').length;
  if (extra <= 0) return transformed;
  const lines = transformed.split('\n');
  const importBlock = lines.slice(0, extra).join(' ');
  const rest = lines.slice(extra);
  rest[0] = `${importBlock} ${rest[0]}`;
  return rest.join('\n');
}
