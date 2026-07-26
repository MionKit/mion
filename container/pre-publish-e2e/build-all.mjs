// Builds every bundler app in the pre-publish e2e feature matrix. Each app is
// its own build root: the bundler transforms the SHARED source (apps/shared) +
// the app entry through that bundler's @ts-runtypes/devtools adapter, emitting to
// apps/<name>/dist. @ts-runtypes/core is EXTERNAL in every app (a real consumer
// imports it; only first-party source is transformed by the RT plugin — bundling
// the marker package would make the plugin choke on files not in its program).
//
// Drive: `node build-all.mjs [appName…]` (default: all). In-container the RT
// plugin resolves the host binary via the published @ts-runtypes/bin launcher
// (no binary option); set RT_E2E_BINARY=<abs path> for host iteration.
import {execFileSync} from 'node:child_process';
import {rmSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APPS = path.join(HERE, 'apps');
const CORE_EXTERNAL = /^@ts-runtypes\/core(\/.*)?$/;

// Enrichment preflight — AUTOGENERATE the shared app's FriendlyText/MockData
// mirrors via the PUBLISHED `ts-runtypes` CLI before any app that imports them
// builds. In a real project these mirrors are committed; this fixture regenerates
// them each run (they're gitignored — see the CLI-created src/__runtypes tree)
// so the e2e exercises the generator + its `enrich --no-emit` validator against the
// published package. Uses the launcher (@ts-runtypes/bin's ts-runtypes-bin);
// RT_E2E_BINARY overrides it for host iteration.
function ensureEnrichment() {
  const sharedDir = path.join(APPS, 'shared');
  const rtCli = process.env.RT_E2E_BINARY || path.join(HERE, 'node_modules/.bin/ts-runtypes-bin');
  const model = 'src/models/enriched-user.ts';
  const genDir = path.join(sharedDir, 'src/__runtypes/enriched');
  for (const sub of ['friendly', 'mock', 'i18n']) rmSync(path.join(genDir, sub), {recursive: true, force: true});
  const cli = (args) => execFileSync(rtCli, args, {cwd: sharedDir, stdio: 'inherit'});
  console.log('enrichment: `ts-runtypes enrich` (autogenerate FriendlyText + MockData mirrors)');
  cli(['enrich', model, 'EnrichedUser']);
  cli(['enrich', '--i18n', 'es', model]);
  console.log('enrichment: `ts-runtypes enrich --no-emit` (validate the generated mirrors)');
  cli(['enrich', '--no-emit']);
}

// Common RT plugin options for an app dir.
function rtOptions(appDir) {
  return {
    ...(process.env.RT_E2E_BINARY ? {binary: process.env.RT_E2E_BINARY} : {}),
    cwd: appDir,
    tsconfig: 'tsconfig.json',
    genDir: path.join(appDir, '.rt'),
  };
}

const isCore = (request) => CORE_EXTERNAL.test(request);

// ── the six apps ────────────────────────────────────────────────────────────
// build-vite carries the FULL feature matrix (imports the shared index); every
// light smoke imports apps/shared/src/minimal.ts.
const APP_LIST = [
  {name: 'build-vite', adapter: 'vite'},
  {name: 'smoke-esbuild', adapter: 'esbuild'},
  {name: 'smoke-rollup', adapter: 'rollup'},
  {name: 'smoke-rolldown', adapter: 'rolldown'},
  {name: 'smoke-webpack', adapter: 'webpack'},
  {name: 'smoke-rspack', adapter: 'rspack'},
  // Source-first consumer: customConditions:["source"] makes @ts-runtypes/core
  // resolve to its published src/, so the plugin's scan walks the library's own
  // internals. Guards the first-party diagnostic scoping — without it the build
  // halts on the library's own CTA001/CTA003 (docs/done/scan-diagnostics-marker-own-source.md).
  {name: 'smoke-source', adapter: 'esbuild'},
];

async function buildVite(app) {
  const {build} = await import('vite');
  const {default: runtypes} = await import('@ts-runtypes/devtools/vite');
  const appDir = path.join(APPS, app.name);
  await build({
    root: appDir,
    configFile: false,
    logLevel: 'warn',
    plugins: [runtypes(rtOptions(appDir))],
    build: {
      outDir: path.join(appDir, 'dist'),
      emptyOutDir: true,
      ssr: true,
      lib: {entry: path.join(appDir, 'src/entry.ts'), formats: ['es'], fileName: 'entry'},
      rollupOptions: {external: CORE_EXTERNAL},
      minify: false,
    },
    ssr: {external: ['@ts-runtypes/core']},
  });
}

async function buildRollup(app) {
  const {rollup} = await import('rollup');
  const {default: runtypes} = await import('@ts-runtypes/devtools/rollup');
  const {nodeResolve} = await import('@rollup/plugin-node-resolve');
  const {default: esbuild} = await import('rollup-plugin-esbuild');
  const appDir = path.join(APPS, app.name);
  const bundle = await rollup({
    input: path.join(appDir, 'src/entry.ts'),
    external: (id) => isCore(id),
    plugins: [runtypes(rtOptions(appDir)), nodeResolve({extensions: ['.ts', '.mjs', '.js']}), esbuild({target: 'es2022'})],
  });
  await bundle.write({dir: path.join(appDir, 'dist'), format: 'es', entryFileNames: 'entry.js'});
  await bundle.close();
}

async function buildRolldown(app) {
  const {rolldown} = await import('rolldown');
  const {default: runtypes} = await import('@ts-runtypes/devtools/rolldown');
  const appDir = path.join(APPS, app.name);
  const bundle = await rolldown({
    input: path.join(appDir, 'src/entry.ts'),
    external: CORE_EXTERNAL,
    plugins: [runtypes(rtOptions(appDir))],
  });
  await bundle.write({dir: path.join(appDir, 'dist'), format: 'es', entryFileNames: 'entry.js'});
  await bundle.close();
}

async function buildEsbuild(app) {
  const {build} = await import('esbuild');
  const {default: runtypes} = await import('@ts-runtypes/devtools/esbuild');
  const appDir = path.join(APPS, app.name);
  await build({
    entryPoints: [path.join(appDir, 'src/entry.ts')],
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node22',
    outfile: path.join(appDir, 'dist/entry.js'),
    external: ['@ts-runtypes/core', '@ts-runtypes/core/*'],
    plugins: [runtypes(rtOptions(appDir))],
    logLevel: 'warning',
  });
}

// webpack + rspack share the same config shape (rspack mirrors webpack). ESM
// output with @ts-runtypes/core kept as a runtime module external.
function webpackConfig(appDir, loader) {
  return {
    mode: 'production',
    target: 'node',
    entry: path.join(appDir, 'src/entry.ts'),
    experiments: {outputModule: true},
    externalsType: 'module',
    externals: [({request}, callback) => (request && isCore(request) ? callback(null, 'module ' + request) : callback())],
    output: {path: path.join(appDir, 'dist'), filename: 'entry.js', module: true, library: {type: 'module'}, chunkFormat: 'module'},
    resolve: {extensions: ['.ts', '.mjs', '.js']},
    optimization: {minimize: false},
    module: {rules: [{test: /\.ts$/, use: loader, exclude: /node_modules/}]},
  };
}

async function buildWebpack(app) {
  const {default: webpack} = await import('webpack');
  const {default: runtypes} = await import('@ts-runtypes/devtools/webpack');
  const appDir = path.join(APPS, app.name);
  const config = webpackConfig(appDir, {loader: 'esbuild-loader', options: {target: 'es2022'}});
  config.plugins = [runtypes(rtOptions(appDir))];
  await new Promise((resolve, reject) => {
    webpack(config, (err, stats) => {
      if (err) return reject(err);
      if (stats?.hasErrors()) return reject(new Error(stats.toString({colors: false, chunks: false})));
      resolve();
    });
  });
}

async function buildRspack(app) {
  const {rspack} = await import('@rspack/core');
  const {default: runtypes} = await import('@ts-runtypes/devtools/rspack');
  const appDir = path.join(APPS, app.name);
  // rspack transpiles TS via its builtin SWC loader — no extra loader dep.
  const config = webpackConfig(appDir, {loader: 'builtin:swc-loader', options: {jsc: {parser: {syntax: 'typescript'}, target: 'es2022'}}});
  config.plugins = [runtypes(rtOptions(appDir))];
  await new Promise((resolve, reject) => {
    rspack(config, (err, stats) => {
      if (err) return reject(err);
      if (stats?.hasErrors()) return reject(new Error(stats.toString({colors: false, chunks: false})));
      resolve();
    });
  });
}

const BUILDERS = {vite: buildVite, esbuild: buildEsbuild, rollup: buildRollup, rolldown: buildRolldown, webpack: buildWebpack, rspack: buildRspack};

async function main() {
  const requested = process.argv.slice(2);
  const apps = requested.length ? APP_LIST.filter((app) => requested.includes(app.name)) : APP_LIST;
  if (!apps.length) {
    console.error(`no matching apps. Available: ${APP_LIST.map((app) => app.name).join(', ')}`);
    process.exit(1);
  }
  // build-vite is the only app that imports the enrichment mirrors; regenerate
  // them first (the smokes use the lean subset and don't need them).
  if (apps.some((app) => app.name === 'build-vite')) ensureEnrichment();
  let failed = 0;
  for (const app of apps) {
    const started = process.hrtime.bigint();
    try {
      await BUILDERS[app.adapter](app);
      const ms = Number(process.hrtime.bigint() - started) / 1e6;
      console.log(`OK  ${app.name.padEnd(16)} (${app.adapter}) — ${ms.toFixed(0)}ms`);
    } catch (error) {
      failed += 1;
      console.error(`FAIL ${app.name} (${app.adapter}):\n${String(error?.stack ?? error).split('\n').slice(0, 8).join('\n')}`);
    }
  }
  if (failed) {
    console.error(`\n${failed} app(s) failed to build.`);
    process.exit(1);
  }
  console.log(`\nAll ${apps.length} app(s) built.`);
}

await main();
