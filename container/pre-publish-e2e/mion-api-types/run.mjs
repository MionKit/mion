// Proves a client built from the server's published .d.ts, whole or types-only, checks the server build version.
// Runs from the mion consumer root (/e2e-mion), which holds the published @mionjs/* plus vite and typescript.
import {execFileSync, spawn, spawnSync} from 'node:child_process';
import {cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const BIN = path.join(ROOT, 'node_modules/.bin');
const OUT = path.join(HERE, 'out');
const TARBALLS = path.join(OUT, 'tarballs');
const API = path.join(HERE, 'libs/api');
const GEO = path.join(HERE, 'libs/geo');
const CLIENT = path.join(HERE, 'client');
const CLIENT_FETCH = path.join(HERE, 'client-fetch');
const PORT = 8247;

const REGISTRY = process.env.MION_E2E_REGISTRY;
if (!REGISTRY) {
  console.error('mion-api-types: MION_E2E_REGISTRY must be set (scripts/release/e2e.mjs sets it)');
  process.exit(2);
}
const MION = path.join(BIN, 'mion');
const TSC = path.join(BIN, 'tsc');

function log(line) {
  console.log(`mion-api-types: ${line}`);
}

function run(file, args, cwd) {
  execFileSync(file, args, {cwd, stdio: 'inherit', env: process.env});
}

// Both streams, so a build diagnostic stays with the exit code.
function capture(file, args, cwd) {
  const result = spawnSync(file, args, {cwd, encoding: 'utf8', env: process.env});
  return {status: result.status, output: `${result.stdout ?? ''}${result.stderr ?? ''}`};
}

// npm like a real consumer; --no-save so a tarball path never lands in a manifest.
function npmInstall(cwd, specs) {
  run('npm', ['install', ...specs, '--no-save', '--registry', REGISTRY, '--no-audit', '--no-fund', '--legacy-peer-deps'], cwd);
}

function tarballOf(version, name = 'api') {
  const file = readdirSync(TARBALLS).find((entry) => entry === `acme-${name}-${version}.tgz`);
  if (!file) throw new Error(`mion-api-types: no @acme/${name}@${version} tarball under ${TARBALLS}`);
  return path.join(TARBALLS, file);
}

function clean() {
  rmSync(OUT, {recursive: true, force: true});
  for (const scratch of ['dist', 'node_modules', '.mion']) rmSync(path.join(API, scratch), {recursive: true, force: true});
  for (const scratch of ['dist-vite', 'dist-cli', 'node_modules', '.mion', '.mion-cli']) {
    rmSync(path.join(CLIENT, scratch), {recursive: true, force: true});
  }
  mkdirSync(TARBALLS, {recursive: true});
}

// @acme/geo is on no registry: whoever builds or installs the whole server gets it from here.
function installGeo(dir) {
  cpSync(GEO, path.join(dir, 'node_modules/@acme/geo'), {recursive: true});
}

function buildApi() {
  log('@acme/geo: the outside package the API reaches, packed for the clients that install the whole server');
  run('npm', ['pack', '--pack-destination', TARBALLS], GEO);
  installGeo(API);
  log('@acme/api: `mion compile` with declarations and the gen dir inside dist, then pack');
  run(MION, ['compile', '--cwd', API, '--tsconfig', 'tsconfig.json', '--gen-dir', 'dist/.mion'], API);
  run('npm', ['pack', '--pack-destination', TARBALLS], API);

  log('@acme/api@0.0.1-plain: the same sources by plain tsc, so its .d.ts carries no server version');
  const plain = path.join(OUT, 'api-plain');
  cpSync(API, plain, {recursive: true, filter: (from) => !/[/\\](dist|node_modules|\.mion)$/.test(from)});
  const manifestFile = path.join(plain, 'package.json');
  writeFileSync(manifestFile, JSON.stringify({...JSON.parse(readFileSync(manifestFile, 'utf8')), version: '0.0.1-plain'}, null, 2));
  installGeo(plain);
  run(TSC, ['-p', path.join(plain, 'tsconfig.json')], plain);
  run('npm', ['pack', '--pack-destination', TARBALLS], plain);
}

function buildApiTypes() {
  log('@acme/api-types: `mion api-types`, the types-only package a client installs instead of the server');
  const types = path.join(OUT, 'api-types');
  run(MION, ['api-types', '--cwd', API, '--tsconfig', 'tsconfig.json', '--out', types], API);
  run('npm', ['pack', '--pack-destination', TARBALLS], types);

  log('@acme/api-types@0.0.1-nomarker: the same package without its marker, as another tool would publish it');
  const noMarker = path.join(OUT, 'api-types-nomarker');
  cpSync(types, noMarker, {recursive: true});
  rmSync(path.join(noMarker, 'mion-api.json'));
  const manifestFile = path.join(noMarker, 'package.json');
  writeFileSync(manifestFile, JSON.stringify({...JSON.parse(readFileSync(manifestFile, 'utf8')), version: '0.0.1-nomarker'}, null, 2));
  run('npm', ['pack', '--pack-destination', TARBALLS], noMarker);
}

// A copy of the client source, so each variant installs its own tarball and keeps its own outputs.
// overlay's files replace the client's own (the fetching main.ts).
function clientCopy(name, tsconfigEdit, overlay, typesOnly = false) {
  const dir = path.join(OUT, name);
  cpSync(CLIENT, dir, {recursive: true, filter: (from) => !/[/\\](dist-vite|dist-cli|node_modules|\.mion|\.mion-cli)$/.test(from)});
  if (overlay) cpSync(overlay, dir, {recursive: true});
  if (typesOnly) {
    const main = path.join(dir, 'src/main.ts');
    writeFileSync(main, readFileSync(main, 'utf8').replace("from '@acme/api'", "from '@acme/api-types'"));
  }
  if (tsconfigEdit) {
    const file = path.join(dir, 'tsconfig.json');
    const tsconfig = JSON.parse(readFileSync(file, 'utf8'));
    tsconfigEdit(tsconfig.compilerOptions);
    writeFileSync(file, JSON.stringify(tsconfig, null, 2));
  }
  return dir;
}

function buildClient(name, dir, tarball, routes = 'bundle') {
  // A client of the whole server needs the outside package its .d.ts imports; a types-only client never does.
  npmInstall(dir, path.basename(tarball).startsWith('acme-api-types-') ? [tarball] : [tarball, tarballOf('0.0.0', 'geo')]);
  const vite = capture(process.execPath, [path.join(HERE, 'vite-build.mjs'), dir, routes], HERE);
  writeFileSync(path.join(OUT, `${name}-vite.json`), JSON.stringify(vite, null, 2));
  const cli = capture(MION, ['compile', '--cwd', dir, '--tsconfig', 'tsconfig.json', '--gen-dir', '.mion-cli', '--client-routes', routes], dir);
  writeFileSync(path.join(OUT, `${name}-cli.json`), JSON.stringify(cli, null, 2));
  return {vite, cli};
}

function runClient(file, cwd) {
  const {status, output} = capture(process.execPath, [file, `http://localhost:${PORT}`], cwd);
  const payload = /<<RT>>(.*)<<RT>>/s.exec(output);
  if (status !== 0 || !payload) throw new Error(`mion-api-types: ${path.relative(HERE, file)} exited ${status} without a report:\n${output}`);
  return JSON.parse(payload[1]);
}

// The server runs from the installed tarball, the way a deployment would run the package.
async function withServer(cwd, body) {
  const server = spawn(process.execPath, ['--input-type=module', '-e', `import('@acme/api').then((m) => m.startServer(${PORT}))`], {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  });
  let output = '';
  server.stdout.on('data', (chunk) => (output += chunk));
  server.stderr.on('data', (chunk) => (output += chunk));
  try {
    for (let attempt = 0; ; attempt++) {
      try {
        await fetch(`http://localhost:${PORT}/`);
        break;
      } catch {
        if (attempt > 100 || server.exitCode !== null) throw new Error(`mion-api-types: the @acme/api server did not start:\n${output}`);
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    return await body();
  } finally {
    server.kill();
  }
}

async function main() {
  clean();
  buildApi();
  buildApiTypes();

  log('client: built from the @acme/api tarball with the Vite preset and with `mion compile`, then run against it');
  const matching = buildClient('client', CLIENT, tarballOf('0.0.0'));
  if (matching.vite.status !== 0) throw new Error(`mion-api-types: the client's Vite build failed:\n${matching.vite.output}`);
  if (matching.cli.status !== 0) throw new Error(`mion-api-types: the client's mion compile failed:\n${matching.cli.output}`);
  const apiCheck = capture(MION, ['api-check', '--server-gen-dir', 'node_modules/@acme/api/dist/.mion', '--client-gen-dir', '.mion-cli'], CLIENT);
  writeFileSync(path.join(OUT, 'api-check.json'), JSON.stringify(apiCheck, null, 2));
  const reports = await withServer(CLIENT, async () => ({
    vite: runClient(path.join(CLIENT, 'dist-vite/main.js'), CLIENT),
    cli: runClient(path.join(CLIENT, 'dist-cli/main.js'), CLIENT),
  }));
  writeFileSync(path.join(OUT, 'reports.json'), JSON.stringify(reports, null, 2));

  log('client-fetch: a client built apart from its API that fetches each route from the server');
  const fetchDir = clientCopy('client-fetch', undefined, CLIENT_FETCH);
  const fetching = buildClient('client-fetch', fetchDir, tarballOf('0.0.0'), 'fetch');
  if (fetching.vite.status !== 0) throw new Error(`mion-api-types: the fetching client's Vite build failed:\n${fetching.vite.output}`);
  if (fetching.cli.status !== 0) throw new Error(`mion-api-types: the fetching client's mion compile failed:\n${fetching.cli.output}`);
  const fetchReports = await withServer(fetchDir, async () => ({
    vite: runClient(path.join(fetchDir, 'dist-vite/main.js'), fetchDir),
    cli: runClient(path.join(fetchDir, 'dist-cli/main.js'), fetchDir),
  }));
  writeFileSync(path.join(OUT, 'fetch-reports.json'), JSON.stringify(fetchReports, null, 2));

  log('client-types: the bundling and the fetching client built from @acme/api-types, run against the server');
  // The server keeps running from CLIENT's @acme/api: a types client never installs it, so its build cannot reach it.
  const typesBuilds = {};
  const typesReports = {};
  for (const [name, routes, overlay] of [['client-types', 'bundle'], ['client-types-fetch', 'fetch', CLIENT_FETCH]]) {
    const dir = clientCopy(name, undefined, overlay, true);
    const built = buildClient(name, dir, tarballOf('0.0.0', 'api-types'), routes);
    if (built.vite.status !== 0) throw new Error(`mion-api-types: ${name}'s Vite build failed:\n${built.vite.output}`);
    if (built.cli.status !== 0) throw new Error(`mion-api-types: ${name}'s mion compile failed:\n${built.cli.output}`);
    typesBuilds[name] = dir;
    typesReports[name] = await withServer(CLIENT, async () => ({
      vite: runClient(path.join(dir, 'dist-vite/main.js'), dir),
      cli: runClient(path.join(dir, 'dist-cli/main.js'), dir),
    }));
  }
  writeFileSync(path.join(OUT, 'types-reports.json'), JSON.stringify(typesReports, null, 2));
  const typesCheck = capture(MION, ['api-check', '--server-gen-dir', 'node_modules/@acme/api-types/.mion', '--client-gen-dir', '.mion-cli'], typesBuilds['client-types']);
  writeFileSync(path.join(OUT, 'api-check-types.json'), JSON.stringify(typesCheck, null, 2));

  log('client-types-nomarker: the types-only package without its marker; both builds must fail with one rpc-client-types-not-built-by-mion');
  buildClient('client-types-nomarker', clientCopy('client-types-nomarker', undefined, undefined, true), tarballOf('0.0.1-nomarker', 'api-types'));

  log('client-plain: the same client against the plain tsc tarball; both builds pass with a warning');
  buildClient('client-plain', clientCopy('client-plain'), tarballOf('0.0.1-plain'));

  log('client-drift: strictNullChecks off changes the ids; both builds must fail');
  buildClient('client-drift', clientCopy('client-drift', (options) => (options.strictNullChecks = false)), tarballOf('0.0.0'));
  log('done');
}

await main();
