import {readFileSync, existsSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

function resolveTemplatesDir(): string {
    let dir = dirname(fileURLToPath(import.meta.url));
    for (let i = 0; i < 5; i++) {
        const candidate = resolve(dir, 'templates');
        if (existsSync(candidate)) return candidate;
        dir = dirname(dir);
    }
    throw new Error('Could not locate templates directory');
}

const TEMPLATES_DIR = resolveTemplatesDir();

/** Reads a template file and replaces {{KEY}} placeholders with provided values */
export function readTemplate(templatePath: string, replacements?: Record<string, string>): string {
    const fullPath = resolve(TEMPLATES_DIR, templatePath);
    let content = readFileSync(fullPath, 'utf-8');
    if (replacements) {
        for (const [key, value] of Object.entries(replacements)) {
            content = content.replaceAll(`{{${key}}}`, value);
        }
    }
    return content;
}
