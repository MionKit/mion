/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Turbopack has no plugin API; compose the broker and loader from ../runtypes/next rather than nesting wrappers.
// Next owns the dev server and API build; the server generates tables and mappers, so a client app generates none.
// Shared ./options.ts mapping keeps Vite and Next options aligned, including client pointers.
// Type dependencies plus a stamp cover ambient types with no import edge; read ../runtypes/next/AGENTS.md before editing.
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

/** The vite preset's options minus `server` (Next runs its own dev server); the Vue SFC switch means nothing here. */
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
        `with everything else. Serve the API from an \`app/api/[...mion]/route.ts\` handler.`
    );
  }
  const root = options.cwd ?? process.cwd();
  const resolverOptions: NextOptions = {
    ...toRunTypesOptions(options),
    cwd: root,
  };
  return withRunTypes(nextConfig, resolverOptions);
}

export default withMion;
