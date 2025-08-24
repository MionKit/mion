#!/usr/bin/env node

/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import { fileURLToPath } from 'url';
import { dirname, join, resolve, basename } from 'path';
import { existsSync, mkdirSync, cpSync, readFileSync, writeFileSync } from 'fs';
import { parseArgs } from 'util';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Parse command line arguments
const { values: args, positionals } = parseArgs({
    args: process.argv.slice(2),
    options: {
        dir: {
            type: 'string',
            short: 'd'
        },
        'package-name': {
            type: 'string',
            short: 'n'
        },
        help: {
            type: 'boolean',
            short: 'h'
        }
    },
    allowPositionals: true
});

function showHelp() {
    console.log(`
mion-init-aot - Initialize AOT package from template

Usage:
  npx mion-init-aot --dir <directory> [--package-name <name>]

Options:
  -d, --dir <directory>        Target directory for AOT package (required)
  -n, --package-name <name>    Package name (optional, derived from dir if not provided)
  -h, --help                   Show this help message

Examples:
  npx mion-init-aot --dir ./packages/my-api-aot
  npx mion-init-aot --dir ./packages/my-api-aot --package-name my-custom-aot
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

    return {
        targetDir: resolve(args.dir),
        packageName: args['package-name'] || basename(resolve(args.dir))
    };
}

function copyTemplate(templateDir, targetDir) {
    console.log(`Copying template from ${templateDir} to ${targetDir}...`);
    
    if (existsSync(targetDir)) {
        console.error(`Error: Target directory ${targetDir} already exists`);
        process.exit(1);
    }

    try {
        mkdirSync(targetDir, { recursive: true });
        cpSync(templateDir, targetDir, { recursive: true });
        console.log('Template copied successfully');
    } catch (error) {
        console.error(`Error copying template: ${error.message}`);
        process.exit(1);
    }
}

function updatePackageJson(targetDir, packageName) {
    const packageJsonPath = join(targetDir, 'package.json');
    
    if (!existsSync(packageJsonPath)) {
        console.error(`Error: package.json not found at ${packageJsonPath}`);
        process.exit(1);
    }

    try {
        const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
        packageJson.name = packageName;
        
        writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n', 'utf8');
        console.log(`Updated package.json with name: ${packageName}`);
    } catch (error) {
        console.error(`Error updating package.json: ${error.message}`);
        process.exit(1);
    }
}

function main() {
    const { targetDir, packageName } = validateArgs();
    
    // Find template directory
    const templateDir = join(__dirname, '..', 'mion-aot-template');
    
    if (!existsSync(templateDir)) {
        console.error(`Error: Template directory not found at ${templateDir}`);
        process.exit(1);
    }

    console.log(`Initializing AOT package:`);
    console.log(`  Target directory: ${targetDir}`);
    console.log(`  Package name: ${packageName}`);
    console.log(`  Template: ${templateDir}`);

    copyTemplate(templateDir, targetDir);
    updatePackageJson(targetDir, packageName);

    console.log(`
✅ AOT package initialized successfully!

Next steps:
1. Build your AOT package: cd ${targetDir} && npm run build
2. Use mion-build-aot to populate the caches:
   npx mion-build-aot --dir ${targetDir} --start-server-script <your-start-script>
`);
}

main();
