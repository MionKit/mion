// lanes.mjs — which CI lanes a commit needs, and whether that exact content
// already went green.
//
// THE PROBLEM this solves: every workflow used to decide by DIFF. ci.yml diffed
// the whole pull request against main (dorny/paths-filter's default on a
// `pull_request` event), so one touched file under packages/ pinned `pkg=true`
// for the life of the branch and a later docs-only commit re-ran ~33 runner
// minutes. pr-heavy.yml and drizzle-e2e.yml had no path gate at all: a label put
// their lanes on every commit forever.
//
// THE ANSWER is content, not diff. Each lane declares the paths that feed it; a
// lane's hash is the git object ids of exactly those paths in the tree being
// tested. A lane that passes saves a cache marker under its hash, so a later run
// whose hash matches KNOWS that content already passed and skips. On a pull
// request the tree is the MERGE ref, so the hash covers main too: main moving
// changes it and the lane re-runs, which a "diff since the last green sha" rule
// would have missed.
//
// It is fail-safe in every direction: a cache miss runs the lane, an unclassified
// path runs every lane, and only a job that actually succeeded ever writes a
// marker.
//
// Usage (via `pnpm miondevx core lanes`, or `node scripts/ci/lanes.mjs …`):
//   lanes                             print the lane table with each lane's hash
//   lanes --decide <lane…>            decide those lanes, print the JSON verdict
//   lanes --candidates <lane…> [--pr] print the marker keys that could prove those lanes
//   lanes --green-keys <file>         the marker keys already recorded green
//   lanes --github                    also write `lanes=<json>` to $GITHUB_OUTPUT
//                                     and a table to $GITHUB_STEP_SUMMARY
//   lanes --ref <ref>                 hash that tree instead of HEAD
import {createHash} from 'node:crypto';
import {appendFileSync, readFileSync} from 'node:fs';
import {REPO_ROOT} from '../lib/env.mjs';
import {isGoInput} from '../lib/go-inputs.mjs';
import {capture, die, note, noteErr, reportCliError} from '../lib/proc.mjs';

// Paths that feed NO lane: read by people and agents, never by a build, a test or
// a container. Adding a path here is the ONE way to buy a lane skip, so it has to
// stay provable, and it only became provable for these once the three whole-tree
// hygiene sweeps moved to scripts/ci/check-tree.mjs. Those sweeps DO read every
// tracked file, so while they lived in the js-lint suite, ignoring .claude/ or a
// root doc here would have let an offending edit through unchecked. They now run
// in the always-on gate job instead, ungated by anything.
export const FEEDS_NOTHING = ['docs/', 'tools/', 'assets/', '.claude/', '.vscode/', '.husky/', '.git-blame-ignore-revs', 'CHANGELOG.md', 'CLAUDE.md', 'README.md', 'SETUP.md', 'LICENSE'];

// A lane that only RUNS the Go binaries skips what never compiles into them, and the cmd/gen-* codegen tools.
const GO_BUILD = {prefix: 'ts-go-runtypes/', keep: (path) => isGoInput(path) && !path.startsWith('ts-go-runtypes/cmd/gen-')};

// Every lane hashes these: the Go binaries are the engine every lane runs (a submodule bump moves every hash).
// Repo-wide config changes rarely enough that the over-run costs nothing.
const REPO_CONFIG = ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'tsconfig.json', '.npmrc', '.editorconfig', '.prettierrc', '.prettierignore', '.gitignore', '.gitmodules', 'cliff.toml', 'commitlint.config.js', '.github/actions/'];
const WORKSPACE = [GO_BUILD, ...REPO_CONFIG];
const GO_TREE = ['ts-go-runtypes/', ...REPO_CONFIG];

// The JS half of the repo. `container/` belongs here, not only to the container
// lanes: check-code-imports reads every <code-import> in the docs content tree and
// the contract tests walk that tree plus the benchmark competitor maps and the
// workflow files. The old path filter listed none of them, so a content-only pull
// request skipped js-lint and the code-import gate never ran on the very commit
// that could break it.
const JS = ['packages/', 'scripts/', 'container/', 'vitest.config.ts', 'version.json', 'drizzle-dialects.json', 'drizzle-suites.pin.json', '.env.sample', '.oxlintrc.json', '.oxfmtrc.json', 'eslint.config.js', '.github/workflows/', ...WORKSPACE];
// What a lane that packs and installs the workspace reads. No container/ (those
// lanes name their own image dir) and no workflow files.
const PACKED = ['packages/', 'scripts/', 'version.json', ...WORKSPACE];

