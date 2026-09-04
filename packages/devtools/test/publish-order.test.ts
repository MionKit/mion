// The release publishes one package at a time (npm stage approve promotes one
// stage-id per call), so the ORDER is what keeps a mid-release install from
// resolving a package whose dependency is not live yet. scripts/lib/publish-order.mjs
// derives that order from the workspace instead of a hand-kept rank, and every
// publishing verb (publish-tarballs, stage-approve, manual-publish, publish,
// unpublish) reads it. Hand-kept ranks are exactly what drifted when the framework
// packages joined the train: they all shared one rank and sorted by name, which put
// @mionjs/core live before @mionjs/run-types.
//
// Lives in this package for the same reason as drizzle-version-line.test.ts:
// scripts/ has no vitest project of its own.
import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, describe, expect, it} from 'vitest';
// @ts-expect-error — plain .mjs release helper, no types
import * as publishOrder from '../../../scripts/lib/publish-order.mjs';

const {
  dependentsFirst,
  isPayloadPackage,
  leavesFirst,
  lockstepPackages,
  publishRank,
  publishedPackages,
  readWorkspaceManifests,
  topOfTrain,
} = publishOrder;

type Manifest = Record<string, unknown>;
const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, {recursive: true, force: true});
});

// A throwaway packages/ tree with the given package.json files.
function fakeWorkspace(packages: Record<string, Manifest>) {
  const root = mkdtempSync(join(tmpdir(), 'publish-order-'));
  dirs.push(root);
  for (const [dir, manifest] of Object.entries(packages)) {
    mkdirSync(join(root, dir));
    writeFileSync(join(root, dir, 'package.json'), JSON.stringify(manifest));
  }
  return readWorkspaceManifests(root);
}

describe('publish-order: the derived leaves-first order', () => {
  it('ranks a package one above its deepest @mionjs/* dependency, peers and optionals included', () => {
    const manifests = fakeWorkspace({
      a: {name: '@mionjs/a', version: '1.0.0'},
      b: {name: '@mionjs/b', version: '1.0.0', dependencies: {'@mionjs/a': 'workspace:*', zod: '1.0.0'}},
      c: {name: '@mionjs/c', version: '1.0.0', peerDependencies: {'@mionjs/b': '>=1.0.0'}},
      d: {name: '@mionjs/d', version: '1.0.0', optionalDependencies: {'@mionjs/a': '1.0.0'}},
    });
    expect(publishRank('@mionjs/a', manifests)).toBe(0);
    expect(publishRank('@mionjs/b', manifests)).toBe(1);
    expect(publishRank('@mionjs/c', manifests)).toBe(2);
    expect(publishRank('@mionjs/d', manifests)).toBe(1);
    expect(leavesFirst(['@mionjs/c', '@mionjs/b', '@mionjs/d', '@mionjs/a'], manifests)).toEqual([
      '@mionjs/a',
      '@mionjs/b',
      '@mionjs/d',
      '@mionjs/c',
    ]);
    expect(dependentsFirst(['@mionjs/c', '@mionjs/b', '@mionjs/d', '@mionjs/a'], manifests)).toEqual([
      '@mionjs/c',
      '@mionjs/d',
      '@mionjs/b',
      '@mionjs/a',
    ]);
  });

  it('treats the staging-time payloads as leaves under their hosts, even though the workspace never lists them', () => {
    const manifests = fakeWorkspace({
      bin: {name: '@mionjs/bin-compiler', version: '1.0.0'},
      uws: {name: '@mionjs/bin-uws', version: '1.0.0'},
    });
    expect(isPayloadPackage('@mionjs/native-compiler-linux-x64')).toBe(true);
    expect(isPayloadPackage('@mionjs/native-uws-darwin-arm64')).toBe(true);
    expect(isPayloadPackage('@mionjs/bin-uws')).toBe(false);
    expect(publishRank('@mionjs/native-compiler-linux-x64', manifests)).toBe(0);
    expect(publishRank('@mionjs/bin-compiler', manifests)).toBe(1);
    expect(publishRank('@mionjs/bin-uws', manifests)).toBe(1);
    expect(
      leavesFirst(
        ['@mionjs/bin-uws', '@mionjs/bin-compiler', '@mionjs/native-uws-linux-x64', '@mionjs/native-compiler-linux-x64'],
        manifests
      )
    ).toEqual(['@mionjs/native-compiler-linux-x64', '@mionjs/native-uws-linux-x64', '@mionjs/bin-compiler', '@mionjs/bin-uws']);
  });

  it('lists the published packages and the lockstep subset (no private, no drizzle line)', () => {
    const manifests = fakeWorkspace({
      a: {name: '@mionjs/a', version: '1.0.0'},
      p: {name: '@mionjs/p', version: '1.0.0', private: true},
      d: {name: '@mionjs/d', version: '0.45.0', versionLine: 'drizzle-orm'},
      n: {name: '@mionjs/n'},
    });
    expect(publishedPackages(manifests)).toEqual(['@mionjs/a', '@mionjs/d']);
    expect(lockstepPackages(manifests)).toEqual(['@mionjs/a']);
  });

  it('names the top of the train: the packages nothing else in the set depends on', () => {
    const manifests = fakeWorkspace({
      a: {name: '@mionjs/a', version: '1.0.0'},
      b: {name: '@mionjs/b', version: '1.0.0', dependencies: {'@mionjs/a': 'workspace:*'}},
      c: {name: '@mionjs/c', version: '1.0.0', dependencies: {'@mionjs/a': 'workspace:*'}},
    });
    expect(topOfTrain(['@mionjs/a', '@mionjs/b', '@mionjs/c'], manifests)).toEqual(['@mionjs/b', '@mionjs/c']);
    expect(topOfTrain(['@mionjs/a', '@mionjs/b'], manifests)).toEqual(['@mionjs/b']);
  });

  it('refuses a dependency cycle instead of ranking it', () => {
    const manifests = fakeWorkspace({
      a: {name: '@mionjs/a', version: '1.0.0', dependencies: {'@mionjs/b': 'workspace:*'}},
      b: {name: '@mionjs/b', version: '1.0.0', dependencies: {'@mionjs/a': 'workspace:*'}},
    });
    expect(() => publishRank('@mionjs/a', manifests)).toThrow(/cycle/);
  });
});

