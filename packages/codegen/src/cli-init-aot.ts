/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {resolve, join, basename} from 'path';
import {existsSync, mkdirSync, cpSync, readFileSync, writeFileSync, rmSync} from 'fs';
import {parseArgs} from 'util';
import {isTest} from './constants';

export interface InitAOTOptions {
    dir: string;
    packageName?: string;
    /** Create a core-only AOT package (no router dependency) */
    coreOnly?: boolean;
    /** Path to the mion-aot-template directory */
    templateDir: string;
}

export function initAOT(options: InitAOTOptions): void {
    const {dir, packageName, coreOnly, templateDir} = options;

    const targetDir = resolve(dir);
    const finalPackageName = packageName || basename(targetDir);

    if (!isTest) {
        console.log(`
Initializing AOT package:
  Target directory: ${targetDir}
  Package name: ${finalPackageName}
  Core only: ${coreOnly ? 'yes' : 'no'}
`);
    }

    if (!existsSync(templateDir)) {
        throw new Error(`Template directory not found at ${templateDir}`);
    }

    copyTemplate(templateDir, targetDir, coreOnly);
    updatePackageJson(targetDir, finalPackageName, coreOnly);

    if (!isTest) {
        console.log(`AOT package initialized successfully!`);
    }
}

function copyTemplate(templateDir: string, targetDir: string, coreOnly?: boolean): void {
    if (existsSync(targetDir)) {
        // Check if it's an existing mion AOT template
        if (isExistingMionAOTTemplate(targetDir)) {
            if (!isTest) console.log('Existing mion AOT template detected. Updating template files...');
            // Override the existing template
            try {
                cpSync(templateDir, targetDir, {recursive: true, force: true});
                // Remove the src directory from the updated template as it's not needed
                const srcDir = join(targetDir, 'src');
                if (existsSync(srcDir)) rmSync(srcDir, {recursive: true, force: true});
                if (coreOnly) applyCoreOnlyTemplate(targetDir);
                return;
            } catch (error) {
                throw new Error(`Error updating template: ${(error as Error).message}`);
            }
        } else {
            throw new Error(`Target directory ${targetDir} already exists and is not a mion AOT template`);
        }
    }

    try {
        mkdirSync(targetDir, {recursive: true});
        cpSync(templateDir, targetDir, {recursive: true});

        // Remove the src directory from the copied template as it's not needed
        const srcDir = join(targetDir, 'src');
        if (existsSync(srcDir)) {
            rmSync(srcDir, {recursive: true, force: true});
        }
        if (coreOnly) applyCoreOnlyTemplate(targetDir);
    } catch (error) {
        throw new Error(`Error copying template: ${(error as Error).message}`);
    }
}

/**
 * Apply core-only template modifications:
 * - Replace index.js with index-core-only.js in build directories
 * - Remove router.cache.js from build directories
 */
function applyCoreOnlyTemplate(targetDir: string): void {
    const moduleFormats = ['cjs', 'esm'] as const;

    for (const format of moduleFormats) {
        const buildDir = join(targetDir, 'build', format);
        if (!existsSync(buildDir)) continue;

        // Replace index.js with index-core-only.js
        const indexPath = join(buildDir, 'index.js');
        const coreOnlyIndexPath = join(buildDir, 'index-core-only.js');
        if (existsSync(coreOnlyIndexPath)) {
            if (existsSync(indexPath)) rmSync(indexPath);
            // Rename core-only to index
            const coreOnlyContent = readFileSync(coreOnlyIndexPath, 'utf8');
            writeFileSync(indexPath, coreOnlyContent, 'utf8');
            rmSync(coreOnlyIndexPath);
        }

        // Remove router.cache.js
        const routerCachePath = join(buildDir, 'router.cache.js');
        if (existsSync(routerCachePath)) rmSync(routerCachePath);

        // Also handle .d.ts files if they exist
        const indexDtsPath = join(buildDir, 'index.d.ts');
        const coreOnlyIndexDtsPath = join(buildDir, 'index-core-only.d.ts');
        if (existsSync(coreOnlyIndexDtsPath)) {
            if (existsSync(indexDtsPath)) rmSync(indexDtsPath);
            const coreOnlyDtsContent = readFileSync(coreOnlyIndexDtsPath, 'utf8');
            writeFileSync(indexDtsPath, coreOnlyDtsContent, 'utf8');
            rmSync(coreOnlyIndexDtsPath);
        }

        const routerCacheDtsPath = join(buildDir, 'router.cache.d.ts');
        if (existsSync(routerCacheDtsPath)) rmSync(routerCacheDtsPath);
    }
}

function isExistingMionAOTTemplate(targetDir: string): boolean {
    const packageJsonPath = join(targetDir, 'package.json');
    if (!existsSync(packageJsonPath)) return false;
    try {
        const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
        return packageJson.isMionAOT === true;
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (error) {
        // If we can't read or parse package.json, assume it's not a mion AOT template
        return false;
    }
}

function updatePackageJson(targetDir: string, packageName: string, coreOnly?: boolean): void {
    const packageJsonPath = join(targetDir, 'package.json');

    if (!existsSync(packageJsonPath)) {
        throw new Error(`package.json not found at ${packageJsonPath}`);
    }

    try {
        const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
        packageJson.name = packageName;

        // Remove router dependency for core-only packages
        if (coreOnly && packageJson.peerDependencies) {
            delete packageJson.peerDependencies['@mionkit/router'];
        }

        writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n', 'utf8');
    } catch (error) {
        throw new Error(`Error updating package.json: ${(error as Error).message}`);
    }
}

function showHelp(): void {
    console.log(`
mion-init-aot - Initialize AOT package from template

Usage:
  npx mion-init-aot --dir <directory> [--package-name <name>] [--core-only]

Options:
  -d, --dir <directory>        Target directory for AOT package (required)
  -n, --package-name <name>    Package name (optional, derived from dir if not provided)
  -c, --core-only              Create core-only package (no router dependency)
  -h, --help                   Show this help message

Examples:
  npx mion-init-aot --dir ./packages/my-api-aot
  npx mion-init-aot --dir ./packages/my-api-aot --package-name my-custom-aot
  npx mion-init-aot --dir ./packages/core-aot --core-only
`);
}

/**
 * CLI entry point for mion-init-aot command
 * @param templateDir - Path to the mion-aot-template directory
 */
export function mionInitAot(templateDir: string): void {
    // Parse command line arguments
    const {values: args} = parseArgs({
        args: process.argv.slice(2),
        options: {
            dir: {
                type: 'string',
                short: 'd',
            },
            'package-name': {
                type: 'string',
                short: 'n',
            },
            'core-only': {
                type: 'boolean',
                short: 'c',
            },
            help: {
                type: 'boolean',
                short: 'h',
            },
        },
        allowPositionals: true,
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

    try {
        initAOT({
            dir: args.dir,
            packageName: args['package-name'],
            coreOnly: args['core-only'],
            templateDir,
        });
    } catch (error) {
        console.error(`Error: ${(error as Error).message}`);
        process.exit(1);
    }
}
