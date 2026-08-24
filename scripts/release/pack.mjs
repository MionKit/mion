#!/usr/bin/env node
// Packs every publishable package into tarballs/ for the verdaccio-backed e2e
// (and as the exact artifacts the publish job ships):
//   - FE packages (ts-runtypes, ts-runtypes-devtools) via `pnpm pack`, so the
//     workspace:* dep on ts-runtypes-bin is rewritten to a concrete version.
//   - launcher + the 7 platform packages from dist-binaries/ (already assembled
//     by build-binaries.mjs, optionalDependencies filled) via `npm pack`.
//
// Run AFTER `node scripts/release/build-binaries.mjs` and a JS `build`.

import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TARBALLS = path.join(REPO_ROOT, 'tarballs');
const DIST_BINARIES = path.join(REPO_ROOT, 'dist-binaries');
// Directory names under packages/ — unchanged by the @ts-runtypes/* scope rename
// (only the package.json "name" fields moved onto the scope).
const FE_PACKAGE_DIRS = ['ts-runtypes', 'ts-runtypes-devtools'];

function pack(cmd, dir) {
  // pnpm/npm pack both accept --pack-destination and emit <name>-<version>.tgz.
  execFileSync(cmd, ['pack', '--pack-destination', TARBALLS], {cwd: dir, stdio: 'inherit'});
}

// npm packs a scoped package @scope/name as scope-name-<version>.tgz.
function tarballName(name, version) {
  return `${name.replace('@', '').replace('/', '-')}-${version}.tgz`;
}

// A `files` entry that matches nothing is SILENTLY ignored by npm, so a package can
// declare "README.md" and still publish a blank npm page — @ts-runtypes/core did
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
    throw new Error('dist-binaries/ missing — run `pnpm rtx release binaries` first.');
  }
  fs.rmSync(TARBALLS, {recursive: true, force: true});
  fs.mkdirSync(TARBALLS, {recursive: true});

  // FE packages: pnpm pack rewrites the workspace:* protocol to the version.
  for (const dir of FE_PACKAGE_DIRS) pack('pnpm', path.join(REPO_ROOT, 'packages', dir));

  // Launcher + platform packages: assembled under dist-binaries/<scoped-name>/
  // (nested by npm scope, e.g. @ts-runtypes/binary-linux-x64) and enumerated in
  // publish-order.json. No workspace deps, so plain `npm pack` of each staged dir.
  const publishOrder = JSON.parse(fs.readFileSync(path.join(DIST_BINARIES, 'publish-order.json'), 'utf8'));
  for (const name of publishOrder) {
    execFileSync('npm', ['pack', path.join(DIST_BINARIES, name), '--pack-destination', TARBALLS], {cwd: REPO_ROOT, stdio: 'inherit'});
  }

  assertReadmes([...FE_PACKAGE_DIRS.map((dir) => path.join(REPO_ROOT, 'packages', dir)), path.join(DIST_BINARIES, '@ts-runtypes/bin')]);

  const tarballs = fs.readdirSync(TARBALLS).filter((file) => file.endsWith('.tgz')).sort();
  console.log(`\nPacked ${tarballs.length} tarballs into ${path.relative(REPO_ROOT, TARBALLS)}/:`);
  for (const tarball of tarballs) console.log('  ' + tarball);
}

main();
