/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// @mionjs/devtools/next — mion on Next.js.
//
// Turbopack has no plugin API and does not run webpack PLUGINS, so this lane is
// not an unplugin adapter: `next.config` is plain Node and runs before any
// bundler worker exists, so it starts a broker holding the one resolver, and a
// webpack-style loader registered through `turbopack.rules` asks that broker to
// rewrite each file over a unix socket. `next --webpack` falls back to the
// ordinary unplugin webpack plugin. All of that already lives in
// ../runtypes/next, which exports its pieces individually precisely so this
// file can COMPOSE them rather than nest one wrapper inside another.
//
// ⚠️ Read ../runtypes/next/CLAUDE.md before changing anything here or there. It
// records the invariants that look like cleanups and are not.
//
// What mion adds on top is deliberately small, because most of the vite preset
// has no Next counterpart:
//
//   ports          the shared option mapping (./options.ts), so a knob added for
//                  vite reaches Next in the same commit — the `client` pointer
//                  included, for the rare Next app that hosts the mion API and
//                  serves batches to a separate client project.
//   does NOT port  anything of the batch transport itself. The SERVER build's
//                  resolver generates the batch table and the mapper modules and
//                  appends the import inside the transform, so a Next app that is
//                  the client (the usual case) does nothing: its API's own build
//                  points at this app's tsconfig.
//   does NOT port  the Vue SFC pass (not a Next concern) and middleware mode /
//                  the managed server (Next runs its own dev server).
//   does NOT port  module-graph invalidation. The broker declares typeDeps AND a
//                  stamp to Turbopack, which covers staleness including ambient
//                  types that have no import edge to follow.
import {withRunTypes, type NextOptions} from '../runtypes/next/index.ts';
import {assertNoRemovedOptions, toRunTypesOptions, type MionPresetOptions} from '../options.ts';

export type {NextOptions};
export {
  isTurbopack,
  ownsBroker,
  runTypesTurbopackRules,
  socketPathFor,
  startBroker,
  RUNTYPES_LOADER,
} from '../runtypes/next/index.ts';

/** Options for the mion Next preset. Same `runTypes` block and `client` pointer the vite preset
 *  takes. There is no `server` block: Next runs its own dev server, and the batch transport needs
 *  no pointer from a client. The Vue SFC switch and the run modes have no meaning under Next. */
export interface MionNextOptions extends MionPresetOptions {
  /** Project root the broker scans. Defaults to `process.cwd()`, which is where Next
   *  evaluates `next.config`. */
  cwd?: string;
}

// A minimal structural view of NextConfig, so the package takes no dependency on
// `next` just to describe the object it returns.
type NextConfigLike = Record<string, unknown>;

/**
 * Wraps a Next config so mion's build transform runs on both bundlers: the Turbopack
 * loader plus the broker, and the unplugin webpack plugin for `next --webpack`.
 *
 * `next.config.ts` must AWAIT it. The whole-program scan has to finish before Turbopack
 * starts handing files to loader workers, and there is no later hook to wait in.
 *
 * ```ts
 * import {withMion} from '@mionjs/devtools/next';
 * export default await withMion({reactStrictMode: true});
 * ```
 */
export async function withMion(nextConfig: NextConfigLike = {}, options: MionNextOptions = {}): Promise<NextConfigLike> {
  assertNoRemovedOptions(options);
  if ((options as Record<string, unknown>).server !== undefined) {
    throw new Error(
      `[withMion] the \`server\` option is gone: a Next app is the client, and the batch transport is generated ` +
        `by the API's own build. Delete it; point the API's plugin at this app's tsconfig with \`client.tsConfig\` instead.`
    );
  }
  const rt = options.runTypes ?? {};
  const root = options.cwd ?? process.cwd();
  const resolverOptions: NextOptions = {...toRunTypesOptions(rt, options.client), cwd: root};
  return withRunTypes(nextConfig, resolverOptions);
}

export default withMion;
