// scripts/core/test-skip.mjs skips a vitest file whose key already passed. These pin what
// the key sees, what it deliberately ignores, and which files it refuses to cache at all.
import {join} from 'node:path';
import {describe, expect, it} from 'vitest';

const REPO_ROOT = join(__dirname, '../../..');
import {
  fileKey,
  isProven,
  moduleGraph,
  parseCli,
  passRecorder,
  recordPass,
  stableCode,
  // @ts-expect-error plain ESM dev script, no types
} from '../../../scripts/core/test-skip.mjs';

const graph = (modules: Record<string, string>, externals: string[] = []) => ({
  modules: new Map(Object.entries(modules)),
  externals: new Set(externals),
  reasons: new Set<string>(),
});

describe('test-skip — the key of one test file', () => {
  const base = {'/repo/packages/a/test/a.test.ts': 'import "./x"', '/repo/packages/a/.mion/types/t.js': 'export const t = 1'};

  it('is a pure function of the loaded code, whatever order the graph was walked in', () => {
    const reversed = Object.fromEntries(Object.entries(base).reverse());
    expect(fileKey(graph(base), 'salt')).toBe(fileKey(graph(reversed), 'salt'));
  });

  it('changes when any loaded module, the compiler output included, changes', () => {
    const key = fileKey(graph(base), 'salt');
    expect(fileKey(graph({...base, '/repo/packages/a/.mion/types/t.js': 'export const t = 2'}), 'salt')).not.toBe(key);
    expect(fileKey(graph({...base, '/repo/packages/a/src/new.ts': ''}), 'salt')).not.toBe(key);
  });

  it('changes with an external package version and with the salt', () => {
    const key = fileKey(graph(base, ['node_modules/.pnpm/zod@4.1.5/node_modules/zod/index.js']), 'salt');
    expect(fileKey(graph(base, ['node_modules/.pnpm/zod@4.1.6/node_modules/zod/index.js']), 'salt')).not.toBe(key);
    expect(fileKey(graph(base, ['node_modules/.pnpm/zod@4.1.5/node_modules/zod/index.js']), 'other')).not.toBe(key);
  });
});

describe('test-skip — the randomly drawn pattern samples', () => {
  // With no mock.seed the compiler draws new samples on every build, on purpose.
  it('ignores drawn samples in generated code, in both the JSON and the quoted form', () => {
    const one = `{"mockSamples":["ab","cd"],"source":"^x$"} f({pattern: {mockSamples: [\\'ac-23\\', \\'db-14\\'], flags: \\'u\\'}})`;
    const two = `{"mockSamples":["zz"],"source":"^x$"} f({pattern: {mockSamples: [\\'bb-07\\'], flags: \\'u\\'}})`;
    expect(stableCode('/repo/packages/a/.mion/types/t.js', one)).toBe(stableCode('/repo/packages/a/.mion/types/t.js', two));
    expect(stableCode('/repo/packages/a/.mion/types/t.js', one)).toContain('"source":"^x$"');
  });

  it('keeps samples declared in source, which a person wrote and a change must re-run', () => {
    const code = 'const f = {mockSamples: ["ab"]};';
    expect(stableCode('/repo/packages/a/src/formats.ts', code)).toBe(code);
  });

  it('never strips past the end of the list, so a sample holding `]` costs a skip, not a missed change', () => {
    expect(stableCode('/repo/.mion/types/t.js', '{"mockSamples":["a]b"],"after":1}')).toBe('{"mockSamples":[]b"],"after":1}');
  });
});

describe('test-skip — the passed list', () => {
  it('keeps the newest keys per file, so switching branches back and forth still hits', () => {
    const store: Record<string, string[]> = {};
    for (const key of ['k1', 'k2', 'k3', 'k4', 'k2']) recordPass(store, 'a.test.ts', key);
    expect(store['a.test.ts']).toEqual(['k2', 'k4', 'k3']);
  });

  it('proves a file only at a recorded key, and never one that reaches outside its graph', () => {
    const store = {'a.test.ts': ['k1']};
    expect(isProven(store, 'a.test.ts', {key: 'k1', reason: ''})).toBe(true);
    expect(isProven(store, 'a.test.ts', {key: 'k2', reason: ''})).toBe(false);
    expect(isProven(store, 'a.test.ts', {key: 'k1', reason: 'imports node:fs'})).toBe(false);
    expect(isProven(store, 'b.test.ts', {key: 'k1', reason: ''})).toBe(false);
  });
});

