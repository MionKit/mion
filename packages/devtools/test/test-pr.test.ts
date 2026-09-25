// Contract tests for `miondevx core test-pr`.

import {describe, it, expect, beforeAll, afterAll} from 'vitest';
import {execFileSync, spawnSync} from 'node:child_process';
import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {resolve, dirname, join} from 'node:path';
// @ts-expect-error — a plain .mjs repo script, no types.
import {affectedClosure, pathTargets, readWorkspaceGraph} from '../../../scripts/lib/workspace-graph.mjs';
// @ts-expect-error — a plain .mjs repo script, no types.
import {changedFiles, classifyPaths} from '../../../scripts/lib/branch-diff.mjs';
// @ts-expect-error — a plain .mjs repo script, no types.
import {buildPlan} from '../../../scripts/core/test-pr.mjs';
// @ts-expect-error — a plain .mjs repo script, no types.
import {readProjects} from '../../../scripts/core/test-batches.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

type Pkg = {dir: string; name: string; deps: Set<string>};
type Graph = Map<string, Pkg>;
type Project = {name: string; configPath: string};
type Plan = {
  full: boolean;
  global: string[];
  ignored: string[];
  affected: Map<string, string | null>;
  projects: string[];
  untested: string[];
};

const graph = (edges: Record<string, string[]>): Graph =>
  new Map(Object.entries(edges).map(([dir, deps]) => [dir, {dir, name: `@x/${dir}`, deps: new Set(deps)}]));
const sorted = (keys: Iterable<string>): string[] => [...keys].sort();

// `a` <- `b` (devDependency) <- `c` (relative import only), plus `d` alone.
const fixture = (): string => {
  const root = mkdtempSync(join(tmpdir(), 'test-pr-'));
  const write = (path: string, text: string) => {
    mkdirSync(dirname(join(root, path)), {recursive: true});
    writeFileSync(join(root, path), text);
  };
  write('packages/a/package.json', JSON.stringify({name: '@x/a'}));
  write('packages/a/src/index.ts', 'export const a = 1;\n');
  write('packages/b/package.json', JSON.stringify({name: '@x/b', devDependencies: {'@x/a': 'workspace:*', vitest: '1.0.0'}}));
  write('packages/b/src/index.ts', 'export const b = 1;\n');
  write('packages/c/package.json', JSON.stringify({name: '@x/c'}));
  write('packages/c/test/c.spec.ts', "import '../../b/src/index.ts';\nconst fixtureText = '../../api/src/api';\n");
  write('packages/d/package.json', JSON.stringify({name: '@x/d'}));
  write('packages/d/src/index.ts', 'export const d = 1;\n');
  write('README.md', '# fixture\n');
  write(
    'vitest.config.ts',
    "export default {test: {projects: [\n  'packages/b/vitest.config.ts',\n  'packages/c/vitest.config.ts',\n]}};\n"
  );
  write('packages/b/vitest.config.ts', "export default {test: {name: 'b-tests'}};\n");
  write('packages/c/vitest.config.ts', "export default {test: {name: 'c-tests'}};\n");
  const git = (...args: string[]) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], {cwd: root});
  git('init', '-q', '-b', 'main');
  git('add', '-A');
  git('commit', '-q', '-m', 'base');
  return root;
};

describe('the package graph', () => {
  let root: string;
  beforeAll(() => {
    root = fixture();
  });
  afterAll(() => rmSync(root, {recursive: true, force: true}));

  it('reads manifest edges from devDependencies too, and drops non-workspace names', () => {
    const packages = readWorkspaceGraph(root) as Graph;
    expect(sorted(packages.get('b')!.deps)).toEqual(['a']);
  });

  it('adds an edge for a relative path into a sibling package', () => {
    const packages = readWorkspaceGraph(root) as Graph;
    expect(sorted(packages.get('c')!.deps)).toEqual(['b']);
  });

  it('ignores relative strings that land in no package, or in the same package', () => {
    const packages = graph({a: [], b: []});
    const text = "import '../src/x'; const p = '../../api/src/api'; const q = '../../../../outside';";
    expect(sorted(pathTargets('packages/a/test/x.ts', text, packages))).toEqual([]);
    expect(sorted(pathTargets('packages/a/test/x.ts', "readFile('../../b/build/x.js')", packages))).toEqual(['b']);
  });

  it('walks every dependent, recording the package that pulled it in', () => {
    const affected = affectedClosure(['a'], readWorkspaceGraph(root) as Graph) as Map<string, string | null>;
    expect(Object.fromEntries(affected)).toEqual({a: null, b: 'a', c: 'b'});
  });

  it('ends on a cycle', () => {
    const affected = affectedClosure(['x'], graph({x: ['y'], y: ['x'], z: []})) as Map<string, string | null>;
    expect(sorted(affected.keys())).toEqual(['x', 'y']);
  });
});

