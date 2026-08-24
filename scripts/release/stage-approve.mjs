// stage-approve.mjs — guided, leaves-first approval of a staged @ts-runtypes/*
// release. After publish.yml stages every package via `npm stage publish` (no
// 2FA), a maintainer promotes them to live with a real 2FA challenge.
//
// npm stage approve/reject take a SINGLE <stage-id> — there is no atomic/group
// approval, and approving one publishes THAT package to the registry immediately.
// So order matters: approve leaves-first — every @ts-runtypes/binary-<os>-<arch>
// FIRST, then @ts-runtypes/bin (the launcher), then @ts-runtypes/core +
// @ts-runtypes/devtools — the SAME rank publish-tarballs.mjs stages in, so a
// consumer install never resolves a launcher whose platform binary 404s.
//
// This reads the pending stage-ids for THIS repo's version (version.json) from
// `npm stage list --json`, sorts them leaves-first, asks ONCE for your 2FA OTP,
// and passes it to each `npm stage approve <id>` — the registry accepts the same
// TOTP code for multiple rapid requests while its ~30s window is valid, so a
// 10-package approval typically needs two or three codes, not ten (you are
// re-prompted when a code expires). After the last approval it waits for npm to
// actually SERVE the new version (a fresh publish lags a little on the registry
// CDN) and then dispatches the website deploy (website-deploy.yml @ prod).
// If the queue can't be read automatically it prints the exact leaves-first
// order to approve by hand.
//
// Flags:
//   --dry-run      print the approval plan; do not approve anything.
//   --no-deploy    approve only; skip the website-deploy dispatch.
//   --deploy-only  skip approvals; wait for the version to be live on npm and
//                  dispatch the website deploy (for a run whose approvals
//                  succeeded but whose deploy step didn't fire).

import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {createInterface} from 'node:readline/promises';
import {setTimeout as sleep} from 'node:timers/promises';
import {loadEnv, REPO_ROOT} from '../lib/env.mjs';
import {capture, die, note, noteErr, reportCliError, run, success, warn} from '../lib/proc.mjs';

// Staged publishing needs npm >= 11.15.0 (Trusted Publishing/OIDC needs >= 11.5.1).
const MIN_NPM = [11, 15, 0];

// How long to wait for npm's CDN to serve the freshly-approved version before
// dispatching the website deploy (its verify-live guard fails on a 404).
const LIVE_POLL_INTERVAL_MS = 10_000;
const LIVE_POLL_TIMEOUT_MS = 180_000;