// Lane -> the paths whose CONTENT decides it. A lane hashes these and nothing
// else, so a file outside every entry cannot make it re-run.
//
// A lane is owned by exactly ONE piece of work, because that work is what proves
// it and saves its marker. `go` and `js-fuzz` therefore split the two halves of
// the go-fuzz job: the Go suite and the JS fuzz sweep run on the same runner but
// answer to different inputs, and neither may claim the other's marker.
export const LANES = {
  // ci.yml
  // The packages are a Go input in the other direction: the suites mount the REAL
  // marker and drizzle packages as virtual node_modules (internal/testfixtures/
  // realmarker.go and realdrizzle.go), so editing their sources changes what the
  // Go tests compile against.
  go: {job: 'go tests + fuzz · the Go suite', paths: ['packages/run-types/', 'packages/drizzle-orm', ...GO_TREE]},
  'js-fuzz': {job: 'go tests + fuzz · the JS fuzz sweep', paths: JS},
  // JS checks that need Go (codegen and drizzle-manifest drift, build-gate tests), so js-lint never sets Go up.
  'go-tools': {job: 'go tests + fuzz · the Go-backed JS checks', paths: [...JS, 'ts-go-runtypes/']},
  js: {job: 'js tests + lint', paths: JS},
  // Both halves build with our packages and Go (the site, and the mion competitor), so only
  // a site-only or a benchmarks-only edit re-runs one half alone.
  smoke: {
    job: 'container smoke',
    paths: ['container/website/', 'container/benchmarks/', ...PACKED],
    items: {
      website: {paths: ['container/website/', 'packages/', 'version.json', GO_BUILD]},
      bench: {paths: ['container/benchmarks/', 'packages/', 'version.json', GO_BUILD]},
    },
  },
  // pr-heavy.yml
  website: {job: 'build the docs site', paths: ['container/website/', ...PACKED]},
  // One item per competitor: only mion's runs our packages and the binary, so a package change re-runs only mion.
  bench: {
    job: 'validation benchmarks',
    paths: ['container/benchmarks/', ...PACKED],
    items: {
      mion: {paths: ['container/benchmarks/competitors/mion/', 'container/benchmarks/_deps/competitors/mion/', 'packages/', 'version.json', GO_BUILD]},
      ...Object.fromEntries(['zod', 'typebox', 'ajv', 'typia'].map((name) => [name, {paths: [`container/benchmarks/competitors/${name}/`, `container/benchmarks/_deps/competitors/${name}/`]}])),
    },
  },
  // Items match `release e2e`'s --no-matrix / --no-mion / --no-host-smoke; each installs every packed package.
  e2e: {
    job: 'pre-publish e2e',
    paths: ['container/pre-publish-e2e/', '.github/verdaccio.yaml', ...PACKED],
    items: {
      matrix: {paths: ['container/pre-publish-e2e/apps/', 'container/pre-publish-e2e/build-all.mjs', 'container/pre-publish-e2e/lint-all.mjs', 'container/pre-publish-e2e/test/', 'container/pre-publish-e2e/pure-fns/', 'container/pre-publish-e2e/_deps/']},
      mion: {paths: ['container/pre-publish-e2e/mion-consumer/', 'container/pre-publish-e2e/mion-bun/', 'container/pre-publish-e2e/_deps-mion/']},
      'host-smoke': {paths: ['container/pre-publish-e2e/host-smoke/']},
    },
  },
  // drizzle-e2e.yml
  // d1 and durable are Cloudflare drivers over sqlite, so they share its package.
  drizzle: {
    job: 'drizzle suites against real databases',
    paths: ['packages/drizzle-orm', 'packages/run-types/', 'packages/devtools/', 'packages/core/', 'packages/bin-compiler/', 'container/drizzle-e2e/', 'scripts/', 'drizzle-dialects.json', 'drizzle-suites.pin.json', ...WORKSPACE],
    items: {
      pg: {paths: ['packages/drizzle-orm-pg-core/', 'container/drizzle-e2e/pg/', 'container/drizzle-e2e/shared/runners/pg.', 'container/drizzle-e2e/shared/addendum/pg.', 'container/drizzle-e2e/shared/stubs/pg/']},
      mysql: {paths: ['packages/drizzle-orm-mysql-core/', 'container/drizzle-e2e/mysql/', 'container/drizzle-e2e/shared/runners/mysql.', 'container/drizzle-e2e/shared/addendum/mysql.']},
      sqlite: {paths: ['packages/drizzle-orm-sqlite-core/', 'container/drizzle-e2e/sqlite/', 'container/drizzle-e2e/shared/runners/sqlite.', 'container/drizzle-e2e/shared/addendum/sqlite.']},
      d1: {paths: ['packages/drizzle-orm-sqlite-core/', 'container/drizzle-e2e/cloudflare/', 'container/drizzle-e2e/shared/runners/d1.']},
      durable: {paths: ['packages/drizzle-orm-sqlite-core/', 'container/drizzle-e2e/cloudflare/', 'container/drizzle-e2e/shared/runners/durable-']},
    },
  },
};

