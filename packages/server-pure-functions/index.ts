/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Plugin
export {pureFunctionsPlugin} from './src/plugin.ts';

// Types (these are plugin config types, not runtime reflection types)
export type {PureServerFnRegistry, PureServerFnRegistryEntry, PureFunctionsPluginOptions} from './src/types.ts';

// Constants
export {VIRTUAL_MODULE_ID} from './src/types.ts';

// Extraction utilities (for advanced usage)
export {extractPureFnsFromSource, PurityError} from './src/extract.ts';

// Registry utilities (for testing/advanced usage)
export {createRegistry} from './src/registry.ts';

// Virtual module generation
export {generateVirtualModule} from './src/virtualModule.ts';
