#!/usr/bin/env node
// Packs every publishable package into tarballs/ for the verdaccio-backed e2e
// (and as the exact artifacts the publish job ships):
//   - workspace packages (both families: the type-system and framework packages) via
//     `pnpm pack`, so every workspace:* dep is rewritten to a concrete version.
//     That rewrite is what makes the e2e meaningful across the families: a packed
//     @mionjs/core carries an exact @mionjs/run-types version, and verdaccio has
//     to serve BOTH from the local publishes.
//     Each is packed from its PUBLISHED manifest (packPublished): no `source` condition.
//   - launcher + the platform packages from dist-binaries/ (already assembled
//     by build-binaries.mjs, optionalDependencies filled) via `npm pack`. All
//     seven for a release; just the host's after `release binaries --host-only`
//     (the drizzle-e2e lane), and the launcher then names only that one.
//
// The workspace set is DERIVED, never hand-listed: every non-private
// packages/*/package.json minus whatever dist-binaries/publish-order.json already
// stages (that is where @mionjs/bin-compiler comes from). A new public package joins
// the e2e by existing, not by being remembered here.
//
// tarballs/ is also exactly what the release publishes from: every @mionjs/*
// tarball rides the train (publish-tarballs.mjs), the drizzle dialect packages
// at their own drizzle-aligned versions.
//
// Run AFTER `node scripts/release/build-binaries.mjs` and a JS `build`.

import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {stripSourceCondition} from '../lib/publish-manifest.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PACKAGES = path.join(REPO_ROOT, 'packages');
const TARBALLS = path.join(REPO_ROOT, 'tarballs');
const DIST_BINARIES = path.join(REPO_ROOT, 'dist-binaries');

// Every publishable workspace package directory, as absolute paths. Non-private,
// has a name + version, and is not already staged under dist-binaries/ (the
// launcher lives there with its optionalDependencies filled, so packing it from
// packages/ would ship an empty one). Sorted, so the packed order is stable.
function workspacePackageDirs(stagedNames) {
  const dirs = [];
  for (const entry of fs.readdirSync(PACKAGES, {withFileTypes: true}).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory()) continue;
    const manifestFile = path.join(PACKAGES, entry.name, 'package.json');
    if (!fs.existsSync(manifestFile)) continue;
    const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
    if (manifest.private || !manifest.name || !manifest.version) continue;
    if (stagedNames.has(manifest.name)) continue;
    dirs.push(path.join(PACKAGES, entry.name));
  }
  return dirs;
}

// Strips the `source` export condition for the pack and restores it after: the repo needs the
// condition for its own resolution, the tarball must not name a src/ it does not carry. The
// `finally` matters — a crash mid-pack must not leave a rewritten manifest checked out.
function packPublished(dir) {
  const manifestFile = path.join(dir, 'package.json');
  const original = fs.readFileSync(manifestFile, 'utf8');
  const indent = /\n(\s+)"/.exec(original)?.[1].length ?? 2;
  fs.writeFileSync(manifestFile, `${JSON.stringify(stripSourceCondition(JSON.parse(original)), null, indent)}\n`);
  try {
    // pnpm pack accepts --pack-destination and emits <name>-<version>.tgz.
    execFileSync('pnpm', ['pack', '--pack-destination', TARBALLS], {cwd: dir, stdio: 'inherit'});
  } finally {
    fs.writeFileSync(manifestFile, original);
  }
}

// npm packs a scoped package @scope/name as scope-name-<version>.tgz.
function tarballName(name, version) {
  return `${name.replace('@', '').replace('/', '-')}-${version}.tgz`;
}

// A `files` entry that matches nothing is SILENTLY ignored by npm, so a package can
// declare "README.md" and still publish a blank npm page — @mionjs/run-types did
// exactly that. Assert the packed artifact really carries one, so the defect fails
// here instead of surfacing on the registry. Only the hand-authored packages are
// checked; the per-platform binary packages ship lib/ + LICENSE by design.
function assertReadmes(packageDirs) {
  for (const dir of packageDirs) {
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
    if (!pkg.files?.includes('README.md')) continue;
    const tarball = tarballName(pkg.name, pkg.version);
    const entries = execFileSync('tar', ['-tzf', path.join(TARBALLS, tarball)], {encoding: 'utf8'}).split('\n');
    if (!entries.includes('package/README.md')) {
      throw new Error(`pack: ${pkg.name} declares README.md in "files" but ${tarball} contains none — its npm page would be blank.`);
    }
  }
}

function main() {
  if (!fs.existsSync(DIST_BINARIES)) {
    throw new Error('dist-binaries/ missing — run `pnpm miondevx release binaries` first.');
  }
  fs.rmSync(TARBALLS, {recursive: true, force: true});
  fs.mkdirSync(TARBALLS, {recursive: true});

  // Launcher + platform packages: assembled under dist-binaries/<scoped-name>/
  // (nested by npm scope, e.g. @mionjs/native-compiler-linux-x64) and enumerated in
  // publish-order.json. No workspace deps, so plain `npm pack` of each staged dir.
  const publishOrder = JSON.parse(fs.readFileSync(path.join(DIST_BINARIES, 'publish-order.json'), 'utf8'));
  for (const name of publishOrder) {
    execFileSync('npm', ['pack', path.join(DIST_BINARIES, name), '--pack-destination', TARBALLS], {cwd: REPO_ROOT, stdio: 'inherit'});
  }

  // Workspace packages: pnpm pack rewrites the workspace:* protocol to the version.
  const workspaceDirs = workspacePackageDirs(new Set(publishOrder));
  for (const dir of workspaceDirs) packPublished(dir);

  assertReadmes([...workspaceDirs, path.join(DIST_BINARIES, '@mionjs/bin-compiler')]);

  const tarballs = fs.readdirSync(TARBALLS).filter((file) => file.endsWith('.tgz')).sort();
  console.log(`\nPacked ${tarballs.length} tarballs into ${path.relative(REPO_ROOT, TARBALLS)}/:`);
  for (const tarball of tarballs) console.log('  ' + tarball);
}

main();
