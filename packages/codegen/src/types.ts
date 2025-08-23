/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

/**
 * Shared AOT (Ahead-of-Time) configuration used by both codegen and router packages
 * This ensures consistency between cache generation and loading
 */
export interface AOTConfig {
    /** Default base directory to look for cache files */
    defaultBaseDir: string;
    /** Cache directory name */
    cacheDirectoryName: string;
    /** Default output directory for cache generation */
    defaultOutputDir: string;
    /** Default module format for generated files */
    defaultModuleFormat: 'esm' | 'cjs';
    /** Default verbose logging setting */
    defaultVerbose: boolean;
    /** Environment variable names */
    envVars: {
        verbose: string;
        compile: string;
    };
}

/**
 * Options for cache generation that override DEFAULT_AOT_CONFIG
 */
export interface CacheGenerationOptions {
    /** Output directory for cache files (overrides DEFAULT_AOT_CONFIG.defaultOutputDir) */
    outputDir?: string;
    /** Whether to generate router cache */
    generateRouter?: boolean;
    /** Whether to generate JIT functions cache */
    generateJitFunctions?: boolean;
    /** Whether to generate pure functions cache */
    generatePureFunctions?: boolean;
    /** Module format to generate (overrides DEFAULT_AOT_CONFIG.defaultModuleFormat) */
    moduleFormat?: 'esm' | 'cjs';
    /** Whether to log generation activity (overrides DEFAULT_AOT_CONFIG.defaultVerbose) */
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
