#!/usr/bin/env node
// rename-casing.mjs - Case-sensitive string replacement for all casing variants
// Replaces content in files AND renames files/directories
//
// Usage: node scripts/rename-casing.mjs <fromCamelCase> <toCamelCase> [directory]
// Example: node scripts/rename-casing.mjs useFn linkedFn
// Example: node scripts/rename-casing.mjs useFn linkedFn ./website
//
// Generates and replaces in order:
//   1. camelCase:  useFn    -> linkedFn
//   2. PascalCase: UseFn    -> LinkedFn
//   3. kebab-case: use-fn   -> linked-fn
//   4. Kebab-Case: Use-Fn   -> Linked-Fn
//   5. UPPER_CASE: USE_FN   -> LINKED_FN
//
// Partial matching is intentional (e.g. UseFnConfig -> LinkedFnConfig)
// All replacements are case-sensitive

import {readdirSync, readFileSync, writeFileSync, existsSync, unlinkSync, renameSync} from 'fs';
import {join, basename, dirname} from 'path';

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.nuxt', '.output', 'coverage']);
const FILE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.md', '.mdx', '.json', '.yaml', '.yml', '.html', '.css', '.vue']);

// --- Case conversion helpers ---

function toPascal(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function toKebabLower(str) {
    return str.replace(/([a-z])([A-Z])/g, (_, a, b) => `${a}-${b.toLowerCase()}`);
}

function toKebabUpper(str) {
    return toKebabLower(toPascal(str)).replace(/(^|-)(\w)/g, (_, sep, ch) => `${sep}${ch.toUpperCase()}`);
}

function toUpperSnake(str) {
    return str.replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase();
}

// --- Generate replacement pairs ---

function generatePairs(from, to) {
    return [
        [from, to],
        [toPascal(from), toPascal(to)],
        [toKebabLower(from), toKebabLower(to)],
        [toKebabUpper(from), toKebabUpper(to)],
        [toUpperSnake(from), toUpperSnake(to)],
    ];
}

// --- Walk directory recursively ---

function walkDir(dir) {
    const results = [];
    for (const entry of readdirSync(dir, {withFileTypes: true})) {
        if (SKIP_DIRS.has(entry.name)) continue;
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
            results.push(...walkDir(fullPath));
            results.push({path: fullPath, isDir: true});
        } else if (FILE_EXTENSIONS.has('.' + entry.name.split('.').pop())) {
            results.push({path: fullPath, isDir: false});
        }
    }
    return results;
}

// --- Parse args ---

function parseArgs(argv) {
    const args = argv.slice(2);
    const skipRename = [];
    const positional = [];
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--skip-rename' && i + 1 < args.length) {
            skipRename.push(args[++i]);
        } else {
            positional.push(args[i]);
        }
    }
    return {from: positional[0], to: positional[1], dir: positional[2] || '.', skipRename};
}

// --- Main ---

const {from, to, dir, skipRename} = parseArgs(process.argv);
if (!from || !to) {
    console.error('Usage: node scripts/rename-casing.mjs <fromCamelCase> <toCamelCase> [directory]');
    console.error('Options: --skip-rename <glob>  Skip renaming files matching glob (content still replaced)');
    process.exit(1);
}

const pairs = generatePairs(from, to);

console.log('=== Replacement pairs (in order) ===');
for (const [f, t] of pairs) console.log(`  ${f} => ${t}`);
console.log('');

// Step 1: Replace file contents
console.log('=== Replacing file contents ===');
let contentCount = 0;
const entries = walkDir(dir);
const files = entries.filter((e) => !e.isDir);

for (const {path: filePath} of files) {
    let content = readFileSync(filePath, 'utf-8');
    let modified = false;
    for (const [f, t] of pairs) {
        if (content.includes(f)) {
            content = content.replaceAll(f, t);
            modified = true;
        }
    }
    if (modified) {
        writeFileSync(filePath, content, 'utf-8');
        console.log(`  [content] ${filePath}`);
        contentCount++;
    }
}
console.log(`  Total: ${contentCount} files modified`);
console.log('');

// Step 2: Rename files and directories (deepest first so nested renames don't break parent paths)
console.log('=== Renaming files and directories ===');
let renameCount = 0;

// Re-walk to get fresh paths, process files first then dirs (dirs are deepest-first from the walk)
const allEntries = walkDir(dir);
const toRename = [...allEntries.filter((e) => !e.isDir), ...allEntries.filter((e) => e.isDir)];

for (const {path: filePath} of toRename) {
    if (skipRename.some((pattern) => filePath.includes(pattern))) continue;
    const base = basename(filePath);
    let newBase = base;
    for (const [f, t] of pairs) {
        newBase = newBase.replaceAll(f, t);
    }
    if (base !== newBase) {
        const newPath = join(dirname(filePath), newBase);
        if (existsSync(newPath)) {
            // Destination already exists — remove source as duplicate
            unlinkSync(filePath);
            console.log(`  [duplicate] ${filePath} removed (${newPath} already exists)`);
            renameCount++;
        } else {
            renameSync(filePath, newPath);
            console.log(`  [rename] ${filePath} => ${newPath}`);
            renameCount++;
        }
    }
}
console.log(`  Total: ${renameCount} renames`);
console.log('');
console.log('=== Done ===');
