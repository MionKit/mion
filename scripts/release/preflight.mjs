// preflight.mjs — pre-publish verification for the mion monorepo. Port of the
// former scripts/release/preflight.sh. Runs the Go + JS test suites, lint, formatting
// check, and a fresh build. Any failing step aborts (runOrThrow throws a CliError).

import {GO_ROOT, loadEnv, REPO_ROOT} from '../lib/env.mjs';
import {green, reportCliError, run, runOrThrow} from '../lib/proc.mjs';
import {main as coreBuild} from '../core/build.mjs';

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

  // Step 2: Build the engine — the Go tests read the marker dist, the JS plugin
  // tests spawn the binary. Through scripts/core/build.mjs, never a bare `go build`:
  // it stamps the version ldflags, so the later pretest / prelint checks are no-ops
  // instead of throwing a "dev"-versioned binary away on the build-id mismatch.
  printStep('Build the engine (Go binary + dev dists)');
  coreBuild(['all']);
  run('./bin/mion', ['--help'], {stdio: 'ignore'}); // smoke; failure tolerated (|| true)

  // Step 3: Go test suite.
  printStep('Go tests');
  runOrThrow('go', ['test', './internal/...'], {cwd: GO_ROOT});

  // Step 4: Lint & formatting + the drizzle version-line guard.
  printStep('Lint & check formatting');
  runOrThrow('pnpm', ['run', 'lint']);
  runOrThrow('pnpm', ['run', 'check-format']);
  runOrThrow('node', ['scripts/release/check-drizzle-versions.mjs'], {cwd: REPO_ROOT});

  // Step 5: JS test suites.
  printStep('JS tests (Vitest projects)');
  runOrThrow('pnpm', ['run', 'test']);

  // Step 6: Build all JS packages.
  printStep('Build JS packages');
  runOrThrow('pnpm', ['run', 'build']);

  console.log(`\n${green('══════════════════════════════════════════')}`);
  console.log(green('  All pre-publish checks passed!'));
  console.log(green('══════════════════════════════════════════'));
  console.log('\nReady to publish. Run:\n  pnpm miondevx release npm\n');
}

if (import.meta.main) {
  loadEnv();
  try {
    main();
  } catch (err) {
    reportCliError(err);
  }
}
