// Every bundler adapter writes the package's pure-fn artifact,
// `mion-pure-fns.json`, into ITS OWN output directory once the bundle is on
// disk, so `files: ["dist"]` publishes it and a consumer's compiler serves the
// package's pure fns from it. Two real builds (vite lib mode, esbuild) prove the
// file lands where the bundle does; the other hosts are driven through the
// shape unplugin hands them (rollup's writeBundle options, webpack's compiler,
// bun's build object), since those bundlers are not workspace dependencies.
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {build, createBuilder} from 'vite';
import * as esbuild from 'esbuild';
import type {UnpluginContextMeta} from 'unplugin';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {unplugin} from '../src/core/unplugin.ts';
import runtypesVite from '../src/runtypes/vite.ts';
import runtypesEsbuild from '../src/runtypes/esbuild.ts';
import {PURE_FN_ARTIFACT_FILE} from '../src/core/go-generated/runtypes-constants.generated.ts';
import {BIN, hasBinary} from './helpers/inline.ts';

const MARKER_PKG = path.resolve(__dirname, '../../run-types');

interface Artifact {
  format: number;
  package: string;
  pureFns: {id: string; bindingName?: string; file?: string; code: string; pureFnDependencies: string[]}[];
}

const LIB_SRC = `import {registerPureFn, registerPureFnFactory} from '@mionjs/run-types';
export const slugify = registerPureFn((s: string): string => s.trim().toLowerCase());
export const title = registerPureFnFactory(function (utl) {
  return function _title(s: string): string { return utl.getPureFn(slugify)(s) + '!'; };
});
`;
const NO_PURE_FN_SRC = `import {getRunTypeId} from '@mionjs/run-types';
export const id = getRunTypeId<{a: number}>();
`;

let BASE = '';

// A library project a build can run over: named, so its ids have an owner.
function writeProject(name: string, source: string): string {
  const root = path.join(BASE, name);
  fs.mkdirSync(path.join(root, 'src'), {recursive: true});
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({name: `@acme/${name}`, type: 'module'}));
  fs.writeFileSync(
    path.join(root, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'bundler',
        strict: true,
        skipLibCheck: true,
        types: [],
      },
      include: ['src'],
    })
  );
  fs.writeFileSync(path.join(root, 'src', 'index.ts'), source);
  const scope = path.join(root, 'node_modules', '@mionjs');
  fs.mkdirSync(scope, {recursive: true});
  fs.symlinkSync(MARKER_PKG, path.join(scope, 'run-types'), 'dir');
  return root;
}

function readArtifact(dir: string): Artifact {
  return JSON.parse(fs.readFileSync(path.join(dir, PURE_FN_ARTIFACT_FILE), 'utf8')) as Artifact;
}

function expectLibArtifact(dir: string, name: string): void {
  const artifact = readArtifact(dir);
  expect(artifact.format).toBe(1);
  expect(artifact.package).toBe(`@acme/${name}`);
  expect(artifact.pureFns.map((row) => row.bindingName).sort()).toEqual(['slugify', 'title']);
  for (const row of artifact.pureFns) {
    expect(row.id).toMatch(new RegExp(`^@acme/${name}#pf_[A-Za-z0-9_-]{14}$`));
    expect(row.file).toBe('src/index.ts');
  }
}

const pluginOptions = (root: string) => ({binary: BIN, cwd: root, tsconfig: 'tsconfig.json', genDir: path.join(root, '.mion')});

// The raw unplugin options object, the shape every host is handed: its
// per-bundler escape hatches are what the fake hosts below call.
function rawPlugin(root: string): any {
  const raw = unplugin.raw(pluginOptions(root), {framework: 'webpack', versions: {}} as UnpluginContextMeta);
  return Array.isArray(raw) ? raw[0] : raw;
}

const ctx = {
  error(message: string): never {
    throw new Error(message);
  },
  warn(): void {},
};

const callHook = (hook: any, thisArg: unknown, ...args: unknown[]): unknown =>
  typeof hook === 'function' ? hook.apply(thisArg, args) : hook.handler.apply(thisArg, args);

async function withStarted(plugin: any, body: () => Promise<void>): Promise<void> {
  await callHook(plugin.buildStart, ctx);
  try {
    await body();
  } finally {
    try {
      await callHook(plugin.buildEnd, ctx);
    } catch {
      // best-effort teardown
    }
  }
}

