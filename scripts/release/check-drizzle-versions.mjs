#!/usr/bin/env node
// check-drizzle-versions.mjs — CI guard for the drizzle-orm version line. The
// @mionjs/drizzle-orm-*-core packages (marked `"versionLine": "drizzle-orm"`)
// are versioned `<drizzle major>.<drizzle minor>.<own patch>` instead of the
// lockstep train, and their compatibility promise is the drizzle-orm peer
// RANGE. This guard pins the whole contract to the INSTALLED drizzle-orm:
//   - every drizzle-dialects.json package carries the versionLine marker,
//   - its version's major.minor equals the installed drizzle-orm's,
//   - its drizzle-orm peer range is exactly `>=X.Y.0 <X.(Y+1).0`,
//   - its @mionjs/run-types peer range covers version.json's minor (core is a
//     type-only peer: the consumer's single copy must supply the format types),
//   - its committed manifest's drizzleOrm field equals the installed version.
// Run via `pnpm rtx release check-drizzle-versions` (CI: next to the
// drizzle-manifest --check steps). Exits non-zero on any violation.
//
// `--changes` additionally REPORTS which packages have unreleased published
// changes (and so are due a patch bump at the next release cut). It never fails
// on them: carrying unreleased changes is the normal state of `main` between
// releases, and bump-version.mjs is what stamps the patch.

import fs from 'node:fs';
import path from 'node:path';
import {installedDrizzleVersion, lockstepVersion, peerRangeFor, plannedVersion, readDialectPackages, REPO_ROOT, unreleasedChanges} from '../lib/drizzle-line.mjs';

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

function main() {
  const reportChanges = process.argv.slice(2).includes('--changes');
  const rows = readDialectPackages(REPO_ROOT);
  const installed = installedDrizzleVersion(REPO_ROOT);
  const [major, minor] = installed.split('.').map(Number);
  const expectedPeerRange = peerRangeFor(installed);
  const expectedCoreRange = peerRangeFor(lockstepVersion(REPO_ROOT));
  const problems = [];

  for (const row of rows) {
    const pkg = row.pkg;
    const label = pkg.name ?? row.packageDir;

    if (pkg.versionLine !== 'drizzle-orm') {
      problems.push(`${label}: package.json must carry "versionLine": "drizzle-orm" (bump-version.mjs skips it by this marker)`);
    }
    if (!pkg.version?.startsWith(`${major}.${minor}.`)) {
      problems.push(`${label}: version ${pkg.version} is not on drizzle-orm's ${major}.${minor}.x line (installed drizzle-orm is ${installed})`);
    }
    const peerRange = pkg.peerDependencies?.['drizzle-orm'];
    if (peerRange !== expectedPeerRange) {
      problems.push(`${label}: drizzle-orm peer range must be "${expectedPeerRange}", got "${peerRange}"`);
    }
    // @mionjs/run-types is a PEER, never a dependency: an exact pin would give the
    // consumer a second copy whose format types are a different brand, and would
    // also force a republish on every lockstep release.
    const coreRange = pkg.peerDependencies?.['@mionjs/run-types'];
    if (coreRange !== expectedCoreRange) {
      problems.push(`${label}: @mionjs/run-types peer range must be "${expectedCoreRange}" (version.json's minor), got "${coreRange}"`);
    }
    if (pkg.dependencies?.['@mionjs/run-types']) {
      problems.push(`${label}: @mionjs/run-types must be a peerDependency (+ a workspace devDependency), never a dependency`);
    }
    const manifestFile = path.join(REPO_ROOT, row.packageDir, row.manifest);
    const manifest = readJson(manifestFile);
    if (manifest.drizzleOrm !== installed) {
      problems.push(`${row.packageDir}/${row.manifest}: drizzleOrm is ${manifest.drizzleOrm}, installed is ${installed} — regenerate (pnpm rtx core drizzle-manifest)`);
    }
  }

  if (problems.length > 0) {
    console.error('check-drizzle-versions: FAIL');
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exit(1);
  }
  console.log(`check-drizzle-versions: OK — ${rows.length} packages on drizzle-orm ${major}.${minor}.x (installed ${installed}, peer "${expectedPeerRange}", @mionjs/run-types peer "${expectedCoreRange}")`);

  if (!reportChanges) return;
  // Only what changed in the tree. A lockstep MINOR bump ALSO moves their
  // @mionjs/run-types peer range, and bump-version.mjs republishes all three for it.
  for (const row of rows) {
    const changes = unreleasedChanges(REPO_ROOT, row.packageDir);
    if (!changes.known) {
      console.log(`  ${row.pkg.name}: unreleased changes unknown (shallow clone — needs full history)`);
      continue;
    }
    if (changes.files.length === 0) {
      console.log(`  ${row.pkg.name}: no published changes since ${row.pkg.version} — the next release skips it`);
      continue;
    }
    const next = plannedVersion(row.pkg.version, installed, true);
    console.log(`  ${row.pkg.name}: ${changes.files.length} published file(s) changed since ${row.pkg.version} — next release cut stamps ${next}`);
  }
}

main();
