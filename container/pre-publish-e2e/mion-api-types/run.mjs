// Proves a client built from its server's published .d.ts checks the server build version. Runs from the mion
// consumer root (/e2e-mion in the container), which holds the published @mionjs/* plus vite and typescript.
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
const CLIENT = path.join(HERE, 'client');
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

function tarballOf(version) {
  const file = readdirSync(TARBALLS).find((entry) => entry === `acme-api-${version}.tgz`);
  if (!file) throw new Error(`mion-api-types: no @acme/api@${version} tarball under ${TARBALLS}`);
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

function buildApi() {
  log('@acme/api: `mion compile` with declarations and the gen dir inside dist, then pack');
  run(MION, ['compile', '--cwd', API, '--tsconfig', 'tsconfig.json', '--gen-dir', 'dist/.mion'], API);
  run('npm', ['pack', '--pack-destination', TARBALLS], API);

  log('@acme/api@0.0.1-plain: the same sources by plain tsc, so its .d.ts carries no server version');
  const plain = path.join(OUT, 'api-plain');
  cpSync(API, plain, {recursive: true, filter: (from) => !/[/\\](dist|node_modules|\.mion)$/.test(from)});
  const manifestFile = path.join(plain, 'package.json');
  writeFileSync(manifestFile, JSON.stringify({...JSON.parse(readFileSync(manifestFile, 'utf8')), version: '0.0.1-plain'}, null, 2));
  run(TSC, ['-p', path.join(plain, 'tsconfig.json')], plain);
  run('npm', ['pack', '--pack-destination', TARBALLS], plain);
}

// A copy of the client source, so each variant installs its own tarball and keeps its own outputs.
function clientCopy(name, tsconfigEdit) {
  const dir = path.join(OUT, name);
  cpSync(CLIENT, dir, {recursive: true, filter: (from) => !/[/\\](dist-vite|dist-cli|node_modules|\.mion|\.mion-cli)$/.test(from)});
  if (tsconfigEdit) {
    const file = path.join(dir, 'tsconfig.json');
    const tsconfig = JSON.parse(readFileSync(file, 'utf8'));
    tsconfigEdit(tsconfig.compilerOptions);
    writeFileSync(file, JSON.stringify(tsconfig, null, 2));
  }
  return dir;
}

function buildClient(name, dir, tarball) {
  npmInstall(dir, [tarball]);
  const vite = capture(process.execPath, [path.join(HERE, 'vite-build.mjs'), dir], HERE);
  writeFileSync(path.join(OUT, `${name}-vite.json`), JSON.stringify(vite, null, 2));
  const cli = capture(MION, ['compile', '--cwd', dir, '--tsconfig', 'tsconfig.json', '--gen-dir', '.mion-cli'], dir);
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

  log('client-plain: the same client against the plain tsc tarball; both builds pass with a warning');
  buildClient('client-plain', clientCopy('client-plain'), tarballOf('0.0.1-plain'));

  log('client-drift: strictNullChecks off changes the ids; both builds must fail');
  buildClient('client-drift', clientCopy('client-drift', (options) => (options.strictNullChecks = false)), tarballOf('0.0.0'));
  log('done');
}

await main();
