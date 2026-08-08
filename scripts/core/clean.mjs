// clean.mjs — the repo's hard clean. Removes every generated tree in the working
// copy: package dists, the Go binary, bundler/tool caches (vite, vitest, nuxt,
// playwright), run artifacts (bench + docs data, logs, tarballs, resolver genDirs)
// and, last, every node_modules in the workspace.
//
// Replaces the old `pnpm -r run clean` fan-out, which only reached the two package
// dists. Everything it deletes is gitignored build output — nothing tracked, and
// never `.env` or the pnpm store (that one is global and shared with other repos;
// `pnpm store prune` is the separate, deliberate call).
//
//   node scripts/core/clean.mjs               # everything, node_modules included
//   node scripts/core/clean.mjs --keep-deps   # everything EXCEPT node_modules
//   node scripts/core/clean.mjs --dry-run     # list what would go, delete nothing
//
// Reinstalling afterwards is `pnpm run fresh-start` (this clean + a frozen install).

import {globSync, readdirSync, rmSync, statSync} from 'node:fs';
import {join, relative} from 'node:path';
import {REPO_ROOT} from '../lib/env.mjs';
import {die, dim, note, reportCliError, success} from '../lib/proc.mjs';

// Never descend into these when hunting for node_modules: vendored Go sources, an
// already-doomed build output, or a nested install (we delete the parent wholesale).
const NO_DESCEND = new Set(['.git', 'node_modules', 'third_party', '.output', 'dist']);
// Same idea for the glob patterns below — `exclude` keeps them out of the vendored
// tsgolint/typescript-go tree and out of installed dependencies.
const excludeVendored = (path) => path.includes('node_modules') || path.includes('third_party') || path.includes('_deps');

// Groups exist for the report only — a labelled list beats one wall of paths when
// you are checking whether a clean is about to eat something expensive.
const GROUPS = [
  {
    label: 'build output',
    patterns: [
      'bin', // the Go resolver binary + its cross-compiled twins
      'packages/*/dist',
      'packages/*/.dist',
      'packages/*/.coverage',
      'packages/**/*.tsbuildinfo',
      '.coverage',
      'coverage.txt',
      'ts-go-runtypes/**/*.test', // stray `go test -c` binaries
      'container/website/.output',
      'container/website/.nuxt',
      'container/website/.nitro',
      'container/website/.data',
      'container/website/.bench-deps',
      'container/website/public/playground-app',
      'container/website/app/playground/.vendor',
    ],
  },
  {
    label: 'caches',
    patterns: [
      '.cache', // host-built playground WASM (rebuilt by the playground script)
      'container/website/.cache',
      'container/website/.eslintcache',
      '**/*.timestamp-*.mjs', // vite config transform leftovers
      '.playwright-cli',
    ],
  },
  {
    label: 'run artifacts',
    patterns: [
      'dist-binaries',
      'tarballs',
      'runtypes-cache.json',
      'logs',
      '.docdata',
      'bench/results',
      'container/benchmarks/results',
      'container/benchmarks/__runtypes',
      'container/website/public/bench-data',
      'container/pre-publish-e2e/package-lock.json',
      'packages/**/__runtypes', // resolver genDirs written by the test suites
      'packages/ts-runtypes/test/suites/enrich/.tmp',
      'packages/ts-runtypes/test/tmp-build-*',
      'packages/ts-runtypes/test/json-schema-official/generated',
      'packages/ts-runtypes/test/json-schema-official/results.json',
    ],
  },
];

// The vite/vitest caches live INSIDE node_modules, so they only need their own
// entries when the install itself is being kept.
const DEP_CACHE_DIRS = ['.vite', '.vite-temp', '.vitest', '.cache'];

// Every node_modules in the workspace: root, the packages, the container-side
// projects (host-smoke, the benchmark competitors when someone installed them here).
function findNodeModules(dir, depth = 0) {
  if (depth > 6) return [];
  const found = [];
  for (const entry of readdirSync(dir, {withFileTypes: true})) {
    if (!entry.isDirectory()) continue; // readdir reports symlinks as their own kind, so links are skipped here
    if (entry.name === 'node_modules') {
      found.push(join(dir, entry.name));
      continue; // never descend into an install we are about to delete
    }
    if (NO_DESCEND.has(entry.name)) continue;
    found.push(...findNodeModules(join(dir, entry.name), depth + 1));
  }
  return found;
}

// Bytes on disk under a path (files only — directory entries themselves are noise).
function diskSize(path) {
  const stat = statSync(path, {throwIfNoEntry: false});
  if (!stat) return 0;
  if (!stat.isDirectory()) return stat.size;
  let total = 0;
  for (const entry of readdirSync(path, {withFileTypes: true, recursive: true})) {
    if (!entry.isFile()) continue;
    const file = statSync(join(entry.parentPath, entry.name), {throwIfNoEntry: false});
    if (file) total += file.size;
  }
  return total;
}

function formatSize(bytes) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${Math.round(bytes / 1024 ** 2)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

function resolveGroup(patterns) {
  const matches = patterns.flatMap((pattern) => globSync(pattern, {cwd: REPO_ROOT, exclude: excludeVendored}));
  return [...new Set(matches)].map((match) => join(REPO_ROOT, match)).sort();
}

export function main(argv = []) {
  const keepDeps = argv.includes('--keep-deps');
  const dryRun = argv.includes('--dry-run');
  const unknown = argv.find((arg) => !['--keep-deps', '--dry-run'].includes(arg));
  if (unknown) die(`core clean: unknown option '${unknown}'. Usage: clean.mjs [--keep-deps] [--dry-run]`, 2);

  const nodeModules = findNodeModules(REPO_ROOT);
  const groups = GROUPS.map((group) => ({label: group.label, paths: resolveGroup(group.patterns)}));
  if (keepDeps) {
    const depCaches = nodeModules.flatMap((dir) => DEP_CACHE_DIRS.map((name) => join(dir, name))).filter((path) => statSync(path, {throwIfNoEntry: false}));
    groups.find((group) => group.label === 'caches').paths.push(...depCaches.sort());
  } else {
    groups.push({label: 'dependencies', paths: nodeModules.sort()}); // last: everything above may live under one
  }

  let removed = 0;
  let freed = 0;
  for (const {label, paths} of groups) {
    if (!paths.length) continue;
    note(`${label} (${paths.length})`);
    for (const path of paths) {
      const size = diskSize(path);
      freed += size;
      removed += 1;
      console.log(dim(`   ${relative(REPO_ROOT, path)}  ${formatSize(size)}`));
      if (!dryRun) rmSync(path, {recursive: true, force: true});
    }
  }

  if (!removed) return success('clean: nothing to remove, working copy is already clean');
  const summary = `${removed} path${removed === 1 ? '' : 's'}, ${formatSize(freed)}`;
  if (dryRun) return note(`dry run: ${summary} would be removed`);
  success(`clean: removed ${summary}`);
  if (!keepDeps) note('run `pnpm install` (or `pnpm run fresh-start`) before building again');
}

if (import.meta.filename === process.argv[1]) {
  try {
    main(process.argv.slice(2));
  } catch (err) {
    reportCliError(err);
  }
}
