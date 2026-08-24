// publish.mjs — interactive npm publish for the ts-runtypes monorepo. Port of the
// former scripts/release/publish.sh. Loads .env (dev) for NPM_TOKEN, bumps the
// lockstep version, cross-compiles the per-platform binary packages, then publishes
// the platform packages FIRST and the launcher/FE packages LAST so a consumer never
// resolves a launcher whose optional deps aren't on the registry yet.

import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {loadEnv, REPO_ROOT} from '../lib/env.mjs';
import {capture, die, green, prompt, red, reportCliError, runOrThrow, yellow} from '../lib/proc.mjs';

export async function main() {
  console.log('');
  console.log(green('══════════════════════════════════════════'));
  console.log(green('  ts-runtypes publish'));
  console.log(green('══════════════════════════════════════════'));

  // [1/5] npm auth — single source: NPM_TOKEN in .env.
  console.log('');
  console.log(green('[1/5] Configuring npm authentication...'));
  console.log('──────────────────────────────────────────');
  if (!process.env.NPM_TOKEN) die(red('NPM_TOKEN is not set. Put NPM_TOKEN=<npm automation token> in .env (cp .env.sample .env).'));
  runOrThrow('npm', ['config', 'set', '//registry.npmjs.org/:_authToken', process.env.NPM_TOKEN]);
  const npmUser = capture('npm', ['whoami']).stdout.trim();
  if (npmUser) console.log(`Authenticated as: ${green(npmUser)}`);
  else console.log(green('npm token configured'));

  // [2/4] Check clean working tree.
  console.log('');
  console.log(green('[2/4] Checking working tree...'));
  console.log('──────────────────────────────────────────');
  if (capture('git', ['status', '--porcelain']).stdout.trim()) {
    console.error(red('Working tree is dirty. Commit or stash changes first.'));
    runOrThrow('git', ['status', '--short']);
    die('', 1);
  }
  console.log(green('Working tree is clean'));

  // [3/5] Version bump (interactive). Writes the lockstep version into version.json
  // + every package.json, then commits + tags.
  console.log('');
  console.log(green('[3/5] Version bump'));
  console.log('──────────────────────────────────────────');
  const bump = await prompt('Version bump (patch / minor / major or explicit X.Y.Z): ');
  runOrThrow('node', ['scripts/release/bump-version.mjs', bump]);

  // [4/5] Cross-compile + stage the per-platform binary packages -> dist-binaries/.
  console.log('');
  console.log(green('[4/5] Building per-platform binary packages...'));
  console.log('──────────────────────────────────────────');
  runOrThrow('node', ['scripts/release/build-binaries.mjs']);

  // [5/5] Publish to npm. OTP is time-based and may expire across the sequential
  // publishes; a granular automation token skips the prompt (leave blank). On an OTP
  // timeout, re-run.
  console.log('');
  console.log(green('[5/5] Publishing to npm...'));
  console.log('──────────────────────────────────────────');
  const otp = await prompt('Enter npm OTP code (blank if using an automation token): ');
  const otpFlag = otp ? [`--otp=${otp}`] : [];

  // Platform binary packages FIRST, launcher LAST (dist-binaries/publish-order.json),
  // so the launcher never lands referencing optional deps not yet on the registry.
  const publishOrder = JSON.parse(readFileSync(join(REPO_ROOT, 'dist-binaries/publish-order.json'), 'utf8'));
  for (const pkg of publishOrder) {
    console.log(yellow(`publishing ${pkg}...`));
    runOrThrow('npm', ['publish', `dist-binaries/${pkg}`, '--access', 'public', ...otpFlag]);
  }

  // FE packages via `pnpm publish` (rewrites workspace:* → concrete versions).
  // @ts-runtypes/bin was already published in the loop above; only @ts-runtypes/core
  // + @ts-runtypes/devtools publish here. Filter by the PACKAGE NAMES (pnpm --filter
  // matches names, not directories) — a stale `ts-runtypes` selector matches nothing
  // and silently skips the package.
  runOrThrow('pnpm', ['--filter', '@ts-runtypes/core', '--filter', '@ts-runtypes/devtools', 'publish', '--no-git-checks', '--ignore-scripts', '--access', 'public', ...otpFlag]);

  console.log('');
  console.log(green('══════════════════════════════════════════'));
  console.log(green('  Published successfully!'));
  console.log(green('══════════════════════════════════════════'));
}

if (import.meta.main) {
  loadEnv();
  try {
    await main();
  } catch (err) {
    reportCliError(err);
  }
}
