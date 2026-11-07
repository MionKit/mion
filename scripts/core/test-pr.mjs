// `core test-pr`: the changed packages plus their dependents in ONE vitest process (one startup, unlike test-batches).
// A change outside packages/ runs the full suite only if the js lane hashes it (not docs, not Go tests).
import {REPO_ROOT} from '../lib/env.mjs';
import {changedFiles, classifyPaths} from '../lib/branch-diff.mjs';
import {affectedClosure, readWorkspaceGraph} from '../lib/workspace-graph.mjs';
import {die, note, reportCliError, runOrThrow} from '../lib/proc.mjs';
import {readProjects} from './test-batches.mjs';

const DEFAULT_BASE = 'origin/main';
const TEST_SKIP = 'scripts/core/test-skip.mjs';
const SHOWN = 8;

// Root-listed project configs sit at `packages/<dir>/…`.
const projectPackage = (configPath) => configPath.split('/')[1];

// Pure; `projects` is readProjects()'s output.
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

// Pulls `--project` / `--skip-project` (both `--flag name` and `--flag=name`) out of the passthrough args.
function takeProjectFlags(args) {
  const only = [];
  const skip = [];
  const rest = [];
  for (let at = 0; at < args.length; at++) {
    const [flag, inline] = args[at].split(/=(.*)/s);
    const into = flag === '--project' ? only : flag === '--skip-project' ? skip : undefined;
    if (!into) rest.push(args[at]);
    else if (inline !== undefined) into.push(inline);
    else if (args[at + 1] === undefined) die(`core test-pr: ${flag} needs a project name`, 2);
    else into.push(args[++at]);
  }
  return {only, skip, rest};
}

// Pure, for the tests. `--project` narrows the plan, never widens it; `--skip-project` removes from it.
export function suiteCommand(plan, {skipPassed = false, passThrough = []} = {}) {
  const {only, skip, rest} = takeProjectFlags(passThrough);
  if ((only.length > 0 || skip.length > 0) && !skipPassed) die('core test-pr: --project and --skip-project need --skip-passed', 2);
  const projects = plan.full ? only : plan.projects.filter((project) => (only.length === 0 || only.includes(project)) && !skip.includes(project));
  if (!plan.full && projects.length === 0) return null;
  const projectFlags = projects.flatMap((project) => ['--project', project]);
  if (skipPassed) return ['node', [TEST_SKIP, ...projectFlags, ...skip.flatMap((project) => ['--skip-project', project]), ...rest]];
  // An --exclude can empty a selected project (test-router-fuzz is all test/fuzz/).
  return ['pnpm', ['exec', 'vitest', 'run', ...projectFlags, ...(plan.full ? [] : ['--passWithNoTests']), ...passThrough]];
}

export function main(argv = []) {
  const {base, rest} = takeBase(argv);
  const list = rest.includes('--list');
  const skipPassed = rest.includes('--skip-passed');
  const passThrough = rest.filter((arg) => arg !== '--list' && arg !== '--skip-passed');
  const diff = changedFiles(base);
  const plan = buildPlan({files: diff.files, packages: readWorkspaceGraph(REPO_ROOT), projects: readProjects(REPO_ROOT)});
  report(plan, {base, ...diff});
  if (list) return;
  const command = suiteCommand(plan, {skipPassed, passThrough});
  if (!command) return note('test-pr: nothing to test');
  runOrThrow(...command, {failMessage: plan.full ? 'core test-pr: the full suite failed' : 'core test-pr: the affected projects failed'});
}

if (import.meta.main) {
  try {
    main(process.argv.slice(2));
  } catch (err) {
    reportCliError(err);
  }
}
