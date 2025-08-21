/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {shouldLoadAOTCaches, shouldUseVerboseLogging, getCacheDirPaths, getCacheFileNames} from '@mionkit/core';
import {loadCompiledMethods} from './methodsCache';

/**
 * Attempts to load AOT caches asynchronously without blocking router initialization
 * This function discovers cache files relative to the application root without depending on codegen package
 */
export function loadAOTCachesIfAvailable(): void {
    // Use shared configuration to check if loading should be enabled
    if (!shouldLoadAOTCaches()) {
        return;
    }

    const verbose = shouldUseVerboseLogging();

    // Discover and load cache files asynchronously
    discoverAndLoadCaches()
        .then((result) => {
            if (result.loaded && verbose) {
                console.log(`[mion-router] AOT caches loaded: ${result.loadedFiles.join(', ')}`);
            }
        })
        .catch((error) => {
            // Silently ignore cache loading failures to ensure router works normally
            if (verbose) {
                console.log(`[mion-router] AOT cache loading failed: ${error.message}`);
            }
        });
}

/**
 * Discovers and loads cache files from common locations relative to the application root
 */
async function discoverAndLoadCaches(): Promise<{loaded: boolean; loadedFiles: string[]}> {
    const {existsSync} = await import('fs');

    const result = {loaded: false, loadedFiles: []};

    // Find application root by looking for package.json
    const appRoot = await findApplicationRoot();
    if (!appRoot) {
        return result;
    }

    // Get cache directories from shared configuration
    const cacheDirs = getCacheDirPaths(appRoot);

    for (const cacheDir of cacheDirs) {
        if (existsSync(cacheDir)) {
            await loadCachesFromDirectory(cacheDir, result);
            if (result.loaded) {
                break; // Stop after finding the first valid cache directory
            }
        }
    }

    return result;
}

/**
 * Finds the application root by walking up the directory tree looking for package.json
 */
async function findApplicationRoot(): Promise<string | null> {
    const {existsSync} = await import('fs');
    const {dirname, join} = await import('path');

    // Start from the current working directory or main module path
    let currentDir = process.cwd();

    // If we have a main module, start from its directory
    if (require.main && require.main.filename) {
        currentDir = dirname(require.main.filename);
    }

    // Walk up the directory tree
    while (currentDir !== dirname(currentDir)) {
        const packageJsonPath = join(currentDir, 'package.json');
        if (existsSync(packageJsonPath)) {
            return currentDir;
        }
        currentDir = dirname(currentDir);
    }

    return null;
}

/**
 * Loads cache files from a specific directory
 */
async function loadCachesFromDirectory(cacheDir: string, result: {loaded: boolean; loadedFiles: string[]}): Promise<void> {
    // Try to load router cache
    await tryLoadRouterCache(cacheDir, result);

    // Try to load JIT functions cache
    await tryLoadJitCache(cacheDir, result);

    // Try to load pure functions cache
    await tryLoadPureCache(cacheDir, result);
}

/**
 * Attempts to load router cache files
 */
async function tryLoadRouterCache(cacheDir: string, result: {loaded: boolean; loadedFiles: string[]}): Promise<void> {
    const {existsSync} = await import('fs');
    const {join} = await import('path');

    const routerCacheFiles = getCacheFileNames('router');
    const verbose = shouldUseVerboseLogging();

    for (const fileName of routerCacheFiles) {
        const filePath = join(cacheDir, fileName);
        if (existsSync(filePath)) {
            try {
                const cacheModule = await import(filePath);
                const routerCache = cacheModule.rΦutεs || cacheModule.routerCache || cacheModule.default;

                if (routerCache && typeof routerCache === 'object') {
                    loadCompiledMethods(routerCache);
                    result.loaded = true;
                    result.loadedFiles.push(filePath);
                    return;
                }
            } catch (error) {
                // Continue to next file on error
                if (verbose) {
                    console.warn(`[mion-router] Failed to load router cache from ${filePath}: ${error}`);
                }
            }
        }
    }
}

/**
 * Attempts to load JIT functions cache files
 */
async function tryLoadJitCache(cacheDir: string, result: {loaded: boolean; loadedFiles: string[]}): Promise<void> {
    const {existsSync} = await import('fs');
    const {join} = await import('path');

    const jitCacheFiles = getCacheFileNames('jit');
    const verbose = shouldUseVerboseLogging();

    for (const fileName of jitCacheFiles) {
        const filePath = join(cacheDir, fileName);
        if (existsSync(filePath)) {
            try {
                const cacheModule = await import(filePath);
                const jitCache = cacheModule.cΦmpilεdCachε || cacheModule.jitCache || cacheModule.default;

                if (jitCache && typeof jitCache === 'object') {
                    // Import loadCompiledCaches dynamically to avoid circular dependencies
                    const {loadCompiledCaches} = await import('@mionkit/core');
                    loadCompiledCaches({jitFnsCache: jitCache});
                    result.loaded = true;
                    result.loadedFiles.push(filePath);
                    return;
                }
            } catch (error) {
                // Continue to next file on error
                if (verbose) {
                    console.warn(`[mion-router] Failed to load JIT cache from ${filePath}: ${error}`);
                }
            }
        }
    }
}

/**
 * Attempts to load pure functions cache files
 */
async function tryLoadPureCache(cacheDir: string, result: {loaded: boolean; loadedFiles: string[]}): Promise<void> {
    const {existsSync} = await import('fs');
    const {join} = await import('path');

    const pureCacheFiles = getCacheFileNames('pure');
    const verbose = shouldUseVerboseLogging();

    for (const fileName of pureCacheFiles) {
        const filePath = join(cacheDir, fileName);
        if (existsSync(filePath)) {
            try {
                const cacheModule = await import(filePath);
                const pureCache = cacheModule.cΦmpilεdCachε || cacheModule.pureCache || cacheModule.default;

                if (pureCache && typeof pureCache === 'object') {
                    // Import loadCompiledCaches dynamically to avoid circular dependencies
                    const {loadCompiledCaches} = await import('@mionkit/core');
                    loadCompiledCaches({pureFnsCache: pureCache});
                    result.loaded = true;
                    result.loadedFiles.push(filePath);
                    return;
                }
            } catch (error) {
                // Continue to next file on error
                if (verbose) {
                    console.warn(`[mion-router] Failed to load pure cache from ${filePath}: ${error}`);
                }
            }
        }
    }
}
