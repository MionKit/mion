#!/usr/bin/env node

/**
 * Syncs all @mionjs/* dependency versions in test-publish/ to match the current version from @mionjs/core.
 * Run from the repo root: node scripts/sync-test-publish-versions.mjs
 */

import {readFileSync, writeFileSync, globSync} from 'node:fs';
import {join, relative} from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const coreVersion = JSON.parse(readFileSync(join(ROOT, 'packages/core/package.json'), 'utf8')).version;
const targetRange = `^${coreVersion}`;

const testPublishPkgs = globSync('test-publish/**/package.json', {cwd: ROOT, ignore: '**/node_modules/**'});

let updated = 0;

for (const rel of testPublishPkgs) {
    const filePath = join(ROOT, rel);
    const pkg = JSON.parse(readFileSync(filePath, 'utf8'));
    let changed = false;

    // sync the top-level version (skip sub-packages that have their own version scheme)
    if (rel === 'test-publish/package.json' && pkg.version !== coreVersion) {
        pkg.version = coreVersion;
        changed = true;
    }

    for (const depKey of ['dependencies', 'devDependencies', 'peerDependencies']) {
        const deps = pkg[depKey];
        if (!deps) continue;
        for (const [name, range] of Object.entries(deps)) {
            if (!name.startsWith('@mionjs/')) continue;
            // skip file: references — they resolve locally and don't need version bumps
            if (range.startsWith('file:')) continue;
            if (range !== targetRange) {
                deps[name] = targetRange;
                changed = true;
            }
        }
    }

    if (changed) {
        writeFileSync(filePath, JSON.stringify(pkg, null, 2) + '\n');
        updated++;
        console.log(`  updated ${relative(ROOT, filePath)}`);
    }
}

if (updated === 0) {
    console.log(`test-publish versions already in sync (${targetRange})`);
} else {
    console.log(`\nSynced ${updated} file(s) to ${targetRange}`);
}
