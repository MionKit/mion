// go-shard.mjs — one of N shards of the Go suite (`go test ./internal/... ./cmd/...`), so CI runs them on
// parallel runners. The slow packages run their tests one at a time, so each is split by test name; every other
// package goes to one shard whole. Together the shards run every package and every test exactly once.
//
// Usage (via `pnpm miondevx core go-shard`, or `node scripts/ci/go-shard.mjs`):
//   go-shard <i>/<n>          run shard i of n
//   go-shard <i>/<n> --list   print the shard's go test commands, run nothing
//   go-shard --check <n>      fail unless shards 1..n cover every package and listed test once
import {GO_ROOT} from '../lib/env.mjs';
import {capture, die, note, reportCliError, runAsync} from '../lib/proc.mjs';

const PATTERNS = ['./internal/...', './cmd/...'];
const MODULE = 'github.com/mionkit/mion/ts-go-runtypes';
// The packages whose tests run one at a time for minutes (resolver 261 s, convert 250 s, apitypes 133 s in CI).
export const HEAVY = [`${MODULE}/internal/compiler/resolver`, `${MODULE}/internal/convert`, `${MODULE}/internal/compiler/apitypes`];
// What `go test -run` selects: tests, examples and fuzz seed corpora. Benchmarks only run with -bench.
const RUNNABLE = /^(Test|Example|Fuzz)\w*$/;

function goOrDie(args) {
  const result = capture('go', args, {cwd: GO_ROOT, maxBuffer: 64 * 1024 * 1024});
  if (result.status !== 0) die(`go-shard: go ${args.join(' ')} failed:\n${result.stderr.trim() || result.error?.message}`);
  return result.stdout;
}

const listPackages = () => goOrDie(['list', ...PATTERNS]).split('\n').filter(Boolean).sort();
export const parseTestList = (stdout) => stdout.split('\n').filter((line) => RUNNABLE.test(line)).sort();
const listTests = (pkg) => parseTestList(goOrDie(['test', '-list', '.', pkg]));

// Pure: shard `index` (0-based) of `count`. Light packages round-robin by sorted path, heavy tests by sorted name.
export function planShard({packages, testsOf, index, count}) {
  const light = packages.filter((pkg) => !testsOf.has(pkg)).filter((_, at) => at % count === index);
  const heavy = [...testsOf].map(([pkg, tests]) => ({pkg, tests: tests.filter((_, at) => at % count === index)})).filter(({tests}) => tests.length > 0);
  return {light, heavy};
}

export const runPattern = (tests) => `^(${tests.join('|')})$`;

// The `go test` argument lists of one planned shard.
export function shardCommands({light, heavy}) {
  return [...heavy.map(({pkg, tests}) => ['test', pkg, '-run', runPattern(tests)]), ...(light.length > 0 ? [['test', ...light]] : [])];
}

// Pure: every package in exactly one shard (whole or as test parts), every test in exactly one shard.
export function coverageErrors({packages, testsOf, count}) {
  const errors = [];
  for (const pkg of HEAVY) if (!packages.includes(pkg)) errors.push(`${pkg} is listed as heavy but go list no longer has it`);
  const plans = Array.from({length: count}, (_, index) => planShard({packages, testsOf, index, count}));
  for (const pkg of packages) {
    const whole = plans.filter((plan) => plan.light.includes(pkg)).length;
    if (!testsOf.has(pkg) && whole !== 1) errors.push(`${pkg} runs in ${whole} shards, not 1`);
    if (testsOf.has(pkg) && whole !== 0) errors.push(`${pkg} is split by test yet also runs whole`);
  }
  for (const [pkg, tests] of testsOf) {
    for (const test of tests) {
      const runs = plans.filter((plan) => plan.heavy.some((part) => part.pkg === pkg && new RegExp(runPattern(part.tests)).test(test))).length;
      if (runs !== 1) errors.push(`${pkg} ${test} runs in ${runs} shards, not 1`);
    }
  }
  return errors;
}

function readSuite() {
  const packages = listPackages();
  const testsOf = new Map(HEAVY.filter((pkg) => packages.includes(pkg)).map((pkg) => [pkg, listTests(pkg)]));
  return {packages, testsOf};
}

function parseShard(arg) {
  const match = /^(\d+)\/(\d+)$/.exec(arg ?? '');
  if (!match || Number(match[1]) < 1 || Number(match[1]) > Number(match[2])) die('go-shard: expected <i>/<n> with 1 <= i <= n, e.g. 2/3', 2);
  return {index: Number(match[1]) - 1, count: Number(match[2])};
}

export async function main(args) {
  if (args[0] === '--check') {
    const count = Number(args[1]);
    if (!Number.isInteger(count) || count < 1) die('go-shard: --check needs a shard count, e.g. --check 3', 2);
    const errors = coverageErrors({...readSuite(), count});
    if (errors.length > 0) die(`go-shard: the ${count} shards do not cover the Go suite exactly once:\n  ${errors.join('\n  ')}`);
    return note(`go-shard: ${count} shards cover every package and test exactly once`);
  }
  const {index, count} = parseShard(args[0]);
  const commands = shardCommands(planShard({...readSuite(), index, count}));
  if (args.includes('--list')) {
    for (const command of commands) console.log(`go ${command.map((arg) => (arg.includes('|') ? `'${arg}'` : arg)).join(' ')}`);
    return;
  }
  note(`go-shard ${index + 1}/${count}: ${commands.length} go test run(s) in parallel`);
  const codes = await Promise.all(commands.map((command, at) => runAsync('go', command, {cwd: GO_ROOT, prefix: `${index + 1}.${at + 1}`})));
  if (codes.some((code) => code !== 0)) die(`go-shard ${index + 1}/${count}: a go test run failed (search the log for FAIL)`);
}

if (import.meta.main) {
  try {
    await main(process.argv.slice(2));
  } catch (err) {
    reportCliError(err);
  }
}
