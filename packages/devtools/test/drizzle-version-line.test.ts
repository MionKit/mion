// The drizzle-orm version line (scripts/lib/drizzle-line.mjs) is the ONE
// exception to the lockstep release train: the @mionjs/drizzle-orm-*-core
// packages carry drizzle's own major.minor and only move their patch when their
// published sources change. Two rules do the work and both fail silently if they
// break — a missed change means a release that ships nothing, and a missed
// version bump means live bytes that no longer match their version number — so
// each gets its own case here.
//
// Lives in this package for the same reason as release-receipt.test.ts: scripts/
// has no vitest project of its own.
import {execFileSync} from 'node:child_process';
import {existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {afterEach, describe, expect, it} from 'vitest';
// @ts-expect-error — plain .mjs release script, no types
import * as drizzleLine from '../../../scripts/lib/drizzle-line.mjs';

const {
  isPublishedSource,
  lockstepVersion,
  peerRangeFor,
  plannedVersion,
  readDialectPackages,
  REPO_ROOT,
  tarballSourceDiff,
  unreleasedChanges,
} = drizzleLine;

const dirs: string[] = [];

function scratch(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}

function write(root: string, relPath: string, body: string) {
  const file = join(root, relPath);
  mkdirSync(dirname(file), {recursive: true});
  writeFileSync(file, body);
}

const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', args, {cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']});

// A repo with one dialect-shaped package at packages/dialect, committed at 1.2.3.
function makeRepo(): string {
  const root = scratch('rt-drizzle-git-');
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'config', 'user.email', 'test@example.com');
  git(root, 'config', 'user.name', 'test');
  write(
    root,
    'packages/dialect/package.json',
    JSON.stringify({name: '@mionjs/dialect', version: '1.2.3', versionLine: 'drizzle-orm'}, null, 2)
  );
  write(root, 'packages/dialect/src/index.ts', 'export const one = 1;\n');
  git(root, 'add', '-A');
  git(root, 'commit', '-qm', 'chore: package at 1.2.3');
  return root;
}

// package/-rooted tarball, the shape npm pack produces.
function makeTarball(files: Record<string, string>, name = 'pkg.tgz'): string {
  const dir = scratch('rt-drizzle-tgz-');
  for (const [relPath, body] of Object.entries(files)) write(dir, join('package', relPath), body);
  const tarball = join(dir, name);
  execFileSync('tar', ['-czf', tarball, '-C', dir, 'package']);
  return tarball;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, {recursive: true, force: true});
});

describe('drizzle line — what version comes next', () => {
  it('leaves the version alone when nothing published changed', () => {
    expect(plannedVersion('0.45.2', '0.45.7', false)).toBe('0.45.2');
  });

  it('bumps only the patch when published sources changed', () => {
    expect(plannedVersion('0.45.2', '0.45.7', true)).toBe('0.45.3');
  });

  it('realigns to drizzle-orm and resets the patch when the drizzle line moves', () => {
    expect(plannedVersion('0.45.9', '0.46.0', false)).toBe('0.46.0');
    expect(plannedVersion('0.45.9', '0.46.0', true)).toBe('0.46.0');
  });

  it('states a peer range as one whole minor line', () => {
    expect(peerRangeFor('0.45.2')).toBe('>=0.45.0 <0.46.0');
    expect(peerRangeFor('1.0.0')).toBe('>=1.0.0 <1.1.0');
  });
});

describe('drizzle line — which files count as published', () => {
  it('counts the sources and the manifest npm actually ships', () => {
    expect(isPublishedSource('src/index.ts')).toBe(true);
    expect(isPublishedSource('src/stubs-formats-mappings/refine.stub.ts')).toBe(true);
    expect(isPublishedSource('package.json')).toBe(true);
  });

  it('ignores tests, build output and repo tooling', () => {
    expect(isPublishedSource('src/index.spec.ts')).toBe(false);
    expect(isPublishedSource('src/index.test.ts')).toBe(false);
    expect(isPublishedSource('.dist/esm/src/index.js')).toBe(false);
    expect(isPublishedSource('manifests/pg.manifest.json')).toBe(false);
    expect(isPublishedSource('vitest.config.ts')).toBe(false);
  });
});

