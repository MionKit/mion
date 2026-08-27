#!/usr/bin/env node
// check-drizzle-versions.mjs — CI guard for the drizzle-orm version line. The
// @mionjs/drizzle-orm-*-core packages (marked `"versionLine": "drizzle-orm"`)
// are versioned `<drizzle major>.<drizzle minor>.<own patch>` instead of the
// lockstep train, and their compatibility promise is the drizzle-orm peer
// RANGE. This guard pins the whole contract to the INSTALLED drizzle-orm:
//   - every dialects.json package carries the versionLine marker,
//   - its version's major.minor equals the installed drizzle-orm's,
//   - its peer range is exactly `>=X.Y.0 <X.(Y+1).0`,
//   - its committed manifest's drizzleOrm field equals the installed version.
// Run via `pnpm rtx release check-drizzle-versions` (CI: next to the
// drizzle-manifest --check steps). Exits non-zero on any violation.

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CONFIG_FILE = path.join(REPO_ROOT, 'packages', 'drizzle-orm-manifests', 'dialects.json');

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

function installedDrizzleVersion() {
  const manifest = path.join(REPO_ROOT, 'node_modules', 'drizzle-orm', 'package.json');
  if (!fs.existsSync(manifest)) throw new Error('drizzle-orm is not installed at the repo root (pnpm install?)');
  return readJson(manifest).version;
}

function main() {
  const config = readJson(CONFIG_FILE);
  const installed = installedDrizzleVersion();
  const [major, minor] = installed.split('.').map(Number);
  const expectedPeerRange = `>=${major}.${minor}.0 <${major}.${minor + 1}.0`;
  const problems = [];

  for (const row of config.dialects) {
    const packageFile = path.join(REPO_ROOT, row.packageDir, 'package.json');
    const pkg = readJson(packageFile);
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
  console.log(`check-drizzle-versions: OK — ${config.dialects.length} packages on drizzle-orm ${major}.${minor}.x (installed ${installed}, peer "${expectedPeerRange}")`);
}

main();
