import {existsSync, readFileSync} from 'node:fs';
import {join} from 'node:path';

export type FrameworkType = 'nextjs' | 'nuxt';

export interface DetectedProject {
    framework: FrameworkType;
    name: string;
    configFile: string;
}

const NEXTJS_CONFIGS = ['next.config.js', 'next.config.ts', 'next.config.mjs'];
const NUXT_CONFIGS = ['nuxt.config.js', 'nuxt.config.ts', 'nuxt.config.mjs'];

/** Detects the meta-framework used in the given directory */
export function detectFramework(cwd: string): DetectedProject | null {
    const projectName = readProjectName(cwd);

    for (const config of NEXTJS_CONFIGS) {
        if (existsSync(join(cwd, config))) {
            return {framework: 'nextjs', name: projectName, configFile: config};
        }
    }

    for (const config of NUXT_CONFIGS) {
        if (existsSync(join(cwd, config))) {
            return {framework: 'nuxt', name: projectName, configFile: config};
        }
    }

    return null;
}

function readProjectName(cwd: string): string {
    try {
        const pkg = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf-8'));
        return pkg.name || 'my-app';
    } catch {
        return 'my-app';
    }
}
