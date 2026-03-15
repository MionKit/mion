#!/usr/bin/env node

/**
 * Rewrites @mionjs/* dependencies in package.json to point to local tarballs.
 * Run this after `npm pack` has placed .tgz files in the tarballs/ directory.
 */

import {readFileSync, writeFileSync, readdirSync} from 'fs';
import {resolve, dirname} from 'path';
import {fileURLToPath} from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');
const pkgPath = resolve(rootDir, 'package.json');
const tarballsDir = resolve(rootDir, 'tarballs');

const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const tarballs = readdirSync(tarballsDir).filter((f) => f.endsWith('.tgz'));

/** Find tarball filename for a scoped package name like @mionjs/core */
function findTarball(pkgName) {
    // @mionjs/core -> mionjs-core-
    const prefix = pkgName.replace('@', '').replace('/', '-');
    const match = tarballs.find((t) => t.startsWith(prefix));
    if (!match) {
        console.warn(`  ⚠️  No tarball found for ${pkgName} (looking for ${prefix}*.tgz)`);
    }
    return match;
}

let rewritten = 0;

for (const depType of ['dependencies', 'devDependencies']) {
    const deps = pkg[depType];
    if (!deps) continue;

    for (const [dep, version] of Object.entries(deps)) {
        if (!dep.startsWith('@mionjs/')) continue;
        const tb = findTarball(dep);
        if (tb) {
            deps[dep] = `file:./tarballs/${tb}`;
            rewritten++;
            console.log(`  ✅ ${dep}: ${version} → file:./tarballs/${tb}`);
        }
    }
}

writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
console.log(`\nRewrote ${rewritten} dependencies to tarball paths.`);
