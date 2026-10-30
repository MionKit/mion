// Real-bench A/B for the getErrors optimizations: builds and runs the mion lane (`pnpm miondevx bench bench-one mion`)
// at several tree states, in interleaved rounds, then prints the change against `base` with machine drift removed.
//
// Drift removal: per case and path, (getErrors run / getErrors base) / (validate run / validate base). validate's code
// is the same in every state, so its ratio is the machine's speed at that moment. 1.00 = unchanged.
//
// Run from a CLEAN tree (it checks out each state, then restores the branch):
//   node container/benchmarks/get-errors-experiments/bench-refs.mjs [--rounds 2] [--states base,final] [--report|--dry-run]
// --report skips the runs and prints from the results already saved under container/benchmarks/results/get-errors/.
// --dry-run prints the commit (and revert) each state resolves to, touching nothing.
//
// States (found by commit subject, so they survive a rebase):
//   base              parent of the spread-free commit: the code before any change
//   spreadFree        APPLIED alone: newRunTypeErr without spreads
//   shortcut          APPLIED alone: validator-first shortcut on container roots (final with spreadFree reverted)
//   shortcutAllRoots  DISCARDED: the shortcut on every root, spreadFree reverted
//   final             what ships: HEAD

import {execFileSync, spawnSync} from 'node:child_process';
import {copyFileSync, existsSync, mkdirSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const REPO = fileURLToPath(new URL('../../..', import.meta.url));
const RESULTS = join(REPO, 'container/benchmarks/results');
const OUT = join(RESULTS, 'get-errors');
const SUBJECTS = {
  spreadFree: 'perf(run-types): build validation error paths without array spreads',
  shortcutAllRoots: 'perf(run-types): ask the validator before building validation errors',
};

const git = (...args) => execFileSync('git', args, {cwd: REPO, encoding: 'utf8'}).trim();
const commitBySubject = (subject) => {
  const hit = git('log', '--format=%H %s', 'HEAD')
    .split('\n')
    .find((line) => line.slice(41) === subject);
  if (!hit) throw new Error(`no commit with subject "${subject}" in HEAD's history`);
  return hit.slice(0, 40);
};

function states() {
  const spreadFree = commitBySubject(SUBJECTS.spreadFree);
  const shortcutAll = commitBySubject(SUBJECTS.shortcutAllRoots);
  const head = git('rev-parse', 'HEAD');
  return {
    base: {ref: `${spreadFree}^`},
    spreadFree: {ref: spreadFree},
    shortcut: {ref: head, revert: spreadFree},
    shortcutAllRoots: {ref: shortcutAll, revert: spreadFree},
    final: {ref: head},
  };
}

function checkout(state) {
  git('checkout', '-q', '--detach', state.ref);
  if (state.revert) git('revert', '--no-commit', state.revert);
}

function runOne(label, round) {
  const run = (args, env = {}) => {
    const proc = spawnSync('pnpm', args, {cwd: REPO, stdio: 'inherit', env: {...process.env, ...env}});
    if (proc.status !== 0) throw new Error(`${label}: pnpm ${args.join(' ')} exited ${proc.status}`);
  };
  console.log(`\n==== ${label} round ${round} ====`);
  run(['miondevx', 'bench', 'prep']);
  run(['miondevx', 'bench', 'bench-one', 'mion'], {MION_VALIDATION_BENCH_BUN: '0'});
  copyFileSync(join(RESULTS, 'mion.json'), join(OUT, `${label}.${round}.json`));
}

function bench(labels, rounds) {
  if (git('status', '--porcelain')) throw new Error('bench-refs: the tree must be clean, it checks out other states');
  const all = states();
  const back = git('rev-parse', '--abbrev-ref', 'HEAD') === 'HEAD' ? git('rev-parse', 'HEAD') : git('rev-parse', '--abbrev-ref', 'HEAD');
  mkdirSync(OUT, {recursive: true});
  try {
    // Interleaved, so a slow stretch of the machine lands on every state instead of one.
    for (let round = 1; round <= rounds; round++) {
      for (const label of labels) {
        checkout(all[label]);
        try {
          runOne(label, round);
        } finally {
          git('reset', '-q', '--hard');
        }
      }
    }
  } finally {
    git('checkout', '-q', back);
  }
}

// Per case and path: median across the rounds saved for that state.
function load(label) {
  const files = [];
  for (let round = 1; existsSync(join(OUT, `${label}.${round}.json`)); round++) files.push(JSON.parse(readFileSync(join(OUT, `${label}.${round}.json`), 'utf8')));
  if (files.length === 0) return null;
  const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
  const cases = {};
  for (const entry of files[0].cases) {
    const rounds = files.map((file) => file.cases.find((other) => other.key === entry.key)).filter(Boolean);
    const merged = {};
    for (const metric of ['validate', 'validationErrors']) {
      const ok = rounds.every((one) => one[metric].status === 'ok');
      merged[metric] = {ok, ...Object.fromEntries(PATHS.map((path) => [path, ok ? median(rounds.map((one) => one[metric][path])) : 0]))};
    }
    cases[entry.key] = merged;
  }
  return {rounds: files.length, cases};
}

const PATHS = ['validOpsSec', 'invalidOpsSec', 'mixedOpsSec'];

function report(labels) {
  const base = load('base');
  if (!base) throw new Error('bench-refs: no base results, run without --report first');
  const others = labels.filter((label) => label !== 'base').map((label) => [label, load(label)]).filter(([, data]) => data);
  const groups = {};
  for (const [label, data] of others) {
    for (const [key, baseCase] of Object.entries(base.cases)) {
      const runCase = data.cases[key];
      if (!runCase || !baseCase.validate.ok || !baseCase.validationErrors.ok || !runCase.validate.ok || !runCase.validationErrors.ok) continue;
      for (const group of ['ALL', key.split('.')[0]]) {
        PATHS.forEach((path, index) => {
          const values = [baseCase.validate[path], runCase.validate[path], baseCase.validationErrors[path], runCase.validationErrors[path]];
          if (!values.every(Boolean)) return;
          (((groups[group] ??= {})[label] ??= [[], [], []])[index]).push(Math.log(values[3] / values[2] / (values[1] / values[0])));
        });
      }
    }
  }
  console.log(`\ngetErrors change vs base, drift removed (valid / invalid / mixed). base rounds: ${base.rounds}`);
  console.log('group'.padEnd(18) + others.map(([label, data]) => `${label} (x${data.rounds})`.padStart(24)).join(''));
  const geo = (logs) => (logs?.length ? Math.exp(logs.reduce((sum, value) => sum + value, 0) / logs.length).toFixed(2).padStart(7) : '      -');
  for (const group of Object.keys(groups).sort((a, b) => (a === 'ALL' ? -1 : b === 'ALL' ? 1 : a.localeCompare(b)))) {
    console.log(group.padEnd(18) + others.map(([label]) => (groups[group][label] ?? [[], [], []]).map(geo).join('').padStart(24)).join(''));
  }
}

const argv = process.argv.slice(2);
const opt = (name, fallback) => (argv.includes(`--${name}`) ? argv[argv.indexOf(`--${name}`) + 1] : fallback);
const labels = opt('states', 'base,spreadFree,shortcut,shortcutAllRoots,final').split(',');
if (!labels.includes('base')) labels.unshift('base');
if (argv.includes('--dry-run')) {
  const all = states();
  for (const label of labels) console.log(label.padEnd(18), all[label].ref, all[label].revert ? `minus ${all[label].revert}` : '');
} else {
  if (!argv.includes('--report')) bench(labels, Number(opt('rounds', 2)));
  report(labels);
}
