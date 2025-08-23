/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {join} from 'path';
import type {CacheGenerationOptions, CacheGenerationResult} from './types';
import {DEFAULT_AOT_CONFIG, shouldUseVerboseLogging, generateCacheFileName} from './aotConfig';

/**
 * Generates AOT cache files from current runtime state
 * This should be called after all routes have been registered and the application has been exercised
 */
export async function generateAOTCaches(options: CacheGenerationOptions = {}): Promise<CacheGenerationResult> {
    const opts = {
        outputDir: DEFAULT_AOT_CONFIG.defaultOutputDir,
        generateRouter: true,
        generateJitFunctions: true,
        generatePureFunctions: true,
        moduleFormat: DEFAULT_AOT_CONFIG.defaultModuleFormat,
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
        const {compileAndWriteRouterMethods} = await import('./cacheCompiler');

        const persistedMethods = getPersistedMethods();

        if (Object.keys(persistedMethods).length === 0) {
            result.warnings.push('No router methods found to cache. Make sure routes have been registered and exercised.');
            return;
        }

        const fileName = generateCacheFileName('router', opts.moduleFormat);
        const filePath = join(opts.outputDir, fileName);

        compileAndWriteRouterMethods(persistedMethods, {
            jit: {path: filePath, module: opts.moduleFormat},
            pure: {path: '', module: opts.moduleFormat},
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
        const {compileAndWriteJitFunctions} = await import('./cacheCompiler');

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
        const {compileAndWritePureFunctions} = await import('./cacheCompiler');

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
