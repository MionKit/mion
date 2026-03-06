import {existsSync, mkdirSync, writeFileSync, readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';

export interface GeneratedFile {
    path: string;
    content: string;
}

/** Writes a file, creating parent directories as needed */
export function writeFile(filePath: string, content: string): void {
    const dir = dirname(filePath);
    if (!existsSync(dir)) mkdirSync(dir, {recursive: true});
    writeFileSync(filePath, content, 'utf-8');
}

/** Writes multiple files and logs the result */
export function writeFiles(cwd: string, files: GeneratedFile[]): void {
    for (const file of files) {
        const fullPath = join(cwd, file.path);
        writeFile(fullPath, file.content);
        console.log(`  created ${file.path}`);
    }
}

/** Reads and parses a JSON file */
export function readJson<T = Record<string, unknown>>(filePath: string): T {
    return JSON.parse(readFileSync(filePath, 'utf-8'));
}

/** Writes an object as formatted JSON */
export function writeJson(filePath: string, data: unknown): void {
    writeFile(filePath, JSON.stringify(data, null, 2) + '\n');
}
