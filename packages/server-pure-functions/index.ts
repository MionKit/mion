/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Client API
export {pureServerFn} from './src/pureServerFn';

// Plugin
export {pureFunctionsPlugin} from './src/plugin';

// Types (these are plugin config types, not runtime reflection types)
export type {PureServerFnRef, PureServerFnRegistry, PureServerFnRegistryEntry, PureFunctionsPluginOptions} from './src/types';

// Constants
export {PURE_SERVER_FN_NAMESPACE, VIRTUAL_MODULE_ID} from './src/types';

// Extraction utilities (for advanced usage)
export {extractPureFnsFromSource, PurityError} from './src/extract';

// Registry utilities (for testing/advanced usage)
export {createRegistry} from './src/registry';

// Virtual module generation
export {generateVirtualModule} from './src/virtualModule';
