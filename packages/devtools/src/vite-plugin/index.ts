/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

/** Vite plugin for mion (pure functions, virtual modules, AOT caches, etc.) */
export {mionVitePlugin, mionVitePlugin as mionPlugin} from './mionVitePlugin.ts';
export type {MionPluginOptions} from './mionVitePlugin.ts';
export type {
    AOTCacheOptions,
    ServerPureFunctionsPluginOptions as PureFunctionsPluginOptions,
    DeepkitTypeOptions,
} from './types.ts';

// Re-export virtual module constants for advanced usage
export {
    VIRTUAL_AOT_JIT_FNS,
    VIRTUAL_AOT_PURE_FNS,
    VIRTUAL_AOT_ROUTER_CACHE,
    VIRTUAL_MODULE_ID as VIRTUAL_PURE_FUNCTIONS,
} from './constants.ts';
