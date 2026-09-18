// Full runtime e2e for pure functions served ACROSS PACKAGES: a consumer's pure
// fn imports ids from installed libraries, and the build reads each library's
// pure-fn bodies straight from what that library ships, with no artifact
// beyond its built files.
//
// Three libraries, three lanes:
//   - @acme/text   — built for real (esbuild + the runtypes esbuild adapter), so
//                    its dist bundle carries the entry tuples: the DIST lane.
//   - @acme/dates  — a plain tsc-style emit (no tuples) plus its TypeScript
//                    under src/, and its own nested copy of @acme/text: the SRC
//                    lane, with a cross-package dep resolved from its own root.
//   - @acme/legacy — hand-written JS registering a live function at load, no
//                    tuple, no src: the runtime-only lane the build reports.
//
// Two consumers over one node_modules tree:
//   - app-vite    — through the plugin (Rollup adapter): the rewritten consumer
//                   and the generated modules are written to disk and run under
//                   plain node.
//   - app-compile — through `mion compile`, the same sources, then run.
//
// Both print JSON from a fresh Node process, so what is asserted is what a
// user's program would see at runtime.
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import * as esbuild from 'esbuild';
import runtypesEsbuild from '../../../devtools/src/runtypes/esbuild.ts';
import runtypesRollup from '../../../devtools/src/runtypes/rollup.ts';
import {BIN, hasBinary} from '../../../devtools/test/helpers/inline.ts';
import {runCli} from '../../../devtools/test/helpers/cliCrash.ts';

// packages/run-types — the real @mionjs/run-types every fixture symlinks in.
const CORE_PKG_DIR = fileURLToPath(new URL('../..', import.meta.url));

// An id is the package plus a hash of the body that ships, so the ids of the
// two built libraries are only known once they are built (read off the dist
// and the registry); only the runtime-only package writes its own.
const PAD_ID = '@acme/legacy#pad00000000000';
const ID_PATTERN = /^@acme\/[a-z]+#[A-Za-z0-9_-]{14}$/;

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
const TEXT_SRC = `import {registerPureFn, registerPureFnFactory} from '@mionjs/run-types';
export const slugify = registerPureFn((s: string): string => s.trim().toLowerCase().replace(/\\s+/g, '-'));
export const title = registerPureFnFactory(function (utl) {
  return function _title(s: string): string { return utl.getPureFn(slugify)(s) + '!'; };
});
`;
const TEXT_DTS = `import type {PureFnId} from '@mionjs/run-types';
export declare const slugify: PureFnId<string>;
export declare const title: PureFnId<string>;
`;

// @acme/dates ships the way run-types does: a hollowed dist (the registration
// keeps no body and no id, nothing in it is a tuple) plus src/, where the
// registration is extracted from with its dep on the nested @acme/text.
const DATES_SRC = `import {registerPureFnFactory} from '@mionjs/run-types';
import {slugify} from '@acme/text';
export const isoDay = registerPureFnFactory(function (utl) {
  return function _isoDay(label: string, day: string): string { return utl.getPureFn(slugify)(label) + '@' + day.slice(0, 10); };
});
`;
const DATES_DIST = `import {registerPureFnFactory} from '@mionjs/run-types';
export const isoDay = registerPureFnFactory(null);
`;
const DATES_DTS = `import type {PureFnId} from '@mionjs/run-types';
export declare const isoDay: PureFnId<string>;
`;

// @acme/legacy: registered at load only; the .d.ts carries the literal so a
// consumer's build can name the edge it cannot serve.
const LEGACY_JS = `import {registerPureFn} from '@mionjs/run-types';
export const padId = registerPureFn(function (n) { return String(n).padStart(4, '0'); }, '${PAD_ID}');
`;
const LEGACY_DTS = `import type {PureFnId} from '@mionjs/run-types';
export declare const padId: PureFnId<'${PAD_ID}'>;
`;

