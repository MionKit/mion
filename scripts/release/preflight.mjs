// preflight.mjs — pre-publish verification for the ts-runtypes monorepo. Port of the
// former scripts/release/preflight.sh. Runs the Go + JS test suites, lint, formatting
// check, and a fresh build. Any failing step aborts (runOrThrow throws a CliError).

import {join} from 'node:path';
import {GO_ROOT, loadEnv, REPO_ROOT} from '../lib/env.mjs';
import {green, reportCliError, run, runOrThrow} from '../lib/proc.mjs';

const TOTAL = 6;
let step = 0;
function printStep(label) {
  step++;
  console.log(`\n${green(`[${step}/${TOTAL}] ${label}`)}`);
  console.log('──────────────────────────────────────────');
}

export function main() {
  // Step 1: Fresh start (clean + reinstall).
  printStep('Fresh start (clean + reinstall)');
  runOrThrow('pnpm', ['run', 'fresh-start']);

  // Step 2: Build the Go binary — JS plugin tests spawn it, so it must exist before
  // `pnpm test`. The binary //go:embeds the cache skeletons directly.
  printStep('Build Go binary');
  runOrThrow('go', ['build', '-o', join(REPO_ROOT, 'bin/ts-runtypes'), './cmd/ts-runtypes'], {cwd: GO_ROOT});
  run('./bin/ts-runtypes', ['--help'], {stdio: 'ignore'}); // smoke; failure tolerated (|| true)

  // Step 3: Go test suite.
  printStep('Go tests');
  runOrThrow('go', ['test', './internal/...'], {cwd: GO_ROOT});

  // Step 4: Lint & formatting.
  printStep('Lint & check formatting');
  runOrThrow('pnpm', ['run', 'lint']);
  runOrThrow('pnpm', ['run', 'check-format']);

  // Step 5: JS test suites.
  printStep('JS tests (Vitest projects)');
  runOrThrow('pnpm', ['run', 'test']);

  // Step 6: Build all JS packages.
  printStep('Build JS packages');
  runOrThrow('pnpm', ['run', 'build']);

  console.log(`\n${green('══════════════════════════════════════════')}`);
  console.log(green('  All pre-publish checks passed!'));
  console.log(green('══════════════════════════════════════════'));
  console.log('\nReady to publish. Run:\n  pnpm rtx release npm\n');
}

if (import.meta.main) {
  loadEnv();
  try {
    main();
  } catch (err) {
    reportCliError(err);
  }
}