describe('the branch diff', () => {
  let root: string;
  const git = (...args: string[]) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], {cwd: root});
  beforeAll(() => {
    root = fixture();
    git('checkout', '-q', '-b', 'feature');
    writeFileSync(join(root, 'packages/a/src/index.ts'), 'export const a = 2;\n');
    git('mv', 'packages/d/src/index.ts', 'packages/b/src/moved.ts');
    git('commit', '-q', '-am', 'feature');
    git('checkout', '-q', 'main');
    writeFileSync(join(root, 'README.md'), '# moved on\n');
    git('commit', '-q', '-am', 'main moves on');
    git('checkout', '-q', 'feature');
    writeFileSync(join(root, 'packages/c/test/c.spec.ts'), '// uncommitted\n');
  });
  afterAll(() => rmSync(root, {recursive: true, force: true}));

  it('lists commits since the merge-base only: no base-side commit, no working-tree edit', () => {
    const {files} = changedFiles('main', {cwd: root}) as {files: string[]};
    expect(sorted(files)).toEqual(['packages/a/src/index.ts', 'packages/b/src/moved.ts', 'packages/d/src/index.ts']);
  });

  it('marks both packages of a move', () => {
    const {files} = changedFiles('main', {cwd: root}) as {files: string[]};
    const {packages} = classifyPaths(files, readWorkspaceGraph(root)) as {packages: Set<string>};
    expect(sorted(packages)).toEqual(['a', 'b', 'd']);
  });

  it('refuses an unknown base', () => {
    expect(() => changedFiles('no-such-branch', {cwd: root})).toThrow(/unknown base 'no-such-branch'/);
  });
});

describe('the plan', () => {
  const packages = graph({a: [], b: ['a'], c: ['b'], d: []});
  const projects: Project[] = [
    {name: 'b-tests', configPath: 'packages/b/vitest.config.ts'},
    {name: 'c-tests', configPath: 'packages/c/vitest.config.ts'},
  ];
  const plan = (files: string[]): Plan => buildPlan({files, packages, projects}) as Plan;

  it('selects the projects of the affected packages and names the ones with no project', () => {
    const result = plan(['packages/a/src/index.ts']);
    expect(result.full).toBe(false);
    expect(result.projects).toEqual(['b-tests', 'c-tests']);
    expect(result.untested).toEqual(['a']);
  });

  it('runs nothing for a package no project covers and nothing depends on', () => {
    expect(plan(['packages/d/src/index.ts']).projects).toEqual([]);
  });

  it('ignores docs-only paths', () => {
    const result = plan(['docs/x.md', 'README.md', 'packages/c/test/c.spec.ts']);
    expect(result.full).toBe(false);
    expect(result.ignored).toEqual(['docs/x.md', 'README.md']);
    expect(result.projects).toEqual(['c-tests']);
  });

  it('runs the full suite for any other path outside the packages', () => {
    for (const file of [
      'ts-go-runtypes/internal/x.go',
      'vitest.config.ts',
      'pnpm-lock.yaml',
      'scripts/x.mjs',
      '.github/workflows/ci.yml',
      'packages/gone/x.ts',
    ]) {
      const result = plan(['packages/c/test/c.spec.ts', file]);
      expect(result.full, file).toBe(true);
      expect(result.global, file).toEqual([file]);
    }
  });
});

describe('the real workspace', () => {
  const packages = readWorkspaceGraph(REPO_ROOT) as Graph;
  const projects = readProjects(REPO_ROOT) as Project[];

  it('every vitest project sits in a workspace package', () => {
    for (const project of projects) expect(packages.has(project.configPath.split('/')[1]), project.configPath).toBe(true);
  });

  it('finds the links tests make by relative path only', () => {
    expect(packages.get('platform-cloudflare')!.deps).toContain('private-test-server');
    expect(packages.get('platform-vercel')!.deps).toContain('private-test-server');
    expect(packages.get('run-types')!.deps).toContain('private-go-be-sidecar');
    expect(packages.get('drizzle-orm-pg-core')!.deps).toContain('devtools');
  });

  it('a run-types change reaches the mion packages', () => {
    const affected = affectedClosure(['run-types'], packages) as Map<string, string | null>;
    for (const dir of ['core', 'rpc-router', 'rpc-client', 'devtools', 'drizzle-orm-pg-core'])
      expect(affected.has(dir), dir).toBe(true);
  });

  it('`core test-pr --list` prints the plan and exits 0', () => {
    const listed = spawnSync('node', ['scripts/miondevx.mjs', 'core', 'test-pr', '--base', 'HEAD', '--list'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 30_000,
    });
    expect(listed.status, listed.stderr).toBe(0);
    expect(listed.stdout).toContain('0 changed file(s)');
    expect(listed.stdout).toContain('vitest projects (0)');
  });
});
