#!/usr/bin/env node

/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {join, resolve, isAbsolute} from 'path';
import {existsSync} from 'fs';
import {parseArgs} from 'util';
import {spawn} from 'child_process';

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

function showHelp() {
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

function validateArgs() {
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

  const aotDir = resolve(args.dir);
  const startScript = isAbsolute(args['start-server-script'])
    ? args['start-server-script']
    : resolve(args['start-server-script']);

  if (!existsSync(aotDir)) {
    console.error(`Error: AOT directory does not exist: ${aotDir}`);
    process.exit(1);
  }

  if (!existsSync(startScript)) {
    console.error(`Error: Start script does not exist: ${startScript}`);
    process.exit(1);
  }

  return {aotDir, startScript};
}

function getCompileScriptPath(aotDir) {
  // Try CJS first, then ESM (doesn't matter which since both write to both formats)
  const cjsScriptPath = join(aotDir, 'build', 'cjs', 'compile-aot.js');
  const esmScriptPath = join(aotDir, 'build', 'esm', 'compile-aot.js');

  if (existsSync(cjsScriptPath)) {
    return cjsScriptPath;
  } else if (existsSync(esmScriptPath)) {
    return esmScriptPath;
  } else {
    console.error(`Error: Compile script not found in AOT package at ${aotDir}`);
    console.error('Expected either build/cjs/compile-aot.js or build/esm/compile-aot.js');
    console.error('Make sure the AOT package has been built with: npm run build');
    process.exit(1);
  }
}

function runCompileScript(compileScriptPath, startScriptPath, aotDir) {
  return new Promise((resolve, reject) => {
    console.log('Executing AOT compilation...');

    const child = spawn('node', [compileScriptPath, startScriptPath], {
      stdio: 'inherit',
      env: {
        ...process.env,
        MION_START_SCRIPT: startScriptPath,
        MION_AOT_DIR: aotDir,
      },
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Compile script exited with code ${code}`));
      }
    });

    child.on('error', (error) => {
      reject(error);
    });
  });
}

async function main() {
  const {aotDir, startScript} = validateArgs();

  console.log(`Building AOT caches:`);
  console.log(`  AOT directory: ${aotDir}`);
  console.log(`  Start script: ${startScript}`);

  // Get the compile script path (prefer CJS, but ESM works too since it writes to both formats)
  const compileScriptPath = getCompileScriptPath(aotDir);
  console.log(`  Compile script: ${compileScriptPath}`);

  try {
    // Run the compile script with the start script path and AOT directory
    await runCompileScript(compileScriptPath, startScript, aotDir);

    console.log(`AOT build completed successfully!`);
  } catch (error) {
    console.error(`Error during AOT build: ${error.message}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
