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
// The core only transforms plain TS/JS ids, and it cannot transform a module that exists nowhere on disk,
// which is exactly what an SFC's <script> is: a marker call in one silently failed at RUNTIME instead. So the
// script is REGISTERED under a virtual path first (setSources + scanFiles + generate, the same thing
// src/lint/lint-worker.ts does with the text ESLint hands it) and then transformed under that path. The virtual
// path sits NEXT TO the .vue file, so the relative import the transform emits resolves from the .vue module
// unchanged. This runs BEFORE @vitejs/plugin-vue: plugin-vue's `compileScript` is SYNCHRONOUS and the resolver
// round-trip is not, and everything after plugin-vue sees a script whose generics and type imports esbuild
// has already erased. plugin-vue then compiles a script that already carries its compiled fns.

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

/** Cheap gate before any parsing, mirroring the core's own marker probes: an SFC with no mion code costs
 *  one regex and nothing else. */
const MARKER_PROBE = /['"]@mionjs\/|registerPureFn/;
/** With BOTH <script> and <script setup>, the two are registered as ONE module so a type declared in one
 *  resolves for a marker call in the other (Vue merges them too). A comment line is never edited. */
const BLOCK_SPLIT = '\n// #mion-sfc-block\n';

/** Vue's plugin, whose resolved compiler is borrowed so parsing uses the project's own @vue/compiler-sfc. */
const VUE_PLUGIN_NAME = 'vite:vue';

/** Maps the virtual script path an SFC is registered under back to the real `.vue` file. */
export interface VirtualSiteMap {
  /** Records that `virtualPath` stands in for `realFile`. */
  register(virtualPath: string, realFile: string): void;
  /** The real module id for a site file, or undefined when it is already real. */
  resolve(siteFile: string): string | undefined;
}

/** The virtual->real map, shared because it has to exist BEFORE the mion plugin is constructed (the handler
 *  is one of its options) and before the SFC pass runs (it fills the map), so neither can own it. */
export function createVirtualSiteMap(): VirtualSiteMap {
  const toReal = new Map<string, string>();
  // Normalise BOTH separators, not just this platform's: the virtual path is built from a vite id and the
  // site files come from the resolver's own program paths, so keying on `path.sep` alone leaves the match
  // dependent on which side used which separator. A miss here is silent, the .vue file just stays stale.
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

/** The injector (before plugin-vue) and the audit (after it). The audit is wired even when the injector is
 *  off: an SFC shipping a marker with no compiled fns is the silent failure this feature exists to end. */
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

  /** plugin-vue's own compiler first (the version the project compiles with), then a resolve from the root. */
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

  /** `rtHotUpdate` is the documented escape hatch for a host with no HMR hook of its own: it takes
   *  {file, content} pairs and runs setSources → scanFiles → generate, which is all it takes to make a source
   *  that exists nowhere on disk visible to the resolver. `handleHotUpdate` reaches the same leaf and is kept
   *  as a fallback so an older plugin still works. */
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
      // Record the stand-in BEFORE delegating: stale site files are reported under the virtual path while the
      // module vite serves is `file`, and without the mapping a .vue file keeps serving the old shape's
      // validator after a type edit that the project's .ts files recover from.
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

  // Silence is the defect this feature fixes, so a marker reaching the browser without its compiled fns must
  // be audible whatever the cause: plugin ordering, a plugin-vue change, an SFC shape the injector skipped.
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

/** Keeps the injected code on the SAME number of lines as the source it replaces: the prepended import block
 *  would otherwise shift every line below the script and break plugin-vue's source map. */
function foldImportBlock(source: string, transformed: string): string {
  const extra = transformed.split('\n').length - source.split('\n').length;
  if (extra <= 0) return transformed;
  const lines = transformed.split('\n');
  const importBlock = lines.slice(0, extra).join(' ');
  const rest = lines.slice(extra);
  rest[0] = `${importBlock} ${rest[0]}`;
  return rest.join('\n');
}
