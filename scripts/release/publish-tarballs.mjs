#!/usr/bin/env node
// Publishes the packed tarballs/ in dependency-safe order: every
// @ts-runtypes/binary-<os>-<arch> FIRST, then @ts-runtypes/bin (the launcher),
// then the FE packages — so the launcher never lands referencing optional deps
// that aren't on the registry yet.
//
// TWO paths, selected by --registry:
//   • no --registry (CI / release): the PUBLIC registry via `npm stage publish`.
//     Staged publishing uploads to a stage queue and needs NO 2FA, so CI can stage
//     unattended; a maintainer then promotes each staged version to live with a
//     real 2FA challenge (`pnpm rtx release stage-approve`, or the npmjs.com queue).
//     Auth is the NPM_TOKEN secret — the publish-npm job writes it to ~/.npmrc; it
//     must be an automation/granular token so the unattended stage isn't
//     2FA-blocked. See SETUP.md → Publishing.
//   • --registry <url> (local verdaccio e2e): a plain `npm publish` into the
//     throwaway registry — never staged (staging is a registry.npmjs.org feature).
//     The caller sets that registry's auth; this script does not touch it.
//
// Flags:
//   --registry <url>  plain-publish to a specific registry (e.g. local verdaccio).
//   --provenance      attach npm provenance. Also enabled by env MION_NPM_PROVENANCE=1.
//                     Needs a PUBLIC repo — npm refuses provenance from a private
//                     source repo, so it stays OFF unless explicitly turned on.
//   --plan            print the publish plan (train filter, order, drizzle
//                     skip-if-live / backport-tag decisions) and exit without
//                     publishing or requiring a receipt. Exits non-zero if a
//                     drizzle tarball would be refused (live version, changed
//                     sources), so the plan doubles as a pre-pack check.

import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {fetchPublishedTarball, tarballSourceDiff} from '../lib/drizzle-line.mjs';
import {describeReceipt, receiptOptOut, verifyReceipt} from './receipt.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TARBALLS = path.join(REPO_ROOT, 'tarballs');

const args = process.argv.slice(2);
const registryIdx = args.indexOf('--registry');
const registry = registryIdx !== -1 ? args[registryIdx + 1] : undefined;
const provenance = args.includes('--provenance') || process.env.MION_NPM_PROVENANCE === '1';
const planOnly = args.includes('--plan');

// Publishing to the PUBLIC registry requires proof that the pre-publish e2e ran
// over exactly these bytes (scripts/release/receipt.mjs). Skipped for --registry,
// which is a throwaway verdaccio — that publish is part of running the e2e, so
// requiring its own receipt would be circular.
if (!registry && !planOnly && !receiptOptOut(args)) {
  const version = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'version.json'), 'utf8')).version;
  const verdict = verifyReceipt(TARBALLS, version);
  if (!verdict.ok) {
    console.error(`publish-tarballs: refusing to publish — ${verdict.reason}.`);
    console.error("Run `pnpm rtx release e2e` over these tarballs, or pass --no-receipt (MION_ALLOW_UNVERIFIED_PUBLISH=1) to publish unverified.");
    process.exit(1);
  }
  console.log(describeReceipt(verdict.receipt));
} else if (!registry && !planOnly) {
  console.warn('publish-tarballs: WARNING publishing WITHOUT an e2e receipt (--no-receipt); nothing has verified these tarballs.');
}

// npm/npx are `npm.cmd` on Windows; execFileSync can't resolve/exec a .cmd
// without a shell (the `spawnSync npm ENOENT` the win32 host-npx e2e hit).
// No-op elsewhere (incl. the Linux CI stage-publish that also runs this script).
const onWindows = process.platform === 'win32';

// Lower rank publishes earlier. Operates on the tarball filename: npm packs a
// scoped package @ts-runtypes/<x> as ts-runtypes-<x>-<version>.tgz, so the
// binary-* leaves sort before the bin launcher before the FE packages before
// the drizzle dialect packages (which depend on @mionjs/run-types).
function rank(name) {
  if (name.startsWith('ts-runtypes-binary-')) return 0;
  if (name.startsWith('ts-runtypes-bin-')) return 1;
  if (name.startsWith('mionjs-drizzle-orm-')) return 3;
  return 2; // FE packages (@mionjs/run-types, @mionjs/devtools)
}

// tarballs/ now holds BOTH families: pack.mjs packs the @mionjs/* packages too so
// the pre-publish e2e (and its receipt) covers them. The release train carries the
// @ts-runtypes/* family (version.json) PLUS the @mionjs/drizzle-orm-*-core family
// (their own drizzle-aligned version line, `versionLine: "drizzle-orm"`). The rest
// of @mionjs/* stays on its 0.8.x line and is held back until the merge plan's
// step 6 ("one release train") unifies the versions and removes this filter.
const isOnTheReleaseTrain = (file) => file.startsWith('ts-runtypes-') || file.startsWith('mionjs-drizzle-orm-');
const isDrizzleTarball = (file) => file.startsWith('mionjs-drizzle-orm-');

// Read {name, version} from a packed tarball's package/package.json (npm/pnpm
// pack always nest the payload under package/) — the real manifest, not the
// filename, keeps the scoped name + version exact.
function readManifest(file) {
  const raw = execFileSync('tar', ['-xzOf', path.join(TARBALLS, file), 'package/package.json'], {encoding: 'utf8'});
  const {name, version} = JSON.parse(raw);
  return {name, version};
}