describe('publish-order: the real workspace', () => {
  const manifests = readWorkspaceManifests();
  const before = (earlier: string, later: string) =>
    expect(publishRank(earlier, manifests)).toBeLessThan(publishRank(later, manifests));

  it('publishes every dependency before its dependents', () => {
    before('@mionjs/run-types', '@mionjs/core');
    before('@mionjs/core', '@mionjs/router');
    before('@mionjs/core', '@mionjs/client');
    before('@mionjs/router', '@mionjs/platform-node');
    before('@mionjs/native-compiler-linux-x64', '@mionjs/bin-compiler');
    before('@mionjs/bin-compiler', '@mionjs/devtools');
    before('@mionjs/native-uws-linux-x64', '@mionjs/bin-uws');
    before('@mionjs/bin-uws', '@mionjs/platform-uws');
    before('@mionjs/drizzle-orm', '@mionjs/drizzle-orm-pg-core');
    before('@mionjs/run-types', '@mionjs/drizzle-orm');
  });

  it('keeps every published package on the train and the drizzle line off the lockstep', () => {
    const published = publishedPackages(manifests);
    for (const name of [
      '@mionjs/run-types',
      '@mionjs/devtools',
      '@mionjs/bin-compiler',
      '@mionjs/core',
      '@mionjs/router',
      '@mionjs/bin-uws',
      '@mionjs/drizzle-orm-pg-core',
    ]) {
      expect(published).toContain(name);
    }
    expect(published).not.toContain('@mionjs/examples');
    const lockstep = lockstepPackages(manifests);
    expect(lockstep).toContain('@mionjs/core');
    expect(lockstep.filter((name: string) => name.startsWith('@mionjs/drizzle-orm'))).toEqual([]);
    // The framework's top packages are what stage-approve waits on before the deploy.
    expect(topOfTrain(lockstep, manifests)).not.toContain('@mionjs/run-types');
  });
});
