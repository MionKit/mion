#!/usr/bin/env node
/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

/**
 * Validates every <code-import> block in the docs content tree
 * (container/website/content).
 *
 * A broken block does NOT fail the website build: processCodeImports() catches the error and
 * renders a ```text block reading "// Error processing code-import: ...", so a page silently
 * ships a hole instead of an example (container/website/server/utils/code-import.ts). This
 * script is the guard that turns that into a loud failure.
 *
 * Checks, per block: the `path` attribute is present, resolves to a file on disk, and — when
 * `commentStart`/`commentEnd` are given — that both markers exist in that file. Marker drift is
 * the failure mode the original sweep missed: the path resolved, the marker did not exist.
 *
 * Host-side and container-free on purpose: it is a cheap pull-request gate, unlike the
 * in-container `check-links`, which needs the image up.
 */

import {existsSync, readFileSync, readdirSync, statSync} from 'node:fs';
import {resolve, join, relative} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = resolve(fileURLToPath(import.meta.url), '../..');
// The one content tree (every subsite lives under it: content/<NN>.<id>/).
const CONTENT_DIRS = [join(ROOT, 'container/website/content')];
if (!existsSync(CONTENT_DIRS[0])) throw new Error(`no content tree at ${CONTENT_DIRS[0]}`);
const CODE_IMPORT_REGEX = /<code-import\s+([^>]*?)\s*\/>/g;

/** Mirrors parseAttributes() in container/website/server/utils/code-import.ts */
function parseAttributes(str) {
    const attrs = {};
    const attrRegex = /(\w+)=(?:"([^"]*)"|'([^']*)'|(\S+))/g;
    let match;
    while ((match = attrRegex.exec(str)) !== null) {
        const [, name, doubleQuoted, singleQuoted, unquoted] = match;
        if (name) attrs[name] = doubleQuoted ?? singleQuoted ?? unquoted ?? '';
    }
    return attrs;
}

/** Every .md file under dir, recursively */
function markdownFiles(dir) {
    const out = [];
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) out.push(...markdownFiles(full));
        else if (entry.endsWith('.md')) out.push(full);
    }
    return out;
}

const problems = [];
let blocks = 0;

for (const mdPath of CONTENT_DIRS.flatMap(markdownFiles)) {
    const body = readFileSync(mdPath, 'utf-8');
    const page = relative(ROOT, mdPath);
    // line number of each block, for a clickable error
    const lineOf = (index) => body.slice(0, index).split('\n').length;

    for (const match of body.matchAll(CODE_IMPORT_REGEX)) {
        blocks++;
        const at = `${page}:${lineOf(match.index)}`;
        const {path: filePath, commentStart, commentEnd} = parseAttributes(match[1]);

        if (!filePath) {
            problems.push(`${at}  missing "path" attribute`);
            continue;
        }

        let source;
        try {
            source = readFileSync(resolve(ROOT, filePath), 'utf-8');
        } catch {
            problems.push(`${at}  file not found: ${filePath}`);
            continue;
        }

        // `lines` blocks carry no markers; nothing further to check
        for (const marker of [commentStart, commentEnd]) {
            if (marker && !source.includes(marker)) problems.push(`${at}  marker not found in ${filePath}: ${marker}`);
        }
    }
}

if (problems.length) {
    console.error(`\n✖ ${problems.length} broken <code-import> block(s) out of ${blocks}:\n`);
    for (const problem of problems) console.error(`  ${problem}`);
    console.error('\nA broken block renders as an error placeholder on the site instead of the example.\n');
    process.exit(1);
}

console.log(`✔ all ${blocks} <code-import> blocks resolve (file + markers)`);
