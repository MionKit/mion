// scripts/core/test-skip.mjs skips a vitest file whose key already passed. These pin what
// the key sees, what it deliberately ignores, and which files it refuses to cache at all.
import {mkdirSync, mkdtempSync, readFileSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, relative} from 'node:path';
import {describe, expect, it} from 'vitest';

const REPO_ROOT = join(__dirname, '../../..');
import {
  bundleDigest,
  externalId,
  fileKey,
  inputDigest,
  isProven,
  missedInputs,
  moduleGraph,
  parseCli,
  passRecorder,
  projectSalt,
  recordPass,
  stableCode,
  // @ts-expect-error plain ESM dev script, no types
} from '../../../scripts/core/test-skip.mjs';

const externalVersion = (name: string) =>
  JSON.parse(readFileSync(join(REPO_ROOT, 'node_modules', name, 'package.json'), 'utf8')).version;

const graph = (modules: Record<string, string>, externals: string[] = []) => ({
  modules: new Map(Object.entries(modules)),
  externals: new Set(externals),
  reasons: new Set<string>(),
});

// A runtypes.js in the resolver's layout: `ini` lines by row id, rows sorted by id, rels by row index.
const bundle = (rows: string[], rels: string, ini: string[] = []) =>
  `function ini(rtu){const c=(id)=>rtu.useRunType(id);\n${ini.join('\n')}\n}\nexport const __rt_runtypes=[4,,ini,'rts_x',[${rows.join(',\n')}],[${rels}]];\n`;

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

