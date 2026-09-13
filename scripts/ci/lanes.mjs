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
//   lanes --green-keys <file>         the marker keys already recorded green
//   lanes --github                    also write `lanes=<json>` to $GITHUB_OUTPUT
//                                     and a table to $GITHUB_STEP_SUMMARY
//   lanes --ref <ref>                 hash that tree instead of HEAD
import {createHash} from 'node:crypto';
import {appendFileSync, readFileSync} from 'node:fs';
import {REPO_ROOT} from '../lib/env.mjs';
import {capture, die, note, reportCliError} from '../lib/proc.mjs';

// Paths that feed NO lane: read by people and agents, never by a build, a test or
// a container. Adding a path here is the ONE way to buy a lane skip, so it has to
// stay provable, and it only became provable for these once the three whole-tree
// hygiene sweeps moved to scripts/ci/check-tree.mjs. Those sweeps DO read every
// tracked file, so while they lived in the js-lint suite, ignoring .claude/ or a
// root doc here would have let an offending edit through unchecked. They now run
// in the always-on gate job instead, ungated by anything.
export const FEEDS_NOTHING = ['docs/', 'assets/', '.claude/', '.vscode/', '.husky/', '.git-blame-ignore-revs', 'CHANGELOG.md', 'CLAUDE.md', 'README.md', 'SETUP.md', 'LICENSE'];

// Inputs EVERY lane hashes: the Go resolver, the lockfile, the workspace layout,
// the repo-wide tool config and the toolchain the bootstrap action pins.
//
// ts-go-runtypes/ is here rather than on the `go` lane alone because the binary
// built from it is the engine every other lane runs on: the plugin tests spawn it,
// and the container lanes mount it. Its third_party/ submodule rides along as a
// single gitlink entry, so a submodule bump moves every hash, which is right.
// Repo-wide config is here for the same reason, and changes rarely enough that the
// over-run costs nothing.
const WORKSPACE = ['ts-go-runtypes/', 'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'tsconfig.json', '.npmrc', '.editorconfig', '.prettierrc', '.prettierignore', '.gitignore', '.gitmodules', 'cliff.toml', 'commitlint.config.js', '.github/actions/'];

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
  go: {job: 'go tests + fuzz · the Go suite', paths: ['packages/run-types/', 'packages/drizzle-orm', ...WORKSPACE]},
  'js-fuzz': {job: 'go tests + fuzz · the JS fuzz sweep', paths: JS},
  js: {job: 'js tests + lint', paths: JS},
  smoke: {job: 'container smoke', paths: ['container/website/', 'container/benchmarks/', ...PACKED]},
  // pr-heavy.yml
  website: {job: 'build the docs site', paths: ['container/website/', ...PACKED]},
  bench: {job: 'validation benchmarks', paths: ['container/benchmarks/', ...PACKED]},
  e2e: {job: 'pre-publish e2e', paths: ['container/pre-publish-e2e/', '.github/verdaccio.yaml', ...PACKED]},
  // drizzle-e2e.yml
  drizzle: {job: 'drizzle suites against real databases', paths: ['packages/drizzle-orm', 'packages/run-types/', 'packages/devtools/', 'packages/core/', 'packages/bin-compiler/', 'container/drizzle-e2e/', 'scripts/', 'drizzle-dialects.json', 'drizzle-suites.pin.json', ...WORKSPACE]},
};

// Prefix match, so a trailing slash means a directory and a bare name means that
// file. A bare name is a prefix on purpose: 'packages/drizzle-orm' picks up the
// four sibling dialect packages without naming each one.
const matches = (path, prefixes) => prefixes.some((prefix) => path.startsWith(prefix));

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
  for (const [name, lane] of Object.entries(LANES)) {
    const digest = createHash('sha256');
    for (const entry of entries) {
      if (matches(entry.path, lane.paths) || unknownSet.has(entry.path)) digest.update(`${entry.objectname} ${entry.path}\n`);
    }
    hashes[name] = digest.digest('hex').slice(0, 32);
  }
  return {hashes, unknown};
}

// The cache key a lane's job writes once it passes, and the same key this reads
// back to decide. Nothing is ever stored UNDER it: the key existing IS the claim
// that this content passed, which is why a marker proven on another branch counts.
export const greenKey = (lane, hash) => `mion-lane-green-${lane}-${hash}`;

// Decide the asked-for lanes. Every unknown resolves to RUN: an unreadable or
// empty key list (a fork pull request has no token) skips nothing.
export function decide(wanted, {hashes, greenKeys = []}) {
  const green = new Set(greenKeys);
  const lanes = {};
  for (const name of wanted) {
    const hash = hashes[name];
    if (!hash) die(`no such lane: ${name} (known lanes: ${Object.keys(LANES).join(', ')})`);
    const run = !green.has(greenKey(name, hash));
    lanes[name] = {run, hash, reason: run ? 'inputs not proven green yet' : 'these exact inputs already passed'};
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
  if (unknown.length > 0) note(`${unknown.length} path(s) match no lane, so every lane hashes them: ${unknown.slice(0, 5).join(', ')}${unknown.length > 5 ? ' …' : ''}`);

  const wanted = flagValues(args, '--decide');
  if (wanted.length === 0) {
    note(`lane inputs at ${ref}:`);
    for (const [name, lane] of Object.entries(LANES)) console.log(`  ${name.padEnd(9)} ${hashes[name]}  ${lane.job}`);
    return;
  }

  const keyFile = flagValues(args, '--green-keys')[0];
  let greenKeys = [];
  try {
    if (keyFile) greenKeys = readFileSync(keyFile, 'utf8').split('\n').filter(Boolean);
  } catch {
    note(`could not read ${keyFile}, so every lane runs`);
  }
  const lanes = decide(wanted, {hashes, greenKeys});
  for (const [name, lane] of Object.entries(lanes)) note(`${name.padEnd(9)} ${lane.run ? 'RUN ' : 'skip'}  ${lane.reason}`);
  if (!args.includes('--github')) return console.log(JSON.stringify(lanes, null, 2));

  appendFileSync(process.env.GITHUB_OUTPUT, `lanes=${JSON.stringify(lanes)}\n`);
  const rows = Object.entries(lanes).map(([name, lane]) => `| ${name} | ${lane.run ? '**run**' : 'skip'} | ${lane.reason} | \`${lane.hash}\` |`);
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, ['### CI lanes', '', '| lane | | why | inputs |', '| --- | --- | --- | --- |', ...rows, ''].join('\n'));
}

if (import.meta.main) {
  try {
    main(process.argv.slice(2));
  } catch (err) {
    reportCliError(err);
  }
}
