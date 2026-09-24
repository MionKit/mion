// test-pr.mjs — `pnpm miondevx core test-pr`: vitest over only the packages a branch
// changed plus every package that depends on them, in ONE vitest process (one
// startup, unlike test-batches). Any change outside packages/ that can feed a test
// (the Go tree, root configs, scripts/, container/, CI files) runs the full suite.
//
// Usage (via `pnpm miondevx core test-pr …`, or `node scripts/core/test-pr.mjs …`):
//   test-pr [--base <ref>]   diff from the merge-base of <ref> (default origin/main) and HEAD
//   test-pr --list           print the plan, run nothing
// Every other arg passes to vitest.
import {REPO_ROOT} from '../lib/env.mjs';
import {changedFiles, classifyPaths} from '../lib/branch-diff.mjs';
import {affectedClosure, readWorkspaceGraph} from '../lib/workspace-graph.mjs';
import {die, note, reportCliError, runOrThrow} from '../lib/proc.mjs';
import {readProjects} from './test-batches.mjs';

const DEFAULT_BASE = 'origin/main';
const SHOWN = 8;

// The package dir a root-listed project config sits in (`packages/<dir>/…`).
const projectPackage = (configPath) => configPath.split('/')[1];

// Pure: what to run for these changed files. `projects` is readProjects()'s output.
export function buildPlan({files, packages, projects}) {
  const {packages: changed, global, ignored} = classifyPaths(files, packages);
  if (global.length > 0) return {full: true, global, ignored, changed, affected: new Map(), projects: [], untested: []};
  const affected = affectedClosure(changed, packages);
  const selected = projects.filter((project) => affected.has(projectPackage(project.configPath))).map((project) => project.name);
  const tested = new Set(projects.map((project) => projectPackage(project.configPath)));
  const untested = [...affected.keys()].filter((dir) => !tested.has(dir)).sort();
  return {full: false, global, ignored, changed, affected, projects: selected, untested};
}

const sample = (list) => `${list.slice(0, SHOWN).join(', ')}${list.length > SHOWN ? `, … (${list.length - SHOWN} more)` : ''}`;

function report(plan, {base, mergeBase, files}) {
  note(`test-pr: base ${base}, merge-base ${mergeBase.slice(0, 12)}, ${files.length} changed file(s)`);
  if (plan.ignored.length > 0) console.log(`   ignored (feed no test): ${sample(plan.ignored)}`);
  if (plan.full) {
    console.log(`   full suite: ${plan.global.length} changed file(s) outside the workspace packages: ${sample(plan.global)}`);
    return;
  }
  console.log(`   changed packages: ${[...plan.changed].sort().join(', ') || '(none)'}`);
  console.log(`   affected packages (${plan.affected.size}):`);
  for (const dir of [...plan.affected.keys()].sort()) {
    const via = plan.affected.get(dir);
    console.log(`     ${dir.padEnd(24)} ${via === null ? 'changed' : `depends on ${via}`}`);
  }
  if (plan.untested.length > 0) console.log(`   no vitest project: ${plan.untested.join(', ')}`);
  if (plan.untested.includes('platform-bun')) console.log('   platform-bun runs on bun:test, see `pnpm run test:bun`');
  console.log(`   vitest projects (${plan.projects.length}): ${plan.projects.join(' ') || '(none)'}`);
}

const takeBase = (argv) => {
  const at = argv.findIndex((arg) => arg === '--base' || arg.startsWith('--base='));
  if (at === -1) return {base: DEFAULT_BASE, rest: argv};
  if (argv[at].includes('=')) return {base: argv[at].slice('--base='.length), rest: argv.toSpliced(at, 1)};
  if (argv[at + 1] === undefined) die('core test-pr: --base needs a ref', 2);
  return {base: argv[at + 1], rest: argv.toSpliced(at, 2)};
};

export function main(argv = []) {
  const {base, rest} = takeBase(argv);
  const list = rest.includes('--list');
  const passThrough = rest.filter((arg) => arg !== '--list');
  const diff = changedFiles(base);
  const plan = buildPlan({files: diff.files, packages: readWorkspaceGraph(REPO_ROOT), projects: readProjects(REPO_ROOT)});
  report(plan, {base, ...diff});
  if (list) return;
  if (plan.full) return runOrThrow('pnpm', ['exec', 'vitest', 'run', ...passThrough], {failMessage: 'core test-pr: the full suite failed'});
  if (plan.projects.length === 0) return note('test-pr: nothing to test');
  const projectFlags = plan.projects.flatMap((project) => ['--project', project]);
  // A caller's --exclude can empty a selected project (test-router-fuzz is all test/fuzz/).
  runOrThrow('pnpm', ['exec', 'vitest', 'run', ...projectFlags, '--passWithNoTests', ...passThrough], {failMessage: 'core test-pr: the affected projects failed'});
}

if (import.meta.main) {
  try {
    main(process.argv.slice(2));
  } catch (err) {
    reportCliError(err);
  }
}
