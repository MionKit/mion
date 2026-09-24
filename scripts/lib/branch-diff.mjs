// For `core test-pr`. Commits only: the working tree never counts, so a local run and CI agree.
import {FEEDS_NOTHING, matches} from '../ci/lanes.mjs';
import {REPO_ROOT} from './env.mjs';
import {capture, die} from './proc.mjs';
import {packageOf} from './workspace-graph.mjs';

const git = (args, cwd) => {
  const result = capture('git', args, {cwd, maxBuffer: 256 * 1024 * 1024});
  if (result.status !== 0) die(`git ${args.join(' ')} failed: ${(result.stderr || result.error?.message || '').trim()}`);
  return result.stdout;
};

// --no-renames lists both ends of a move, so a file moved between packages marks both.
export function changedFiles(base, {cwd = REPO_ROOT} = {}) {
  const verified = capture('git', ['rev-parse', '--verify', '--quiet', `${base}^{commit}`], {cwd});
  if (verified.status !== 0) die(`unknown base '${base}' (fetch it first, e.g. \`git fetch origin main\`)`);
  const mergeBase = git(['merge-base', base, 'HEAD'], cwd).trim();
  const files = git(['diff', '--name-only', '--no-renames', '-z', mergeBase, 'HEAD'], cwd).split('\0').filter(Boolean);
  return {mergeBase, files};
}

// `global` paths sit outside every workspace package and force the full suite.
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
