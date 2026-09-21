/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// mion on Next.js, COMPOSED from the pieces ../runtypes/next exports individually rather than nesting one
// wrapper in another: Turbopack has no plugin API and runs no webpack PLUGINS, so that lane is a broker started
// from `next.config` plus a `turbopack.rules` loader that asks it to rewrite each file, while `next --webpack`
// falls back to the ordinary unplugin webpack plugin. ⚠️ Read ../runtypes/next/CLAUDE.md before changing
// anything here or there: it records invariants that look like cleanups and are not. mion adds only the shared
// option mapping (./options.ts), so a knob added for vite reaches Next in the same commit, `client` pointer
// included. Nothing of the batch transport is ported: the SERVER build generates the table and mapper modules,
// so a Next app that is the client does nothing. No Vue SFC pass, no `server` block (Next runs its own dev
// server and builds the API route itself) and no module-graph invalidation, the broker declaring typeDeps plus
// a stamp to Turbopack instead, which covers ambient types that have no import edge to follow.
import {withRunTypes, type NextOptions} from '../runtypes/next/index.ts';
import {toRunTypesOptions, type MionPresetOptions} from '../options.ts';

export type {NextOptions};
export {
  isTurbopack,
  ownsBroker,
  runTypesTurbopackRules,
  socketPathFor,
  startBroker,
  RUNTYPES_LOADER,
} from '../runtypes/next/index.ts';

/** Same `runTypes` block and `client` pointer the vite preset takes. No `server` block (Next runs its own dev
 *  server), and the Vue SFC switch and the run modes have no meaning under Next. */
export interface MionNextOptions extends MionPresetOptions {
  /** Project root the broker scans. Defaults to `process.cwd()`, where Next evaluates `next.config`. */
  cwd?: string;
}

// A structural view of NextConfig, so the package takes no dependency on `next` to describe what it returns.
type NextConfigLike = Record<string, unknown>;

/**
 * Wraps a Next config so mion's build transform runs on both bundlers.
 *
 * `next.config.ts` must AWAIT it: the whole-program scan has to finish before Turbopack starts handing
 * files to loader workers, and there is no later hook to wait in.
 *
 * ```ts
 * import {withMion} from '@mionjs/devtools/next';
 * export default await withMion({reactStrictMode: true});
 * ```
 */
export async function withMion(nextConfig: NextConfigLike = {}, options: MionNextOptions = {}): Promise<NextConfigLike> {
  if ((options as Record<string, unknown>).server !== undefined) {
    throw new Error(
      `[withMion] there is no \`server\` option: Next runs its own dev server and builds your API route ` +
        `with everything else. Serve the API from an \`app/api/[...mion]/route.ts\` handler, or, when it is a ` +
        `separate project, point that project's plugin at this app's tsconfig with \`client.tsConfig\`.`
    );
  }
  const rt = options.runTypes ?? {};
  const root = options.cwd ?? process.cwd();
  const resolverOptions: NextOptions = {
    ...toRunTypesOptions(rt, options.client, {api: options.api, bundleApi: options.bundleApi}),
    cwd: root,
  };
  return withRunTypes(nextConfig, resolverOptions);
}

export default withMion;
