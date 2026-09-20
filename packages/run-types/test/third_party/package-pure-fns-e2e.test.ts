// Runtime e2e for pure fns served ACROSS PACKAGES: a consumer's pure fn imports ids from installed libraries,
// and the build reads each body from `mion-pure-fns/` in the library's output dir, never from its bundle.
// @acme/text is built for real and its bundle then hollowed, so the artifact is the only place its bodies
// exist (the ARTIFACT lane); @acme/dates is a plain tsc-style emit plus src/, with its own nested @acme/text
// (the SRC lane, a cross-package dep resolved from its own root); @acme/legacy registers a live function at
// load with no artifact and no src, so a consumer reaching it fails to build (PFE9016). Two consumers share one
// node_modules tree, app-vite through the Rollup adapter and app-compile through `mion compile`, and both
// print JSON from a fresh Node process, so what is asserted is what a user's program sees at runtime;
// app-legacy runs both lanes over a consumer of @acme/legacy and must halt.
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import * as esbuild from 'esbuild';
import runtypesEsbuild from '../../../devtools/src/runtypes/esbuild.ts';
import runtypesRollup from '../../../devtools/src/runtypes/rollup.ts';
import {
  PURE_FN_ARTIFACT_DIR,
  PURE_FN_ARTIFACT_INDEX,
  PURE_FN_HASH_PREFIX,
} from '../../../devtools/src/core/go-generated/runtypes-constants.generated.ts';
import {BIN, hasBinary} from '../../../devtools/test/helpers/inline.ts';
import {runCli} from '../../../devtools/test/helpers/cliCrash.ts';

// packages/run-types — the real @mionjs/run-types every fixture symlinks in.
const CORE_PKG_DIR = fileURLToPath(new URL('../..', import.meta.url));

// An id hashes the body that ships, so the two built libraries' ids are only known once built.
// Only the runtime-only package writes its own.
const PAD_ID = '@acme/legacy#pf_pad00000000000';
const ID_PATTERN = /^@acme\/[a-z]+#pf_[A-Za-z0-9_-]{14}$/;

let BASE = '';
let TEXT_DIR = '';
let DATES_DIR = '';
let LEGACY_DIR = '';

const tsconfig = (include: string[], rootDir?: string): string =>
  JSON.stringify({
    compilerOptions: {
      target: 'ES2022',
      module: 'ESNext',
      moduleResolution: 'bundler',
      strict: false,
      skipLibCheck: true,
      types: [],
      outDir: 'dist',
      ...(rootDir ? {rootDir} : {}),
    },
    include,
  });

const libManifest = (name: string): string =>
  JSON.stringify({
    name,
    version: '0.0.0',
    type: 'module',
    types: './dist/index.d.ts',
    exports: {'.': {types: './dist/index.d.ts', default: './dist/index.js'}},
  });

// @acme/text: source the esbuild build compiles; the .d.ts is what tsc emits
// when the build injects the ids, `PureFnId<string>` with no literal in it.
const TEXT_SRC = `import {registerPureFn, registerPureFnFactory} from '@mionjs/run-types/runtime';
export const slugify = registerPureFn((s: string): string => s.trim().toLowerCase().replace(/\\s+/g, '-'));
export const title = registerPureFnFactory(function (utl) {
  return function _title(s: string): string { return utl.getPureFn(slugify)(s) + '!'; };
});
`;
const TEXT_DTS = `import type {PureFnId} from '@mionjs/run-types/runtime';
export declare const slugify: PureFnId<string>;
export declare const title: PureFnId<string>;
`;
// Replaces the text bundle after its build, so only the artifact can be the source of the bodies.
const TEXT_HOLLOW = `import {registerPureFn, registerPureFnFactory} from '@mionjs/run-types/runtime';
export const slugify = registerPureFn(null);
export const title = registerPureFnFactory(null);
`;

// @acme/dates ships the way run-types does: a hollowed dist (the registration
// keeps no body and no id, nothing in it is a tuple) plus src/, where the
// registration is extracted from with its dep on the nested @acme/text.
const DATES_SRC = `import {registerPureFnFactory} from '@mionjs/run-types/runtime';
import {slugify} from '@acme/text';
export const isoDay = registerPureFnFactory(function (utl) {
  return function _isoDay(label: string, day: string): string { return utl.getPureFn(slugify)(label) + '@' + day.slice(0, 10); };
});
`;
const DATES_DIST = `import {registerPureFnFactory} from '@mionjs/run-types/runtime';
export const isoDay = registerPureFnFactory(null);
`;
const DATES_DTS = `import type {PureFnId} from '@mionjs/run-types/runtime';
export declare const isoDay: PureFnId<string>;
`;

