/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {JitFunctionsHashes} from '@mionkit/core';
import {RunTypeOptions} from '@mionkit/run-types';

export interface MethodOptions {
    runOnError?: boolean;
    hasReturnData?: boolean;
    validateParams?: boolean;
    deserializeParams?: boolean;
    validateReturn?: boolean;
    serializeReturn?: boolean;
    description?: string;
    isAsync?: boolean;
}

export interface MethodData {
    type: number;
    id: string;
    // pointer to the src Hook or Route definition within the original Routers object, ie: ['users','getUser']
    pointer: string[];
    nestLevel: number;
    paramNames?: string[];
    headerNames?: string[];
    options: MethodOptions;
    paramsJitHashes: JitFunctionsHashes;
    returnJitHashes: JitFunctionsHashes;
} /** Record of all persisted methods */

export type MethodsCache = Record<string, MethodData>;

export type compiledCacheConfig = {
    path: string;
    exportName: string;
};

/**
 * Shared AOT (Ahead-of-Time) configuration used by both codegen and router packages
 * This ensures consistency between cache generation and loading
 */
export interface AOTConfig {
    /** Header added to all generated cache files */
    fileHeader: string;
    /** Default output directory for cache generation */
    outputDir: string;
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
