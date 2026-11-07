// One of N shards of the Go suite, each on its own CI runner. The slow packages run their tests one at a time, so they
// split by test name; every other package goes to one shard whole. Every package and test runs exactly once.
import {GO_ROOT} from '../lib/env.mjs';
import {capture, die, note, reportCliError, runAsync} from '../lib/proc.mjs';

const PATTERNS = ['./internal/...', './cmd/...'];
const MODULE = 'github.com/mionkit/mion/ts-go-runtypes';
// The packages whose tests run one at a time for minutes (resolver 261 s, convert 250 s, apitypes 133 s in CI).
export const HEAVY = [`${MODULE}/internal/compiler/resolver`, `${MODULE}/internal/convert`, `${MODULE}/internal/compiler/apitypes`];
// What `go test -run` selects: tests, examples and fuzz seed corpora. Benchmarks only run with -bench.
const RUNNABLE = /^(Test|Example|Fuzz)\w*$/;
// The line `go test -list` ends each package's names with.
const PACKAGE_DONE = /^ok\s+(\S+)/;

function goOrDie(args) {
  const result = capture('go', args, {cwd: GO_ROOT, maxBuffer: 64 * 1024 * 1024});
  if (result.status !== 0) die(`go-shard: go ${args.join(' ')} failed:\n${result.stderr.trim() || result.error?.message}`);
  return result.stdout;
}

// Pure: `go test -list . <pkgs…>` output to each package's sorted names; one call builds the test binaries in parallel.
export function parseTestLists(stdout) {
  const testsOf = new Map();
  let names = [];
  for (const line of stdout.split('\n')) {
    const done = PACKAGE_DONE.exec(line);
    if (done) {
      testsOf.set(done[1], names.sort());
      names = [];
    } else if (RUNNABLE.test(line)) names.push(line);
  }
  return testsOf;
}

// Pure: a heavy package go list no longer has would otherwise run whole, unsplit, without a word.
export function staleHeavy(packages) {
  return HEAVY.filter((pkg) => !packages.includes(pkg));
}

// Pure: shard `index` (0-based) of `count`. Light packages round-robin by sorted path, heavy tests by sorted name.
export function planShard({packages, testsOf, index, count}) {
  const light = packages.filter((pkg) => !testsOf.has(pkg)).filter((_, at) => at % count === index);
  const heavy = [...testsOf].map(([pkg, tests]) => ({pkg, tests: tests.filter((_, at) => at % count === index)})).filter(({tests}) => tests.length > 0);
  return {light, heavy};
}

export const runPattern = (tests) => `^(${tests.join('|')})$`;

export function shardCommands({light, heavy}) {
  return [...heavy.map(({pkg, tests}) => ['test', pkg, '-run', runPattern(tests)]), ...(light.length > 0 ? [['test', ...light]] : [])];
}

function readSuite() {
  const packages = goOrDie(['list', ...PATTERNS]).split('\n').filter(Boolean).sort();
  const stale = staleHeavy(packages);
  if (stale.length > 0) die(`go-shard: HEAVY names packages go list no longer has: ${stale.join(', ')}`);
  return {packages, testsOf: parseTestLists(goOrDie(['test', '-list', '.', ...HEAVY]))};
}

// Pure: the <i>/<n> argument, wherever it sits among the flags.
export function parseShard(args) {
  const match = /^(\d+)\/(\d+)$/.exec(args.find((arg) => !arg.startsWith('--')) ?? '');
  if (!match || Number(match[1]) < 1 || Number(match[1]) > Number(match[2])) die('go-shard: expected <i>/<n> with 1 <= i <= n, e.g. 2/3', 2);
  return {index: Number(match[1]) - 1, count: Number(match[2])};
}

// `run` is runAsync, or a stand-in in tests.
export async function runShard(commands, label, run = (command, at) => runAsync('go', command, {cwd: GO_ROOT, prefix: `${label}.${at + 1}`})) {
  note(`go-shard ${label}: ${commands.length} go test run(s) in parallel`);
  const codes = await Promise.all(commands.map(run));
  if (codes.some((code) => code !== 0)) die(`go-shard ${label}: a go test run failed (search the log for FAIL)`);
}

export async function main(args) {
  const unknown = args.filter((arg) => arg.startsWith('--') && arg !== '--list');
  if (unknown.length > 0) die(`go-shard: unknown flag ${unknown.join(' ')}`, 2);
  const {index, count} = parseShard(args);
  const commands = shardCommands(planShard({...readSuite(), index, count}));
  if (args.includes('--list')) {
    for (const command of commands) console.log(`go ${command.map((arg) => (arg.startsWith('^') ? `'${arg}'` : arg)).join(' ')}`);
    return;
  }
  await runShard(commands, `${index + 1}/${count}`);
}

if (import.meta.main) {
  try {
    await main(process.argv.slice(2));
  } catch (err) {
    reportCliError(err);
  }
}
