/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

/** Vite plugin for mion — a thin wrapper over @ts-runtypes/devtools since the ts-runtypes migration */
export {mionVitePlugin, serverReady, resolveRtBinary} from './mionVitePlugin.ts';
export type {MionPluginOptions, MionRunTypesOptions} from './mionVitePlugin.ts';

/** Vite plugin that writes {"type":"commonjs"} package.json in CJS output dirs */
export {cjsPackageJsonPlugin} from './cjsPackageJsonPlugin.ts';
