// drizzle-line.mjs — the ONE place that knows how the @mionjs/drizzle-orm-*-core
// packages are versioned, and the only exception to the lockstep release train.
//
// Their version line is `<drizzle major>.<drizzle minor>.<own patch>`, marked by
// `"versionLine": "drizzle-orm"` in package.json. Two rules follow from it:
//
//   ALIGN   major.minor tracks the drizzle-orm the repo builds against, and the
//           peer range is exactly `>=X.Y.0 <X.(Y+1).0`. A drizzle-orm upgrade
//           re-stamps both in the same commit (check-drizzle-versions.mjs is the
//           gate, and it runs on every PR).
//   CHANGE  the patch moves only when the package's own PUBLISHED files changed
//           since its last version bump, so a release that did not touch them
//           publishes nothing new for that package.
//
// Consumers: check-drizzle-versions.mjs (the gate), bump-version.mjs (stamps the
// patch at the release cut) and publish-tarballs.mjs (verifies an already-live
// version really is the same bytes before skipping it).

import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

// The hand-owned dialect table at the repo root, resolved to package.json paths.
export function readDialectPackages(repoRoot = REPO_ROOT) {
  const config = readJson(path.join(repoRoot, 'drizzle-dialects.json'));
  return config.dialects.map((row) => {
    const packageFile = path.join(repoRoot, row.packageDir, 'package.json');
    return {...row, packageFile, pkg: readJson(packageFile)};
  });
}

export function installedDrizzleVersion(repoRoot = REPO_ROOT) {
  const manifest = path.join(repoRoot, 'node_modules', 'drizzle-orm', 'package.json');
  if (!fs.existsSync(manifest)) throw new Error('drizzle-orm is not installed at the repo root (pnpm install?)');
  return readJson(manifest).version;
}

// `>=0.45.0 <0.46.0` for 0.45.2 — one whole minor line. Used for BOTH peer ranges
// a dialect package declares: drizzle-orm (which drizzle it wraps) and
// @mionjs/run-types (which format types its stamps line up with). Both are
// deliberate exceptions to the exact-pin policy: a peer must resolve to the
// consumer's single copy, and the range IS the compatibility promise.
export function peerRangeFor(version) {
  const [major, minor] = version.split('.').map(Number);
  return `>=${major}.${minor}.0 <${major}.${minor + 1}.0`;
}

// The lockstep version the mion run-types/* family is on (version.json).
export function lockstepVersion(repoRoot = REPO_ROOT) {
  return readJson(path.join(repoRoot, 'version.json')).version;
}

// What npm actually ships from a dialect package, minus the build output: `.dist`
// is derived from `src`, and comparing it would flag rebuild noise as a change.
export function isPublishedSource(relPath) {
  if (relPath === 'package.json') return true;
  if (!relPath.startsWith('src/')) return false;
  return !relPath.endsWith('.spec.ts') && !relPath.endsWith('.test.ts');
}

