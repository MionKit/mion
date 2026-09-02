#!/usr/bin/env node
// manual-publish.mjs — interactive, resumable FIRST-publish bootstrap for the
// published packages. Creates them LIVE on npm so the normal CI
// path (staged publish with NPM_TOKEN) can take over for every release afterward.
//
// Why this exists (not the CI stage path, not publish.mjs):
//   - npm can't STAGE a name that has no published version yet — so the very first
//     version of each package must be a plain, live `npm publish`. This is that
//     one-time step.
//   - Auth is `npm login` (session-based: one 2FA challenge for the whole run).
//     Classic tokens were revoked (Dec 2025) and 2FA-bypass tokens deprecated, so a
//     login session is the reliable interactive path — no token needed.
//   - No provenance: the repo is private and npm refuses provenance from a private
//     source repo (the CI path gates it behind MION_NPM_PROVENANCE for when it's public).
//
// Resumable: every package whose <version> is already live is SKIPPED, so an OTP
// hiccup or a network blip mid-run just picks up where it stopped on a re-run.
//
// Flags:
//   --skip-build   reuse the existing tarballs/ (don't rebuild binaries + repack).
//   --dry-run      print the plan (build? / login? / publish vs skip) and exit.
//   --yes          skip the "continue?" / "publish live?" confirmations.

