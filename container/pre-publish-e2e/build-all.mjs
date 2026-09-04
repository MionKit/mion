// Builds every bundler app in the pre-publish e2e feature matrix. Each app is
// its own build root: the bundler transforms the SHARED source (apps/shared) +
// the app entry through that bundler's @mionjs/devtools adapter, emitting to
// apps/<name>/dist. @mionjs/run-types is EXTERNAL in every app (a real consumer
// imports it; only first-party source is transformed by the RT plugin — bundling
// the marker package would make the plugin choke on files not in its program).
//
// Drive: `node build-all.mjs [appName…]` (default: all). In-container the RT
// plugin resolves the host binary via the published @mionjs/bin-compiler launcher
// (no binary option); set MION_E2E_BINARY=<abs path> for host iteration.
import {execFileSync} from 'node:child_process';
import {existsSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APPS = path.join(HERE, 'apps');
const CORE_EXTERNAL = /^@mionjs\/run-types(\/.*)?$/;

// Enrichment preflight — AUTOGENERATE the shared app's FriendlyText/MockData
// mirrors via the PUBLISHED `mion` CLI before any app that imports them
// builds. In a real project these mirrors are committed; this fixture regenerates
// them each run (they're gitignored — see the CLI-created src/.mion tree)
// so the e2e exercises the generator + its `enrich --no-emit` validator against the
// published package. Uses the launcher (@mionjs/bin-compiler's `mion` command);
// MION_E2E_BINARY overrides it for host iteration.
function ensureEnrichment() {
  const sharedDir = path.join(APPS, 'shared');
  const rtCli = process.env.MION_E2E_BINARY || path.join(HERE, 'node_modules/.bin/mion');
  const model = 'src/models/enriched-user.ts';
  const genDir = path.join(sharedDir, 'src/.mion/enriched');
  for (const sub of ['friendly', 'mock', 'i18n']) rmSync(path.join(genDir, sub), {recursive: true, force: true});
  const cli = (args) => execFileSync(rtCli, args, {cwd: sharedDir, stdio: 'inherit'});
  console.log('enrichment: `mion enrich` (autogenerate FriendlyText + MockData mirrors)');
  cli(['enrich', model, 'EnrichedUser']);
  cli(['enrich', '--i18n', 'es', model]);
  console.log('enrichment: `mion enrich --no-emit` (validate the generated mirrors)');
  cli(['enrich', '--no-emit']);
}

// Common RT plugin options for an app dir.
function rtOptions(appDir) {
  return {
    ...(process.env.MION_E2E_BINARY ? {binary: process.env.MION_E2E_BINARY} : {}),
    cwd: appDir,
    tsconfig: 'tsconfig.json',
    genDir: path.join(appDir, '.rt'),
  };
}

const isCore = (request) => CORE_EXTERNAL.test(request);

// ── the apps: eight bundler adapters over ten builds ────────────────────────
// build-vite carries the FULL feature matrix (imports the shared index); every
// light smoke imports apps/shared/src/minimal.ts. smoke-source is the seventh
// build but not a seventh bundler — it reuses the esbuild adapter to cover a
// different resolution mode.
const APP_LIST = [
  {name: 'build-vite', adapter: 'vite'},
  {name: 'smoke-esbuild', adapter: 'esbuild'},
  {name: 'smoke-rollup', adapter: 'rollup'},
  {name: 'smoke-rolldown', adapter: 'rolldown'},
  {name: 'smoke-webpack', adapter: 'webpack'},
  {name: 'smoke-rspack', adapter: 'rspack'},
  // Source-first consumer: customConditions:["source"] makes @mionjs/run-types
  // resolve to its published src/, so the plugin's scan walks the library's own
  // internals. Guards the first-party diagnostic scoping — without it the build
  // halts on the library's own CTA001/CTA003.
  {name: 'smoke-source', adapter: 'esbuild'},
  // Bun has TWO plugin hosts and they are different code paths, so each gets an
  // app: `Bun.build` (bundler, produces a dist like every other adapter) and the
  // `Bun.plugin` RUNTIME loader (no bundle step, transforms on import). Both run
  // under bun, which build-all.mjs cannot call in-process — see buildBun.
  {name: 'smoke-bun', adapter: 'bun'},
  {name: 'smoke-bun-preload', adapter: 'bunPreload'},
  // Next.js is the odd one out: Turbopack has no plugin API, so this app is
  // driven by `withRunTypes` in next.config (one broker) plus a loader in
  // turbopack.rules, not by a bundler plugin. It also cannot be built in-process
  // — `next build` is a CLI — so it runs out-of-process like the bun apps.
  // It is also the repo's ONLY `next build` coverage (next is ~202MB and not a
  // workspace dep, so a vitest equivalent would never run) — see
  // packages/devtools/src/runtypes/next/CLAUDE.md.
  {name: 'smoke-next', adapter: 'next'},
];

async function buildVite(app) {
  const {build} = await import('vite');
  const {default: runtypes} = await import('@mionjs/devtools/runtypes/vite');
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
    ssr: {external: ['@mionjs/run-types']},
  });
}

