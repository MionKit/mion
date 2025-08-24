/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {RunTypeOptions} from '@mionkit/run-types';

export type compiledCacheConfig = {
    path: string;
    exportName: string;
};

/**
 * Shared AOT (Ahead-of-Time) configuration used by both codegen and router packages
 * This ensures consistency between cache generation and loading
 */
export interface AOTConfig {
    /** Default module format for generated files */
    module: 'esm' | 'cjs';
    /** Default run type compiling options for caches */
    runTypeOptions?: RunTypeOptions;
    /** Paths to generated cache files */
    caches: {
        router: compiledCacheConfig;
        jit: compiledCacheConfig;
        pure: compiledCacheConfig;
    };
}
