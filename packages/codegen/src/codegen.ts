/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {existsSync} from 'fs';
import {join} from 'path';
import {
    getAOTConfig,
    shouldLoadAOTCaches,
    shouldUseVerboseLogging,
    getCacheFileNames,
    generateCacheFileName,
} from '@mionkit/core';

/**
 * Configuration for AOT cache loading
 */
export interface CacheLoadingOptions {
    /** Base directory to look for cache files (default: './dist') */
    baseDir?: string;
    /** Cache directory name (default: '.mion-cache') */
    cacheDir?: string;
    /** Whether to enable cache loading (default: auto-detect based on environment) */
    enabled?: boolean;
    /** Whether to log cache loading activity */
    verbose?: boolean;
}

/**
 * Result of cache loading attempt
 */
export interface CacheLoadingResult {
    /** Whether any caches were loaded */
    loaded: boolean;
    /** Paths of cache files that were found and loaded */
    loadedFiles: string[];
    /** Any errors that occurred during loading */
    errors: string[];
    /** Whether cache loading was skipped */
    skipped: boolean;
    /** Reason for skipping if applicable */
    skipReason?: string;
}

/**
 * Attempts to load AOT compiled caches if they exist
 * This function is called automatically during router initialization
 */
export async function loadAOTCaches(options: CacheLoadingOptions = {}): Promise<CacheLoadingResult> {
    const config = getAOTConfig();
    const opts = {
        baseDir: './dist',
        cacheDir: config.cacheDirectoryName,
        enabled: shouldLoadAOTCaches(),
        verbose: shouldUseVerboseLogging(),
        ...options,
    };

    const result: CacheLoadingResult = {
        loaded: false,
        loadedFiles: [],
        errors: [],
        skipped: false,
    };

    // Check if cache loading is enabled
    if (!opts.enabled) {
        result.skipped = true;
        result.skipReason = 'Cache loading disabled';
        if (opts.verbose) {
            console.log('[mion-codegen] AOT cache loading disabled');
        }
        return result;
    }

    const cacheBasePath = join(opts.baseDir, opts.cacheDir);

    // Check if cache directory exists
    if (!existsSync(cacheBasePath)) {
        result.skipped = true;
        result.skipReason = `Cache directory not found: ${cacheBasePath}`;
        if (opts.verbose) {
            console.log(`[mion-codegen] Cache directory not found: ${cacheBasePath}`);
        }
        return result;
    }

    if (opts.verbose) {
        console.log(`[mion-codegen] Loading AOT caches from: ${cacheBasePath}`);
    }

    // Try to load router cache
    await loadRouterCache(cacheBasePath, result, opts.verbose);

    // Try to load JIT functions cache
    await loadJitFunctionsCache(cacheBasePath, result, opts.verbose);

    // Try to load pure functions cache
    await loadPureFunctionsCache(cacheBasePath, result, opts.verbose);

    result.loaded = result.loadedFiles.length > 0;

    if (opts.verbose) {
        if (result.loaded) {
            console.log(`[mion-codegen] Successfully loaded ${result.loadedFiles.length} cache file(s)`);
        } else {
            console.log('[mion-codegen] No cache files were loaded');
        }
    }

    return result;
}

/**
 * Attempts to load router cache (compiled methods)
 */
async function loadRouterCache(cacheBasePath: string, result: CacheLoadingResult, verbose: boolean): Promise<void> {
    const routerCacheFileNames = getCacheFileNames('router');
    const routerCacheFiles = routerCacheFileNames.map((fileName) => join(cacheBasePath, fileName));

    for (const filePath of routerCacheFiles) {
        if (existsSync(filePath)) {
            try {
                const cacheModule = await import(filePath);
                const routerCache = cacheModule.rΦutεs || cacheModule.routerCache || cacheModule.default;

                if (routerCache && typeof routerCache === 'object') {
                    // Import the loadCompiledMethods function dynamically to avoid circular dependencies
                    const {loadCompiledMethods} = await import('@mionkit/router');
                    loadCompiledMethods(routerCache);

                    result.loadedFiles.push(filePath);
                    if (verbose) {
                        console.log(`[mion-codegen] Loaded router cache: ${filePath}`);
                    }
                    return; // Only load the first found cache file
                }
            } catch (error) {
                const errorMsg = `Failed to load router cache from ${filePath}: ${error instanceof Error ? error.message : String(error)}`;
                result.errors.push(errorMsg);
                if (verbose) {
                    console.warn(`[mion-codegen] ${errorMsg}`);
                }
            }
        }
    }
}

/**
 * Attempts to load JIT functions cache
 */
