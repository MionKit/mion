// check.mjs — report RunTypes env vars and verify what a task needs.
//
// Reads the env-var registry from scripts/lib/env.mjs (the single source of truth,
// mirrored by .env.sample) after loadEnv() has filled process.env from .env (dev).
//
// Usage (via `pnpm rtx env …`, or `node scripts/env/check.mjs …`):
//   rt env                 status of every known var
//   rt env push-image      verify the vars `pnpm rtx container push` needs
//   rt env publish-npm     (info) NPM_TOKEN is for LOCAL publish + the CI secret
//   rt env deploy-website  (info) where the Cloudflare secrets live
//   rt env --create-env    create .env from .env.sample if missing
//
// Every run (except --create-env) also ENFORCES the .env.sample mirror: the
// user-settable REGISTRY rows (secret + dev) must each appear in .env.sample, no
// unknown key may appear there, and no `internal` var may (setting one breaks the
// run). Drift exits 1, so `pnpm run check:env` is a real gate in CI.

import {copyFileSync, existsSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import {loadEnv, REGISTRY, REPO_ROOT} from '../lib/env.mjs';
import {die, dim, green, red, reportCliError} from '../lib/proc.mjs';

const ENV_SAMPLE = join(REPO_ROOT, '.env.sample');

function usage() {
  console.log(`Usage: pnpm rtx env [TASK | --create-env]
  (no args)        status of every known RunTypes env var + the .env.sample mirror check
  push-image       verify the vars \`pnpm rtx container push\` needs (GHCR token)
  publish-npm      info: NPM_TOKEN is for the local publish + the CI stage secret
  deploy-website   info: the Cloudflare secrets live in GitHub, not .env
  --create-env     create .env from .env.sample if it does not exist`);
}

// Every var .env.sample declares, live or commented-out. A declaration is a line
// whose first non-`#`/space token is an UPPER_SNAKE name followed by `=`, which is
// exactly how the file writes both the live rows (`GHCR_PAT=`) and the
// commented-out knobs (`# RT_WEBSITE_PORT=3000`). Prose comments never match: they
// start with a lowercase word or lack the `=`.
export function sampleKeys(text) {
  const keys = new Set();
  for (const line of text.split('\n')) {
    const match = /^#?\s*([A-Z][A-Z0-9_]*)=/.exec(line);
    if (match) keys.add(match[1]);
  }
  return keys;
}

// The registry-to-sample contract, as three disjoint drift lists. Pure (takes the
// file text) so the test can drive it without touching the real .env.sample.
export function sampleMirrorDrift(text, registry = REGISTRY) {
  const declared = sampleKeys(text);
  const byName = new Map(registry.map((entry) => [entry.name, entry]));
  const userSettable = registry.filter((entry) => entry.scope === 'secret' || entry.scope === 'dev');
  return {
    // A user-settable var registered but never mirrored into .env.sample.
    missing: userSettable.filter((entry) => !declared.has(entry.name)).map((entry) => entry.name),
    // An internal var listed in .env.sample — setting it breaks the run.
    internal: [...declared].filter((name) => byName.get(name)?.scope === 'internal'),
    // A key in .env.sample that no registry row declares.
    unknown: [...declared].filter((name) => !byName.has(name)),
  };
}

// Report the mirror check; returns true when the contract holds.
function checkSampleMirror() {
  const drift = sampleMirrorDrift(readFileSync(ENV_SAMPLE, 'utf8'));
  const clean = drift.missing.length === 0 && drift.internal.length === 0 && drift.unknown.length === 0;
  if (clean) {
    console.log(`${green('ok')} .env.sample mirrors the registry (every secret + dev var, and nothing else).`);
    return true;
  }
  console.error(`${red('drift')} .env.sample does not mirror the REGISTRY in scripts/lib/env.mjs:`);
  if (drift.missing.length > 0) console.error(`   missing from .env.sample (add them):        ${drift.missing.join(' ')}`);
  if (drift.internal.length > 0) console.error(`   internal vars listed (remove them):         ${drift.internal.join(' ')}`);
  if (drift.unknown.length > 0) console.error(`   not in the registry (register or remove):   ${drift.unknown.join(' ')}`);
  console.error('   fix: mirror every secret + dev row into .env.sample; internal vars never belong there.');
  return false;
}

// True when the var is set and non-empty.
const isSet = (name) => Boolean(process.env[name]);

function createEnv() {
  const dest = join(REPO_ROOT, '.env');
  if (existsSync(dest)) {
    console.log(`${dest} already exists — not overwriting.`);
    return;
  }
  copyFileSync(join(REPO_ROOT, '.env.sample'), dest);
  console.log(`${green('created .env')} from .env.sample — fill in the values you need (e.g. GHCR_PAT).`);
}

function printStatus() {
  const haveEnv = existsSync(join(REPO_ROOT, '.env')) ? 'yes' : 'no';
  const ciState = process.env.CI ? 'yes' : 'no';
  console.log(`RunTypes env vars   (.env present: ${haveEnv}   CI: ${ciState})\n`);
  const row = (name, set, scope, task, desc) => `  ${name.padEnd(30)} ${set.padEnd(4)} ${scope.padEnd(8)} ${task.padEnd(14)} ${desc}`;
  console.log(row('NAME', 'SET', 'SCOPE', 'NEEDED-FOR', 'DESCRIPTION'));
  console.log(row('-'.repeat(30), '---', '--------', '-------------', '-----------'));
  for (const {name, scope, task, desc} of REGISTRY) {
    console.log(row(name, isSet(name) ? 'yes' : '-', scope, task, desc));
  }
  console.log(`\n${dim('dev vars are local knobs in .env (cp .env.sample .env). secret vars (GHCR_PAT,')}`);
  console.log(dim('NPM_TOKEN, CLOUDFLARE_*) go in .env to run a step from local, or are GitHub secrets in CI.'));
  console.log(dim('internal vars are set by the scripts themselves (container paths / plumbing) — do NOT put them in .env.'));
}

// Verify a task's dev requirements; print guidance and throw (code 1) on failure.
function verifyTask(task) {
  switch (task) {
    case 'push-image':
      if (isSet('GHCR_PAT')) return void console.log(`${green('ok')} push-image: GHCR token is configured.`);
      console.error(`${red('missing')} push-image needs GHCR_PAT (write:packages).`);
      console.error('   fix: pnpm rtx env --create-env   then set GHCR_PAT=... in .env');
      die('', 1);
      break;
    case 'publish-npm':
      if (isSet('NPM_TOKEN')) {
        console.log(`${green('ok')} publish-npm: NPM_TOKEN is set for the local interactive publish. CI stage-publishes with the same token as a GitHub secret.`);
        return;
      }
      console.log('publish-npm: no NPM_TOKEN in .env. Set NPM_TOKEN for the local interactive publish (scripts/release/publish.mjs); CI stage-publishes with the same token as a GitHub secret.');
      return;
    case 'deploy-website': {
      const miss = ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID'].filter((name) => !isSet(name));
      if (miss.length === 0) return void console.log(`${green('ok')} deploy-website: Cloudflare creds are set for a local deploy. In CI they are GitHub secrets.`);
      console.error(`${red('missing')} deploy-website needs: ${miss.join(' ')} — set them in .env for a local deploy (GitHub secrets in CI).`);
      die('', 1);
      break;
    }
    default:
      console.error(`${red(`unknown task '${task}'`)}`);
      usage();
      die('', 2);
  }
}

export function main(args) {
  const first = args[0];
  if (first === '-h' || first === '--help') return usage();
  if (first === '--create-env') return createEnv();
  printStatus();
  console.log('');
  const mirrored = checkSampleMirror();
  if (first !== undefined) {
    console.log('');
    verifyTask(first);
  }
  if (!mirrored) die('', 1);
}

if (import.meta.main) {
  loadEnv();
  try {
    main(process.argv.slice(2));
  } catch (err) {
    reportCliError(err);
  }
}