describe('the pure-fn artifact lands in every bundler output dir', () => {
  const register = hasBinary() ? it : it.skip;

  beforeAll(() => {
    BASE = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-pure-fn-artifact-'));
  });
  afterAll(() => fs.rmSync(BASE, {recursive: true, force: true}));

  register(
    'vite lib mode: next to the bundle in build.outDir',
    async () => {
      const root = writeProject('vite-lib', LIB_SRC);
      const outDir = path.join(root, 'dist');
      await build({
        root,
        configFile: false,
        logLevel: 'error',
        plugins: [runtypesVite(pluginOptions(root)) as never],
        build: {
          outDir,
          minify: false,
          lib: {entry: path.join(root, 'src/index.ts'), formats: ['es'], fileName: 'index'},
          rollupOptions: {external: ['@mionjs/run-types']},
        },
      });
      expect(fs.existsSync(path.join(outDir, 'index.js'))).toBe(true);
      expectLibArtifact(outDir, 'vite-lib');
    },
    120_000
  );

  register(
    'vite app build with several environments: one copy per output dir',
    async () => {
      const root = writeProject('vite-app', LIB_SRC);
      const builder = await createBuilder({
        root,
        configFile: false,
        logLevel: 'error',
        plugins: [runtypesVite(pluginOptions(root)) as never],
        builder: {},
        build: {minify: false, rollupOptions: {external: ['@mionjs/run-types']}},
        environments: {
          client: {
            build: {
              outDir: path.join(root, 'dist/client'),
              lib: {entry: path.join(root, 'src/index.ts'), formats: ['es'], fileName: 'index'},
            },
          },
          ssr: {build: {outDir: path.join(root, 'dist/server'), ssr: path.join(root, 'src/index.ts')}},
        },
      });
      await builder.buildApp();
      expectLibArtifact(path.join(root, 'dist/client'), 'vite-app');
      expectLibArtifact(path.join(root, 'dist/server'), 'vite-app');
    },
    120_000
  );

  register(
    'esbuild: next to the bundle for outdir and for outfile',
    async () => {
      const root = writeProject('esbuild-lib', LIB_SRC);
      const common = {
        entryPoints: [path.join(root, 'src/index.ts')],
        bundle: true,
        format: 'esm' as const,
        platform: 'neutral' as const,
        external: ['@mionjs/run-types'],
        logLevel: 'silent' as const,
        absWorkingDir: root,
        plugins: [runtypesEsbuild(pluginOptions(root))],
      };
      await esbuild.build({...common, outdir: 'dist/esm'});
      expectLibArtifact(path.join(root, 'dist/esm'), 'esbuild-lib');
      await esbuild.build({...common, outfile: 'dist/bundle/index.js'});
      expectLibArtifact(path.join(root, 'dist/bundle'), 'esbuild-lib');
    },
    120_000
  );

  register(
    'rollup and rolldown: writeBundle places it by output.dir or beside output.file',
    async () => {
      const root = writeProject('rollup-lib', LIB_SRC);
      const plugin = rawPlugin(root);
      await withStarted(plugin, async () => {
        await plugin.rollup.writeBundle.call(ctx, {dir: path.join(root, 'dist/esm')});
        expectLibArtifact(path.join(root, 'dist/esm'), 'rollup-lib');
        await plugin.rolldown.writeBundle.call(ctx, {file: path.join(root, 'dist/cjs/index.cjs')});
        expectLibArtifact(path.join(root, 'dist/cjs'), 'rollup-lib');
      });
    },
    120_000
  );

  register(
    'webpack and rspack: afterEmit places it in output.path',
    async () => {
      const root = writeProject('webpack-lib', LIB_SRC);
      const plugin = rawPlugin(root);
      const fakeCompiler = (outputPath: string) => {
        let afterEmit: (() => Promise<void>) | undefined;
        return {
          compiler: {
            options: {output: {path: outputPath}},
            hooks: {afterEmit: {tapPromise: (_name: string, fn: () => Promise<void>) => void (afterEmit = fn)}},
          },
          emit: () => afterEmit!(),
        };
      };
      await withStarted(plugin, async () => {
        const webpack = fakeCompiler(path.join(root, 'dist/webpack'));
        plugin.webpack(webpack.compiler);
        await webpack.emit();
        expectLibArtifact(path.join(root, 'dist/webpack'), 'webpack-lib');
        const rspack = fakeCompiler(path.join(root, 'dist/rspack'));
        plugin.rspack(rspack.compiler);
        await rspack.emit();
        expectLibArtifact(path.join(root, 'dist/rspack'), 'webpack-lib');
      });
    },
    120_000
  );

  register(
    'bun: the bundler host writes it into config.outdir; the runtime loader writes nothing',
    async () => {
      const root = writeProject('bun-lib', LIB_SRC);
      const plugin = rawPlugin(root);
      await withStarted(plugin, async () => {
        let onEnd: (() => Promise<void>) | undefined;
        plugin.bun.setup({config: {outdir: path.join(root, 'dist/bun')}, onEnd: (fn: () => Promise<void>) => void (onEnd = fn)});
        expect(onEnd).toBeTruthy();
        await onEnd!();
        expectLibArtifact(path.join(root, 'dist/bun'), 'bun-lib');
        // `Bun.plugin()` from a preload: no bundle, no onEnd, and no throw.
        plugin.bun.setup({});
      });
    },
    120_000
  );

  register(
    'a package with no pure fn gets no file, and a stale one is removed',
    async () => {
      const root = writeProject('no-pure-fns', NO_PURE_FN_SRC);
      const outDir = path.join(root, 'dist');
      fs.mkdirSync(outDir, {recursive: true});
      fs.writeFileSync(path.join(outDir, PURE_FN_ARTIFACT_FILE), '{"format":1,"package":"@acme/no-pure-fns","pureFns":[]}\n');
      const plugin = rawPlugin(root);
      await withStarted(plugin, async () => {
        await plugin.rollup.writeBundle.call(ctx, {dir: outDir});
      });
      expect(fs.existsSync(path.join(outDir, PURE_FN_ARTIFACT_FILE))).toBe(false);
    },
    120_000
  );
});
