// verify-live.mjs — website-deploy guard. Refuse to deploy the docs site unless the
// tree being deployed matches the LIVE npm release, with every published
// @ts-runtypes/* package in lockstep. Run by website-deploy.yml before the build.
//
// Why: the docs site builds from THIS repo, not from an installed npm version. So a
// deploy dispatched from the wrong ref would happily ship docs for a version consumers
// cannot install — `main` (version.json already bumped, nothing published yet) or
// `prod` BEFORE `pnpm rtx release stage-approve` (npm still on the previous version).
// Tying the deploy to the live release turns both of those into a clean abort here.
//
// The three consumer-facing packages move in lockstep (forcePublish + exact). The 7
// @ts-runtypes/binary-<os>-<arch> leaves are pinned exact-equal by @ts-runtypes/bin's
// optionalDependencies and staged leaves-first, so a live bin@X already implies them —
// checking the launcher covers the platform packages without 7 extra registry reads.
//
// Fails CLOSED: a version mismatch, an unpublished package, or an unreachable registry
// all abort (never deploy on an unverified release). Usage (via
// `pnpm rtx release verify-live`, or `node scripts/rt.mjs release verify-live`).

import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {loadEnv, REPO_ROOT} from '../lib/env.mjs';
import {capture, die, dim, green, note, red, reportCliError, sleep} from '../lib/proc.mjs';

const PACKAGES = ['@ts-runtypes/core', '@ts-runtypes/devtools', '@ts-runtypes/bin'];

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

  if (live.every(([, version]) => version === expected)) {
    return void note(green(`verify-live: PASS — all ${PACKAGES.length} packages live at v${expected}. Safe to deploy.`));
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
