/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Main user-facing functions
export {generateAOTCaches} from './src/codegen';
export type {CacheGenerationOptions, CacheGenerationResult} from './src/codegen';

// Internal functions used by router (not intended for direct user consumption)
export {loadRouterCache, loadCoreCache, autoGenerateAOTCaches} from './src/codegen';
export type {CacheLoadingOptions} from './src/codegen';

// Precompile utilities (for advanced users)
export * from './src/precompile/cacheCompiler';
export * from './src/precompile/precompileRoutes';
