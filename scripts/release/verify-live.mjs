// verify-live.mjs — website-deploy guard. Refuse to deploy the docs site unless the
// tree being deployed matches the LIVE npm release, with every published
// mion run-types/* package in lockstep. Run by website-deploy.yml before the build.
//
// Why: the docs site builds from THIS repo, not from an installed npm version. So a
// deploy dispatched from the wrong ref would happily ship docs for a version consumers
// cannot install — `main` (version.json already bumped, nothing published yet) or
// `prod` BEFORE `pnpm rtx release stage-approve` (npm still on the previous version).
// Tying the deploy to the live release turns both of those into a clean abort here.
//
// Every lockstep package is checked, derived from the workspace rather than a
// hand-kept list: the mion packages joined version.json when the two devtools
// packages merged, and a hardcoded list is exactly how a newly published package
// goes unverified. The 7 @mionjs/binary-<os>-<arch> leaves are pinned exact-equal
// by @mionjs/bin's optionalDependencies and staged leaves-first, so a live bin@X
// already implies them — checking the launcher covers the platform packages
// without 7 extra registry reads.
//
// Fails CLOSED: a version mismatch, an unpublished package, or an unreachable registry
// all abort (never deploy on an unverified release). Usage (via
// `pnpm rtx release verify-live`, or `node scripts/rt.mjs release verify-live`).

import {existsSync, readFileSync, readdirSync} from 'node:fs';
import {join} from 'node:path';
import {loadEnv, REPO_ROOT} from '../lib/env.mjs';
import {capture, die, dim, green, note, red, reportCliError, sleep} from '../lib/proc.mjs';

// Every publishable workspace package on the lockstep (private ones and the
// drizzle version line excluded — the latter is checked separately below).
function lockstepPackages() {
  const packagesDir = join(REPO_ROOT, 'packages');
  const out = [];
  for (const dir of readdirSync(packagesDir)) {
    const file = join(packagesDir, dir, 'package.json');
    if (!existsSync(file)) continue;
    const pkg = JSON.parse(readFileSync(file, 'utf8'));
    if (pkg.private || !pkg.version || pkg.versionLine === 'drizzle-orm') continue;
    out.push(pkg.name);
  }
  return out.sort();
}

const PACKAGES = lockstepPackages();

// The @mionjs/drizzle-orm-*-core packages ride drizzle-orm's version line
// (`versionLine: "drizzle-orm"` in their package.json), so they are checked at
// their OWN tree versions: each must EXIST live at that exact version (it need
// not be `latest` — a backport publishes under a drizzle-X.Y dist-tag).
function drizzleTreePackages() {
  const packagesDir = join(REPO_ROOT, 'packages');
  const out = [];
  for (const dir of readdirSync(packagesDir)) {
    const file = join(packagesDir, dir, 'package.json');
    if (!existsSync(file)) continue;
    const pkg = JSON.parse(readFileSync(file, 'utf8'));
    if (pkg.versionLine === 'drizzle-orm') out.push({name: pkg.name, version: pkg.version});
  }
  return out;
}

// name@version exists on the registry (any dist-tag). Transient errors retry,
// then fail closed — same policy as npmLatest.
async function npmHasExact(pkg, version) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = capture('npm', ['view', `${pkg}@${version}`, 'version']);
    if (res.status === 0) return res.stdout.trim() === version;
    if (/E404|is not in this registry|No match found/i.test(res.stderr)) return false;
    if (attempt === 3) die(`verify-live: could not reach npm for ${pkg} (${res.stderr.trim() || res.error?.message || 'unknown error'}). Refusing to deploy without a verified live release.`);
    await sleep(attempt * 2000);
  }
  return false;
}

// The version this deploy would ship, read from the checked-out tree.
function repoVersion() {
  const version = JSON.parse(readFileSync(join(REPO_ROOT, 'version.json'), 'utf8')).version;
  if (!version) die('verify-live: version.json has no "version" field.');
  return version;
}

// The `latest` dist-tag version on npm, or null when the package has never published a
// `latest` (a definitive answer, not retried). A transient registry error retries a few
// times, then fails closed — we never deploy without a verified live version.
async function npmLatest(pkg) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = capture('npm', ['view', `${pkg}@latest`, 'version']);
    if (res.status === 0) return res.stdout.trim() || null;
    if (/E404|is not in this registry|No match found/i.test(res.stderr)) return null;
    if (attempt === 3) die(`verify-live: could not reach npm for ${pkg} (${res.stderr.trim() || res.error?.message || 'unknown error'}). Refusing to deploy without a verified live release.`);
    await sleep(attempt * 2000);
  }
  return null;
}

export async function main() {
  const expected = repoVersion();
  note(`verify-live: deploy tree is v${expected}; requiring every npm package to be live at that exact version.`);

  const live = [];
  for (const pkg of PACKAGES) live.push([pkg, await npmLatest(pkg)]);

  for (const [pkg, version] of live) {
    const ok = version === expected;
    console.log(`  ${ok ? green('OK ') : red('BAD')}  ${pkg.padEnd(24)} npm latest: ${version ?? red('(unpublished)')}`);
  }

  const drizzle = [];
  for (const {name, version} of drizzleTreePackages()) drizzle.push([name, version, await npmHasExact(name, version)]);
  for (const [name, version, ok] of drizzle) {
    console.log(`  ${ok ? green('OK ') : red('BAD')}  ${name.padEnd(32)} live at: ${ok ? version : red(`${version} (not published)`)}`);
  }

  if (live.every(([, version]) => version === expected) && drizzle.every(([, , ok]) => ok)) {
    return void note(green(`verify-live: PASS — all ${PACKAGES.length + drizzle.length} packages live at their tree versions. Safe to deploy.`));
  }

  console.error('');
  console.error(red(`verify-live: FAIL — the deploy tree (v${expected}) does not match the live npm release.`));
  console.error(dim('  Deploying now would publish docs for a version consumers cannot install. Deploy from the'));
  console.error(dim('  branch whose version.json matches the LIVE npm release — usually `prod` AFTER'));
  console.error(dim('  `pnpm rtx release stage-approve` — or stage + approve this version first.'));
  die('', 1);
}

if (import.meta.main) {
  loadEnv();
  try {
    await main();
  } catch (err) {
    reportCliError(err);
  }
}