function npmView(spec, field) {
  try {
    return execFileSync('npm', ['view', spec, field], {encoding: 'utf8', shell: onWindows, stdio: ['ignore', 'pipe', 'ignore']}).trim();
  } catch {
    return '';
  }
}

const parseSemver = (version) => version.split('.').map((part) => parseInt(part, 10));
function semverLower(a, b) {
  const [aParts, bParts] = [parseSemver(a), parseSemver(b)];
  for (let i = 0; i < 3; i++) {
    if ((aParts[i] ?? 0) !== (bParts[i] ?? 0)) return (aParts[i] ?? 0) < (bParts[i] ?? 0);
  }
  return false;
}

// The drizzle packages ride drizzle-orm's version line, which does not bump on
// every release: a tarball whose exact version is already live is SKIPPED (the
// lockstep family always has a fresh version, so it never needs this). The skip
// is VERIFIED, never assumed — the live tarball is downloaded and its published
// sources compared byte-for-byte with ours, so a forgotten patch bump fails the
// release instead of silently shipping nothing. (bump-version.mjs stamps that
// patch from git; this is the backstop when the cut skipped it.) And a tarball
// for a drizzle line OLDER than the live `latest` is a backport: it publishes
// under a `drizzle-X.Y` dist-tag so `latest` never moves backwards.
function drizzlePublishPlan(file) {
  const {name, version} = readManifest(file);
  if (npmView(`${name}@${version}`, 'version') === version) {
    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-drizzle-live-'));
    try {
      const live = fetchPublishedTarball(name, version, scratch, registry);
      if (!live) return {error: `${name}@${version} is live but its tarball could not be downloaded — cannot verify the skip`};
      const changed = tarballSourceDiff(path.join(TARBALLS, file), live);
      if (changed.length > 0) {
        return {error: `${name}@${version} is already live with DIFFERENT sources (${changed.join(', ')}) — bump its patch (pnpm rtx release bump ...) and re-pack`};
      }
      return {skip: true, reason: `${name}@${version} is already live with identical sources`};
    } finally {
      fs.rmSync(scratch, {recursive: true, force: true});
    }
  }
  const latest = npmView(`${name}@latest`, 'version');
  if (latest && semverLower(version, latest)) {
    const [major, minor] = parseSemver(version);
    return {skip: false, tag: `drizzle-${major}.${minor}`};
  }
  return {skip: false};
}

function main() {
  const packed = fs.readdirSync(TARBALLS).filter((file) => file.endsWith('.tgz'));
  const tarballs = packed.filter(isOnTheReleaseTrain).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  const held = packed.filter((file) => !isOnTheReleaseTrain(file));
  if (tarballs.length === 0) throw new Error(`no release-train tarballs in ${TARBALLS}`);
  if (held.length) console.log(`holding back ${held.length} tarball(s) not yet on the release train (merge plan step 6): ${held.join(', ')}`);

  // --registry (verdaccio e2e) is a plain publish into the throwaway registry;
  // everywhere else (CI / release) stages into the public registry's queue for a
  // later 2FA approval.
  const staged = !registry;
  const planProblems = [];
  if (planOnly) {
    console.log('\n--plan: publish order (no publish happens):');
    for (const tarball of tarballs) {
      let annotation = '';
      if (staged && isDrizzleTarball(tarball)) {
        const plan = drizzlePublishPlan(tarball);
        if (plan.error) {
          annotation = `  [FAIL: ${plan.error}]`;
          planProblems.push(plan.error);
        } else if (plan.skip) annotation = `  [SKIP: ${plan.reason}]`;
        else if (plan.tag) annotation = `  [backport --tag ${plan.tag}]`;
      }
      console.log(`  ${rank(tarball)}  ${tarball}${annotation}`);
    }
    if (planProblems.length > 0) {
      console.error(`\npublish-tarballs: ${planProblems.length} drizzle tarball(s) would be REFUSED — see [FAIL] above.`);
      process.exit(1);
    }
    return;
  }
  let published = 0;
  for (const tarball of tarballs) {
    const cmd = staged ? ['stage', 'publish'] : ['publish'];
    cmd.push(path.join(TARBALLS, tarball), '--access', 'public');
    // Skip-if-live + backport dist-tag apply only against the PUBLIC registry;
    // the verdaccio e2e always publishes everything fresh.
    if (staged && isDrizzleTarball(tarball)) {
      const plan = drizzlePublishPlan(tarball);
      if (plan.error) {
        console.error(`publish-tarballs: refusing to publish — ${plan.error}.`);
        process.exit(1);
      }
      if (plan.skip) {
        console.log(`skipping ${tarball} — ${plan.reason}`);
        continue;
      }
      if (plan.tag) {
        console.log(`${tarball} is a backport (live latest is newer) — staging under --tag ${plan.tag}`);
        cmd.push('--tag', plan.tag);
      }
    }
    if (registry) cmd.push('--registry', registry);
    if (staged && provenance) cmd.push('--provenance');
    console.log(`${staged ? 'staging' : 'publishing'} ${tarball}${registry ? ` -> ${registry}` : ''}`);
    execFileSync('npm', cmd, {cwd: REPO_ROOT, stdio: 'inherit', shell: onWindows});
    published++;
  }

  if (staged) {
    console.log(`\nStaged ${published} packages to the npm stage queue (no 2FA).`);
    console.log('Promote to live with a 2FA approval, leaves-first: pnpm rtx release stage-approve');
  } else {
    console.log(`\nPublished ${published} packages -> ${registry}.`);
  }
}

main();
