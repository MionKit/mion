/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {getENV} from '@mionkit/core';
import {join} from 'path';

/**
 * Shared AOT (Ahead-of-Time) configuration used by both codegen and router packages
 * This ensures consistency between cache generation and loading
 */
export interface AOTConfig {
    /** Default output/search directories for cache files */
    cacheDirs: string[];
    /** Cache file naming patterns */
    cacheFiles: {
        router: string[];
        jit: string[];
        pure: string[];
    };
    /** Cache directory name */
    cacheDirectoryName: string;
    /** Environment variable names */
    envVars: {
        disable: string;
        verbose: string;
        enableInTests: string;
        compile: string;
    };
    /** Default module format for generated files */
    defaultModuleFormat: 'esm' | 'cjs';
}

/**
 * Default AOT configuration shared across all mion packages
 */
export const DEFAULT_AOT_CONFIG: AOTConfig = {
    cacheDirs: ['dist/.mion-cache', '.mion-cache', 'build/.mion-cache'],
    cacheFiles: {
        router: ['router.cache.js', 'router.cache.mjs', 'routes.cache.js', 'routes.cache.mjs'],
        jit: ['jit.cache.js', 'jit.cache.mjs', 'jitFunctions.cache.js', 'jitFunctions.cache.mjs'],
        pure: ['pure.cache.js', 'pure.cache.mjs', 'pureFunctions.cache.js', 'pureFunctions.cache.mjs'],
    },
    cacheDirectoryName: '.mion-cache',
    envVars: {
        disable: 'MION_DISABLE_AOT_CACHE',
        verbose: 'MION_CACHE_VERBOSE',
        enableInTests: 'MION_ENABLE_CACHE_IN_TESTS',
        compile: 'MION_COMPILE',
    },
    defaultModuleFormat: 'esm',
};

/**
 * Gets the current AOT configuration, allowing for environment-based overrides
 */
export function getAOTConfig(): AOTConfig {
    // For now, return the default config
    // In the future, this could be extended to read from config files or environment variables
    return DEFAULT_AOT_CONFIG;
}

/**
 * Checks if AOT cache loading should be enabled based on environment
 */
export function shouldLoadAOTCaches(): boolean {
    const config = getAOTConfig();

    // Disable if explicitly disabled
    if (getENV(config.envVars.disable) === 'true') {
        return false;
    }

    // Disable in test environments by default
    if (getENV('NODE_ENV') === 'test' && getENV(config.envVars.enableInTests) !== 'true') {
        return false;
    }

    // Enable by default in production-like environments
    return true;
}

/**
 * Checks if verbose logging should be enabled
 */
export function shouldUseVerboseLogging(): boolean {
    const config = getAOTConfig();
    return getENV(config.envVars.verbose) === 'true';
}

/**
 * Checks if compilation should be enabled (for backwards compatibility)
 */
export function shouldCompile(): boolean {
    const config = getAOTConfig();
    return getENV(config.envVars.compile) === 'true';
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

/**
 * Gets all possible cache file names for a specific cache type
 */
export function getCacheFileNames(cacheType: 'router' | 'jit' | 'pure'): string[] {
    const config = getAOTConfig();
    return config.cacheFiles[cacheType];
}

/**
 * Gets all possible cache directory paths relative to an application root
 */
export function getCacheDirPaths(appRoot: string): string[] {
    const config = getAOTConfig();

    return config.cacheDirs.map((dir) => join(appRoot, dir));
}
