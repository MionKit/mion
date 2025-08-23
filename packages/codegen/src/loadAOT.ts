import {existsSync} from 'fs';
import {join} from 'path/posix';
import {DEFAULT_AOT_CONFIG, generateCacheFileName} from './aotConfig';
import type {AOTConfig} from './types';
import {loadCompiledMethods} from '@mionkit/router';
import {loadCompiledCaches} from '@mionkit/core';

/**
 * Loads router cache (compiled methods) if available
 * Returns the loaded router cache data or null if not found
 */

export async function loadRouterCache(options: Partial<AOTConfig> = {}): Promise<any | null> {
    const config = {
        ...DEFAULT_AOT_CONFIG,
        ...options,
    };

    const cacheBasePath = join(config.defaultBaseDir, config.cacheDirectoryName);
    if (!existsSync(cacheBasePath)) {
        if (config.defaultVerbose) {
            console.log(`[mion-codegen] Router cache directory not found: ${cacheBasePath}`);
        }
        return null;
    }

    // Try both ESM and CJS cache files
    const routerCacheFileNames = [generateCacheFileName('router', 'esm'), generateCacheFileName('router', 'cjs')];

    for (const fileName of routerCacheFileNames) {
        const filePath = join(cacheBasePath, fileName);
        if (existsSync(filePath)) {
            try {
                const cacheModule = await import(filePath);
                const routerCache = cacheModule.rΦutεs || cacheModule.routerCache || cacheModule.default;

                if (routerCache && typeof routerCache === 'object') {
                    // Load into router's persistedMethods
                    loadCompiledMethods(routerCache);

                    if (config.defaultVerbose) {
                        console.log(`[mion-codegen] Loaded router cache: ${filePath}`);
                    }
                    return routerCache;
                }
            } catch (error) {
                if (config.defaultVerbose) {
                    console.warn(`[mion-codegen] Failed to load router cache from ${filePath}: ${error}`);
                }
            }
        }
    }

    return null;
} /**
 * Loads core caches (JIT functions and pure functions) if available
 * Returns object with loaded cache data or null values if not found
 */

export async function loadCoreCache(options: Partial<AOTConfig> = {}): Promise<{jitCache: any | null; pureCache: any | null}> {
    const config = {
        ...DEFAULT_AOT_CONFIG,
        ...options,
    };

    const cacheBasePath = join(config.defaultBaseDir, config.cacheDirectoryName);
    if (!existsSync(cacheBasePath)) {
        if (config.defaultVerbose) {
            console.log(`[mion-codegen] Core cache directory not found: ${cacheBasePath}`);
        }
        return {jitCache: null, pureCache: null};
    }

    const result = {jitCache: null as any, pureCache: null as any};

    // Load JIT functions cache
    const jitCacheFileNames = [generateCacheFileName('jit', 'esm'), generateCacheFileName('jit', 'cjs')];
    for (const fileName of jitCacheFileNames) {
        const filePath = join(cacheBasePath, fileName);
        if (existsSync(filePath)) {
            try {
                const cacheModule = await import(filePath);
                const jitCache = cacheModule.cΦmpilεdCachε || cacheModule.jitCache || cacheModule.default;

                if (jitCache && typeof jitCache === 'object') {
                    // Load into core's JIT cache
                    loadCompiledCaches({jitFnsCache: jitCache});
                    result.jitCache = jitCache;

                    if (config.defaultVerbose) {
                        console.log(`[mion-codegen] Loaded JIT cache: ${filePath}`);
                    }
                    break;
                }
            } catch (error) {
                if (config.defaultVerbose) {
                    console.warn(`[mion-codegen] Failed to load JIT cache from ${filePath}: ${error}`);
                }
            }
        }
    }

    // Load pure functions cache
    const pureCacheFileNames = [generateCacheFileName('pure', 'esm'), generateCacheFileName('pure', 'cjs')];
    for (const fileName of pureCacheFileNames) {
        const filePath = join(cacheBasePath, fileName);
        if (existsSync(filePath)) {
            try {
                const cacheModule = await import(filePath);
                const pureCache = cacheModule.cΦmpilεdCachε || cacheModule.pureCache || cacheModule.default;

                if (pureCache && typeof pureCache === 'object') {
                    // Load into core's pure functions cache
                    loadCompiledCaches({pureFnsCache: pureCache});
                    result.pureCache = pureCache;

                    if (config.defaultVerbose) {
                        console.log(`[mion-codegen] Loaded pure functions cache: ${filePath}`);
                    }
                    break;
                }
            } catch (error) {
                if (config.defaultVerbose) {
                    console.warn(`[mion-codegen] Failed to load pure functions cache from ${filePath}: ${error}`);
                }
            }
        }
    }

    return result;
}
