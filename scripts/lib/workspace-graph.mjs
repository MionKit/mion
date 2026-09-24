// workspace-graph.mjs — which workspace packages depend on which, for `core test-pr`.
// Two edge sources: every workspace name in the four package.json dep fields
// (devDependencies included, unlike publish-order.mjs, since tests run on dev deps),
// and relative string paths that reach into a sibling package, which many tests use
// (`../../test-server/build/x.js`) and no manifest records.
import {existsSync, readFileSync, readdirSync} from 'node:fs';
import {dirname, join, sep} from 'node:path';
import {REPO_ROOT} from './env.mjs';
import {capture, die} from './proc.mjs';

const DEP_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];
const SCANNED = /\.(?:[mc]?[jt]s|json)$/;
const RELATIVE_STRING = /(['"`])(\.\.?\/[^'"`\n]*)\1/g;

// Map<dir, {dir, name, deps: Set<dir>}> over packages/*, manifest edges only.
export function readWorkspacePackages(repoRoot = REPO_ROOT) {
  const packagesDir = join(repoRoot, 'packages');
  const packages = new Map();
  for (const dir of readdirSync(packagesDir).sort()) {
    const manifestPath = join(packagesDir, dir, 'package.json');
    if (!existsSync(manifestPath)) continue;
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    packages.set(dir, {dir, name: manifest.name, manifest, deps: new Set()});
  }
  const dirByName = new Map([...packages.values()].map((pkg) => [pkg.name, pkg.dir]));
  for (const pkg of packages.values()) {
    for (const field of DEP_FIELDS) {
      for (const depName of Object.keys(pkg.manifest[field] ?? {})) {
        const depDir = dirByName.get(depName);
        if (depDir && depDir !== pkg.dir) pkg.deps.add(depDir);
      }
    }
    delete pkg.manifest;
  }
  return packages;
}

// The workspace package dir a repo-relative path sits in, or undefined.
export const packageOf = (repoPath, packages) => {
  const [top, dir] = repoPath.split('/');
  return top === 'packages' && packages.has(dir) ? dir : undefined;
};

// Sibling packages one file's relative string literals point into. Pure (takes the text).
export function pathTargets(repoPath, text, packages) {
  const self = packageOf(repoPath, packages);
  const targets = new Set();
  for (const [, , literal] of text.matchAll(RELATIVE_STRING)) {
    const resolved = join(dirname(repoPath), literal).split(sep).join('/');
    const target = packageOf(resolved, packages);
    if (target && target !== self) targets.add(target);
  }
  return targets;
}

// Adds the relative-path edges, reading every tracked source/config file of each package.
export function addPathEdges(packages, repoRoot = REPO_ROOT) {
  const listed = capture('git', ['ls-files', '-z', '--', 'packages/'], {cwd: repoRoot, maxBuffer: 256 * 1024 * 1024});
  if (listed.status !== 0) die(`git ls-files failed: ${listed.stderr.trim()}`);
  for (const repoPath of listed.stdout.split('\0')) {
    if (!SCANNED.test(repoPath)) continue;
    const self = packageOf(repoPath, packages);
    if (!self) continue;
    const absolute = join(repoRoot, repoPath);
    if (!existsSync(absolute)) continue;
    for (const target of pathTargets(repoPath, readFileSync(absolute, 'utf8'), packages)) packages.get(self).deps.add(target);
  }
  return packages;
}

// The full graph: manifest edges plus relative-path edges.
export const readWorkspaceGraph = (repoRoot = REPO_ROOT) => addPathEdges(readWorkspacePackages(repoRoot), repoRoot);

// Map<dir, via>: the changed packages (via = null) plus every package that depends on
// one, where via is the dependency that pulled it in. The visited map ends cycles.
export function affectedClosure(changedDirs, packages) {
  const dependents = new Map([...packages.keys()].map((dir) => [dir, []]));
  for (const pkg of packages.values()) for (const dep of pkg.deps) dependents.get(dep)?.push(pkg.dir);
  const affected = new Map();
  const queue = [];
  for (const dir of changedDirs) {
    if (!packages.has(dir) || affected.has(dir)) continue;
    affected.set(dir, null);
    queue.push(dir);
  }
  while (queue.length > 0) {
    const dir = queue.shift();
    for (const dependent of dependents.get(dir)) {
      if (affected.has(dependent)) continue;
      affected.set(dependent, dir);
      queue.push(dependent);
    }
  }
  return affected;
}
