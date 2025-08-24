/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {resolve} from 'path';
import {existsSync} from 'fs';
import {parseArgs} from 'util';
import {compileAOT} from './aot-compile';
import {isTest} from './constants';

export interface BuildAOTOptions {
    aotDir: string;
    startScript: string;
}

export async function buildAOT(options: BuildAOTOptions): Promise<void> {
    const {aotDir, startScript} = options;

    if (!isTest) {
        console.log(`
Building AOT caches:
  AOT directory: ${aotDir}
  Start script: ${startScript}
`);
    }

    // Validate arguments (expecting absolute paths)
    if (!existsSync(aotDir)) {
        throw new Error(`AOT directory does not exist: ${aotDir}`);
    }

    if (!existsSync(startScript)) {
        throw new Error(`Start script does not exist: ${startScript}`);
    }

    // Check if AOT package has been built (has build directory)
    const hasCjsBuild = existsSync(resolve(aotDir, 'build', 'cjs'));
    const hasEsmBuild = existsSync(resolve(aotDir, 'build', 'esm'));

    if (!hasCjsBuild && !hasEsmBuild) {
        throw new Error(
            `AOT package has not been built. Expected build/cjs or build/esm directory in ${aotDir}. Run 'npm run build' in the AOT package first.`
        );
    }

    try {
        await compileAOT({
            startScriptPath: startScript,
            aotDir: aotDir,
        });

        if (!isTest) {
            console.log('AOT build completed successfully!');
        }
    } catch (error) {
        throw new Error(`AOT build failed: ${(error as Error).message}`);
    }
}

function showHelp(): void {
    console.log(`
mion-build-aot - Build AOT caches by running start script and compiling

Usage:
  npx mion-build-aot --dir <aot-directory> --start-server-script <script-path>

Options:
  -d, --dir <directory>              AOT package directory (required)
  -s, --start-server-script <path>   Path to start server script (required)
  -h, --help                         Show this help message

Examples:
  npx mion-build-aot --dir ./packages/my-api-aot --start-server-script ./dist/cjs/my-api/init.js
  npx mion-build-aot --dir ./packages/my-api-aot --start-server-script ./dist/esm/server.mjs
`);
}

/**
 * CLI entry point for mion-build-aot command
 */
export async function mionBuildAot(): Promise<void> {
    // Parse command line arguments
    const {values: args} = parseArgs({
        args: process.argv.slice(2),
        options: {
            dir: {
                type: 'string',
                short: 'd',
            },
            'start-server-script': {
                type: 'string',
                short: 's',
            },
            help: {
                type: 'boolean',
                short: 'h',
            },
        },
    });

    if (args.help) {
        showHelp();
        process.exit(0);
    }

    if (!args.dir) {
        console.error('Error: --dir argument is required');
        showHelp();
        process.exit(1);
    }

    if (!args['start-server-script']) {
        console.error('Error: --start-server-script argument is required');
        showHelp();
        process.exit(1);
    }

    try {
        await buildAOT({
            aotDir: resolve(args.dir),
            startScript: resolve(args['start-server-script']),
        });
    } catch (error) {
        console.error(`Error: ${(error as Error).message}`);
        process.exit(1);
    }
}

// If this file is run directly, execute the CLI
if (require.main === module) {
    mionBuildAot();
}
