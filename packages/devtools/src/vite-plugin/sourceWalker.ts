/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {readdirSync, readFileSync, statSync} from 'fs';
import {join, resolve} from 'path';
import {extractVueScriptContent} from './extractPureFn.ts';
import {isIncluded} from './mionVitePlugin.ts';

/** A single source file surfaced to a visitor by the walker. */
export interface SourceFile {
    /** Filesystem path of the file as discovered. */
    fullPath: string;
    /** File contents (for .vue files this is the extracted script block content). */
    code: string;
    /** Path used for parser/diagnostic context (.vue → "<fullPath>.ts"|"tsx"). */
    effectivePath: string;
}

export interface WalkOptions {
    /** Glob include patterns. Default: ts/tsx/js/jsx/vue. */
    include?: string[];
    /** Glob exclude patterns. Default excludes node_modules / build outputs. */
    exclude?: string[];
}

/** Visitor invoked once per file. Mutate caller state from within. Returns nothing. */
export type FileVisitor = (file: SourceFile) => void;

/** Walks each rootDir recursively, applies include/exclude globs, and dispatches every
 *  matching file to all registered visitors in order. Each file is read once.
 *  Errors per file (parse-related) are logged and skipped — never fatal. */
export function walkSourceFiles(rootDirs: string[], opts: WalkOptions, visitors: FileVisitor[]): void {
    if (visitors.length === 0) return;
    const include = opts.include ?? ['**/*.ts', '**/*.tsx', '**/*.vue', '**/*.js', '**/*.jsx'];
    const exclude = opts.exclude ?? ['../node_modules/**', '**/.dist/**', '**/dist/**', '**/build/**'];
    const seen = new Set<string>();
    for (const root of rootDirs) {
        const abs = resolve(root);
        if (seen.has(abs)) continue;
        seen.add(abs);
        walkDir(abs, include, exclude, visitors);
    }
}

function walkDir(dir: string, include: string[], exclude: string[], visitors: FileVisitor[]) {
    let entries: string[];
    try {
        entries = readdirSync(dir);
    } catch {
        // dir missing — silent skip (e.g. clientSrcPath not yet created)
        return;
    }
    for (const entry of entries) {
        const fullPath = join(dir, entry);
        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
            if (!isIncluded(fullPath + '/', include, exclude)) continue;
            walkDir(fullPath, include, exclude, visitors);
        } else if (stat.isFile()) {
            if (!isIncluded(fullPath, include, exclude)) continue;
            try {
                let code = readFileSync(fullPath, 'utf-8');
                let effectivePath = fullPath;
                if (fullPath.endsWith('.vue')) {
                    const block = extractVueScriptContent(code);
                    if (!block) continue;
                    code = block.content;
                    effectivePath = `${fullPath}.${block.lang}`;
                }
                const file: SourceFile = {fullPath, code, effectivePath};
                for (const v of visitors) v(file);
            } catch (err: any) {
                console.warn(`[mion] sourceWalker: skipping ${fullPath}: ${err?.message ?? err}`);
            }
        }
    }
}

/** Visitor that flips `out.found = true` on the first source file containing
 *  any `virtual:mion-aot/` import. Used to gate the buildStart AOT pre-pass. */
export const aotImportVisitor =
    (out: {found: boolean}): FileVisitor =>
    ({code}) => {
        if (out.found) return;
        if (code.includes('virtual:mion-aot/')) out.found = true;
    };