async function loadJitFunctionsCache(cacheBasePath: string, result: CacheLoadingResult, verbose: boolean): Promise<void> {
    const jitCacheFiles = [
        join(cacheBasePath, 'jit.cache.js'),
        join(cacheBasePath, 'jit.cache.mjs'),
        join(cacheBasePath, 'jitFunctions.cache.js'),
        join(cacheBasePath, 'jitFunctions.cache.mjs'),
    ];

    for (const filePath of jitCacheFiles) {
        if (existsSync(filePath)) {
            try {
                const cacheModule = await import(filePath);
                const jitCache = cacheModule.cΦmpilεdCachε || cacheModule.jitCache || cacheModule.default;

                if (jitCache && typeof jitCache === 'object') {
                    // Import the loadCompiledCaches function dynamically to avoid circular dependencies
                    const {loadCompiledCaches} = await import('@mionkit/core');
                    loadCompiledCaches({jitFnsCache: jitCache});

                    result.loadedFiles.push(filePath);
                    if (verbose) {
                        console.log(`[mion-codegen] Loaded JIT functions cache: ${filePath}`);
                    }
                    return; // Only load the first found cache file
                }
            } catch (error) {
                const errorMsg = `Failed to load JIT functions cache from ${filePath}: ${error instanceof Error ? error.message : String(error)}`;
                result.errors.push(errorMsg);
                if (verbose) {
                    console.warn(`[mion-codegen] ${errorMsg}`);
                }
            }
        }
    }
}

/**
 * Attempts to load pure functions cache
 */
async function loadPureFunctionsCache(cacheBasePath: string, result: CacheLoadingResult, verbose: boolean): Promise<void> {
    const pureCacheFiles = [
        join(cacheBasePath, 'pure.cache.js'),
        join(cacheBasePath, 'pure.cache.mjs'),
        join(cacheBasePath, 'pureFunctions.cache.js'),
        join(cacheBasePath, 'pureFunctions.cache.mjs'),
    ];

    for (const filePath of pureCacheFiles) {
        if (existsSync(filePath)) {
            try {
                const cacheModule = await import(filePath);
                const pureCache = cacheModule.cΦmpilεdCachε || cacheModule.pureCache || cacheModule.default;

                if (pureCache && typeof pureCache === 'object') {
                    // Import the loadCompiledCaches function dynamically to avoid circular dependencies
                    const {loadCompiledCaches} = await import('@mionkit/core');
                    loadCompiledCaches({pureFnsCache: pureCache});

                    result.loadedFiles.push(filePath);
                    if (verbose) {
                        console.log(`[mion-codegen] Loaded pure functions cache: ${filePath}`);
                    }
                    return; // Only load the first found cache file
                }
            } catch (error) {
                const errorMsg = `Failed to load pure functions cache from ${filePath}: ${error instanceof Error ? error.message : String(error)}`;
                result.errors.push(errorMsg);
                if (verbose) {
                    console.warn(`[mion-codegen] ${errorMsg}`);
                }
            }
        }
    }
}

/**
 * Configuration for AOT cache generation
 */
export interface CacheGenerationOptions {
    /** Output directory for cache files (default: './dist/.mion-cache') */
    outputDir?: string;
    /** Whether to generate router cache */
    generateRouter?: boolean;
    /** Whether to generate JIT functions cache */
    generateJitFunctions?: boolean;
    /** Whether to generate pure functions cache */
    generatePureFunctions?: boolean;
    /** Module format to generate (default: 'esm') */
    moduleFormat?: 'esm' | 'cjs';
    /** Whether to log generation activity */
    verbose?: boolean;
}

/**
 * Result of cache generation
 */
export interface CacheGenerationResult {
    /** Whether generation was successful */
    success: boolean;
    /** Paths of cache files that were generated */
    generatedFiles: string[];
    /** Any errors that occurred during generation */
    errors: string[];
    /** Any warnings during generation */
    warnings: string[];
}

/**
 * Generates AOT cache files from current runtime state
 * This should be called after all routes have been registered and the application has been exercised
 */
