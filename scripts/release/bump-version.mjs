#!/usr/bin/env node
// Lockstep version bump — the zero-dependency replacement for `lerna version`.
// Writes one version string into version.json + every workspace package.json
// (published and private, so the lockstep stays exact), then commits + tags.
//
//   Usage:  node scripts/release/bump-version.mjs <patch|minor|major|X.Y.Z>
//
// The per-platform @ts-runtypes/binary-* packages and @ts-runtypes/bin's
// optionalDependencies are stamped from version.json at build time by
// scripts/release/build-binaries.mjs — this script never touches them.

import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const VERSION_FILE = path.join(REPO_ROOT, 'version.json');

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const writeJson = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');

function nextVersion(current, bump) {
  if (/^\d+\.\d+\.\d+$/.test(bump)) return bump; // explicit X.Y.Z
  const [major, minor, patch] = current.split('.').map(Number);
  if (bump === 'major') return `${major + 1}.0.0`;
  if (bump === 'minor') return `${major}.${minor + 1}.0`;
  if (bump === 'patch') return `${major}.${minor}.${patch + 1}`;
  throw new Error(`invalid bump "${bump}" — use patch | minor | major | X.Y.Z`);
}

function main() {
  const bump = process.argv[2];
  if (!bump) {
    console.error('usage: node scripts/release/bump-version.mjs <patch|minor|major|X.Y.Z>');
    process.exit(1);
  }
  if (execFileSync('git', ['status', '--porcelain'], {cwd: REPO_ROOT, encoding: 'utf8'}).trim()) {
    throw new Error('working tree is dirty — commit or stash before bumping the version.');
  }

  const manifest = readJson(VERSION_FILE);
  const version = nextVersion(manifest.version, bump);

  // version.json is the source of truth (read by build-binaries.mjs + CI).
  manifest.version = version;
  writeJson(VERSION_FILE, manifest);
  const edited = [path.relative(REPO_ROOT, VERSION_FILE)];

  // Every workspace package.json + the root, so the lockstep stays exact. The
  // ts-runtypes-bin bump is load-bearing: pnpm writes that concrete version into
  // ts-runtypes-devtools' workspace:* dependency at pack time.
  const dirs = [REPO_ROOT, ...fs.readdirSync(path.join(REPO_ROOT, 'packages')).map((name) => path.join(REPO_ROOT, 'packages', name))];
  for (const dir of dirs) {
    const file = path.join(dir, 'package.json');
    if (!fs.existsSync(file)) continue;
    const pkg = readJson(file);
    if (!('version' in pkg)) continue;
    pkg.version = version;
    writeJson(file, pkg);
    edited.push(path.relative(REPO_ROOT, file));
  }

  execFileSync('git', ['add', ...edited], {cwd: REPO_ROOT, stdio: 'inherit'});
  execFileSync('git', ['commit', '-m', `chore(release): v${version}`], {cwd: REPO_ROOT, stdio: 'inherit'});
  execFileSync('git', ['tag', `v${version}`], {cwd: REPO_ROOT, stdio: 'inherit'});

  console.log(`\nBumped to v${version} across ${edited.length} files, committed + tagged.`);
  console.log(`Push the tag when ready:  git push origin v${version}`);
}

main();