import {execFileSync} from 'node:child_process';
import {existsSync, readdirSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import {loadEnv, REPO_ROOT} from '../lib/env.mjs';
import {capture, die, green, note, prompt, red, reportCliError, run, runOrThrow, success, warn, yellow} from '../lib/proc.mjs';
import {describeReceipt, verifyReceipt} from './receipt.mjs';
import {publishRank, readWorkspaceManifests} from '../lib/publish-order.mjs';

const TARBALLS = join(REPO_ROOT, 'tarballs');

// Same leaves-first order as publish-tarballs.mjs: each package's dependency
// depth in the workspace (scripts/lib/publish-order.mjs) — so a consumer install
// never resolves a package whose dependency isn't live yet.
const MANIFESTS = readWorkspaceManifests();
const rank = (name) => publishRank(name, MANIFESTS);

// Read {name, version} from a packed tarball's package/package.json (npm/pnpm pack
// always nest the payload under package/). Using the real manifest — not the
// filename — keeps the scoped name + version exact.
function readManifest(file) {
  const raw = execFileSync('tar', ['-xzOf', join(TARBALLS, file), 'package/package.json'], {encoding: 'utf8'});
  const {name, version} = JSON.parse(raw);
  return {file, name, version};
}

// Is name@version already on the public registry? `npm view` exits non-zero (E404)
// for a brand-new package or an unpublished version, so absence reads as "not live".
function alreadyLive(name, version) {
  const {status, stdout} = capture('npm', ['view', `${name}@${version}`, 'version']);
  return status === 0 && stdout.trim() === version;
}

async function confirm(question, assumeYes) {
  if (assumeYes) return true;
  return (await prompt(question)).toLowerCase() === 'y';
}

async function main(argv) {
  const skipBuild = argv.includes('--skip-build');
  const dryRun = argv.includes('--dry-run');
  const assumeYes = argv.includes('--yes');

  const version = JSON.parse(readFileSync(join(REPO_ROOT, 'version.json'), 'utf8')).version;
  if (!version || version === 'independent') die(red('manual-publish: version.json has no fixed lockstep version.'));

  console.log('');
  console.log(green('══════════════════════════════════════════'));
  console.log(green(`  mion manual publish — v${version}`));
  console.log(green('══════════════════════════════════════════'));
  console.log('One-time bootstrap: creates every published package LIVE so the CI staged publish can take over.');
  console.log('Live (no provenance — private repo), resumable (already-live versions are skipped).');

  // [1/4] Working tree — building binaries off a dirty tree would ship uncommitted
  // source. Warn + confirm rather than hard-fail (you may be publishing a tag).
  const dirty = capture('git', ['status', '--porcelain']).stdout.trim();
  if (dirty && !dryRun) {
    warn('working tree is not clean — the build would include uncommitted changes.');
    if (!(await confirm('Continue anyway? (y/N): ', assumeYes))) die('aborted.');
  }

  // [2/4] Build the exact tarballs CI packs — FE dists, the 7-platform binaries, pack.
  if (skipBuild) {
    if (!existsSync(TARBALLS)) die(red('manual-publish: --skip-build but tarballs/ is missing. Run once without it first.'));
    note('--skip-build: reusing the existing tarballs/.');
  } else if (dryRun) {
    note('--dry-run: would build FE dists + the 7-platform binaries, then pack -> tarballs/.');
  } else {
    note('Building FE dists, cross-compiling the 7 platform packages, packing (this takes a while)…');
    runOrThrow('pnpm', ['run', 'build']); // FE dists (canonical, for packing)
    runOrThrow('node', ['scripts/release/build-binaries.mjs']); // -> dist-binaries/
    runOrThrow('node', ['scripts/release/pack.mjs']); // -> tarballs/ (workspace:* rewritten)
  }

  // Enumerate the packed tarballs -> manifests, leaves-first.
  if (!existsSync(TARBALLS)) {
    if (dryRun) return void note('--dry-run: no tarballs/ yet; a real run builds them first, then publishes leaves-first.');
    die(red('manual-publish: no tarballs/ to publish.'));
  }
  // Same release-train filter publish-tarballs.mjs applies: every @mionjs/*
  // tarball (npm packs @mionjs/<x> as mionjs-<x>-<version>.tgz), the drizzle
  // dialect packages included at their own drizzle-aligned versions.
  const onTrain = (file) => file.startsWith('mionjs-');
  const packed = readdirSync(TARBALLS).filter((file) => file.endsWith('.tgz'));
  const files = packed.filter(onTrain);
  const held = packed.filter((file) => !onTrain(file));
  if (held.length) note(`holding back ${held.length} tarball(s) outside the @mionjs/* release train: ${held.join(', ')}`);
  if (files.length === 0) {
    if (dryRun) return void note('--dry-run: tarballs/ is empty; a real run builds it first.');
    die(red('manual-publish: tarballs/ has no release-train tarballs.'));
  }
  const pkgs = files.map(readManifest).sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name));

  // The e2e receipt is advisory here, not a gate. This is the first-publish
  // bootstrap and it REBUILDS tarballs/ by default, which invalidates any receipt
  // by construction — so say what is (or is not) verified and let the operator
  // decide, rather than hard-failing the one path that exists for emergencies.
  // The refusal lives in publish-tarballs.mjs, the CI path that publishes exactly
  // the artifact the gate validated.
  if (!dryRun) {
    const verdict = verifyReceipt(TARBALLS, version);
    if (verdict.ok) note(describeReceipt(verdict.receipt));
    else warn(`no valid e2e receipt for these tarballs (${verdict.reason}). Run \`pnpm rtx release e2e\` first if you want that proof.`);
  }

  // [3/4] Auth — a login SESSION (one 2FA for the whole run). Reuse an existing login.
  let account = capture('npm', ['whoami']).stdout.trim();
  if (dryRun) {
    note(account ? `--dry-run: logged in to npm as ${account}.` : '--dry-run: would run `npm login` (interactive; 2FA).');
  } else if (account) {
    note(`Logged in to npm as ${green(account)}.`);
    if (!assumeYes && (await confirm('Re-login as a different account? (y/N): ', false))) {
      runOrThrow('npm', ['login']);
      account = capture('npm', ['whoami']).stdout.trim();
    }
  } else {
    note('Not logged in — running `npm login` (interactive; complete the 2FA challenge)…');
    runOrThrow('npm', ['login']);
    account = capture('npm', ['whoami']).stdout.trim();
    if (!account) die(red('manual-publish: still not logged in after `npm login`.'));
    success(`logged in as ${account}`);
  }

  // [4/4] Plan (live check once per package), confirm, then publish leaves-first.
  const plan = pkgs.map((pkg) => ({...pkg, live: alreadyLive(pkg.name, pkg.version)}));
  const toPublish = plan.filter((pkg) => !pkg.live);

  console.log('');
  note(`Publish plan for v${version} (leaves-first):`);
  for (const pkg of plan) {
    // The drizzle dialect packages ride drizzle-orm's version line, never version.json's.
    if (pkg.version !== version && !pkg.name.startsWith('@mionjs/drizzle-orm-')) warn(`${pkg.name} tarball is v${pkg.version}, not v${version}`);
    console.log(`  ${pkg.live ? green('skip   ') : yellow('publish')}  ${pkg.name}@${pkg.version}`);
  }

  if (dryRun) return void note('--dry-run: nothing published.');
  if (toPublish.length === 0) return void success(`all ${plan.length} packages already live at v${version} — nothing to do.`);

  if (!(await confirm(red(`\nPublish ${toPublish.length} package(s) LIVE to npm as ${account || 'the logged-in user'}? (y/N): `), assumeYes))) {
    die('aborted — nothing published.');
  }

  console.log('');
  for (const pkg of toPublish) {
    console.log(yellow(`publishing ${pkg.name}@${pkg.version}…`));
    const code = run('npm', ['publish', join(TARBALLS, pkg.file), '--access', 'public']);
    if (code !== 0) {
      die(
        red(`manual-publish: 'npm publish ${pkg.file}' failed (code ${code}).\n`) +
          'Packages published before it stay live. Fix the issue and re-run — already-live\n' +
          'versions are skipped, so it resumes where it stopped.',
        code
      );
    }
    success(`${pkg.name}@${pkg.version} published`);
  }

  console.log('');
  console.log(green('══════════════════════════════════════════'));
  success(`published ${toPublish.length}, skipped ${plan.length - toPublish.length} — all ${plan.length} @ v${version}`);
  console.log(green('══════════════════════════════════════════'));
  console.log('');
  console.log('Next (one-time): make sure the repo NPM_TOKEN secret is set so CI can authenticate');
  console.log('(add any new sibling package to that token scope). Every future release stages with');
  console.log('NPM_TOKEN in CI — `pnpm rtx release stage-approve` promotes each staged version with 2FA.');
}

loadEnv();
try {
  await main(process.argv.slice(2));
} catch (err) {
  reportCliError(err);
}
