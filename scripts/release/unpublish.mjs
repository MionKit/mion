// unpublish.mjs — interactive npm unpublish, in reverse dependency order. Port of
// the former scripts/release/unpublish.sh. Dependents first, dependencies last
// (ts-runtypes <- ts-runtypes-devtools <- ts-runtypes-bin).

import {loadEnv} from '../lib/env.mjs';
import {capture, die, green, prompt, red, reportCliError, run, yellow} from '../lib/proc.mjs';

// Reverse dependency order (dependents first). Hardcoded to avoid a lerna dep.
const PACKAGES = ['@ts-runtypes/core', '@ts-runtypes/devtools', '@ts-runtypes/bin'];

export async function main(args) {
  // Check npm auth.
  const who = capture('npm', ['whoami', '--no-interactive']);
  if (who.status !== 0) die(red("Not logged in to npm. Run 'npm login' first."));
  console.log(`Logged in as: ${green(who.stdout.trim())}`);

  // Get version (arg or prompt).
  const version = args[0] || (await prompt('Version to unpublish: '));
  if (!version) die(red('No version provided.'));

  // Preview.
  console.log('');
  console.log(yellow('Will unpublish in reverse dependency order:'));
  PACKAGES.forEach((pkg, i) => console.log(`  ${i + 1}. ${pkg}@${version}`));

  console.log('');
  const confirm = await prompt('Are you sure? (y/N) ');
  if (!/^[Yy]$/.test(confirm)) return void console.log('Aborted.');

  // One OTP for all packages.
  console.log('');
  const otp = await prompt('Enter npm OTP code: ');

  const failed = [];
  for (const pkg of PACKAGES) {
    process.stdout.write(`Unpublishing ${pkg}@${version}... `);
    if (run('npm', ['unpublish', `${pkg}@${version}`, `--otp=${otp}`]) === 0) console.log(green('done'));
    else {
      console.log(red('failed'));
      failed.push(pkg);
    }
  }

  console.log('');
  if (failed.length === 0) {
    console.log(green('All packages unpublished successfully.'));
  } else {
    console.error(red('Failed to unpublish:'));
    for (const pkg of failed) console.error(`  ${pkg}@${version}`);
  }
}

if (import.meta.main) {
  loadEnv();
  try {
    await main(process.argv.slice(2));
  } catch (err) {
    reportCliError(err);
  }
}
