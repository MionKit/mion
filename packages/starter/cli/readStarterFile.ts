import {readFileSync, existsSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {STARTER_DEFAULTS} from './starterDefaults.ts';

function resolveStartersDir(): string {
    let dir = dirname(fileURLToPath(import.meta.url));
    for (let i = 0; i < 5; i++) {
        const candidate = resolve(dir, 'starters');
        if (existsSync(candidate)) return candidate;
        dir = dirname(dir);
    }
    throw new Error('Could not locate starters directory');
}

const STARTERS_DIR = resolveStartersDir();

/** Reads the api tsconfig from the starter, stripping dev-only paths that resolve within the monorepo */
export function readStarterTsConfig(starterPath: string): string {
    const fullPath = resolve(STARTERS_DIR, starterPath);
    const tsconfig = JSON.parse(readFileSync(fullPath, 'utf-8'));
    delete tsconfig.compilerOptions.paths;
    return JSON.stringify(tsconfig, null, 2) + '\n';
}

/** Reads a file from the real starter app and replaces default values with user values */
export function readStarterFile(starterPath: string, replacements?: Record<string, string>): string {
    const fullPath = resolve(STARTERS_DIR, starterPath);
    let content = readFileSync(fullPath, 'utf-8');
    if (replacements) {
        for (const [key, value] of Object.entries(replacements)) {
            const defaultValue = STARTER_DEFAULTS[key as keyof typeof STARTER_DEFAULTS];
            if (defaultValue && defaultValue !== value) {
                content = content.replaceAll(defaultValue, value);
            }
        }
    }
    return content;
}
