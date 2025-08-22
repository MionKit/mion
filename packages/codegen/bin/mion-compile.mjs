#!/usr/bin/env node

import {spawn} from 'child_process';
import {existsSync} from 'fs';
import {resolve} from 'path';

function showUsage() {
  console.log('Usage: mion-compile <server-file> [options]');
  console.log('');
  console.log('Options:');
  console.log('  --output-dir <dir>    Output directory for cache files (default: ./dist/.mion-cache)');
  console.log('  --verbose             Enable verbose logging');
  console.log('  --help                Show this help message');
  console.log('');
  console.log('Examples:');
  console.log('  mion-compile ./dist/server.js');
  console.log('  mion-compile ./dist/server.js --output-dir ./build/.mion-cache --verbose');
  console.log('');
  console.log('This command runs your server with MION_COMPILE=true, which:');
  console.log('1. Registers routes and populates caches');
  console.log('2. Generates AOT cache files');
  console.log('3. Exits without starting the server');
}

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    showUsage();
    process.exit(0);
  }

  const serverFile = args[0];
  const serverPath = resolve(serverFile);

  if (!existsSync(serverPath)) {
    console.error(`Error: Server file not found: ${serverPath}`);
    process.exit(1);
  }

  // Parse additional options
  const env = {...process.env, MION_COMPILE: 'true'};

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--output-dir':
        if (i + 1 < args.length) {
          env.MION_CACHE_OUTPUT_DIR = args[i + 1];
          i++; // Skip next argument
        } else {
          console.error('Error: --output-dir requires a directory path');
          process.exit(1);
        }
        break;
      case '--verbose':
        env.MION_CACHE_VERBOSE = 'true';
        break;
      default:
        console.error(`Error: Unknown option: ${arg}`);
        showUsage();
        process.exit(1);
    }
  }

  console.log(`[mion-compile] Starting compilation of: ${serverPath}`);
  console.log(`[mion-compile] Environment: MION_COMPILE=true`);

  // Spawn the server process with MION_COMPILE=true
  const child = spawn('node', [serverPath], {
    env,
    stdio: 'inherit',
  });

  child.on('close', (code) => {
    if (code === 0) {
      console.log('[mion-compile] Compilation completed successfully');
    } else {
      console.error(`[mion-compile] Compilation failed with exit code ${code}`);
      process.exit(code);
    }
  });

  child.on('error', (error) => {
    console.error('[mion-compile] Failed to start compilation:', error.message);
    process.exit(1);
  });

  // Handle termination signals
  process.on('SIGINT', () => {
    console.log('[mion-compile] Received SIGINT, terminating...');
    child.kill('SIGINT');
  });

  process.on('SIGTERM', () => {
    console.log('[mion-compile] Received SIGTERM, terminating...');
    child.kill('SIGTERM');
  });
}

main();
