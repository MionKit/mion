/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

/** Vite plugin for mion — a thin preset over the runtypes core */
export {mionVitePlugin, resolveRtBinary} from './mionVitePlugin.ts';
export type {
  MionClientPointer,
  MionPluginOptions,
  MionRunTypesOptions,
  MionServerBuildOptions,
  MionServerOptions,
} from './mionVitePlugin.ts';

/** Paths middleware mode leaves to vite when the router has no basePath. Extend it, don't replace it, unless
 *  you know every vite-internal URL you would take over. */
export {DEFAULT_MIDDLEWARE_EXCLUDE} from './middlewareMode.ts';

export {cjsPackageJsonPlugin} from './cjsPackageJsonPlugin.ts';

export {collectBuildEntries} from './buildEntries.ts';