// A bare name is a prefix on purpose: 'packages/drizzle-orm' also picks up the dialect packages.
const entryMatches = (path, entry) => (typeof entry === 'string' ? path.startsWith(entry) : path.startsWith(entry.prefix) && entry.keep(path));
export const matches = (path, entries) => entries.some((entry) => entryMatches(path, entry));

// A tracked path that matches no lane and no FEEDS_NOTHING entry is an unknown
// risk: it joins EVERY lane's hash, so adding a directory re-runs everything
// until someone classifies it. Never a free skip.
export const unclassified = (paths) => paths.filter((path) => !matches(path, FEEDS_NOTHING) && !Object.values(LANES).some((lane) => matches(path, lane.paths)));

// One `git ls-tree` over the whole tree, partitioned per lane. Hashing the OBJECT
// IDS (not the bytes) keeps it to a single git call on any repo size.
export function laneHashes(ref = 'HEAD', {cwd = REPO_ROOT} = {}) {
  const listed = capture('git', ['ls-tree', '-r', ref, '--format=%(objectname) %(path)'], {cwd});
  if (listed.status !== 0) die(`git ls-tree ${ref} failed: ${listed.stderr.trim() || listed.error?.message}`);
  const entries = listed.stdout
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const at = line.indexOf(' ');
      return {objectname: line.slice(0, at), path: line.slice(at + 1)};
    });
  const unknown = unclassified(entries.map((entry) => entry.path));
  const unknownSet = new Set(unknown);
  const hashes = {};
  const hashOf = (feeds) => {
    const digest = createHash('sha256');
    for (const entry of entries) {
      if (feeds(entry.path) || unknownSet.has(entry.path)) digest.update(`${entry.objectname} ${entry.path}\n`);
    }
    return digest.digest('hex').slice(0, 32);
  };
  for (const [name, lane] of Object.entries(LANES)) {
    hashes[name] = hashOf((path) => matches(path, lane.paths));
    for (const item of Object.keys(lane.items ?? {})) hashes[itemName(name, item)] = hashOf((path) => itemFeeds(lane, item, path));
  }
  return {hashes, unknown};
}

// An item is one independently provable piece of a lane (a database, a competitor); its own edits re-run only it.
const itemName = (lane, item) => `${lane}.${item}`;
export function itemFeeds(lane, item, path) {
  if (!matches(path, lane.paths)) return false;
  if (matches(path, lane.items[item].paths)) return true;
  return !Object.entries(lane.items).some(([other, spec]) => other !== item && matches(path, spec.paths));
}

// The cache key a lane's job writes once it passes, and the same key this reads
// back to decide. Nothing is ever stored UNDER it: the key existing IS the claim
// that this content passed, which is why a marker proven on another branch counts.
export const greenKey = (lane, hash) => `mion-lane-green-${lane}-${hash}`;

// Narrower markers only a pull request accepts: `core test-pr` saves js-pr for its partial run.
// A push to main never accepts them, so main still runs the full suite once after the merge.
export const PR_PROOF = {js: 'js-pr'};

// The keys `decide` reads, so the caller can look each up exactly instead of listing every cache.
export function candidateKeys(wanted, {hashes, pr = false}) {
  return wanted.flatMap((name) => {
    if (!hashes[name]) die(`no such lane: ${name} (known lanes: ${Object.keys(LANES).join(', ')})`);
    const keys = [greenKey(name, hashes[name])];
    if (pr && PR_PROOF[name] !== undefined) keys.push(greenKey(PR_PROOF[name], hashes[name]));
    for (const item of Object.keys(LANES[name].items ?? {})) keys.push(greenKey(itemName(name, item), hashes[itemName(name, item)]));
    return keys;
  });
}

