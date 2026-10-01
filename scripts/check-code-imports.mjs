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
 * It also fails on an example under packages/private-examples/src that no block imports, directly
 * or through a relative import of an imported example: nobody reads it, so it drifts unseen.
 *
 * Host-side and container-free on purpose: it is a cheap pull-request gate, unlike the
 * in-container `check-links`, which needs the image up.
 */

import {existsSync, readFileSync, readdirSync, statSync} from 'node:fs';
import {resolve, join, relative, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = resolve(fileURLToPath(import.meta.url), '../..');
// The one content tree (every subsite lives under it: content/<NN>.<id>/).
const CONTENT_DIRS = [join(ROOT, 'container/website/content')];
const EXAMPLES_DIR = 'packages/private-examples/src';
const CODE_IMPORT_REGEX = /<code-import\s+([^>]*?)\s*\/>/g;
// The other way a page shows an example: a ::twoslash-code block whose frontmatter names `path:`.
const TWOSLASH_PATH_REGEX = /:{2,}twoslash-code[^\n]*\n\s*---\n(?:(?!\s*---\n)[^\n]*\n)*?\s*path:\s*(\S+)/g;

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

// Examples kept although no page imports them, each with the reason.
export const UNUSED_EXCEPTIONS = {
    'packages/private-examples/src/client/client.ts': 'the client overview links the client/ folder as the full client example',
    'packages/private-examples/src/client/server.routes.ts': 'the server half of that full client example',
    'packages/private-examples/src/run-types/serialization-union.ts': 'deleted by the pull request that rewrites the serialization page',
};

const RELATIVE_IMPORT_REGEX = /(?:from|import)\s*\(?\s*['"](\.{1,2}\/[^'"]+)['"]/g;

/** Every file under dir, recursively, as a root-relative path */
function filesUnder(root, dir) {
    const out = [];
    for (const entry of readdirSync(join(root, dir))) {
        const rel = `${dir}/${entry}`;
        if (statSync(join(root, rel)).isDirectory()) out.push(...filesUnder(root, rel));
        else out.push(rel);
    }
    return out;
}

/** The root-relative file a relative specifier names, trying the .ts spellings a .js or bare one stands for */
function resolveRelative(root, fromFile, specifier) {
    const base = join(dirname(fromFile), specifier);
    const candidates = [base, base.replace(/\.js$/, '.ts'), `${base}.ts`, `${base}/index.ts`];
    return candidates.find((candidate) => existsSync(join(root, candidate)) && statSync(join(root, candidate)).isFile());
}

/** Example files no code-import reaches, minus the exceptions; also exceptions that are missing or in use */
export function unusedExamples(root, importedPaths, exceptions = UNUSED_EXCEPTIONS) {
    const examples = filesUnder(root, EXAMPLES_DIR);
    const reached = new Set();
    const queue = [...importedPaths].filter((path) => path.startsWith(`${EXAMPLES_DIR}/`));
    while (queue.length) {
        const file = queue.pop();
        if (reached.has(file) || !existsSync(join(root, file))) continue;
        reached.add(file);
        for (const [, specifier] of readFileSync(join(root, file), 'utf-8').matchAll(RELATIVE_IMPORT_REGEX)) {
            const target = resolveRelative(root, file, specifier);
            if (target) queue.push(target);
        }
    }
    const unused = examples.filter((file) => !reached.has(file) && !(file in exceptions)).sort();
    const staleExceptions = Object.keys(exceptions).filter((file) => !examples.includes(file) || reached.has(file)).sort();
    return {unused, staleExceptions};
}

function main() {
if (!existsSync(CONTENT_DIRS[0])) throw new Error(`no content tree at ${CONTENT_DIRS[0]}`);
const problems = [];
const importedPaths = new Set();
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
        importedPaths.add(filePath);

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

    for (const match of body.matchAll(TWOSLASH_PATH_REGEX)) {
        blocks++;
        const filePath = match[1];
        importedPaths.add(filePath);
        if (!existsSync(resolve(ROOT, filePath))) problems.push(`${page}:${lineOf(match.index)}  file not found: ${filePath}`);
    }
}

if (problems.length) {
    console.error(`\n✖ ${problems.length} broken <code-import> block(s) out of ${blocks}:\n`);
    for (const problem of problems) console.error(`  ${problem}`);
    console.error('\nA broken block renders as an error placeholder on the site instead of the example.\n');
    process.exit(1);
}

const {unused, staleExceptions} = unusedExamples(ROOT, importedPaths);
if (unused.length || staleExceptions.length) {
    if (unused.length) console.error(`\n✖ ${unused.length} example(s) no <code-import> uses:\n`);
    for (const file of unused) console.error(`  ${file}`);
    if (staleExceptions.length) console.error('\n✖ UNUSED_EXCEPTIONS entries that are missing or now imported:\n');
    for (const file of staleExceptions) console.error(`  ${file}`);
    console.error('\nImport an example from the page it belongs to, or delete it.\n');
    process.exit(1);
}

console.log(`✔ all ${blocks} <code-import> blocks resolve (file + markers), and every example is imported`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
