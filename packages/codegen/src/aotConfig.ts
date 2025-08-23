/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {AOTConfig} from './types';
import {getENV} from '@mionkit/core';

/**
 * Default AOT configuration shared across all mion packages
 */
export const DEFAULT_AOT_CONFIG: AOTConfig = {
    defaultBaseDir: './dist',
    cacheDirectoryName: '.mion-cache',
    defaultOutputDir: './dist/.mion-cache',
    defaultModuleFormat: 'esm',
    defaultVerbose: false,
    envVars: {
        verbose: 'MION_CACHE_VERBOSE',
        compile: 'MION_COMPILE',
    },
};

/**
 * Checks if verbose logging should be enabled
 */
export function shouldUseVerboseLogging(): boolean {
    return getENV(DEFAULT_AOT_CONFIG.envVars.verbose) === 'true';
}

/**
 * Gets the cache file extension for a given module format
 */
export function getCacheFileExtension(moduleFormat: 'esm' | 'cjs'): string {
    return moduleFormat === 'esm' ? '.mjs' : '.js';
}

/**
 * Generates a cache file name for a specific cache type and module format
 */
export function generateCacheFileName(cacheType: 'router' | 'jit' | 'pure', moduleFormat: 'esm' | 'cjs' = 'esm'): string {
    const extension = getCacheFileExtension(moduleFormat);
    return `${cacheType}.cache${extension}`;
}
