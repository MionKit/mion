// gen-test-counts.mjs — count the test suites and write them where the docs site
// can read them, so the homepage's "Tested to the highest standard" tiles stop
// being hand-typed numbers that drift.
//
// Both counts come from the test runners' own LIST modes, so nothing is executed:
// `vitest list --json` collects every test the config would run, and `go test
// -list` prints the test function names a package declares. Collection still
// compiles the sources, so this needs the resolver binary + the marker/plugin
// dists, the playground wasm (the website build runs it right after the stage that
// builds them) and a Go toolchain.
//
// Output: container/website/app/data/test-counts.json — COMMITTED, and imported
// by app/components/content/StatTiles.vue at build time rather than fetched at
// runtime, so the numbers are in the prerendered HTML with no hydration flash.
// Committing it also means the site still builds where the tooling is absent (a
// container-only build, a docs-only CI lane): a stage that cannot count leaves the
// last known-good file in place and warns, and the diff shows the numbers moving.
//
// The file carries NO timestamp on purpose — a regenerate that finds the same
// counts must leave the file byte-identical, or every build dirties the tree.

import {mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {loadEnv, REPO_ROOT} from '../lib/env.mjs';
import {capture, die, note, reportCliError, warn, which} from '../lib/proc.mjs';
import {wasmAssetState} from './playground-wasm-inputs.mjs';

const OUT_DIR = join(REPO_ROOT, 'container/website/app/data');
const OUT_FILE = join(OUT_DIR, 'test-counts.json');

// `vitest list` writes the collected tests as JSON to a file, not stdout: a project's
// globalSetup runs in the same process and logs there (the client tests' server prints
// its port), which would corrupt a stdout parse.
function countFrontEndTests() {
  // The playground suites skip without a wasm built from this Go tree, and `vitest list` leaves skipped
  // tests out, so counting then would drop every engine test and depend on the host.
  const wasm = wasmAssetState(join(REPO_ROOT, '.cache/rt-wasm/'), REPO_ROOT);
  if (wasm !== 'ready') throw new Error(`the playground wasm is ${wasm} - build it first: node container/website/scripts/build-playground.mjs`);
  const dir = mkdtempSync(join(tmpdir(), 'mion-test-counts-'));
  const file = join(dir, 'tests.json');
  let tests;
  try {
    // maxBuffer raised so the logs stdout still carries never truncate the capture.
    const listed = capture('pnpm', ['exec', 'vitest', 'list', `--json=${file}`], {maxBuffer: 64 * 1024 * 1024});
    if (listed.status !== 0) throw new Error(`vitest list failed (exit ${listed.status})`);
    tests = JSON.parse(readFileSync(file, 'utf8'));
  } finally {
    rmSync(dir, {recursive: true, force: true});
  }
  if (!Array.isArray(tests) || tests.length === 0) throw new Error('vitest list returned no tests');
  const projects = {};
  for (const test of tests) projects[test.projectName] = (projects[test.projectName] ?? 0) + 1;
  return {
    tests: tests.length,
    files: new Set(tests.map((test) => test.file)).size,
    projects: Object.fromEntries(Object.entries(projects).sort(([a], [b]) => a.localeCompare(b))),
  };
}

// `go test -list` prints one name per line plus a trailing "ok <pkg>" per package.
// Count only Test functions: Benchmarks and Examples are not tests, and Fuzz
// targets are counted by the fuzz suite's own page, not here.
function countGoTests() {
  if (!which('go')) throw new Error('go is not on PATH');
  const listed = capture('go', ['-C', join(REPO_ROOT, 'ts-go-runtypes'), 'test', '-list', '.*', './internal/...'], {maxBuffer: 64 * 1024 * 1024});
  if (listed.status !== 0) throw new Error(`go test -list failed (exit ${listed.status})`);
  const lines = listed.stdout.split('\n');
  const tests = lines.filter((line) => /^Test\w/.test(line)).length;
  if (tests === 0) throw new Error('go test -list returned no Test functions');
  return {tests, packages: lines.filter((line) => line.startsWith('ok ') || line.startsWith('?   ')).length};
}

const readExisting = () => {
  try {
    return JSON.parse(readFileSync(OUT_FILE, 'utf8'));
  } catch {
    return null;
  }
};

// Regenerate what we can. A counter that cannot run keeps the committed value
// rather than writing a zero — a homepage tile reading "0 tests" would be worse
// than one reading a slightly stale number, and silently wrong either way, so it
// warns. `--check` turns the same comparison into a gate (used by CI) and refuses that fallback:
// a kept value always matches itself, so a check that cannot count would report green on a stale file.
export function main(args = []) {
  const check = args.includes('--check');
  for (const arg of args) if (arg !== '--check') die(`gen-test-counts: unknown arg '${arg}' (want: [--check])`, 2);

  const existing = readExisting();
  const counts = {};

  try {
    counts.frontEnd = countFrontEndTests();
  } catch (err) {
    if (check) die(`gen-test-counts: --check cannot verify the committed front-end count - ${err.message}`);
    if (!existing?.frontEnd) die(`gen-test-counts: cannot count the front-end tests and no committed count to fall back on - ${err.message}`);
    warn(`front-end count kept at ${existing.frontEnd.tests} (could not recount: ${err.message})`);
    counts.frontEnd = existing.frontEnd;
  }

  try {
    counts.go = countGoTests();
  } catch (err) {
    if (check) die(`gen-test-counts: --check cannot verify the committed Go count - ${err.message}`);
    if (!existing?.go) die(`gen-test-counts: cannot count the Go tests and no committed count to fall back on - ${err.message}`);
    warn(`Go count kept at ${existing.go.tests} (could not recount: ${err.message})`);
    counts.go = existing.go;
  }

  const next = JSON.stringify(counts, null, 2) + '\n';
  const current = existing === null ? '' : JSON.stringify(existing, null, 2) + '\n';

  if (check) {
    if (next === current) return note(`test counts up to date (${counts.frontEnd.tests} front-end, ${counts.go.tests} Go)`);
    die(`gen-test-counts: ${OUT_FILE} is stale - run 'pnpm miondevx website test-counts' and commit the result`);
  }

  if (next === current) return note(`test counts unchanged (${counts.frontEnd.tests} front-end, ${counts.go.tests} Go)`);
  mkdirSync(OUT_DIR, {recursive: true});
  writeFileSync(OUT_FILE, next);
  note(`test counts -> ${OUT_FILE} (${counts.frontEnd.tests} front-end across ${counts.frontEnd.files} files, ${counts.go.tests} Go)`);
}

if (import.meta.main) {
  loadEnv();
  try {
    main(process.argv.slice(2));
  } catch (err) {
    reportCliError(err);
  }
}
