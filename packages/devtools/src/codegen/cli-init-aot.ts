/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {resolve, join, basename} from 'path';
import {existsSync, mkdirSync, cpSync, readFileSync, writeFileSync, rmSync} from 'fs';
import {parseArgs} from 'util';
import {isTest} from './constants.ts';

export interface InitAOTOptions {
    dir: string;
    packageName?: string;
    /** Path to the mion-aot-template directory (defaults to package-relative) */
    templateDir?: string;
}

const DEFAULT_TEMPLATE_DIR = join(__dirname, '..', '..', 'mion-aot-template');

export function initAOT(options: InitAOTOptions): void {
    const {dir, packageName, templateDir = DEFAULT_TEMPLATE_DIR} = options;

    const targetDir = resolve(dir);
    const finalPackageName = packageName || basename(targetDir);

    if (!isTest) {
        console.log(`
Initializing AOT package:
  Target directory: ${targetDir}
  Package name: ${finalPackageName}
`);
    }

    if (!existsSync(templateDir)) {
        throw new Error(`Template directory not found at ${templateDir}`);
    }

    copyTemplate(templateDir, targetDir);
    updatePackageJson(targetDir, finalPackageName);

    if (!isTest) {
        console.log(`AOT package initialized successfully!`);
    }
}

function copyTemplate(templateDir: string, targetDir: string): void {
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
    } catch (error) {
        throw new Error(`Error copying template: ${(error as Error).message}`);
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

function updatePackageJson(targetDir: string, packageName: string): void {
    const packageJsonPath = join(targetDir, 'package.json');

    if (!existsSync(packageJsonPath)) {
        throw new Error(`package.json not found at ${packageJsonPath}`);
    }

    try {
        const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
        packageJson.name = packageName;
        // Remove scripts from template - they are only needed for building the template artifacts
        delete packageJson.scripts;

        writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n', 'utf8');
    } catch (error) {
        throw new Error(`Error updating package.json: ${(error as Error).message}`);
    }
}

function showHelp(): void {
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
            templateDir,
        });
    } catch (error) {
        console.error(`Error: ${(error as Error).message}`);
        process.exit(1);
    }
}