function git(repoRoot, args) {
  return execFileSync('git', args, {cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']});
}

function versionAt(repoRoot, rev, file) {
  try {
    return JSON.parse(git(repoRoot, ['show', `${rev}:${file}`])).version;
  } catch {
    return undefined;
  }
}

// The commit that last CHANGED this package's version field — everything after it
// is unreleased. `undefined` when the history cannot answer (a shallow clone, or
// the walk runs past its boundary); callers must treat that as "cannot tell",
// never as "no changes".
export function releasePointSha(repoRoot, packageDir) {
  const file = `${packageDir}/package.json`;
  let log;
  try {
    log = git(repoRoot, ['log', '--format=%H', '--', file]).trim();
  } catch {
    return undefined;
  }
  if (!log) return undefined;
  for (const sha of log.split('\n')) {
    const current = versionAt(repoRoot, sha, file);
    const parent = versionAt(repoRoot, `${sha}^`, file);
    if (current === undefined) return undefined;
    if (current !== parent) return sha;
  }
  return undefined; // walked the whole (possibly shallow) log without a version change
}

// Published files touched since the release point. `{known: false}` when the
// history cannot answer.
export function unreleasedChanges(repoRoot, packageDir) {
  const sha = releasePointSha(repoRoot, packageDir);
  if (!sha) return {known: false, sha: undefined, files: []};
  const raw = git(repoRoot, ['diff', '--name-only', `${sha}..HEAD`, '--', packageDir]).trim();
  const files = raw ? raw.split('\n').filter((file) => isPublishedSource(file.slice(packageDir.length + 1))) : [];
  return {known: true, sha, files};
}

// The version a dialect package should carry: drizzle's major.minor, patch reset
// when that line moves, patch + 1 when its published files changed since the last
// bump, unchanged otherwise.
export function plannedVersion(currentVersion, drizzleVersion, hasUnreleasedChanges) {
  const [drizzleMajor, drizzleMinor] = drizzleVersion.split('.').map(Number);
  const [major, minor, patch] = currentVersion.split('.').map(Number);
  if (major !== drizzleMajor || minor !== drizzleMinor) return `${drizzleMajor}.${drizzleMinor}.0`;
  return hasUnreleasedChanges ? `${major}.${minor}.${patch + 1}` : currentVersion;
}

// ── content comparison against a published tarball ──────────────────────────
// The release-time backstop for a forgotten patch bump: same version number must
// mean the same published bytes.

const tarList = (tarball) => execFileSync('tar', ['-tzf', tarball], {encoding: 'utf8'}).trim().split('\n');
const tarRead = (tarball, entry) => execFileSync('tar', ['-xzOf', tarball, entry], {encoding: 'buffer'});

// name -> sha256 over every published source file in a packed tarball.
// package.json is normalized first: its own `version` is what the comparison
// DECIDES, and `devDependencies` are inert in a published package (npm never
// installs them, and pnpm rewrites the workspace:* ones to a concrete version at
// pack time, which would otherwise read as a change on every release). What is
// left — exports, files, dependencies, peerDependencies — is exactly what a
// consumer gets, so a change there IS a change.
export function tarballSourceDigests(tarball) {
  const digests = new Map();
  for (const entry of tarList(tarball)) {
    if (!entry.startsWith('package/') || entry.endsWith('/')) continue;
    const relPath = entry.slice('package/'.length);
    if (!isPublishedSource(relPath)) continue;
    let body = tarRead(tarball, entry);
    if (relPath === 'package.json') body = Buffer.from(JSON.stringify({...JSON.parse(body.toString('utf8')), version: '', devDependencies: {}}));
    digests.set(relPath, createHash('sha256').update(body).digest('hex'));
  }
  return digests;
}

// Published-source paths that differ between two packed tarballs (added, removed
// or edited), sorted. Empty means the two publishes carry identical content.
export function tarballSourceDiff(a, b) {
  const [left, right] = [tarballSourceDigests(a), tarballSourceDigests(b)];
  const changed = new Set();
  for (const [file, digest] of left) if (right.get(file) !== digest) changed.add(file);
  for (const file of right.keys()) if (!left.has(file)) changed.add(file);
  return [...changed].sort();
}

// Downloads `name@version` from the registry into destDir and returns its path,
// or undefined when that exact version is not published.
export function fetchPublishedTarball(name, version, destDir, registry) {
  const args = ['pack', `${name}@${version}`, '--pack-destination', destDir, '--json'];
  if (registry) args.push('--registry', registry);
  let out;
  try {
    out = execFileSync('npm', args, {encoding: 'utf8', shell: process.platform === 'win32', stdio: ['ignore', 'pipe', 'pipe']});
  } catch {
    return undefined;
  }
  const parsed = JSON.parse(out);
  const filename = Array.isArray(parsed) ? parsed[0]?.filename : parsed?.filename;
  if (!filename) return undefined;
  const file = path.join(destDir, path.basename(filename));
  return fs.existsSync(file) ? file : undefined;
}