async function buildRollup(app) {
  const {rollup} = await import('rollup');
  const {default: runtypes} = await import('@mionjs/devtools/runtypes/rollup');
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
  const {default: runtypes} = await import('@mionjs/devtools/runtypes/rolldown');
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
  const {default: runtypes} = await import('@mionjs/devtools/runtypes/esbuild');
  const appDir = path.join(APPS, app.name);
  await build({
    entryPoints: [path.join(appDir, 'src/entry.ts')],
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node22',
    outfile: path.join(appDir, 'dist/entry.js'),
    external: ['@mionjs/run-types', '@mionjs/run-types/*'],
    plugins: [runtypes(rtOptions(appDir))],
    logLevel: 'warning',
  });
}

// webpack + rspack share the same config shape (rspack mirrors webpack). ESM
// output with @mionjs/run-types kept as a runtime module external.
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
  const {default: runtypes} = await import('@mionjs/devtools/runtypes/webpack');
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
  const {default: runtypes} = await import('@mionjs/devtools/runtypes/rspack');
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

// Bun's plugin API only exists inside a bun process, and this script runs under
// node — so both bun lanes shell out. Each app owns its own bun-side script so
// everything the e2e needs stays under apps/ (the container copy is `cp -a apps`).
function runBun(appDir, args) {
  execFileSync('bun', args, {cwd: appDir, stdio: 'inherit', env: process.env});
}

async function buildBun(app) {
  runBun(path.join(APPS, app.name), ['build.ts']);
}

// The runtime lane has nothing to BUILD: registering the plugin and importing
// the entry IS the test. Running it here (rather than only in the assertions)
// keeps a failure attributed to this app, like every other build failure.
async function buildBunPreload(app) {
  runBun(path.join(APPS, app.name), ['--preload', './rt-preload.ts', 'src/run.ts']);
}

// Next owns its own output layout (.next/), so there is no dist/entry.js to
// assert against; the page prerenders selfCheck() and the assertions read the
// built HTML instead.
async function buildNext(app) {
  const appDir = path.join(APPS, app.name);
  const nextBin = path.join(HERE, 'node_modules/next/dist/bin/next');
  const run = () =>
    execFileSync(process.execPath, [nextBin, 'build'], {cwd: appDir, stdio: 'inherit', env: {...process.env, NODE_ENV: 'production'}});
  run();

  // Second build, after editing a type the page reflects through an ERASED
  // import (apps/smoke-next/typeDep.ts — `import type`, so Turbopack has no edge
  // to it). The loader declares its type dependencies via addDependency; this
  // proves declaring them does not break a Turbopack build and that the edit is
  // picked up, with Next's persistent build cache in play.
  //
  // NB: `next build` re-runs loaders on every build, so this lane cannot fail
  // for a MISSING declaration — the stale case lives in `next dev`. It is
  // covered where it can actually be driven, in
  // packages/devtools/test/type-deps-invalidation.test.ts, which
  // re-transforms after a type edit and asserts the injected id moved.
  const probe = path.join(appDir, 'typeDep.ts');
  const original = readFileSync(probe, 'utf8');
  const html = path.join(appDir, '.next/server/app/index.html');
  // Capture word characters only. The injected id is [A-Za-z0-9_], and React can
  // emit comment separators (`<!-- -->`) inside a div, which a lazy match up to
  // </div> would swallow into the captured value.
  const injectedId = () => {
    if (!existsSync(html)) throw new Error(`smoke-next: no prerendered HTML at ${html} — did the build emit it?`);
    const id = /id="rt-typedep">(\w+)/.exec(readFileSync(html, 'utf8'))?.[1];
    if (!id) throw new Error(`smoke-next: no rt-typedep id in ${html} — did the page stop rendering the probe?`);
    return id;
  };
  const firstId = injectedId();
  try {
    writeFileSync(probe, original.replace('label: string;', 'label: string;\n  country: string;'));
    run();
    const secondId = injectedId();
    if (firstId === secondId) {
      throw new Error(`smoke-next: the injected id did not move after a type edit (${firstId}) — the rewrite is stale`);
    }
  } finally {
    writeFileSync(probe, original);
  }
}

const BUILDERS = {vite: buildVite, esbuild: buildEsbuild, rollup: buildRollup, rolldown: buildRolldown, webpack: buildWebpack, rspack: buildRspack, bun: buildBun, bunPreload: buildBunPreload, next: buildNext};

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
