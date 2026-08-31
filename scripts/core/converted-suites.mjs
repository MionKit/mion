// converted-suites.mjs — run the WHOLE suite tree in the value-first forms.
//
// `mion convert` rewrites packages/run-types/test/suites/ into one tree
// per target, vitest runs those trees against the same assertions, and the trees
// are removed again. They are gitignored and exist only while this runs.
//
// The point is a corpus the fuzz lanes cannot produce: 205 hand-written files
// covering every construct the engine reflects, run three times over. A failure
// here means the CONVERSION changed behaviour — the assertions are identical, so
// nothing else can have.
//
// WHY THE TREES SIT BESIDE suites/ rather than under a shared parent: the suite
// files import `../../util/*.ts` and `../../../src/...`. Those resolve to the
// same files only at that exact depth. One level deeper and every converted file
// fails to find its helpers.
//
// Refusals are EXPECTED and listed, never silent: a declaration convert cannot
// spell is left byte-identical and keeps working in type form, so the suite
// still runs. The counts below are the contract — if a target starts refusing
// MORE, something regressed; if it refuses FEWER, a limitation was fixed and the
// number should come down with the commit that fixed it.
import {execFileSync, spawnSync} from 'node:child_process';
import {existsSync, rmSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const REPO_ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');
const PACKAGE_ROOT = path.join(REPO_ROOT, 'packages/run-types');
const SUITES = path.join(PACKAGE_ROOT, 'test/suites');
const BINARY = path.join(REPO_ROOT, 'bin/ts-runtypes');
const TSCONFIG = path.join(PACKAGE_ROOT, 'tsconfig.test.json');
const VITEST_CONFIG = path.join(PACKAGE_ROOT, 'vitest.converted.config.ts');

// Per target: the tree it generates, and the number of declarations convert is
// expected to refuse. Every refusal is a documented limitation with a row in
// packages/run-types/test/features/unsupported-conversion.test.ts. A
// BUILDER has to come out as a TypeScript expression, so a shape with no
// factory spelling has nowhere to go.
const TARGETS = [
  {name: 'builders', dir: path.join(PACKAGE_ROOT, 'test/converted-builders'), expectedRefusals: 23},
];

const args = process.argv.slice(2);
const keep = args.includes('--keep');
const only = args.includes('--target') ? args[args.indexOf('--target') + 1] : '';
const targets = only ? TARGETS.filter((target) => target.name === only) : TARGETS;
if (targets.length === 0) {
  console.error(`converted-suites: unknown --target '${only}'. Try: ${TARGETS.map((t) => t.name).join(' | ')}`);
  process.exit(2);
}
if (!existsSync(BINARY)) {
  console.error('converted-suites: bin/ts-runtypes is missing — run `pnpm run check:builds` first.');
  process.exit(1);
}

const removeTrees = () => {
  for (const target of targets) rmSync(target.dir, {recursive: true, force: true});
};

function generate(target) {
  rmSync(target.dir, {recursive: true, force: true});
  // convert exits non-zero when ANY declaration refuses, which is the normal
  // case here — the refusals are counted below instead of failing the run.
  const result = spawnSync(
    BINARY,
    ['convert', '--tsconfig', TSCONFIG, '--to', target.name, SUITES, '--out-dir', target.dir],
    {cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024}
  );
  if (result.error) throw result.error;
  // Diagnostics ride stderr, the per-file `rewrote …` lines ride stdout.
  const refusals = (result.stderr ?? '').split('\n').filter((line) => /CNV\d{3} error/.test(line));
  const rewritten = (result.stdout ?? '').split('\n').filter((line) => line.startsWith('rewrote ')).length;
  console.log(`-> ${target.name}: rewrote ${rewritten} file(s), ${refusals.length} refusal(s)`);
  if (refusals.length !== target.expectedRefusals) {
    console.error(
      `converted-suites: ${target.name} produced ${refusals.length} refusals, expected ${target.expectedRefusals}.\n` +
        (refusals.length > target.expectedRefusals
          ? 'Something regressed — a shape that used to convert no longer does.\n'
          : 'A limitation was fixed. Lower the expected count in this file with the commit that fixed it.\n') +
        refusals.join('\n')
    );
    process.exitCode = 1;
    return false;
  }
  return true;
}

let generatedAll = true;
try {
  for (const target of targets) generatedAll = generate(target) && generatedAll;
  if (!generatedAll) throw new Error('converted-suites: refusal count changed');
  execFileSync('pnpm', ['exec', 'vitest', 'run', '--config', VITEST_CONFIG], {cwd: REPO_ROOT, stdio: 'inherit'});
} catch (error) {
  if (process.exitCode === undefined || process.exitCode === 0) process.exitCode = 1;
  if (!(error && typeof error === 'object' && 'status' in error)) console.error(String(error?.message ?? error));
} finally {
  // Always — a failing run must not leave a half-generated tree behind for
  // `pnpm test` to trip over. `--keep` opts out so a failure can be inspected.
  if (keep) console.log(`-> --keep: left ${targets.map((t) => path.relative(REPO_ROOT, t.dir)).join(', ')} in place`);
  else removeTrees();
}
