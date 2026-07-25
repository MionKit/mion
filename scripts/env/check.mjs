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

import {copyFileSync, existsSync} from 'node:fs';
import {join} from 'node:path';
import {loadEnv, REGISTRY, REPO_ROOT} from '../lib/env.mjs';
import {die, dim, green, red, reportCliError} from '../lib/proc.mjs';

function usage() {
  console.log(`Usage: pnpm rtx env [TASK | --create-env]
  (no args)        status of every known RunTypes env var
  push-image       verify the vars \`pnpm rtx container push\` needs (GHCR token)
  publish-npm      info: NPM_TOKEN is for the local publish + the CI stage secret
  deploy-website   info: the Cloudflare secrets live in GitHub, not .env
  --create-env     create .env from .env.sample if it does not exist`);
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
  if (first !== undefined) {
    console.log('');
    verifyTask(first);
  }
}

if (import.meta.main) {
  loadEnv();
  try {
    main(process.argv.slice(2));
  } catch (err) {
    reportCliError(err);
  }
}