describe('drizzle line — unreleased changes since the last bump', () => {
  it('reports nothing when the last commit was the version bump itself', () => {
    const root = makeRepo();
    expect(unreleasedChanges(root, 'packages/dialect')).toMatchObject({known: true, files: []});
  });

  it('reports a published source edited after the bump', () => {
    const root = makeRepo();
    write(root, 'packages/dialect/src/index.ts', 'export const one = 2;\n');
    git(root, 'commit', '-qam', 'fix: change a column builder');
    const changes = unreleasedChanges(root, 'packages/dialect');
    expect(changes.known).toBe(true);
    expect(changes.files).toEqual(['packages/dialect/src/index.ts']);
  });

  it('ignores commits that only touch unpublished files', () => {
    const root = makeRepo();
    write(root, 'packages/dialect/src/index.spec.ts', 'it("x", () => {});\n');
    write(root, 'packages/dialect/manifests/dialect.manifest.json', '{}\n');
    git(root, 'add', '-A');
    git(root, 'commit', '-qm', 'test: add a spec');
    expect(unreleasedChanges(root, 'packages/dialect').files).toEqual([]);
  });

  it('measures from the LAST version bump, not from the first commit', () => {
    const root = makeRepo();
    write(root, 'packages/dialect/src/index.ts', 'export const one = 2;\n');
    git(root, 'commit', '-qam', 'fix: change a column builder');
    const bumped = JSON.parse(readFileSync(join(root, 'packages/dialect/package.json'), 'utf8'));
    bumped.version = '1.2.4';
    write(root, 'packages/dialect/package.json', JSON.stringify(bumped, null, 2));
    git(root, 'commit', '-qam', 'chore(release): dialect 1.2.4');
    expect(unreleasedChanges(root, 'packages/dialect').files).toEqual([]);
  });

  it('says "unknown" rather than "unchanged" when the history cannot answer', () => {
    const root = scratch('rt-drizzle-nogit-');
    write(root, 'packages/dialect/package.json', '{"version":"1.2.3"}');
    expect(unreleasedChanges(root, 'packages/dialect')).toMatchObject({known: false, files: []});
  });
});

describe('drizzle line — a live version must mean the same bytes', () => {
  const base = {'package.json': '{"name":"@mionjs/dialect","version":"0.45.0"}', 'src/index.ts': 'export const one = 1;\n'};

  it('sees no difference between identical publishes', () => {
    expect(tarballSourceDiff(makeTarball(base), makeTarball(base))).toEqual([]);
  });

  it('ignores the version field itself — content is what decides', () => {
    const other = {...base, 'package.json': '{"name":"@mionjs/dialect","version":"0.45.9"}'};
    expect(tarballSourceDiff(makeTarball(base), makeTarball(other))).toEqual([]);
  });

  it('catches an edited source, an added one and a removed one', () => {
    expect(tarballSourceDiff(makeTarball(base), makeTarball({...base, 'src/index.ts': 'export const one = 2;\n'}))).toEqual([
      'src/index.ts',
    ]);
    expect(tarballSourceDiff(makeTarball(base), makeTarball({...base, 'src/refine.ts': 'export const two = 2;\n'}))).toEqual([
      'src/refine.ts',
    ]);
    expect(tarballSourceDiff(makeTarball({...base, 'src/refine.ts': 'export const two = 2;\n'}), makeTarball(base))).toEqual([
      'src/refine.ts',
    ]);
  });

  it('ignores devDependencies — npm never installs them, and pack stamps them every release', () => {
    const withDev = {
      ...base,
      'package.json': '{"name":"@mionjs/dialect","version":"0.45.0","devDependencies":{"@mionjs/run-types":"0.13.0"}}',
    };
    expect(tarballSourceDiff(makeTarball(base), makeTarball(withDev))).toEqual([]);
  });

  it('counts a moved peer range — that IS what the consumer resolves against', () => {
    const moved = {
      ...base,
      'package.json': '{"name":"@mionjs/dialect","version":"0.45.0","peerDependencies":{"@mionjs/run-types":">=0.13.0 <0.14.0"}}',
    };
    expect(tarballSourceDiff(makeTarball(base), makeTarball(moved))).toEqual(['package.json']);
  });

  it('ignores build output, so a rebuild alone never reads as a change', () => {
    const rebuilt = {...base, '.dist/esm/src/index.js': 'export const one=1;//built later\n'};
    expect(
      tarballSourceDiff(makeTarball({...base, '.dist/esm/src/index.js': 'export const one=1;\n'}), makeTarball(rebuilt))
    ).toEqual([]);
  });
});

describe('drizzle line — the tree itself', () => {
  it('marks every dialect package as off the lockstep train', () => {
    const rows = readDialectPackages(REPO_ROOT);
    expect(rows.length).toBeGreaterThan(0);
    const lockstep = JSON.parse(readFileSync(join(REPO_ROOT, 'version.json'), 'utf8')).version;
    for (const row of rows) {
      expect(existsSync(row.packageFile)).toBe(true);
      expect(row.pkg.versionLine).toBe('drizzle-orm');
      expect(row.pkg.version).not.toBe(lockstep);
      expect(row.pkg.peerDependencies?.['drizzle-orm']).toBeTruthy();
    }
  });

  it('takes @mionjs/run-types as a peer on the lockstep minor, never as a pinned dependency', () => {
    const expected = peerRangeFor(lockstepVersion(REPO_ROOT));
    for (const row of readDialectPackages(REPO_ROOT)) {
      expect(row.pkg.peerDependencies?.['@mionjs/run-types']).toBe(expected);
      expect(row.pkg.dependencies?.['@mionjs/run-types']).toBeUndefined();
      // Kept resolvable in the workspace, and dev deps never reach a consumer.
      expect(row.pkg.devDependencies?.['@mionjs/run-types']).toBe('workspace:*');
    }
  });
});