// @acme/legacy: registered at load only; the .d.ts carries the literal so a
// consumer's build can name the edge it cannot serve.
const LEGACY_JS = `import {registerPureFn} from '@mionjs/run-types/runtime';
export const padId = registerPureFn(function (n) { return String(n).padStart(4, '0'); }, '${PAD_ID}');
`;
const LEGACY_DTS = `import type {PureFnId} from '@mionjs/run-types/runtime';
export declare const padId: PureFnId<'${PAD_ID}'>;
`;

// Annotation-free, so the plugin's rewritten output runs as plain ESM (the compile lane adds the typed marker pair).
// Lowering leaves the imports unused, so a TypeScript emit drops them: the served bodies are all the program has.
const consumerBody = (titleId: string): string => `import {registerPureFnFactory, getRTUtils} from '@mionjs/run-types/runtime';
import {isoDay} from '@acme/dates';

export const stamp = registerPureFnFactory(function (utl) {
  return function _stamp(label, day) { return utl.getPureFn(isoDay)(label, day); };
});

export const report = () => {
  const utl = getRTUtils();
  const deps = utl.getCompiledPureFnByKey(stamp).pureFnDependencies;
  const isoDayDeps = utl.getCompiledPureFnByKey(deps[0]).pureFnDependencies;
  return {
    stampId: stamp,
    deps,
    result: utl.getPureFnByKey(stamp)('Hello World', '2026-09-18T10:00:00Z'),
    isoDayDeps,
    servedSlugifyCode: utl.getCompiledPureFnByKey(isoDayDeps[0]).code,
    titleStillOwnedByText: utl.hasPureFnByKey('${titleId}'),
  };
};
`;
// Reaches the runtime-only package, whose body nothing can serve at build time: this build must fail.
const legacyMain = `import {registerPureFnFactory} from '@mionjs/run-types/runtime';
import {padId} from '@acme/legacy';
export const pad = registerPureFnFactory(function (utl) {
  return function _pad(n) { return utl.getPureFn(padId)(n); };
});
`;
const viteMain = (titleId: string): string =>
  consumerBody(titleId) + `process.stdout.write('<<RT>>' + JSON.stringify(report()) + '<<RT>>');\n`;
const compileMain = (titleId: string): string =>
  consumerBody(titleId) +
  `import {getRunTypeId} from '@mionjs/run-types';
type Tag = {label: string; day: string};
const staticId = getRunTypeId<Tag>();
const sample: Tag = {label: 'x', day: 'y'};
const valueId = getRunTypeId(sample);
process.stdout.write('<<RT>>' + JSON.stringify({...report(), staticId, valueId}) + '<<RT>>');
`;

interface Report {
  stampId: string;
  deps: string[];
  result: string;
  isoDayDeps: string[];
  servedSlugifyCode: string;
  titleStillOwnedByText: boolean;
  staticId?: string;
  valueId?: string;
}

function link(from: string, to: string): void {
  fs.mkdirSync(path.dirname(from), {recursive: true});
  fs.symlinkSync(to, from, 'dir');
}

function runNode(file: string, cwd: string): Report {
  const stdout = execFileSync(process.execPath, [file], {cwd, encoding: 'utf8'});
  const payload = /<<RT>>(.*)<<RT>>/s.exec(stdout);
  expect(payload, `the program must print its result; got:\n${stdout}`).toBeTruthy();
  return JSON.parse(payload![1]) as Report;
}

