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

/** Packages whose tarballs must ship TS source alongside `.dist`, so the `source` export condition resolves for downstream consumers (e.g. mion-pro). */
const publicPackages = [
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
    '@mionjs/drizzle-orm-mysql-core',
    '@mionjs/drizzle-orm-pg-core',
    '@mionjs/drizzle-orm-sqlite-core',
    '@mionjs/devtools',
];
// NOT listed: @mionjs/bin-uws ships plain JS (lib/) with no `source` export condition,
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

describe('published tarballs ship source + declaration maps', () => {
    for (const name of publicPackages) {
        describe(name, () => {
            const root = pkgDir(name);
            const manifest = readManifest(name);
            const sourcePaths = collectSourcePathsFromExports(manifest.exports);

            it('has at least one `source` export', () => {
                expect(sourcePaths.length, `${name} declares no "source" export condition`).toBeGreaterThan(0);
            });

            it('ships every file referenced by the `source` export condition', () => {
                for (const p of sourcePaths) {
                    const full = resolve(root, p);
                    expect(
                        existsSync(full),
                        `${name}: "source" condition points at ${p} but it is missing from the published tarball`
                    ).toBe(true);
                }
            });

            it('ships declaration maps next to each .d.ts in the output dir', () => {
                // The framework packages emit `.dist`, the merged @mionjs/devtools `dist`.
                const distRoot = ['.dist', 'dist', 'build'].map((dir) => resolve(root, dir)).find((dir) => existsSync(dir)) ?? resolve(root, '.dist');
                const files = walk(distRoot);
                const declarations = files.filter((f) => f.endsWith('.d.ts'));
                expect(declarations.length, `${name}: no declaration files found under ${distRoot}`).toBeGreaterThan(0);
                const missingMaps = declarations.filter((d) => !files.includes(`${d}.map`));
                expect(missingMaps, `${name}: missing .d.ts.map alongside: ${missingMaps.join(', ')}`).toEqual([]);
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
