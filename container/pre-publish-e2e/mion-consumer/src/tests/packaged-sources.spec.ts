/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, it, expect} from 'vitest';
import {existsSync, readdirSync, readFileSync, statSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

// The consumer root: `npm install` put every published @mionjs/* under its node_modules,
// so these assertions read the tarballs verdaccio actually served, unpacked.
const consumerRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/** Every package that keeps a `source` export condition in the repo. Each must ship the PUBLISHED
 *  manifest instead: no condition, no sources, just the type definitions and the build output. */
const publicPackages = [
    '@mionjs/run-types',
    '@mionjs/core',
    '@mionjs/router',
    '@mionjs/client',
    '@mionjs/platform-node',
    '@mionjs/platform-aws',
    '@mionjs/platform-bun',
    '@mionjs/platform-cloudflare',
    '@mionjs/platform-gcloud',
    '@mionjs/platform-uws',
    '@mionjs/platform-vercel',
    '@mionjs/drizzle-orm',
    '@mionjs/drizzle-orm-mysql-core',
    '@mionjs/drizzle-orm-pg-core',
    '@mionjs/drizzle-orm-sqlite-core',
    '@mionjs/devtools',
];
// NOT listed: @mionjs/bin-uws ships plain JS (lib/) and never had a `source` condition,
// and the @mionjs/native-uws-<os>-<arch> payloads are binaries staged at release time.

function pkgDir(name: string): string {
    return resolve(consumerRoot, 'node_modules', name);
}

function readManifest(name: string): {exports?: unknown} {
    return JSON.parse(readFileSync(resolve(pkgDir(name), 'package.json'), 'utf8')) as {exports?: unknown};
}

function walk(dir: string, acc: string[] = [], base = dir): string[] {
    if (!existsSync(dir)) return acc;
    for (const entry of readdirSync(dir)) {
        const full = resolve(dir, entry);
        const rel = full.slice(base.length + 1);
        if (statSync(full).isDirectory()) walk(full, acc, base);
        else acc.push(rel);
    }
    return acc;
}

function collectSourcePathsFromExports(exportsField: unknown, out: string[] = []): string[] {
    if (!exportsField || typeof exportsField !== 'object') return out;
    const record = exportsField as Record<string, unknown>;
    if (typeof record.source === 'string') out.push(record.source);
    for (const value of Object.values(record)) if (value && typeof value === 'object') collectSourcePathsFromExports(value, out);
    return out;
}

describe('published tarballs ship type definitions, never sources', () => {
    for (const name of publicPackages) {
        describe(name, () => {
            const root = pkgDir(name);
            const manifest = readManifest(name);

            // scripts/release/pack.mjs strips it, because it names a src/ the tarball does not
            // carry — and a consumer who asks for the condition fails on a dangling one, where
            // an absent one just falls through to `types`.
            it('declares no `source` export condition', () => {
                const sourcePaths = collectSourcePathsFromExports(manifest.exports);
                expect(sourcePaths, `${name} still declares "source": ${sourcePaths.join(', ')}`).toEqual([]);
            });

            it('carries no src directory', () => {
                expect(existsSync(resolve(root, 'src')), `${name}: the tarball still ships src/`).toBe(false);
            });

            it('ships declarations in the output dir', () => {
                // The framework packages emit `.dist`, the merged @mionjs/devtools `dist`.
                const distRoot = ['.dist', 'dist', 'build'].map((dir) => resolve(root, dir)).find((dir) => existsSync(dir)) ?? resolve(root, '.dist');
                const declarations = walk(distRoot).filter((file) => file.endsWith('.d.ts'));
                expect(declarations.length, `${name}: no declaration files found under ${distRoot}`).toBeGreaterThan(0);
            });

            // A .d.ts.map names ../src/*.ts and embeds no source of its own, so with the sources
            // gone it resolves to nothing: dead weight that breaks "go to definition" either way.
            it('ships no declaration maps, which would have nothing to point at', () => {
                const maps = walk(root).filter((file) => file.endsWith('.d.ts.map'));
                expect(maps, `${name}: dangling declaration maps: ${maps.join(', ')}`).toEqual([]);
            });

            it('does not ship spec, test or tsc build-info files', () => {
                // A no-emit `tsc` under the root's `incremental` still writes a
                // .tsbuildinfo into outDir, i.e. into the very dir the tarball ships.
                const files = walk(root);
                const leaked = files.filter((f) => /\.(spec|test)\.[mc]?[tj]s$/.test(f) || f.endsWith('.tsbuildinfo'));
                expect(leaked, `${name}: spec/test/build-info files leaked into the tarball: ${leaked.join(', ')}`).toEqual([]);
            });
        });
    }
});
