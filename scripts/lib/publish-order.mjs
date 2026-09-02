// publish-order.mjs — the ONE leaves-first publish order for the @mionjs/*
// release train, derived from the workspace instead of hand-ranked.
//
// npm publishes (and `npm stage approve` promotes) one package at a time, so a
// consumer installing mid-release can resolve a package whose dependency is not
// live yet. Publishing leaves first closes that window: a package goes out only
// after everything it depends on. The order is a dependency depth — 0 for a
// package with no @mionjs/* dependency, otherwise one more than the deepest
// dependency — read from every packages/*/package.json (dependencies,
// peerDependencies and optionalDependencies alike). Two families never appear in
// the workspace as dependencies because build-binaries.mjs / build-uws-binaries.mjs
// fill them in at staging time: the per-platform payloads
// (@mionjs/binary-<os>-<arch>, @mionjs/uws-<os>-<arch>) are depth 0 and their
// hosts (@mionjs/bin, @mionjs/uws) sit one above them.
//
// Zero-dep on purpose: publish.yml runs the release scripts pnpm-free.

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PACKAGES_DIR = path.join(REPO_ROOT, 'packages');
const SCOPE = '@mionjs/';

// The staging-time payload packages and the workspace package that hosts them.
const PAYLOAD_PATTERN = /^@mionjs\/(binary|uws)-[a-z0-9]+-[a-z0-9]+$/;
const PAYLOAD_HOSTS = {'@mionjs/bin': '@mionjs/binary-<os>-<arch>', '@mionjs/uws': '@mionjs/uws-<os>-<arch>'};

export const isPayloadPackage = (name) => PAYLOAD_PATTERN.test(name);

// Every workspace package.json, keyed by name: {name, version, private,
// versionLine, deps} where deps holds only the @mionjs/* names it depends on.
export function readWorkspaceManifests(packagesDir = PACKAGES_DIR) {
  const manifests = new Map();
  for (const dir of fs.readdirSync(packagesDir).sort()) {
    const file = path.join(packagesDir, dir, 'package.json');
    if (!fs.existsSync(file)) continue;
    const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!pkg.name) continue;
    const declared = {...pkg.dependencies, ...pkg.peerDependencies, ...pkg.optionalDependencies};
    const deps = Object.keys(declared).filter((dep) => dep.startsWith(SCOPE));
    if (PAYLOAD_HOSTS[pkg.name]) deps.push(PAYLOAD_HOSTS[pkg.name]);
    manifests.set(pkg.name, {name: pkg.name, version: pkg.version, private: Boolean(pkg.private), versionLine: pkg.versionLine, deps});
  }
  return manifests;
}

// Names of every package that goes to npm: non-private, versioned, both version
// lines. The staging-time payloads are not workspace packages and are not listed.
export function publishedPackages(manifests = readWorkspaceManifests()) {
  return [...manifests.values()].filter((pkg) => !pkg.private && pkg.version).map((pkg) => pkg.name);
}

// The version.json lockstep family: published packages minus the drizzle line.
export function lockstepPackages(manifests = readWorkspaceManifests()) {
  return publishedPackages(manifests).filter((name) => manifests.get(name).versionLine !== 'drizzle-orm');
}

// Dependency depth of a package; lower publishes earlier. A name outside the
// workspace is a leaf (the staging-time payloads, or a package this tree no
// longer knows, which then publishes first and can never hold anything back).
export function publishRank(name, manifests = readWorkspaceManifests()) {
  const memo = new Map();
  const depth = (pkg, trail) => {
    if (memo.has(pkg)) return memo.get(pkg);
    if (trail.includes(pkg)) throw new Error(`publish-order: dependency cycle ${[...trail, pkg].join(' -> ')}`);
    const manifest = manifests.get(pkg);
    const value = manifest && manifest.deps.length ? 1 + Math.max(...manifest.deps.map((dep) => depth(dep, [...trail, pkg]))) : 0;
    memo.set(pkg, value);
    return value;
  };
  return depth(name, []);
}

// A copy of names sorted leaves-first (rank, then name — stable and readable).
export function leavesFirst(names, manifests = readWorkspaceManifests()) {
  return [...names].sort((a, b) => publishRank(a, manifests) - publishRank(b, manifests) || a.localeCompare(b));
}

// The reverse walk, for unpublishing: dependents before their dependencies.
export function dependentsFirst(names, manifests = readWorkspaceManifests()) {
  return leavesFirst(names, manifests).reverse();
}

// The packages nothing else on the train depends on — the LAST ones to go live,
// so once npm serves them the whole release is live.
export function topOfTrain(names, manifests = readWorkspaceManifests()) {
  const wanted = new Set(names);
  const dependedOn = new Set();
  for (const name of names) for (const dep of manifests.get(name)?.deps ?? []) if (wanted.has(dep)) dependedOn.add(dep);
  return [...names].filter((name) => !dependedOn.has(name)).sort();
}
