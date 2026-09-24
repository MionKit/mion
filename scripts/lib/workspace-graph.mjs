// For `core test-pr`. Edges count devDependencies (unlike publish-order.mjs, tests run on them), and relative
// paths tests use to reach a sibling package (`../../test-server/build/x.js`), which no manifest records.
import {existsSync, readFileSync, readdirSync} from 'node:fs';
import {dirname, join, sep} from 'node:path';
import {REPO_ROOT} from './env.mjs';
import {capture, die} from './proc.mjs';

const DEP_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];
const SCANNED = /\.(?:[mc]?[jt]s|json)$/;
const RELATIVE_STRING = /(['"`])(\.\.?\/[^'"`\n]*)\1/g;

// Manifest edges only.
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

export const packageOf = (repoPath, packages) => {
  const [top, dir] = repoPath.split('/');
  return top === 'packages' && packages.has(dir) ? dir : undefined;
};

// Pure (takes the text).
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

export const readWorkspaceGraph = (repoRoot = REPO_ROOT) => addPathEdges(readWorkspacePackages(repoRoot), repoRoot);

// Map<dir, via>: via is the dep that pulled the package in (null if changed); the visited map ends cycles.
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
