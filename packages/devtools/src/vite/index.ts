/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

/** Vite plugin for mion — a thin wrapper over the runtypes core since the mion migration */
export {mionVitePlugin, serverReady, resolveRtBinary} from './mionVitePlugin.ts';
// (deriveRuntypesTsconfig workaround removed — the resolver now ignores tsconfig project references itself)
export type {MionClientPointer, MionPluginOptions, MionRunTypesOptions, MionServerOptions} from './mionVitePlugin.ts';

/** Paths middleware mode leaves to vite when the router has no basePath — extend it, don't replace
 *  it, unless you know every vite-internal URL you are taking over. */
export {DEFAULT_MIDDLEWARE_EXCLUDE} from './middlewareMode.ts';

/** Vite plugin that writes {"type":"commonjs"} package.json in CJS output dirs */
export {cjsPackageJsonPlugin} from './cjsPackageJsonPlugin.ts';

/** Shared build-entry collection: the package's build tsconfig program IS the entry list */
export {collectBuildEntries} from './buildEntries.ts';
