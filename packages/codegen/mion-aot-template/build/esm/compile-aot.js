/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import { resolve, join } from 'path';
import { compileAndWriteJitFunctions, compileAndWritePureFunctions, compileAndWriteRouterMethods } from '@mionkit/codegen';
import { getFnCaches } from '@mionkit/core';
import { getPersistedMethods } from '@mionkit/router';
/**
 * AOT Compilation Script
 *
 * This script is executed as part of the AOT build process.
 * It runs the user's start script with MION_COMPILE=true to populate caches,
 * then compiles and writes those caches to the AOT package files.
 *
 * Expected environment variables:
 * - MION_START_SCRIPT: Path to the start script
 * - MION_AOT_DIR: Absolute path to the AOT package directory
 */
async function main() {
    // Get required environment variables
    const serverStartScriptPath = process.env.MION_START_SCRIPT || process.argv[2];
    const aotDir = process.env.MION_AOT_DIR;
    if (!serverStartScriptPath) {
        console.error('Error: Start script path is required');
        console.error('Usage: node compile-aot.js <start-script-path>');
        console.error('Or set MION_START_SCRIPT environment variable');
        process.exit(1);
    }
    if (!aotDir) {
        console.error('Error: MION_AOT_DIR environment variable is required');
        process.exit(1);
    }
    const resolvedStartScript = resolve(serverStartScriptPath);
    console.log(`AOT Compilation starting...`);
    console.log(`Start script: ${resolvedStartScript}`);
    console.log(`AOT directory: ${aotDir}`);
    // Set compilation mode
    process.env.MION_COMPILE = 'true';
    console.log('Running start script to populate caches...');
    // Import and run the original start script (only dynamic import needed)
    try {
        await import(resolvedStartScript);
        console.log('Start script completed, caches populated');
    }
    catch (error) {
        console.error('Error running start script:', error.message);
        process.exit(1);
    }
    // Now compile and write the caches
    console.log('Compiling and writing AOT caches...');
    // Get the populated caches
    const { jitFnsCache, pureFnsCache } = getFnCaches();
    const routerCache = getPersistedMethods();
    // Write to both CJS and ESM builds
    const moduleFormats = ['cjs', 'esm'];
    for (const moduleFormat of moduleFormats) {
        console.log(`Writing ${moduleFormat.toUpperCase()} cache files...`);
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
        console.log(`Writing JIT functions cache (${moduleFormat})...`);
        compileAndWriteJitFunctions(jitFnsCache, aotConfig);
        console.log(`Writing pure functions cache (${moduleFormat})...`);
        compileAndWritePureFunctions(pureFnsCache, aotConfig);
        console.log(`Writing router methods cache (${moduleFormat})...`);
        compileAndWriteRouterMethods(routerCache, aotConfig);
    }
    console.log('✅ AOT compilation completed successfully!');
    console.log(`
Cache files updated in both CJS and ESM formats:
  - ${join(aotDir, 'build', 'cjs', '*.cache.js')}
  - ${join(aotDir, 'build', 'esm', '*.cache.js')}
`);
}
// Run the main function
main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});