describe('test-skip — the shared runtypes.js, keyed per root', () => {
  const base = bundle([`['A',32,,,'a']`, `['B',1]`, `['C',2]`], '[1],,');

  it('ignores a row added elsewhere, even though it shifts every later row index', () => {
    const shifted = bundle([`['A',32,,,'a']`, `['A0',7]`, `['B',1]`, `['C',2]`], '[2],,,');
    expect(bundleDigest(shifted, ['A'])).toBe(bundleDigest(base, ['A']));
    expect(bundleDigest(shifted, ['C'])).toBe(bundleDigest(base, ['C']));
  });

  it('changes with a row reached through a relation, and only for the roots that reach it', () => {
    const changed = bundle([`['A',32,,,'a']`, `['B',9]`, `['C',2]`], '[1],,');
    expect(bundleDigest(changed, ['A'])).not.toBe(bundleDigest(base, ['A']));
    expect(bundleDigest(changed, ['C'])).toBe(bundleDigest(base, ['C']));
  });

  it('changes with a relation that now points somewhere else', () => {
    expect(bundleDigest(bundle([`['A',32,,,'a']`, `['B',1]`, `['C',2]`], '[2],,'), ['A'])).not.toBe(bundleDigest(base, ['A']));
  });

  it('follows ini lines, their references to other rows, and ids inside inline literals', () => {
    const withIni = (value: number) =>
      bundle([`['A',32]`, `['B',1]`, `['C',2]`], ",,[{'kind':23,'id':'A'}]", [
        `c('B').contains = c('A');`,
        `c('A').literal = BigInt('${value}');`,
      ]);
    expect(bundleDigest(withIni(2), ['B'])).not.toBe(bundleDigest(withIni(1), ['B']));
    expect(bundleDigest(withIni(2), ['C'])).not.toBe(bundleDigest(withIni(1), ['C']));
  });

  it('ignores drawn samples in the ini lines, like everywhere else in generated code', () => {
    const drawn = (sample: string) =>
      bundle([`['A',32]`], '', [
        `c('A').formatAnnotation = {"params":{"pattern":{"mockSamples":["${sample}"],"source":"^x$"}}};`,
      ]);
    expect(bundleDigest(drawn('ab'), ['A'])).toBe(bundleDigest(drawn('zz'), ['A']));
  });

  it('gives up on a bundle it cannot read or a root it cannot find, so the caller hashes the whole file', () => {
    expect(bundleDigest('export const __rt_runtypes=[4,,ini', ['A'])).toBeNull();
    expect(bundleDigest(base, ['missing'])).toBeNull();
  });

  it('keys a test graph on the rows its facades reach, not the bundle text', async () => {
    const dir = join(mkdtempSync(join(tmpdir(), 'test-skip-')), '.mion/types');
    mkdirSync(dir, {recursive: true});
    const facade = (root: string) =>
      `import {__rt_runtypes} from './runtypes.js';\nexport const __rt_${root}=[5,()=>[__rt_runtypes],,'${root}'];\n`;
    writeFileSync(join(dir, 'A.js'), facade('A'));
    writeFileSync(join(dir, 'C.js'), facade('C'));
    const test = join(dir, '../../a.test.ts');
    const keyWith = async (bundleCode: string, root: string) => {
      writeFileSync(join(dir, 'runtypes.js'), bundleCode);
      const modules = {
        [test]: {code: 'x', deps: ['/@fs' + join(dir, `${root}.js`)]},
        [join(dir, `${root}.js`)]: {code: facade(root), deps: ['/@fs' + join(dir, 'runtypes.js')]},
        [join(dir, 'runtypes.js')]: {code: 'bundle text'},
      };
      return fileKey(await moduleGraph(fakeProject(dir, modules), test), 'salt');
    };
    const key = await keyWith(base, 'A');
    expect(await keyWith(bundle([`['A',32,,,'a']`, `['A0',7]`, `['B',1]`, `['C',2]`], '[2],,,'), 'A')).toBe(key);
    expect(await keyWith(bundle([`['A',32,,,'a']`, `['B',9]`, `['C',2]`], '[1],,'), 'A')).not.toBe(key);
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

  it('forgives a declared module its builtins, and keys the file on what that module declares instead', async () => {
    const helper = join(root, 'test/helpers/inline.ts');
    const input = relative(REPO_ROOT, join(mkdtempSync(join(tmpdir(), 'test-skip-')), 'fixture.txt'));
    writeFileSync(join(REPO_ROOT, input), 'one');
    const declared = {[relative(REPO_ROOT, helper)]: [input]};
    const modules = {[file]: {code: 'x', deps: ['/@fs' + helper]}, [helper]: {code: 'spawn', deps: ['node:child_process']}};
    const graph = await moduleGraph(fakeProject(root, modules), file, declared);
    expect([...graph.reasons]).toEqual([]);
    expect([...graph.inputs]).toEqual([input]);
    expect((await moduleGraph(fakeProject(root, modules), file, {})).reasons.size).toBe(1);
  });

  it('lets a declared directory cover every module under it', async () => {
    const helper = join(root, 'test/helpers/inline.ts');
    const modules = {[file]: {code: 'x', deps: ['/@fs' + helper]}, [helper]: {code: 'spawn', deps: ['node:child_process']}};
    const covered = await moduleGraph(fakeProject(root, modules), file, {'packages/devtools/test/': ['version.json']});
    expect([...covered.reasons]).toEqual([]);
    expect([...covered.inputs]).toEqual(['version.json']);
    const elsewhere = await moduleGraph(fakeProject(root, modules), file, {'packages/devtools/src/': ['version.json']});
    expect([...elsewhere.reasons]).toEqual(['imports node:child_process']);
  });

  it('digests a declared file by its bytes and a directory by every file in it', () => {
    const dir = mkdtempSync(join(tmpdir(), 'test-skip-'));
    const write = (name: string, content: string) => {
      mkdirSync(join(dir, name, '..'), {recursive: true});
      writeFileSync(join(dir, name), content);
      return relative(REPO_ROOT, join(dir, name));
    };
    expect(inputDigest(write('a.txt', 'one'))).toBe(inputDigest(write('b.txt', 'one')));
    expect(inputDigest(write('c.txt', 'two'))).not.toBe(inputDigest(write('d.txt', 'one')));
    write('x/one/f.txt', 'one');
    write('y/one/f.txt', 'two');
    expect(inputDigest(relative(REPO_ROOT, join(dir, 'x')))).not.toBe(inputDigest(relative(REPO_ROOT, join(dir, 'y'))));
    expect(inputDigest(relative(REPO_ROOT, join(dir, 'missing')))).toBe('missing');
  });

  it('blocks every file of a project whose setup file reaches outside its graph', async () => {
    const setup = join(root, 'test/setup.ts');
    const project = {...fakeProject(root, {[setup]: {code: 'x', deps: ['node:fs']}}), config: {root, setupFiles: [setup]}};
    expect((await projectSalt(project, 'base', {})).reason).toBe(`setup ${relative(REPO_ROOT, setup)} imports node:fs`);
    expect((await projectSalt(project, 'base', {[relative(REPO_ROOT, setup)]: []})).reason).toBe('');
  });

  // The hoisted layout puts no version in the path; it comes from the package's manifest.
  it('keeps a pure graph cacheable, and records an external package by name and version', async () => {
    const dep = '/@fs' + join(REPO_ROOT, 'node_modules/vitest/dist/index.js');
    const graph = await moduleGraph(fakeProject(root, {[file]: {code: 'x', deps: ['node:path', dep]}}), file);
    expect([...graph.reasons]).toEqual([]);
    expect([...graph.externals]).toEqual(['node:path', `vitest@${externalVersion('vitest')}`]);
    expect(externalId('node_modules/@vitejs/plugin-vue/dist/index.mjs')).toBe(
      `@vitejs/plugin-vue@${externalVersion('@vitejs/plugin-vue')}`
    );
  });

  it('is never cached when the graph imports a package that reads files itself, unless the importer is declared', async () => {
    const dep = '/@fs' + join(REPO_ROOT, 'node_modules/typescript/lib/typescript.js');
    const modules = {[file]: {code: 'x', deps: [dep]}};
    const typescript = `typescript@${externalVersion('typescript')}`;
    expect([...(await moduleGraph(fakeProject(root, modules), file, {})).reasons]).toEqual([`imports ${typescript}`]);
    const declared = await moduleGraph(fakeProject(root, modules), file, {
      [relative(REPO_ROOT, file)]: ['packages/run-types/src'],
    });
    expect([...declared.reasons]).toEqual([]);
    expect([...declared.inputs]).toEqual(['packages/run-types/src']);
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

describe('test-skip — the audit on main', () => {
  it('names a failed file the passed list would have skipped, and never one it would have run', () => {
    const store = {'p::a.test.ts': ['k1'], 'p::b.test.ts': ['k1']};
    const keys = {
      'p::a.test.ts': {key: 'k1', reason: ''},
      'p::b.test.ts': {key: 'k2', reason: ''},
      'p::c.test.ts': {key: 'k1', reason: ''},
    };
    expect(missedInputs(store, keys, new Set(['p::a.test.ts', 'p::b.test.ts', 'p::c.test.ts']))).toEqual(['p::a.test.ts']);
  });
});

describe('test-skip — the command line', () => {
  it('takes repeatable projects and excludes, and leaves the rest as filters', () => {
    const cli = parseCli(['--project', 'core', '--project', 'router', '--exclude', '**/fuzz/**', 'errors']);
    expect(cli.scope).toEqual({filters: ['errors'], projects: ['core', 'router'], excludes: ['**/fuzz/**']});
  });

  it('turns the audit on with --audit, and leaves it off by default', () => {
    expect(parseCli(['--audit']).audit).toBe(true);
    expect(parseCli([]).audit).toBe(false);
  });

  it.each([['--keys'], ['--store'], ['--keys', '--project'], ['--nope'], ['--audit=yes']])('refuses %j', (...args) => {
    expect(() => parseCli(args)).toThrow(/core test-skip:/);
  });
});
