/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, it, expect} from 'vitest';
import {execFileSync} from 'node:child_process';
import {existsSync, readdirSync, readFileSync, statSync} from 'node:fs';
import {createRequire} from 'node:module';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

// The consumer root: `npm install` put every published @mionjs/* under its node_modules,
// so these assertions read the tarballs verdaccio actually served, unpacked.
const consumerRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/** Packages that keep a `source` condition in the repo; each must ship the PUBLISHED manifest instead. */
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
// NOT listed: @mionjs/bin-uws ships plain JS (lib/) and never had a `source` condition; the
// @mionjs/native-uws-<os>-<arch> payloads are binaries staged at release time.

function pkgDir(name: string): string {
    return resolve(consumerRoot, 'node_modules', name);
}

function readManifest(name: string): {exports?: unknown; imports?: unknown} {
    return JSON.parse(readFileSync(resolve(pkgDir(name), 'package.json'), 'utf8')) as {exports?: unknown; imports?: unknown};
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

function collectCondition(exportsField: unknown, condition: string, out: string[] = []): string[] {
    if (!exportsField || typeof exportsField !== 'object') return out;
    const record = exportsField as Record<string, unknown>;
    if (typeof record[condition] === 'string') out.push(record[condition]);
    for (const value of Object.values(record)) if (value && typeof value === 'object') collectCondition(value, condition, out);
    return out;
}

describe('published tarballs ship type definitions, never sources', () => {
    for (const name of publicPackages) {
        describe(name, () => {
            const root = pkgDir(name);
            const manifest = readManifest(name);

            // scripts/release/pack.mjs strips it: it would name a src/ the tarball does not carry,
            // and a dangling condition fails the consumer who asks, where an absent one falls
            // through to `types`.
            it('declares no `source` export condition', () => {
                const sourcePaths = collectCondition(manifest.exports, 'source');
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

            // A .d.ts.map names ../src/*.ts and embeds none of its own, so with src gone it resolves to nothing.
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

// Every package ships ESM only: a CommonJS consumer loads it through Node's require(esm), one copy for import and require.
// @mionjs/devtools stays import-only build tooling (its `./eslint` entry awaits at the top level, which require refuses).
const requirablePackages = [...publicPackages.filter((name) => name !== '@mionjs/devtools'), '@mionjs/bin-uws'];
// `./drizzle` re-exports upstream drizzle-orm, an optional peer this lane does not install.
const optionalPeerSubpaths = new Set(['./drizzle']);
const requireFromConsumer = createRequire(resolve(consumerRoot, 'consumer.cjs'));

describe('a CommonJS consumer require()s every package', () => {
    for (const name of requirablePackages) {
        it(name, () => {
            const manifest = readManifest(name);
            expect(collectCondition([manifest.exports, manifest.imports], 'require'), `${name} has a require condition`).toEqual([]);
            for (const subpath of Object.keys(manifest.exports as object)) {
                if (optionalPeerSubpaths.has(subpath)) continue;
                const id = subpath === '.' ? name : `${name}/${subpath.slice(2)}`;
                expect(() => requireFromConsumer(id), `require('${id}')`).not.toThrow();
            }
        });
    }

    it('type-checks a .cts consumer under module nodenext', () => {
        const tsc = requireFromConsumer.resolve('typescript/bin/tsc');
        execFileSync(process.execPath, [tsc, '-p', resolve(consumerRoot, 'src/cjs-consumer/tsconfig.json')], {stdio: 'pipe'});
    });
});