function expectReport(result: Report): void {
  expect(result.deps).toHaveLength(1);
  expect(result.deps[0]).toMatch(/^@acme\/dates#/);
  // app → dates (served from src) → text (served from dist).
  expect(result.result).toBe('hello-world@2026-09-18');
  expect(result.isoDayDeps).toEqual([SLUGIFY_ID]);
  // The body came from the artifact, not a runtime registration.
  expect(result.servedSlugifyCode).toContain('toLowerCase');
}

// With every library import dropped by the emit, what the registry holds is
// what the build served: the src-extracted isoDay with its lowered dep, and
// nothing for title, which no pure fn demanded.
function expectOnlyServedBodies(result: Report): void {
  expect(result.titleStillOwnedByText).toBe(false);
}

interface ArtifactIndex {
  format: number;
  package: string;
  pureFns: {id: string; bindingName?: string; file?: string}[];
}

function readIndex(dir: string): ArtifactIndex {
  return JSON.parse(fs.readFileSync(path.join(dir, PURE_FN_ARTIFACT_DIR, PURE_FN_ARTIFACT_INDEX), 'utf8')) as ArtifactIndex;
}

// The same path the module has under `<genDir>/types/pf/`.
function modulePath(id: string): string {
  const [pkg, hash] = id.split(PURE_FN_HASH_PREFIX);
  return path.join(...pkg.split('/'), `${hash}.js`);
}

function readModule(dir: string, id: string): string {
  return fs.readFileSync(path.join(dir, PURE_FN_ARTIFACT_DIR, modulePath(id)), 'utf8');
}

// A consumer is a package of its own and ships its artifact the same way.
function expectOwnArtifact(app: string, name: string): {id: string; bindingName?: string; file?: string} {
  const dist = path.join(app, 'dist');
  const own = readIndex(dist);
  expect(own.package).toBe(name);
  expect(own.pureFns.map((row) => row.bindingName)).toEqual(['stamp']);
  const [row] = own.pureFns;
  expect(readModule(dist, row.id)).toBe(fs.readFileSync(path.join(app, '.mion', 'types', 'pf', modulePath(row.id)), 'utf8'));
  return row;
}

function textIds(): {slugify: string; title: string} {
  const index = readIndex(path.join(TEXT_DIR, 'dist'));
  const byName = Object.fromEntries(index.pureFns.map((row) => [row.bindingName, row.id]));
  expect(byName).toEqual({slugify: expect.stringMatching(ID_PATTERN), title: expect.stringMatching(ID_PATTERN)});
  return byName as {slugify: string; title: string};
}
let SLUGIFY_ID = '';

function writeApp(name: string, mainRel: string, main: string, include: string[], rootDir?: string): string {
  const dir = path.join(BASE, name);
  fs.mkdirSync(path.dirname(path.join(dir, mainRel)), {recursive: true});
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({name: `@acme/${name}`, private: true, type: 'module'}));
  fs.writeFileSync(path.join(dir, 'tsconfig.json'), tsconfig(include, rootDir));
  fs.writeFileSync(path.join(dir, mainRel), main);
  link(path.join(dir, 'node_modules', '@mionjs', 'run-types'), CORE_PKG_DIR);
  link(path.join(dir, 'node_modules', '@acme', 'text'), TEXT_DIR);
  link(path.join(dir, 'node_modules', '@acme', 'dates'), DATES_DIR);
  link(path.join(dir, 'node_modules', '@acme', 'legacy'), LEGACY_DIR);
  return dir;
}

const callHook = (hook: any, thisArg: unknown, ...args: unknown[]): unknown =>
  typeof hook === 'function' ? hook.apply(thisArg, args) : hook.handler.apply(thisArg, args);