export async function generateAOTCaches(options: CacheGenerationOptions = {}): Promise<CacheGenerationResult> {
    const config = getAOTConfig();
    const opts = {
        outputDir: `./dist/${config.cacheDirectoryName}`,
        generateRouter: true,
        generateJitFunctions: true,
        generatePureFunctions: true,
        moduleFormat: config.defaultModuleFormat,
        verbose: shouldUseVerboseLogging(),
        ...options,
    };

    const result: CacheGenerationResult = {
        success: false,
        generatedFiles: [],
        errors: [],
        warnings: [],
    };

    if (opts.verbose) {
        console.log(`[mion-codegen] Generating AOT caches to: ${opts.outputDir}`);
    }

    try {
        // Ensure output directory exists
        const {mkdirSync} = await import('fs');
        mkdirSync(opts.outputDir, {recursive: true});

        // Generate router cache
        if (opts.generateRouter) {
            await generateRouterCacheFile(opts, result);
        }

        // Generate JIT functions cache
        if (opts.generateJitFunctions) {
            await generateJitFunctionsCacheFile(opts, result);
        }

        // Generate pure functions cache
        if (opts.generatePureFunctions) {
            await generatePureFunctionsCacheFile(opts, result);
        }

        result.success = result.errors.length === 0;

        if (opts.verbose) {
            if (result.success) {
                console.log(`[mion-codegen] Successfully generated ${result.generatedFiles.length} cache file(s)`);
            } else {
                console.error(`[mion-codegen] Generation failed with ${result.errors.length} error(s)`);
            }
        }
    } catch (error) {
        const errorMsg = `Cache generation failed: ${error instanceof Error ? error.message : String(error)}`;
        result.errors.push(errorMsg);
        if (opts.verbose) {
            console.error(`[mion-codegen] ${errorMsg}`);
        }
    }

    return result;
}

/**
 * Generates router cache file
 */
async function generateRouterCacheFile(opts: Required<CacheGenerationOptions>, result: CacheGenerationResult): Promise<void> {
    try {
        // Import router functions dynamically
        const {getPersistedMethods} = await import('@mionkit/router');
        const {compileAndWriteRunType} = await import('./precompile/cacheCompiler');
        const {routerCompilerConstants} = await import('./precompile/precompileRoutes');

        const persistedMethods = getPersistedMethods();

        if (Object.keys(persistedMethods).length === 0) {
            result.warnings.push('No router methods found to cache. Make sure routes have been registered and exercised.');
            return;
        }

        const fileName = generateCacheFileName('router', opts.moduleFormat);
        const filePath = join(opts.outputDir, fileName);

        compileAndWriteRunType(persistedMethods, {
            ...routerCompilerConstants,
            files: {
                jit: {path: filePath, module: opts.moduleFormat},
                pure: {path: '', module: opts.moduleFormat},
            },
        });

        result.generatedFiles.push(filePath);
        if (opts.verbose) {
            console.log(`[mion-codegen] Generated router cache: ${filePath}`);
        }
    } catch (error) {
        const errorMsg = `Failed to generate router cache: ${error instanceof Error ? error.message : String(error)}`;
        result.errors.push(errorMsg);
    }
}

/**
 * Generates JIT functions cache file
 */
async function generateJitFunctionsCacheFile(
    opts: Required<CacheGenerationOptions>,
    result: CacheGenerationResult
): Promise<void> {
    try {
        // Import core functions dynamically
        const {getFnCaches} = await import('@mionkit/core');
        const {compileAndWriteJitFunctions} = await import('./precompile/cacheCompiler');

        const {jitFnsCache} = getFnCaches();

        if (Object.keys(jitFnsCache).length === 0) {
            result.warnings.push('No JIT functions found to cache. Make sure the application has been exercised.');
            return;
        }

        const fileName = generateCacheFileName('jit', opts.moduleFormat);
        const filePath = join(opts.outputDir, fileName);

        compileAndWriteJitFunctions(jitFnsCache, {
            jit: {path: filePath, module: opts.moduleFormat},
            pure: {path: '', module: opts.moduleFormat},
        });

        result.generatedFiles.push(filePath);
        if (opts.verbose) {
            console.log(`[mion-codegen] Generated JIT functions cache: ${filePath}`);
        }
    } catch (error) {
        const errorMsg = `Failed to generate JIT functions cache: ${error instanceof Error ? error.message : String(error)}`;
        result.errors.push(errorMsg);
    }
}

/**
 * Generates pure functions cache file
 */
async function generatePureFunctionsCacheFile(
    opts: Required<CacheGenerationOptions>,
    result: CacheGenerationResult
): Promise<void> {
    try {
        // Import core functions dynamically
        const {getFnCaches} = await import('@mionkit/core');
        const {compileAndWritePureFunctions} = await import('./precompile/cacheCompiler');

        const {pureFnsCache} = getFnCaches();

        if (Object.keys(pureFnsCache).length === 0) {
            result.warnings.push('No pure functions found to cache. Make sure the application has been exercised.');
            return;
        }

        const fileName = generateCacheFileName('pure', opts.moduleFormat);
        const filePath = join(opts.outputDir, fileName);

        compileAndWritePureFunctions(pureFnsCache, {
            jit: {path: '', module: opts.moduleFormat},
            pure: {path: filePath, module: opts.moduleFormat},
        });

        result.generatedFiles.push(filePath);
        if (opts.verbose) {
            console.log(`[mion-codegen] Generated pure functions cache: ${filePath}`);
        }
    } catch (error) {
        const errorMsg = `Failed to generate pure functions cache: ${error instanceof Error ? error.message : String(error)}`;
        result.errors.push(errorMsg);
    }
}
