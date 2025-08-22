/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {existsSync} from 'fs';
import {join} from 'path';
import {getAOTConfig, shouldUseVerboseLogging, getCacheFileNames, generateCacheFileName} from './aotConfig';

/**
 * Configuration for cache loading
 */
export interface CacheLoadingOptions {
    /** Base directory to look for cache files (default: './dist') */
    baseDir?: string;
    /** Cache directory name (default: '.mion-cache') */
    cacheDir?: string;
    /** Whether to log cache loading activity */
    verbose?: boolean;
}

/**
 * Loads router cache (compiled methods) if available
 * Returns the loaded router cache data or null if not found
 */
export async function loadRouterCache(options: CacheLoadingOptions = {}): Promise<any | null> {
    const config = getAOTConfig();
    const opts = {
        baseDir: './dist',
        cacheDir: config.cacheDirectoryName,
        verbose: false,
        ...options,
    };

    const cacheBasePath = join(opts.baseDir, opts.cacheDir);
    if (!existsSync(cacheBasePath)) {
        if (opts.verbose) {
            console.log(`[mion-codegen] Router cache directory not found: ${cacheBasePath}`);
        }
        return null;
    }

    const routerCacheFileNames = getCacheFileNames('router');

    for (const fileName of routerCacheFileNames) {
        const filePath = join(cacheBasePath, fileName);
        if (existsSync(filePath)) {
            try {
                const cacheModule = await import(filePath);
                const routerCache = cacheModule.rΦutεs || cacheModule.routerCache || cacheModule.default;

                if (routerCache && typeof routerCache === 'object') {
                    // Load into router's persistedMethods
                    const {loadCompiledMethods} = await import('@mionkit/router');
                    loadCompiledMethods(routerCache);

                    if (opts.verbose) {
                        console.log(`[mion-codegen] Loaded router cache: ${filePath}`);
                    }
                    return routerCache;
                }
            } catch (error) {
                if (opts.verbose) {
                    console.warn(`[mion-codegen] Failed to load router cache from ${filePath}: ${error}`);
                }
            }
        }
    }

    return null;
}

/**
 * Loads core caches (JIT functions and pure functions) if available
 * Returns object with loaded cache data or null values if not found
 */
export async function loadCoreCache(options: CacheLoadingOptions = {}): Promise<{jitCache: any | null; pureCache: any | null}> {
    const config = getAOTConfig();
    const opts = {
        baseDir: './dist',
        cacheDir: config.cacheDirectoryName,
        verbose: false,
        ...options,
    };

    const cacheBasePath = join(opts.baseDir, opts.cacheDir);
    if (!existsSync(cacheBasePath)) {
        if (opts.verbose) {
            console.log(`[mion-codegen] Core cache directory not found: ${cacheBasePath}`);
        }
        return {jitCache: null, pureCache: null};
    }

    const result = {jitCache: null as any, pureCache: null as any};

    // Load JIT functions cache
    const jitCacheFileNames = getCacheFileNames('jit');
    for (const fileName of jitCacheFileNames) {
        const filePath = join(cacheBasePath, fileName);
        if (existsSync(filePath)) {
            try {
                const cacheModule = await import(filePath);
                const jitCache = cacheModule.cΦmpilεdCachε || cacheModule.jitCache || cacheModule.default;

                if (jitCache && typeof jitCache === 'object') {
                    // Load into core's JIT cache
                    const {loadCompiledCaches} = await import('@mionkit/core');
                    loadCompiledCaches({jitFnsCache: jitCache});
                    result.jitCache = jitCache;

                    if (opts.verbose) {
                        console.log(`[mion-codegen] Loaded JIT cache: ${filePath}`);
                    }
                    break;
                }
            } catch (error) {
                if (opts.verbose) {
                    console.warn(`[mion-codegen] Failed to load JIT cache from ${filePath}: ${error}`);
                }
            }
        }
    }

    // Load pure functions cache
    const pureCacheFileNames = getCacheFileNames('pure');
    for (const fileName of pureCacheFileNames) {
        const filePath = join(cacheBasePath, fileName);
        if (existsSync(filePath)) {
            try {
                const cacheModule = await import(filePath);
                const pureCache = cacheModule.cΦmpilεdCachε || cacheModule.pureCache || cacheModule.default;

                if (pureCache && typeof pureCache === 'object') {
                    // Load into core's pure functions cache
                    const {loadCompiledCaches} = await import('@mionkit/core');
                    loadCompiledCaches({pureFnsCache: pureCache});
                    result.pureCache = pureCache;

                    if (opts.verbose) {
                        console.log(`[mion-codegen] Loaded pure functions cache: ${filePath}`);
                    }
                    break;
                }
            } catch (error) {
                if (opts.verbose) {
                    console.warn(`[mion-codegen] Failed to load pure functions cache from ${filePath}: ${error}`);
                }
            }
        }
    }

    return result;
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
 * Automatically generates AOT caches when MION_COMPILE=true
 * This function is called by the router's compileRouter() function
 * No user intervention required - runtime packages handle this automatically
 */
export async function autoGenerateAOTCaches(): Promise<void> {
    if (process.env.MION_COMPILE !== 'true') {
        return;
    }

    try {
        console.log('[mion-codegen] MION_COMPILE=true detected, generating AOT caches...');
        const result = await generateAOTCaches({verbose: true});

        if (result.success) {
            console.log(`[mion-codegen] Successfully generated ${result.generatedFiles.length} cache file(s)`);
            console.log('[mion-codegen] Compilation complete, exiting...');
        } else {
            console.error(`[mion-codegen] Compilation failed with ${result.errors.length} error(s):`);
            result.errors.forEach((error) => console.error(`  - ${error}`));
            process.exit(1);
        }
    } catch (error) {
        console.error('[mion-codegen] Compilation failed:', error);
        process.exit(1);
    }

    process.exit(0);
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
