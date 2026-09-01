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
//
// ONE family is not on the lockstep: the @mionjs/drizzle-orm-*-core packages
// ride drizzle-orm's version line (scripts/lib/drizzle-line.mjs). They get the
// version.json string NEVER; instead each gets a patch bump here IF its own
// published files changed since its last bump, so a release that did not touch
// them publishes nothing new for them.

import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {installedDrizzleVersion, peerRangeFor, plannedVersion, readDialectPackages, unreleasedChanges} from '../lib/drizzle-line.mjs';

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

// Decides the next version of every drizzle-line package: a patch bump for the
// ones carrying unreleased published changes, the current version for the rest.
// Refuses to guess — a tree whose versions do not match the installed drizzle-orm,
// or a history too shallow to tell what changed, throws. Planning happens BEFORE
// anything is written, so an abort leaves the tree untouched.
function planDrizzleLine(newVersion) {
  const installed = installedDrizzleVersion(REPO_ROOT);
  // Their @mionjs/run-types peer range covers the lockstep MINOR, so it moves (and
  // with it the package a consumer installs) only on a minor bump, not every patch.
  const coreRange = peerRangeFor(newVersion);
  const [drizzleMajor, drizzleMinor] = installed.split('.').map(Number);
  const plan = [];

  for (const row of readDialectPackages(REPO_ROOT)) {
    const {pkg, packageFile, packageDir} = row;
    const [major, minor] = pkg.version.split('.').map(Number);
    if (major !== drizzleMajor || minor !== drizzleMinor) {
      throw new Error(`${pkg.name} is on ${pkg.version} but drizzle-orm ${installed} is installed — realign the drizzle line first (pnpm rtx release check-drizzle-versions).`);
    }
    if (pkg.peerDependencies?.['drizzle-orm'] !== peerRangeFor(installed)) {
      throw new Error(`${pkg.name}'s drizzle-orm peer range does not match drizzle-orm ${installed} — realign it first (pnpm rtx release check-drizzle-versions).`);
    }

    const changes = unreleasedChanges(REPO_ROOT, packageDir);
    if (!changes.known) {
      throw new Error(`cannot tell what changed in ${packageDir} since its last version bump (shallow clone?) — bump the release from a full checkout.`);
    }
    // A moved core peer range is itself a published change: it is what the consumer
    // resolves against, so it earns the same patch bump as an edited source file.
    const coreRangeMoved = pkg.peerDependencies['@mionjs/run-types'] !== coreRange;
    const next = plannedVersion(pkg.version, installed, changes.files.length > 0 || coreRangeMoved);
    plan.push({pkg, packageFile, next, coreRange, coreRangeMoved, changed: changes.files.length});
  }
  return plan;
}

// Writes the planned drizzle versions and returns the files it edited.
function applyDrizzleLine(plan) {
  const edited = [];
  for (const {pkg, packageFile, next, coreRange, coreRangeMoved, changed} of plan) {
    if (next === pkg.version) {
      console.log(`  ${pkg.name}: unchanged since ${pkg.version} — not republished`);
      continue;
    }
    const why = [changed > 0 ? `${changed} published file(s) changed` : '', coreRangeMoved ? `@mionjs/run-types peer -> ${coreRange}` : ''].filter(Boolean).join(', ');
    console.log(`  ${pkg.name}: ${why} -> ${next}`);
    pkg.version = next;
    pkg.peerDependencies['@mionjs/run-types'] = coreRange;
    writeJson(packageFile, pkg);
    edited.push(path.relative(REPO_ROOT, packageFile));
  }
  return edited;
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
  // Planned first: a drizzle-line violation must abort before any file is written.
  const drizzlePlan = planDrizzleLine(version);

  // version.json is the source of truth (read by build-binaries.mjs + CI).
  manifest.version = version;
  writeJson(VERSION_FILE, manifest);
  const edited = [path.relative(REPO_ROOT, VERSION_FILE)];

  // Every workspace package.json + the root, so the lockstep stays exact. The
  // ts-runtypes-bin bump is load-bearing: pnpm writes that concrete version into
  // @mionjs/devtools' workspace:* dependency at pack time. Packages marked
  // `"versionLine": "drizzle-orm"` ride drizzle-orm's version line instead
  // (<drizzle major.minor>.<own patch>, guarded by check-drizzle-versions.mjs)
  // and are never stamped here.
  const dirs = [REPO_ROOT, ...fs.readdirSync(path.join(REPO_ROOT, 'packages')).map((name) => path.join(REPO_ROOT, 'packages', name))];
  for (const dir of dirs) {
    const file = path.join(dir, 'package.json');
    if (!fs.existsSync(file)) continue;
    const pkg = readJson(file);
    if (!('version' in pkg)) continue;
    if (pkg.versionLine === 'drizzle-orm') continue;
    pkg.version = version;
    writeJson(file, pkg);
    edited.push(path.relative(REPO_ROOT, file));
  }

  console.log(`\ndrizzle-orm version line (own versions, patched only on change):`);
  edited.push(...applyDrizzleLine(drizzlePlan));

  execFileSync('git', ['add', ...edited], {cwd: REPO_ROOT, stdio: 'inherit'});
  execFileSync('git', ['commit', '-m', `chore(release): v${version}`], {cwd: REPO_ROOT, stdio: 'inherit'});
  execFileSync('git', ['tag', `v${version}`], {cwd: REPO_ROOT, stdio: 'inherit'});

  console.log(`\nBumped to v${version} across ${edited.length} files, committed + tagged.`);
  console.log(`Push the tag when ready:  git push origin v${version}`);
}

main();
