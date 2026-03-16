#!/usr/bin/env node

/**
 * Renames @mionjs tarballs from versioned to unversioned names.
 * Run this after `npm pack` has placed .tgz files in the tarballs/ directory.
 *
 * Example: mionjs-core-0.8.3-alpha.0.tgz -> mionjs-core.tgz
 *
 * package.json already uses stable unversioned paths (file:./tarballs/mionjs-core.tgz),
 * so only the tarball files need renaming.
 */

import {readdirSync, renameSync} from 'fs';
import {resolve, dirname} from 'path';
import {fileURLToPath} from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const tarballsDir = resolve(__dirname, '..', 'tarballs');

const tarballs = readdirSync(tarballsDir).filter((f) => f.endsWith('.tgz'));
let renamed = 0;

for (const tb of tarballs) {
    // Match: mionjs-<name>-<version>.tgz, where version starts with a digit
    const match = tb.match(/^(mionjs-[a-z-]+?)-\d.+\.tgz$/);
    if (match) {
        const unversioned = `${match[1]}.tgz`;
        if (tb !== unversioned) {
            renameSync(resolve(tarballsDir, tb), resolve(tarballsDir, unversioned));
            console.log(`  📦 ${tb} → ${unversioned}`);
            renamed++;
        }
    }
}

console.log(`\nRenamed ${renamed} tarballs to unversioned names.`);