// Decide the asked-for lanes. Every unknown resolves to RUN: an unreadable or
// empty key list (a fork pull request has no token) skips nothing.
export function decide(wanted, {hashes, greenKeys = [], pr = false}) {
  const green = new Set(greenKeys);
  const provenGreen = (name) => green.has(greenKey(name, hashes[name])) || (pr && PR_PROOF[name] !== undefined && green.has(greenKey(PR_PROOF[name], hashes[name])));
  const lanes = {};
  for (const name of wanted) {
    const hash = hashes[name];
    if (!hash) die(`no such lane: ${name} (known lanes: ${Object.keys(LANES).join(', ')})`);
    const laneGreen = provenGreen(name);
    const itemNames = Object.keys(LANES[name].items ?? {});
    if (itemNames.length === 0) {
      lanes[name] = {run: !laneGreen, hash, reason: laneGreen ? 'these exact inputs already passed' : 'inputs not proven green yet'};
      continue;
    }
    // A lane marker covers every item; otherwise each item answers for itself.
    const items = Object.fromEntries(itemNames.map((item) => [item, {run: !laneGreen && !provenGreen(itemName(name, item)), hash: hashes[itemName(name, item)]}]));
    const runItems = itemNames.filter((item) => items[item].run);
    const run = runItems.length > 0;
    const reason = !run ? 'these exact inputs already passed' : `not proven green yet: ${runItems.join(', ')}`;
    lanes[name] = {run, hash, reason, items, runItems};
  }
  return lanes;
}

const flagValues = (args, flag) => {
  const at = args.indexOf(flag);
  if (at === -1) return [];
  const rest = args.slice(at + 1);
  const end = rest.findIndex((arg) => arg.startsWith('--'));
  return end === -1 ? rest : rest.slice(0, end);
};

export function main(args) {
  const ref = flagValues(args, '--ref')[0] ?? 'HEAD';
  const {hashes, unknown} = laneHashes(ref);
  // stderr: --candidates prints keys on stdout for a shell loop to read.
  if (unknown.length > 0) noteErr(`${unknown.length} path(s) match no lane, so every lane hashes them: ${unknown.slice(0, 5).join(', ')}${unknown.length > 5 ? ' …' : ''}`);

  const candidates = flagValues(args, '--candidates');
  if (candidates.length > 0) {
    for (const key of candidateKeys(candidates, {hashes, pr: args.includes('--pr')})) console.log(key);
    return;
  }

  const wanted = flagValues(args, '--decide');
  if (wanted.length === 0) {
    note(`lane inputs at ${ref}:`);
    for (const [name, lane] of Object.entries(LANES)) {
      console.log(`  ${name.padEnd(16)} ${hashes[name]}  ${lane.job}`);
      for (const item of Object.keys(lane.items ?? {})) console.log(`  ${itemName(name, item).padEnd(16)} ${hashes[itemName(name, item)]}`);
    }
    return;
  }

  const keyFile = flagValues(args, '--green-keys')[0];
  let greenKeys = [];
  try {
    if (keyFile) greenKeys = readFileSync(keyFile, 'utf8').split('\n').filter(Boolean);
  } catch {
    note(`could not read ${keyFile}, so every lane runs`);
  }
  const lanes = decide(wanted, {hashes, greenKeys, pr: args.includes('--pr')});
  for (const [name, lane] of Object.entries(lanes)) note(`${name.padEnd(16)} ${lane.run ? 'RUN ' : 'skip'}  ${lane.reason}`);
  if (!args.includes('--github')) return console.log(JSON.stringify(lanes, null, 2));

  appendFileSync(process.env.GITHUB_OUTPUT, `lanes=${JSON.stringify(lanes)}\n`);
  const rows = Object.entries(lanes).flatMap(([name, lane]) => [
    `| ${name} | ${lane.run ? '**run**' : 'skip'} | ${lane.reason} | \`${lane.hash}\` |`,
    ...Object.entries(lane.items ?? {}).map(([item, verdict]) => `| ${itemName(name, item)} | ${verdict.run ? '**run**' : 'skip'} | | \`${verdict.hash}\` |`),
  ]);
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, ['### CI lanes', '', '| lane | | why | inputs |', '| --- | --- | --- | --- |', ...rows, ''].join('\n'));
}

if (import.meta.main) {
  try {
    main(process.argv.slice(2));
  } catch (err) {
    reportCliError(err);
  }
}
