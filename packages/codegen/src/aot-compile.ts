/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {resolve, join} from 'path';
import {compileAndWriteJitFunctions, compileAndWritePureFunctions, compileAndWriteRouterMethods} from './cacheCompiler';
import {getFnCaches} from '@mionkit/core';
import {getPersistedMethods} from '@mionkit/router';
import {isTest} from './constants';

export interface CacheData {
    jitFnsCache: Record<string, any>;
    pureFnsCache: Record<string, any>;
    routerCache: Record<string, any>;
}

/**
 * Write cache data to AOT package files
 * Separated from compileAOT for testing purposes
 */
export function writeCachesToFiles(cacheData: CacheData, aotDir: string): void {
    const {jitFnsCache, pureFnsCache, routerCache} = cacheData;

    // Write to both CJS and ESM builds
    const moduleFormats = ['cjs', 'esm'] as const;

    for (const moduleFormat of moduleFormats) {
        if (!isTest) {
            console.log(`Writing ${moduleFormat.toUpperCase()} cache files...`);
        }

        const buildDir = join(aotDir, 'build', moduleFormat);

        // Create AOT configuration for this module format
        const aotConfig = {
            module: moduleFormat,
            caches: {
                router: {
                    path: join(buildDir, 'router.cache.js'),
                    exportName: 'routerCache',
                },
                jit: {
                    path: join(buildDir, 'jitFns.cache.js'),
                    exportName: 'jitFnsCache',
                },
                pure: {
                    path: join(buildDir, 'pureFns.cache.js'),
                    exportName: 'pureFnsCache',
                },
            },
        };

        if (!isTest) {
            console.log(`Writing JIT functions cache (${moduleFormat})...`);
        }
        compileAndWriteJitFunctions(jitFnsCache, aotConfig);

        if (!isTest) {
            console.log(`Writing pure functions cache (${moduleFormat})...`);
        }
        compileAndWritePureFunctions(pureFnsCache, aotConfig);

        if (!isTest) {
            console.log(`Writing router methods cache (${moduleFormat})...`);
        }
        compileAndWriteRouterMethods(routerCache, aotConfig);
    }
}

export interface AOTCompileOptions {
    startScriptPath: string;
    aotDir: string;
}

/**
 * AOT Compilation Function
 *
 * This function is executed as part of the AOT build process.
 * It runs the user's start script with MION_COMPILE=true to populate caches,
 * then compiles and writes those caches to the AOT package files.
 */
export async function compileAOT(options: AOTCompileOptions): Promise<void> {
    const {startScriptPath, aotDir} = options;

    const resolvedStartScript = resolve(startScriptPath);

    if (!isTest) {
        console.log(`AOT Compilation starting...`);
        console.log(`Start script: ${resolvedStartScript}`);
        console.log(`AOT directory: ${aotDir}`);
    }

    // Set compilation mode
    process.env.MION_COMPILE = 'true';

    if (!isTest) {
        console.log('Running start script to populate caches...');
    }

    // Import and run the original start script (only dynamic import needed)
    try {
        await import(resolvedStartScript);
        console.log('Start script completed, caches populated');
    } catch (error) {
        console.error('Error running start script:', (error as Error).message);
        throw error;
    }

    // Now compile and write the caches
    if (!isTest) {
        console.log('Compiling and writing AOT caches...');
    }

    // Get the populated caches
    const {jitFnsCache, pureFnsCache} = getFnCaches();
    const routerCache = getPersistedMethods();

    // Write the caches to files
    writeCachesToFiles({jitFnsCache, pureFnsCache, routerCache}, aotDir);

    if (!isTest) {
        console.log('✅ AOT compilation completed successfully!');
        console.log(`
Cache files updated in both CJS and ESM formats:
  - ${join(aotDir, 'build', 'cjs', '*.cache.js')}
  - ${join(aotDir, 'build', 'esm', '*.cache.js')}
`);
    }
}
