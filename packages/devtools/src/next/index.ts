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
//                  vite reaches Next in the same commit
//   ports          the batch HARVEST — `onPureFnReport` / `onBatchReport` are
//                  universal hooks fired inside buildStart, and the broker runs
//                  buildStart, so the callbacks work here. Loader options cross into the
//                  Turbopack worker as plain JSON with no functions, which is
//                  why it is set on the BROKER and not through the rules.
//   does NOT port  the batch CONSUME half. That one injects an import
//                  into the module calling initMionRouter, which is the mion API
//                  server — a separate process that vite builds. Next never
//                  sees it, so it stays on the vite preset.
//   does NOT port  the Vue SFC pass (not a Next concern) and middleware mode /
//                  the managed server (Next runs its own dev server).
//   does NOT port  module-graph invalidation. The broker declares typeDeps AND a
//                  stamp to Turbopack, which covers staleness including ambient
//                  types that have no import edge to follow.
import {withRunTypes, type NextOptions} from '../runtypes/next/index.ts';
import {
  assertNoRemovedOptions,
  createBatchHarvest,
  resolveGenDir,
  toRunTypesOptions,
  type MionPresetOptions,
} from '../options.ts';

export type {NextOptions};
export {
  isTurbopack,
  ownsBroker,
  runTypesTurbopackRules,
  socketPathFor,
  startBroker,
  RUNTYPES_LOADER,
} from '../runtypes/next/index.ts';

/** Options for the mion Next preset. Same `runTypes` and `batches` blocks the
 *  vite preset takes; `server` and the Vue SFC switch have no meaning here. */
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
  const rt = options.runTypes ?? {};
  const root = options.cwd ?? process.cwd();
  const resolverOptions: NextOptions = {...toRunTypesOptions(rt), cwd: root};

  // Harvest runs in the CLIENT build, and under Next that IS this build. The callback
  // lives in the next.config process alongside the broker, so it stays a real function.
  const {manifestPath, harvestMappers, harvestBatches} = createBatchHarvest(options.batches?.emit, () => resolveGenDir(root, rt));
  if (manifestPath) {
    resolverOptions.pureFnReport = 'callback';
    resolverOptions.onPureFnReport = harvestMappers;
    resolverOptions.onBatchReport = harvestBatches;
  }

  return withRunTypes(nextConfig, resolverOptions);
}

export default withMion;
