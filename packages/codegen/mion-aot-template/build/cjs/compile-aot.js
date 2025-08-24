"use strict";
/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const path_1 = require("path");
const codegen_1 = require("@mionkit/codegen");
const core_1 = require("@mionkit/core");
const router_1 = require("@mionkit/router");
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
    const resolvedStartScript = (0, path_1.resolve)(serverStartScriptPath);
    console.log(`AOT Compilation starting...`);
    console.log(`Start script: ${resolvedStartScript}`);
    console.log(`AOT directory: ${aotDir}`);
    // Set compilation mode
    process.env.MION_COMPILE = 'true';
    console.log('Running start script to populate caches...');
    // Import and run the original start script (only dynamic import needed)
    try {
        await Promise.resolve(`${resolvedStartScript}`).then(s => __importStar(require(s)));
        console.log('Start script completed, caches populated');
    }
    catch (error) {
        console.error('Error running start script:', error.message);
        process.exit(1);
    }
    // Now compile and write the caches
    console.log('Compiling and writing AOT caches...');
    // Get the populated caches
    const { jitFnsCache, pureFnsCache } = (0, core_1.getFnCaches)();
    const routerCache = (0, router_1.getPersistedMethods)();
    // Write to both CJS and ESM builds
    const moduleFormats = ['cjs', 'esm'];
    for (const moduleFormat of moduleFormats) {
        console.log(`Writing ${moduleFormat.toUpperCase()} cache files...`);
        const buildDir = (0, path_1.join)(aotDir, 'build', moduleFormat);
        // Create AOT configuration for this module format
        const aotConfig = {
            module: moduleFormat,
            caches: {
                router: {
                    path: (0, path_1.join)(buildDir, 'router.cache.js'),
                    exportName: 'routerCache',
                },
                jit: {
                    path: (0, path_1.join)(buildDir, 'jitFns.cache.js'),
                    exportName: 'jitFnsCache',
                },
                pure: {
                    path: (0, path_1.join)(buildDir, 'pureFns.cache.js'),
                    exportName: 'pureFnsCache',
                },
            },
        };
        console.log(`Writing JIT functions cache (${moduleFormat})...`);
        (0, codegen_1.compileAndWriteJitFunctions)(jitFnsCache, aotConfig);
        console.log(`Writing pure functions cache (${moduleFormat})...`);
        (0, codegen_1.compileAndWritePureFunctions)(pureFnsCache, aotConfig);
        console.log(`Writing router methods cache (${moduleFormat})...`);
        (0, codegen_1.compileAndWriteRouterMethods)(routerCache, aotConfig);
    }
    console.log('✅ AOT compilation completed successfully!');
    console.log(`
Cache files updated in both CJS and ESM formats:
  - ${(0, path_1.join)(aotDir, 'build', 'cjs', '*.cache.js')}
  - ${(0, path_1.join)(aotDir, 'build', 'esm', '*.cache.js')}
`);
}
// Run the main function
main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});