// A fake vite ssr environment: each module's transformed code and the imports vite recorded.
const fakeProject = (root: string, modules: Record<string, {code: string; deps?: string[]}>) => ({
  name: 'fake',
  config: {root},
  vite: {
    environments: {
      ssr: {
        moduleGraph: {getModuleById: () => undefined},
        transformRequest: async (id: string) => modules[id] && {code: modules[id].code, deps: modules[id].deps ?? []},
      },
    },
  },
});

describe('test-skip — files that reach outside their import graph', () => {
  const root = join(REPO_ROOT, 'packages/devtools');
  const file = join(root, 'test/test-skip.test.ts');

  it.each(['node:child_process', 'child_process', 'node:fs', 'fs/promises', 'node:http', 'node:worker_threads'])(
    'is never cached when the graph imports %s',
    async (builtin) => {
      const graph = await moduleGraph(fakeProject(root, {[file]: {code: 'x', deps: [builtin]}}), file);
      expect([...graph.reasons]).toEqual([`imports ${builtin}`]);
    }
  );

  it('keeps a pure graph cacheable, and records an external package by its versioned path', async () => {
    const dep = '/@fs' + join(REPO_ROOT, 'node_modules/.pnpm/zod@4.1.5/node_modules/zod/index.js');
    const graph = await moduleGraph(fakeProject(root, {[file]: {code: 'x', deps: ['node:path', dep]}}), file);
    expect([...graph.reasons]).toEqual([]);
    expect([...graph.externals]).toContain('node_modules/.pnpm/zod@4.1.5/node_modules/zod/index.js');
  });
});

describe('test-skip — what a run records', () => {
  const testModule = (state: string, testStates: string[]) => ({
    project: {name: 'p'},
    moduleId: join(REPO_ROOT, 'packages/a/test/a.test.ts'),
    state: () => state,
    children: {allTests: () => testStates.map((testState) => ({result: () => ({state: testState})}))},
  });

  it('records a file whose every test passed', () => {
    const recorder = passRecorder();
    recorder.reporter.onTestModuleEnd(testModule('passed', ['passed', 'passed']));
    expect([...recorder.passed]).toEqual(['p::packages/a/test/a.test.ts']);
  });

  // A `.skipIf(!HAS_BIN)` looks the same as a real skip, so the file proved less than it claims.
  it('never records a file with a skipped test, and never counts a skip as a failure', () => {
    const recorder = passRecorder();
    recorder.reporter.onTestModuleEnd(testModule('passed', ['passed', 'skipped']));
    recorder.reporter.onTestModuleEnd(testModule('skipped', ['skipped']));
    expect(recorder.passed.size).toBe(0);
    expect(recorder.failed.size).toBe(0);
  });

  it('counts a failed file as failed', () => {
    const recorder = passRecorder();
    recorder.reporter.onTestModuleEnd(testModule('failed', ['passed', 'failed']));
    expect([...recorder.failed]).toEqual(['p::packages/a/test/a.test.ts']);
  });
});

describe('test-skip — the command line', () => {
  it('takes repeatable projects and excludes, and leaves the rest as filters', () => {
    const cli = parseCli(['--project', 'core', '--project', 'router', '--exclude', '**/fuzz/**', 'errors']);
    expect(cli.scope).toEqual({filters: ['errors'], projects: ['core', 'router'], excludes: ['**/fuzz/**']});
  });

  it.each([['--keys'], ['--store'], ['--keys', '--project'], ['--nope']])('refuses %j', (...args) => {
    expect(() => parseCli(args)).toThrow(/core test-skip:/);
  });
});
