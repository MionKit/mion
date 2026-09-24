// branch-diff.mjs — the files a branch changed since it left its base, sorted into
// the packages they belong to, for `core test-pr`. Commits only: the working tree
// never counts, so a local run and the CI run give the same answer.
import {FEEDS_NOTHING, matches} from '../ci/lanes.mjs';
import {REPO_ROOT} from './env.mjs';
import {capture, die} from './proc.mjs';
import {packageOf} from './workspace-graph.mjs';

const git = (args, cwd) => {
  const result = capture('git', args, {cwd, maxBuffer: 256 * 1024 * 1024});
  if (result.status !== 0) die(`git ${args.join(' ')} failed: ${(result.stderr || result.error?.message || '').trim()}`);
  return result.stdout;
};

// {mergeBase, files}: every path touched between the merge-base and HEAD. --no-renames
// lists both ends of a move, so a file moved between packages marks both.
export function changedFiles(base, {cwd = REPO_ROOT} = {}) {
  const verified = capture('git', ['rev-parse', '--verify', '--quiet', `${base}^{commit}`], {cwd});
  if (verified.status !== 0) die(`unknown base '${base}' (fetch it first, e.g. \`git fetch origin main\`)`);
  const mergeBase = git(['merge-base', base, 'HEAD'], cwd).trim();
  const files = git(['diff', '--name-only', '--no-renames', '-z', mergeBase, 'HEAD'], cwd).split('\0').filter(Boolean);
  return {mergeBase, files};
}

// {packages, global, ignored}: package dirs with a changed file, paths that force the
// full suite (anything outside a workspace package), and paths that feed no test.
export function classifyPaths(files, packages) {
  const changed = new Set();
  const global = [];
  const ignored = [];
  for (const file of files) {
    const dir = packageOf(file, packages);
    if (dir) changed.add(dir);
    else if (matches(file, FEEDS_NOTHING)) ignored.push(file);
    else global.push(file);
  }
  return {packages: changed, global, ignored};
}