function cmpVersion(a, b) {
  for (let i = 0; i < 3; i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function ensureNpmSupportsStage() {
  const version = capture('npm', ['--version']).stdout.trim();
  const parts = version.split('.').map((n) => parseInt(n, 10));
  const ok = parts.length >= 3 && !parts.some(Number.isNaN) && cmpVersion(parts, MIN_NPM) >= 0;
  if (!ok) die(`stage-approve: needs npm >= ${MIN_NPM.join('.')} for staged publishing (found ${version || 'unknown'}). Run: npm i -g npm@latest`);
}

function readVersion() {
  const manifest = JSON.parse(readFileSync(join(REPO_ROOT, 'version.json'), 'utf8'));
  if (!manifest.version || manifest.version === 'independent') die('stage-approve: version.json has no fixed lockstep version.');
  return manifest.version;
}

// Lower rank approves (and so publishes) earlier: binary leaves, then the
// launcher, then the FE packages. Mirrors publish-tarballs.mjs's rank().
function rank(name) {
  if (name.startsWith('@ts-runtypes/binary-')) return 0;
  if (name === '@ts-runtypes/bin') return 1;
  return 2; // @ts-runtypes/core, @ts-runtypes/devtools
}

// Coerce whatever `npm stage list --json` returns into a flat [{name, version, id}].
// The exact JSON shape isn't contractually documented for this new command, so
// accept the plausible ones: a top-level array, an object with an array field
// (staged/packages/versions/results/stages), or an object keyed by package name
// whose values are arrays of version entries (the `npm outdated --json` shape).
function normalizeEntries(parsed) {
  const out = [];
  const pushEntry = (raw, fallbackName) => {
    if (!raw || typeof raw !== 'object') return;
    const id = raw.id ?? raw.stageId ?? raw['stage-id'] ?? raw.stage_id ?? raw.stageid;
    // npm 11.17 emits `packageName` (observed live); older guesses kept for safety.
    let name = raw.name ?? raw.packageName ?? raw.package ?? fallbackName;
    let version = raw.version;
    const spec = raw.spec ?? raw.pkgid ?? raw._id;
    if ((!name || !version) && typeof spec === 'string') {
      const at = spec.lastIndexOf('@');
      if (at > 0) {
        name = name ?? spec.slice(0, at);
        version = version ?? spec.slice(at + 1);
      }
    }
    out.push({name, version, id});
  };
  if (Array.isArray(parsed)) {
    for (const entry of parsed) pushEntry(entry);
  } else if (parsed && typeof parsed === 'object') {
    const arrayField = parsed.staged ?? parsed.packages ?? parsed.versions ?? parsed.results ?? parsed.stages;
    if (Array.isArray(arrayField)) {
      for (const entry of arrayField) pushEntry(entry);
    } else {
      for (const [name, value] of Object.entries(parsed)) {
        if (Array.isArray(value)) for (const entry of value) pushEntry(entry, name);
        else pushEntry(value, name);
      }
    }
  }
  return out;
}

// Print the leaves-first rule + the by-hand commands, then fail — used whenever
// the queue can't be read/parsed automatically.
function manualFallback(version, why) {
  noteErr(`stage-approve: ${why}`);
  console.log('');
  console.log('Approve by hand instead — LEAVES-FIRST (every @ts-runtypes/binary-* first, then');
  console.log('@ts-runtypes/bin, then @ts-runtypes/core + @ts-runtypes/devtools). Approving one');
  console.log('publishes it immediately, so order matters:');
  console.log('');
  console.log('  npm stage list                # find the stage-id for each package');
  console.log('  npm stage approve <stage-id>  # 2FA per id, in the order above');
  console.log('');
  console.log(`All packages are @ ${version}. Full runbook: SETUP.md → Publishing.`);
  die('', 1);
}

// One OTP prompt. Empty answer = no --otp flag, npm prompts by itself per
// package (the pre-OTP behavior, kept as an escape hatch).
async function promptOtp(rl, message) {
  const answer = (await rl.question(`${message} `)).trim();
  return answer || null;
}

// Approve one stage-id, reusing the current OTP. A failure with an OTP set is
// most likely the ~30s TOTP window rolling over, so re-prompt once and retry
// the SAME package; a second consecutive failure is a real error.
async function approveEntry(rl, entry, otp) {
  const argsFor = (code) => ['stage', 'approve', entry.id, ...(code ? [`--otp=${code}`] : [])];
  note(`approving ${entry.name} (${entry.id})${otp ? '' : ' — npm will prompt for your 2FA OTP'}`);
  if (run('npm', argsFor(otp)) === 0) return otp;
  if (otp) {
    warn(`approval of ${entry.name} failed — the OTP has likely expired. Enter a fresh code to retry.`);
    const fresh = await promptOtp(rl, `New npm 2FA OTP for ${entry.name} (empty = let npm prompt):`);
    if (run('npm', argsFor(fresh)) === 0) return fresh;
  }
  die(
    `stage-approve: 'npm stage approve ${entry.id}' failed for ${entry.name}.\n` +
      'The packages listed BEFORE it are already live. Fix the issue and re-run — already-approved\n' +
      'packages drop off the queue, so it resumes where it stopped.',
    1
  );
}

// Block until the registry actually serves version for the LAST-approved (and
// so freshest) packages — a fresh publish can lag on npm's CDN, and dispatching
// the deploy too early trips its verify-live guard.
async function waitUntilLive(version) {
  const freshest = ['@ts-runtypes/core', '@ts-runtypes/devtools'];
  note(`waiting for npm to serve ${version} (CDN propagation; up to ${LIVE_POLL_TIMEOUT_MS / 1000}s)...`);
  const deadline = Date.now() + LIVE_POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const pending = freshest.filter((name) => {
      const view = capture('npm', ['view', `${name}@${version}`, 'version']);
      return view.status !== 0 || view.stdout.trim() !== version;
    });
    if (pending.length === 0) return true;
    await sleep(LIVE_POLL_INTERVAL_MS);
  }
  return false;
}

// Dispatch website-deploy.yml against prod. Failure is loud but non-fatal: the
// approvals (this command's actual job) already succeeded.
function dispatchWebsiteDeploy(version) {
  if (capture('gh', ['--version']).status !== 0) {
    warn('DEPLOY NOT TRIGGERED — the gh CLI is not available.');
    note('Dispatch by hand: Actions -> "prod · deploy website" -> Run workflow, on the prod ref.');
    return;
  }
  note('dispatching the website deploy (website-deploy.yml @ prod)...');
  const code = run('gh', ['workflow', 'run', 'website-deploy.yml', '--ref', 'prod', '-f', `version=${version}`]);
  if (code !== 0) {
    warn(`DEPLOY NOT TRIGGERED — 'gh workflow run' exited with code ${code}.`);
    note('Dispatch by hand: Actions -> "prod · deploy website" -> Run workflow, on the prod ref.');
    return;
  }
  success('website deploy dispatched — watch it: Actions -> "prod · deploy website".');
}

async function deployAfterLive(version) {
  if (await waitUntilLive(version)) return void dispatchWebsiteDeploy(version);
  warn(`DEPLOY NOT TRIGGERED — npm still does not serve ${version} after ${LIVE_POLL_TIMEOUT_MS / 1000}s.`);
  note('Check the approvals (npm stage list), then re-run: pnpm rtx release stage-approve --deploy-only');
}

async function main(argv) {
  const dryRun = argv.includes('--dry-run');
  const noDeploy = argv.includes('--no-deploy');
  const deployOnly = argv.includes('--deploy-only');
  ensureNpmSupportsStage();
  const version = readVersion();
  note(`stage-approve for @ts-runtypes/* @ ${version}`);

  if (deployOnly) return deployAfterLive(version);

  const listed = capture('npm', ['stage', 'list', '--json']);
  if (listed.status !== 0) return manualFallback(version, `\`npm stage list\` exited with code ${listed.status ?? '?'} (npm login? staged anything yet?).\n${listed.stderr.trim()}`);

  let parsed;
  try {
    parsed = JSON.parse(listed.stdout);
  } catch {
    return manualFallback(version, 'could not parse `npm stage list --json` output.');
  }

  const all = normalizeEntries(parsed);
  const incomplete = all.filter((entry) => !entry.id || !entry.name);
  if (incomplete.length) return manualFallback(version, `couldn't read a stage-id + name for ${incomplete.length} of ${all.length} staged entries.`);

  const forVersion = all.filter((entry) => !entry.version || entry.version === version);
  if (forVersion.length === 0) {
    note(`no pending staged packages for ${version} — nothing to approve (already promoted, or none staged).`);
    note('If the site was never deployed for this version: pnpm rtx release stage-approve --deploy-only');
    return;
  }
  const versionless = forVersion.filter((entry) => !entry.version).length;
  if (versionless) warn(`${versionless} staged entr${versionless === 1 ? 'y' : 'ies'} had no version field — approving them too, assuming they belong to ${version}.`);

  const ordered = forVersion.sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name));

  console.log('\nApproval order (leaves-first — approving publishes THAT package to npm immediately):');
  for (const entry of ordered) console.log(`  ${entry.name}@${entry.version ?? version}  (${entry.id})`);
  console.log('');

  if (dryRun) return void note('--dry-run: not approving. Re-run without --dry-run (one OTP prompt covers the run; you are re-asked when a code expires).');

  const rl = createInterface({input: process.stdin, output: process.stdout});
  try {
    let otp = await promptOtp(rl, 'npm 2FA OTP (reused while its ~30s window lasts; empty = let npm prompt per package):');
    for (const entry of ordered) {
      otp = await approveEntry(rl, entry, otp);
      success(`${entry.name} approved -> live`);
    }
  } finally {
    rl.close();
  }
  console.log('');
  success(`Approved ${ordered.length} package(s) for ${version}.`);

  if (noDeploy) return void note('--no-deploy: skipping the website deploy. Dispatch later with: pnpm rtx release stage-approve --deploy-only');
  await deployAfterLive(version);
}

loadEnv();
try {
  await main(process.argv.slice(2));
} catch (err) {
  reportCliError(err);
}
