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
import {execFileSync, spawn} from 'node:child_process';
import {existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
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

// Packed first, so the apps resolve exactly what @acme/src-types's `files` list ships.
// Unpacked by hand: `npm install` could prune the matrix root's BAKED toolchain manifest.
function ensureSrcTypesFixture() {
  const libDir = path.join(APPS, 'libs/src-types');
  const packDir = path.join(HERE, '.fixtures');
  const target = path.join(HERE, 'node_modules/@acme/src-types');
  rmSync(packDir, {recursive: true, force: true});
  rmSync(target, {recursive: true, force: true});
  mkdirSync(packDir, {recursive: true});
  mkdirSync(target, {recursive: true});
  console.log('fixture: pack @acme/src-types (type definitions under src/)');
  execFileSync('npm', ['pack', '--pack-destination', packDir], {cwd: libDir, stdio: 'inherit'});
  const tarball = readdirSync(packDir).find((entry) => entry.endsWith('.tgz'));
  if (!tarball) throw new Error(`build-all: npm pack produced no tarball for @acme/src-types in ${packDir}`);
  execFileSync('tar', ['-xzf', path.join(packDir, tarball), '--strip-components=1', '-C', target], {stdio: 'inherit'});
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

// ── the apps: eight bundler adapters over eleven builds ─────────────────────
// build-vite carries the FULL feature matrix; every light smoke imports
// apps/shared/src/minimal.ts. smoke-source and smoke-types-in-src reuse the
// esbuild adapter, so they are builds without being bundlers.
const APP_LIST = [
  {name: 'build-vite', adapter: 'vite'},
  {name: 'smoke-esbuild', adapter: 'esbuild'},
  {name: 'smoke-rollup', adapter: 'rollup'},
  {name: 'smoke-rolldown', adapter: 'rolldown'},
  {name: 'smoke-webpack', adapter: 'webpack'},
  {name: 'smoke-rspack', adapter: 'rspack'},
  // Source-first: @acme/src-types resolves to its TypeScript, so the plugin scans a
  // dependency's own internals. Guards the first-party diagnostic scoping (else marker-comptime-arg-*).
  {name: 'smoke-source', adapter: 'esbuild'},
  // The same fixture with NO custom conditions, found through plain `types`. Together the two
  // prove the resolver follows a dependency's manifest, which is what lets @mionjs/* ship no src.
  {name: 'smoke-types-in-src', adapter: 'esbuild'},
  // Bun has TWO plugin hosts and they are different code paths, so each gets an
  // app: `Bun.build` (bundler, produces a dist like every other adapter) and the
  // `Bun.plugin` RUNTIME loader (no bundle step, transforms on import). Both run
  // under bun, which build-all.mjs cannot call in-process — see buildBun.
  {name: 'smoke-bun', adapter: 'bun'},
  {name: 'smoke-bun-preload', adapter: 'bunPreload'},
  // Turbopack has no plugin API; next build requires a separate CLI process.
  // Next is not a workspace dependency; this supplies build coverage (packages/devtools/src/runtypes/next/AGENTS.md).
  // `directiveProbes` (app/ClientProbe.tsx, app/actions.ts): also `next build --webpack`, `next dev` on both bundlers.
  {name: 'smoke-next', adapter: 'next', directiveProbes: true},
  // The same Turbopack lane over the typed .ts cache modules emitMode 'ts' writes (its tsconfig asks for it).
  // No type-edit rebuild: smoke-next already proves it, and the mode changes nothing in it.
  {name: 'smoke-next-ts', adapter: 'next', typeEdit: false},
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

// Next's .next/ layout has no dist/entry.js: the page prerenders selfCheck() and the assertions read the built HTML.
async function buildNext(app) {
  const appDir = path.join(APPS, app.name);
  const nextBin = path.join(HERE, 'node_modules/next/dist/bin/next');
  const html = path.join(appDir, '.next/server/app/index.html');
  const run = (flags = []) =>
    execFileSync(process.execPath, [nextBin, 'build', ...flags], {cwd: appDir, stdio: 'inherit', env: {...process.env, NODE_ENV: 'production'}});
  // Next fails if the injected imports land above a directive. Turbopack builds last: build-outputs.test.mjs reads it.
  if (app.directiveProbes) {
    run(['--webpack']);
    assertDirectiveIds(readFileSync(html, 'utf8'), `${app.name} (next build --webpack)`);
    for (const flags of [[], ['--webpack']]) await checkNextDev(app, appDir, nextBin, flags);
  }
  run();
  if (app.typeEdit === false) return;

  // Rebuild after editing typeDep.ts (erased `import type`): Turbopack must accept the declared dep and see the edit.
  // `next build` reruns loaders, so a MISSING type-dep declaration only shows in `next dev`:
  // packages/devtools/test/type-deps-invalidation.test.ts covers that.
  const probe = path.join(appDir, 'typeDep.ts');
  const original = readFileSync(probe, 'utf8');
  const injectedId = () => {
    if (!existsSync(html)) throw new Error(`smoke-next: no prerendered HTML at ${html} — did the build emit it?`);
    return typeDepId(readFileSync(html, 'utf8'), html);
  };
  const firstId = injectedId();
  try {
    writeFileSync(probe, editTypeDep(original));
    run();
    const secondId = injectedId();
    if (firstId === secondId) {
      throw new Error(`smoke-next: the injected id did not move after a type edit (${firstId}) — the rewrite is stale`);
    }
  } finally {
    writeFileSync(probe, original);
  }
}

// Fixed, like the consumers' 8086 / 8087: the lanes run one at a time in an image nothing else listens in.
const SMOKE_NEXT_DEV_PORT = 8089;

// \w+, not a lazy match up to </div>: React can emit `<!-- -->` separators inside the div.
function typeDepId(rendered, where) {
  const id = /id="rt-typedep">(\w+)/.exec(rendered)?.[1];
  if (!id) throw new Error(`smoke-next: no rt-typedep id in ${where} — did the page stop rendering the probe?`);
  return id;
}

function editTypeDep(source) {
  const edited = source.replace('label: string;', 'label: string;\n  country: string;');
  if (edited === source) throw new Error("smoke-next: typeDep.ts has no 'label: string;' to edit");
  return edited;
}

// A server killed by a signal keeps exitCode null and sets signalCode instead.
const exited = (child) => child.exitCode !== null || child.signalCode !== null;

function assertDirectiveIds(rendered, where) {
  for (const probe of ['rt-use-client', 'rt-use-server']) {
    if (!new RegExp(`id="${probe}">\\w+`).test(rendered)) throw new Error(`${where}: no ${probe} id in the rendered page`);
  }
}

// `next dev` rewrites through the same loader (Turbopack) or plugin (webpack) as a build, served lazily.
// Turbopack's type edit: `next dev` caches untouched rewrites, so only the broker's watcher and type deps move the id.
async function checkNextDev(app, appDir, nextBin, flags) {
  const {NODE_ENV: _nodeEnv, ...env} = process.env;
  const where = `${app.name} (${['next dev', ...flags].join(' ')})`;
  const url = `http://127.0.0.1:${SMOKE_NEXT_DEV_PORT}/`;
  const child = spawn(process.execPath, [nextBin, 'dev', '--port', String(SMOKE_NEXT_DEV_PORT), ...flags], {cwd: appDir, stdio: 'inherit', env});
  const probe = path.join(appDir, 'typeDep.ts');
  const original = readFileSync(probe, 'utf8');
  try {
    const rendered = await (await waitForOk(url, child, 180_000)).text();
    assertDirectiveIds(rendered, where);
    if (flags.length) return;
    const firstId = typeDepId(rendered, where);
    writeFileSync(probe, editTypeDep(original));
    const moved = (body) => typeDepId(body, where) !== firstId;
    await waitForOk(url, child, 60_000, moved).catch((error) => {
      throw new Error(`${where}: the rt-typedep id did not move after a type edit — the dev rewrite is stale (${error.message})`);
    });
  } finally {
    writeFileSync(probe, original);
    child.kill('SIGTERM');
    await new Promise((resolve) => (exited(child) ? resolve() : child.once('exit', resolve)));
  }
}

async function waitForOk(url, child, timeoutMs, accept = () => true) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (exited(child)) throw new Error(`the server exited (${child.exitCode ?? child.signalCode}) before serving ${url}`);
    try {
      const res = await fetch(url);
      if (res.ok && accept(await res.clone().text())) return res;
    } catch {
      // not listening yet, or mid-recompile
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`${url} did not answer within ${timeoutMs}ms`);
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
  if (apps.some((app) => app.name === 'smoke-source' || app.name === 'smoke-types-in-src')) ensureSrcTypesFixture();
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
