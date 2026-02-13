/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

/** Vite plugin for mion (pure functions, virtual modules, etc.) */
export {pureFunctionsPlugin} from './plugin.ts';
export type {PureServerFnRegistry, PureServerFnRegistryEntry, PureFunctionsPluginOptions} from './types.ts';
export {VIRTUAL_MODULE_ID, RESOLVED_VIRTUAL_MODULE_ID} from './constants.ts';
export {extractPureFnsFromSource, PurityError} from './extractPureFn.ts';
export {createRegistry} from './registry.ts';
export {generateVirtualModule} from './virtualModule.ts';