// The consumer body: one pure fn reaching all three libraries. Annotation-free
// so the plugin's rewritten output runs as plain ESM; the compile lane adds
// the typed marker pair on top.
//
// The lowered ids leave the imported bindings unused, so a TypeScript emit
// drops those imports and no library module loads on its own: the served
// bodies are all the program has, except for the runtime-only package, which
// the consumer must load for its side effect (what PFE9016 asks for).
const consumerBody = (titleId: string): string => `import {registerPureFnFactory, getRTUtils} from '@mionjs/run-types';
import {isoDay} from '@acme/dates';
import {padId} from '@acme/legacy';
import '@acme/legacy';

export const stamp = registerPureFnFactory(function (utl) {
  return function _stamp(label, day, n) { return utl.getPureFn(isoDay)(label, day) + '#' + utl.getPureFn(padId)(n); };
});

export const report = () => {
  const utl = getRTUtils();
  const deps = utl.getCompiledPureFnByKey(stamp).pureFnDependencies;
  const isoDayDeps = utl.getCompiledPureFnByKey(deps[0]).pureFnDependencies;
  return {
    stampId: stamp,
    deps,
    result: utl.getPureFnByKey(stamp)('Hello World', '2026-09-18T10:00:00Z', 7),
    isoDayDeps,
    servedSlugifyCode: utl.getCompiledPureFnByKey(isoDayDeps[0]).code,
    titleStillOwnedByText: utl.hasPureFnByKey('${titleId}'),
  };
};
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
  expect(result.deps).toHaveLength(2);
  expect(result.deps[0]).toMatch(/^@acme\/dates#/);
  expect(result.deps[1]).toBe(PAD_ID);
  // app → dates (served from src) → text (served from dist) → legacy (runtime).
  expect(result.result).toBe('hello-world@2026-09-18#0007');
  expect(result.isoDayDeps).toEqual([SLUGIFY_ID]);
  // The body came from the built dist, not a runtime registration.
  expect(result.servedSlugifyCode).toContain('toLowerCase');
}

// With every library import dropped by the emit, what the registry holds is
// what the build served: the src-extracted isoDay with its lowered dep, and
// nothing for title, which no pure fn demanded.
function expectOnlyServedBodies(result: Report): void {
  expect(result.titleStillOwnedByText).toBe(false);
}

// The two ids the text build wrote, read off its dist: the registration sites
// carry them as the registrar's trailing argument (esbuild double-quotes).
function textIds(): {slugify: string; title: string} {
  const dist = fs.readFileSync(path.join(TEXT_DIR, 'dist', 'index.js'), 'utf8');
  const ids = [
    ...dist.matchAll(/(slugify|title)\d* = registerPureFn\w*\(\s*__rt_pf[A-Za-z0-9_$]*,\s*"(@acme\/text#[A-Za-z0-9_-]{14})"\)/g),
  ];
  const byName = Object.fromEntries(ids.map((match) => [match[1], match[2]]));
  expect(byName, dist).toEqual({slugify: expect.stringMatching(ID_PATTERN), title: expect.stringMatching(ID_PATTERN)});
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

describe('pure fns served across packages: dist lane, src lane and the runtime-only lane', () => {
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

  register('the library built with the plugin ships its tuples in one dist file', () => {
    const {slugify, title} = textIds();
    SLUGIFY_ID = slugify;
    const dist = fs.readFileSync(path.join(TEXT_DIR, 'dist', 'index.js'), 'utf8');
    // The tuples sit next to the registrations, ids in their key slot; the
    // scan keys on shape, not on quotes or names.
    expect(dist).toContain(`[2,`);
    expect(dist).toContain(`"${title}"`);
    expect(slugify).not.toBe(title);
  });

  register('app-vite: the plugin serves dates from src, text from dist, and reports legacy', async () => {
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
    } finally {
      try {
        await callHook(plugin.buildEnd, ctx);
      } catch {
        // best-effort teardown
      }
    }
    // The build said what it could not serve, once, naming the id and the package.
    const unbuilt = warnings.filter((line) => line.includes('PFE9016'));
    expect(unbuilt, warnings.join('\n')).toHaveLength(1);
    expect(unbuilt[0]).toContain(PAD_ID);
    expect(unbuilt[0]).toContain('@acme/legacy');
    expect(warnings.filter((line) => line.includes('PFE9012') || line.includes('PFE9013'))).toEqual([]);

    // Both library bodies were emitted into the consumer's OWN modules, one per
    // id under the owning package's dir: isoDay, and the slugify it reaches (never
    // title, which nothing demanded).
    const pf = path.join(app, '.mion', 'types', 'pf');
    const datesModules = fs.readdirSync(path.join(pf, '@acme', 'dates'));
    expect(datesModules).toHaveLength(1);
    const isoDayModule = fs.readFileSync(path.join(pf, '@acme', 'dates', datesModules[0]), 'utf8');
    expect(isoDayModule).toContain(String.raw`getPureFn(\'${SLUGIFY_ID}\')`);
    expect(fs.readdirSync(path.join(pf, '@acme', 'text'))).toEqual([SLUGIFY_ID.split('#')[1] + '.js']);

    fs.writeFileSync(path.join(app, 'main.mjs'), code);
    expectReport(runNode(path.join(app, 'main.mjs'), app));
  });

  register('app-compile: `mion compile` serves the same bodies and the program runs', () => {
    const app = writeApp('app-compile', path.join('src', 'main.ts'), compileMain(textIds().title), ['src'], 'src');
    const run = runCli(['compile', '--cwd', app, '--tsconfig', 'tsconfig.json', '--gen-dir', path.join(app, '.mion')], {
      label: 'package-purefns-compile',
    });
    expect(run.status, run.report).toBe(0);
    const unbuilt = run.stderr.split('\n').filter((line) => line.includes('PFE9016'));
    expect(unbuilt, run.stderr).toHaveLength(1);
    expect(unbuilt[0]).toContain(PAD_ID);

    const pf = path.join(app, '.mion', 'types', 'pf');
    expect(fs.readdirSync(path.join(pf, '@acme', 'dates'))).toHaveLength(1);
    expect(fs.readdirSync(path.join(pf, '@acme', 'text'))).toEqual([SLUGIFY_ID.split('#')[1] + '.js']);

    const emitted = fs.readFileSync(path.join(app, 'dist', 'main.js'), 'utf8');
    expect(emitted).not.toContain("from '@acme/dates'");
    expect(emitted).toContain("import '@acme/legacy'");
    const result = runNode(path.join(app, 'dist', 'main.js'), app);
    expectReport(result);
    expectOnlyServedBodies(result);
    // Marker coverage rule: both getRunTypeId shapes name one runtype.
    expect(result.staticId).toBeTruthy();
    expect(result.valueId).toBe(result.staticId);
  });
});
