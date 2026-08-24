#!/usr/bin/env node
// bump-tsgolint.mjs — move the pinned oxc-project/tsgolint submodule (and its
// nested typescript-go, our TypeScript 7 checker) to a NEW revision: fetch,
// checkout, advance typescript-go, re-apply the shim patches, rebuild the resolver,
// WRITE the pin, and run the full Go + JS test gate. It never commits, tags, or
// pushes — you review the moved pointer + pin and land (or revert) it yourself.
//
//   pnpm rtx core bump-tsgolint               # -> latest tsgolint release tag
//   pnpm rtx core bump-tsgolint origin/main   # bleeding edge (unreleased main HEAD)
//   pnpm rtx core bump-tsgolint v0.24.0       # a specific tag / branch / sha
//   pnpm rtx core bump-tsgolint --skip-tests  # build only, skip the go + js suites
//
// The submodule gitlink, ts-go-runtypes/tsgolint.pin.json (source of truth), and the
// launcher's `tsgo` metadata all move together. Setup re-derives the working tree
// from the pin via `pnpm rtx core ensure-tsgolint`.
//
// The only step that can genuinely fail is patch re-application; the patches ride
// inside the tsgolint repo and travel with the pinned rev, so they normally match
// the typescript-go they ship with. On a conflict this stops with the exact
// `git apply --3way --reject` recovery flow.