describe('pure fns served across packages: dist lane, src lane, and the unbuilt package that fails', () => {
  const register = hasBinary() ? it : it.skip;

  beforeAll(async () => {
    BASE = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-package-purefns-e2e-'));
    TEXT_DIR = path.join(BASE, 'lib-text');
    DATES_DIR = path.join(BASE, 'lib-dates');
    LEGACY_DIR = path.join(BASE, 'lib-legacy');

    // @acme/text, built for real: esbuild bundles the transformed source and
    // the generated pure-fn modules into ONE dist file.
    fs.mkdirSync(path.join(TEXT_DIR, 'src'), {recursive: true});
    fs.mkdirSync(path.join(TEXT_DIR, 'dist'), {recursive: true});
    fs.writeFileSync(path.join(TEXT_DIR, 'package.json'), libManifest('@acme/text'));
    fs.writeFileSync(path.join(TEXT_DIR, 'tsconfig.json'), tsconfig(['src'], 'src'));
    fs.writeFileSync(path.join(TEXT_DIR, 'src', 'index.ts'), TEXT_SRC);
    fs.writeFileSync(path.join(TEXT_DIR, 'dist', 'index.d.ts'), TEXT_DTS);
    link(path.join(TEXT_DIR, 'node_modules', '@mionjs', 'run-types'), CORE_PKG_DIR);
    if (hasBinary()) {
      await esbuild.build({
        entryPoints: [path.join(TEXT_DIR, 'src', 'index.ts')],
        outfile: path.join(TEXT_DIR, 'dist', 'index.js'),
        bundle: true,
        format: 'esm',
        platform: 'neutral',
        external: ['@mionjs/run-types'],
        logLevel: 'silent',
        plugins: [runtypesEsbuild({binary: BIN, cwd: TEXT_DIR, tsconfig: 'tsconfig.json', genDir: path.join(TEXT_DIR, '.mion')})],
      });
      // The generated dir is a build scratch, not part of what ships.
      fs.rmSync(path.join(TEXT_DIR, '.mion'), {recursive: true, force: true});
      // From here on the artifact is the only place the bodies exist.
      fs.writeFileSync(path.join(TEXT_DIR, 'dist', 'index.js'), TEXT_HOLLOW);
    }

    // @acme/dates: tsc-style dist + src, with its own nested @acme/text.
    fs.mkdirSync(path.join(DATES_DIR, 'src'), {recursive: true});
    fs.mkdirSync(path.join(DATES_DIR, 'dist'), {recursive: true});
    fs.writeFileSync(path.join(DATES_DIR, 'package.json'), libManifest('@acme/dates'));
    fs.writeFileSync(path.join(DATES_DIR, 'src', 'index.ts'), DATES_SRC);
    fs.writeFileSync(path.join(DATES_DIR, 'dist', 'index.js'), DATES_DIST);
    fs.writeFileSync(path.join(DATES_DIR, 'dist', 'index.d.ts'), DATES_DTS);
    link(path.join(DATES_DIR, 'node_modules', '@mionjs', 'run-types'), CORE_PKG_DIR);
    link(path.join(DATES_DIR, 'node_modules', '@acme', 'text'), TEXT_DIR);

    // @acme/legacy: runtime registration only.
    fs.mkdirSync(LEGACY_DIR, {recursive: true});
    fs.writeFileSync(
      path.join(LEGACY_DIR, 'package.json'),
      JSON.stringify({name: '@acme/legacy', version: '0.0.0', type: 'module', types: './index.d.ts', main: './index.js'})
    );
    fs.writeFileSync(path.join(LEGACY_DIR, 'index.js'), LEGACY_JS);
    fs.writeFileSync(path.join(LEGACY_DIR, 'index.d.ts'), LEGACY_DTS);
    // Every library resolves its own deps from its real location, as an
    // installed package does.
    link(path.join(LEGACY_DIR, 'node_modules', '@mionjs', 'run-types'), CORE_PKG_DIR);
  });
  afterAll(() => fs.rmSync(BASE, {recursive: true, force: true}));

  register('the library built with the plugin ships its pure fns in mion-pure-fns/ next to the bundle', () => {
    const {slugify, title} = textIds();
    SLUGIFY_ID = slugify;
    expect(slugify).not.toBe(title);
    const dist = path.join(TEXT_DIR, 'dist');
    const index = readIndex(dist);
    expect(index.format).toBe(1);
    expect(index.package).toBe('@acme/text');
    expect(index.pureFns.map((row) => row.id)).toEqual([slugify, title].sort());
    for (const row of index.pureFns) expect(row.file).toBe('src/index.ts');
    // One cache module per id, the build's own: the body, the lowered dep.
    expect(readModule(dist, slugify)).toContain('toLowerCase');
    const titleModule = readModule(dist, title);
    expect(titleModule).toContain(String.raw`getPureFn(\'${slugify}\')`);
    expect(titleModule).toContain(`'${title}'`);
    expect(fs.readdirSync(path.join(dist, PURE_FN_ARTIFACT_DIR)).sort()).toEqual(['@acme', PURE_FN_ARTIFACT_INDEX]);
    // The bundle holds nothing to read: hollow registrations, no tuple, no id.
    const bundle = fs.readFileSync(path.join(dist, 'index.js'), 'utf8');
    expect(bundle).not.toContain('[2,');
    expect(bundle).not.toContain('#pf_');
  });

  register('app-vite: the plugin serves dates from src and text from dist', async () => {
    const main = viteMain(textIds().title);
    const app = writeApp('app-vite', 'main.ts', main, ['*.ts']);
    const warnings: string[] = [];
    const ctx = {
      error(message: string): never {
        throw new Error(message);
      },
      warn(message: unknown): void {
        warnings.push(typeof message === 'string' ? message : String((message as {message?: string}).message ?? message));
      },
    };
    const plugin = runtypesRollup({binary: BIN, cwd: app, tsconfig: 'tsconfig.json', genDir: path.join(app, '.mion')}) as any;
    let code = '';
    try {
      await callHook(plugin.buildStart, ctx);
      const transformed = (await callHook(plugin.transform, ctx, main, path.join(app, 'main.ts'))) as {code: string} | null;
      expect(transformed, 'the consumer must be transformed').toBeTruthy();
      code = transformed!.code;
      // The consumer is a package of its own and ships its artifact the same way.
      await callHook(plugin.writeBundle, ctx, {dir: path.join(app, 'dist')});
    } finally {
      try {
        await callHook(plugin.buildEnd, ctx);
      } catch {
        // best-effort teardown
      }
    }
    expect(warnings.filter((line) => /PFE901[236]/.test(line))).toEqual([]);

    // Both library bodies were emitted into the consumer's OWN modules, one per
    // id under the owning package's dir: isoDay, and the slugify it reaches (never
    // title, which nothing demanded).
    const pf = path.join(app, '.mion', 'types', 'pf');
    const datesModules = fs.readdirSync(path.join(pf, '@acme', 'dates'));
    expect(datesModules).toHaveLength(1);
    const isoDayModule = fs.readFileSync(path.join(pf, '@acme', 'dates', datesModules[0]), 'utf8');
    expect(isoDayModule).toContain(String.raw`getPureFn(\'${SLUGIFY_ID}\')`);
    expect(fs.readdirSync(path.join(pf, '@acme', 'text'))).toEqual([SLUGIFY_ID.split('#pf_')[1] + '.js']);

    expectOwnArtifact(app, '@acme/app-vite');

    fs.writeFileSync(path.join(app, 'main.mjs'), code);
    expectReport(runNode(path.join(app, 'main.mjs'), app));
  });

  register('app-compile: `mion compile` serves the same bodies and the program runs', () => {
    const app = writeApp('app-compile', path.join('src', 'main.ts'), compileMain(textIds().title), ['src'], 'src');
    const run = runCli(['compile', '--cwd', app, '--tsconfig', 'tsconfig.json', '--gen-dir', path.join(app, '.mion')], {
      label: 'package-purefns-compile',
    });
    expect(run.status, run.report).toBe(0);
    expect(run.stderr).not.toContain('PFE9016');

    const pf = path.join(app, '.mion', 'types', 'pf');
    expect(fs.readdirSync(path.join(pf, '@acme', 'dates'))).toHaveLength(1);
    expect(fs.readdirSync(path.join(pf, '@acme', 'text'))).toEqual([SLUGIFY_ID.split('#pf_')[1] + '.js']);

    // The compile lane writes the consumer's own artifact into its outDir.
    expect(expectOwnArtifact(app, '@acme/app-compile').file).toBe('src/main.ts');

    const emitted = fs.readFileSync(path.join(app, 'dist', 'main.js'), 'utf8');
    expect(emitted).not.toContain("from '@acme/dates'");
    const result = runNode(path.join(app, 'dist', 'main.js'), app);
    expectReport(result);
    expectOnlyServedBodies(result);
    // Marker coverage rule: both getRunTypeId shapes name one runtype.
    expect(result.staticId).toBeTruthy();
    expect(result.valueId).toBe(result.staticId);
  });

  register('app-legacy: a dep on a package that ships no compiled pure fns fails the plugin build', async () => {
    const app = writeApp('app-legacy', 'main.ts', legacyMain, ['*.ts']);
    const warnings: string[] = [];
    const ctx = {
      error(message: string): never {
        throw new Error(message);
      },
      warn(message: unknown): void {
        warnings.push(typeof message === 'string' ? message : String((message as {message?: string}).message ?? message));
      },
    };
    const plugin = runtypesRollup({binary: BIN, cwd: app, tsconfig: 'tsconfig.json', genDir: path.join(app, '.mion')}) as any;
    let halted = '';
    try {
      await callHook(plugin.buildStart, ctx);
      await callHook(plugin.transform, ctx, legacyMain, path.join(app, 'main.ts'));
    } catch (error) {
      halted = String((error as Error).message);
    } finally {
      try {
        await callHook(plugin.buildEnd, ctx);
      } catch {
        // best-effort teardown
      }
    }
    expect(halted, warnings.join('\n')).toContain('build halted');
    const unbuilt = warnings.filter((line) => line.includes('PFE9016'));
    expect(unbuilt, warnings.join('\n')).toHaveLength(1);
    expect(unbuilt[0]).toContain('error PFE9016');
    expect(unbuilt[0]).toContain(PAD_ID);
    expect(unbuilt[0]).toContain('@acme/legacy');
  });

  register('app-legacy-compile: `mion compile` fails the same way', () => {
    const app = writeApp('app-legacy-compile', path.join('src', 'main.ts'), legacyMain, ['src'], 'src');
    const run = runCli(['compile', '--cwd', app, '--tsconfig', 'tsconfig.json', '--gen-dir', path.join(app, '.mion')], {
      label: 'package-purefns-legacy-compile',
    });
    expect(run.status, run.report).not.toBe(0);
    const unbuilt = run.stderr.split('\n').filter((line) => line.includes('PFE9016'));
    expect(unbuilt, run.stderr).toHaveLength(1);
    expect(unbuilt[0]).toContain(PAD_ID);
    expect(unbuilt[0]).toContain('@acme/legacy');
  });
});