import {readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {loadEnv, REPO_ROOT} from '../lib/env.mjs';
import {die, dim, green, info, note, red, reportCliError, run, success, warn, which, yellow} from '../lib/proc.mjs';
import {main as coreBuild} from './build.mjs';
import {checkout, describe, ensurePatches, fetchTsgolint, headCommit, latestReleaseTag, PIN_FILE, readPin, rel, resolveCommit, shortCommit, submoduleInitialised, TSGO, writePin} from '../lib/tsgolint.mjs';

const LAUNCHER_PKG = join(REPO_ROOT, 'packages/ts-runtypes-bin/package.json');

const parseArgs = (argv) => ({rev: argv.find((arg) => !arg.startsWith('-')), skipTests: argv.includes('--skip-tests')});

// Keep the launcher's pure-metadata `tsgo` short-sha in step with the new pin so the
// working-tree diff is self-consistent (build/publish re-derive it from git anyway).
function syncLauncherMetadata(sha) {
  const text = readFileSync(LAUNCHER_PKG, 'utf8');
  const next = text.replace(/("tsgo":\s*")[0-9a-f]+(")/, `$1${sha}$2`);
  if (next === text) return warn(`could not rewrite the "tsgo" field in ${rel(LAUNCHER_PKG)} — set it to ${sha} by hand.`);
  writeFileSync(LAUNCHER_PKG, next);
  success(`Synced ${rel(LAUNCHER_PKG)} "tsgo" -> ${sha}.`);
}

function revertHint(beforeSha) {
  console.log(dim('  # revert (restore the previous pin, its patches, and the binary):'));
  console.log(`  pnpm rtx core bump-tsgolint ${beforeSha}`);
}

function printSummary(state) {
  const line = (label, value) => console.log(`  ${label.padEnd(14)} ${value}`);
  console.log(`\n${green('bump-tsgolint summary')}`);
  line('tsgolint', `${state.beforeTsgolint}  ->  ${state.afterTsgolint}`);
  line('typescript-go', `${state.beforeTsgo}  ->  ${state.afterTsgo}`);
  line('pin file', `${rel(PIN_FILE)} updated`);
  if (state.skipTests) line('tests', yellow('skipped (--skip-tests)'));
  else {
    line('go test', state.goOk ? green('PASS') : red('FAIL'));
    line('pnpm test', state.jsOk ? green('PASS') : red('FAIL'));
  }
  const failed = !state.skipTests && (!state.goOk || !state.jsOk);
  console.log('');
  if (failed) console.log(red('One or more suites FAILED — do NOT commit. Investigate, or revert below.'));
  else console.log('Review the moved submodule pointer + pin, then land it:');
  console.log(dim('  # land'));
  console.log('  git add ts-go-runtypes/third_party/tsgolint ts-go-runtypes/tsgolint.pin.json packages/ts-runtypes-bin/package.json');
  console.log(`  git commit -m "chore: bump tsgolint to ${state.target}"`);
  revertHint(state.beforeSha);
  console.log('');
}

export function main(argv) {
  const {rev, skipTests} = parseArgs(argv);
  if (!which('git')) die('bump-tsgolint: git not found on PATH.', 1);
  if (!which('go')) die('bump-tsgolint: Go toolchain not found on PATH (needed to rebuild the resolver).', 1);
  if (!submoduleInitialised()) die('bump-tsgolint: tsgolint submodule not initialised. Run the ts-runtypes-setup skill first (SETUP.md -> Bootstrap).', 1);

  const beforeSha = shortCommit();
  const beforeTsgolint = describe();
  const beforeTsgo = describe(TSGO);

  info('Fetching tsgolint (origin, with tags)...');
  if (!fetchTsgolint()) die('bump-tsgolint: git fetch failed (network / remote?).', 1);

  const target = rev ?? latestReleaseTag();
  if (!target) die('bump-tsgolint: no release tag found to default to — pass an explicit <rev>.', 1);
  const targetCommit = resolveCommit(target);
  if (!targetCommit) die(`bump-tsgolint: '${target}' is not a known revision in tsgolint.`, 1);

  note(`tsgolint: ${beforeTsgolint} (${beforeSha})  ->  ${target} (${targetCommit.slice(0, 7)})`);
  // No-op when the PIN already declares the target (not just the submodule HEAD, which
  // can transiently sit on the target after an interrupted bump while the pin is stale).
  const currentPin = readPin();
  if (currentPin && currentPin.commit === targetCommit) return success(`Pin already at ${target} (${targetCommit.slice(0, 7)}). Nothing to do.`);

  try {
    info(`Checking out tsgolint ${target}...`);
    if (!checkout(target)) die(`bump-tsgolint: checkout of '${target}' (or its typescript-go) failed.`, 1);

    info('Re-applying shim patches to typescript-go...');
    const patched = ensurePatches();
    success(`Patches: ${patched.applied} applied, ${patched.already} already present.`);

    // Declare the pin BEFORE building so the build's own drift check sees the submodule
    // matching the pin (no spurious warning). A build failure after this is fine — the
    // bump throws and the revert line below restores the previous pin.
    writePin({commit: headCommit(), ref: describe()});
    success(`Wrote pin ${rel(PIN_FILE)} -> ${describe()} (${shortCommit()}).`);
    syncLauncherMetadata(shortCommit());

    info('Rebuilding bin/ts-runtypes against the new typescript-go...');
    coreBuild(['go']);
  } catch (err) {
    console.error(red('bump-tsgolint: the move failed against the new typescript-go (patch/API drift?).'));
    revertHint(beforeSha);
    throw err;
  }

  let goOk = true;
  let jsOk = true;
  if (skipTests) {
    warn('--skip-tests: skipping the Go + JS suites. Run them before you commit.');
  } else {
    info('Running the Go suite (go test ./internal/...)...');
    goOk = run('go', ['test', './internal/...'], {cwd: join(REPO_ROOT, 'ts-go-runtypes')}) === 0;
    info('Running the JS suite (pnpm test)...');
    jsOk = run('pnpm', ['test']) === 0;
  }

  printSummary({beforeSha, beforeTsgolint, afterTsgolint: describe(), beforeTsgo, afterTsgo: describe(TSGO), target, skipTests, goOk, jsOk});
  if (!goOk || !jsOk) die('', 1);
}

if (import.meta.main) {
  loadEnv();
  try {
    main(process.argv.slice(2));
  } catch (err) {
    reportCliError(err);
  }
}
