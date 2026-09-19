// Proves pure functions survive real npm tarballs: two libraries built with the PUBLISHED packages
// (@acme/text via the Vite adapter, @acme/dates via `mion compile`, reaching a pure fn of text) are packed,
// installed into a consumer, built twice and run under a fresh node; a plain-tsc library must fail both
// consumer builds. Runs from the matrix root (/e2e in the container), which holds the published @mionjs/*
// plus vite and typescript; everything the assertions read lands under out/.
import {execFileSync, spawnSync} from 'node:child_process';
import {existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const E2E_ROOT = path.join(HERE, '..');
const BIN = path.join(E2E_ROOT, 'node_modules/.bin');
const OUT = path.join(HERE, 'out');
const TARBALLS = path.join(OUT, 'tarballs');
const LIBS = path.join(HERE, 'libs');
const CONSUMER = path.join(HERE, 'consumer');
const CONSUMER_PLAIN = path.join(HERE, 'consumer-plain');
const ARTIFACT_DIR = 'mion-pure-fns';

const VERSION = process.env.MION_E2E_VERSION;
const REGISTRY = process.env.MION_E2E_REGISTRY;
if (!VERSION || !REGISTRY) {
  console.error('pure-fns: MION_E2E_VERSION and MION_E2E_REGISTRY must be set (scripts/release/e2e.mjs sets them)');
  process.exit(2);
}
const MION = process.env.MION_E2E_BINARY || path.join(BIN, 'mion');
const TSC = path.join(BIN, 'tsc');

function log(line) {
  console.log(`pure-fns: ${line}`);
}

function run(file, args, cwd) {
  execFileSync(file, args, {cwd, stdio: 'inherit', env: process.env});
}

// Both streams, so a plugin diagnostic stays with the exit code.
function capture(file, args, cwd) {
  const result = spawnSync(file, args, {cwd, encoding: 'utf8', env: process.env});
  return {status: result.status, output: `${result.stdout ?? ''}${result.stderr ?? ''}`};
}

// npm like a real consumer; --no-save so a tarball path never lands in a manifest that gets packed.
function npmInstall(cwd, specs) {
  run('npm', ['install', ...specs, '--no-save', '--registry', REGISTRY, '--no-audit', '--no-fund', '--legacy-peer-deps'], cwd);
}

function tarballOf(name) {
  const file = readdirSync(TARBALLS).find((entry) => entry.startsWith(`acme-${name}-`) && entry.endsWith('.tgz'));
  if (!file) throw new Error(`pure-fns: no tarball for @acme/${name} under ${TARBALLS}`);
  return path.join(TARBALLS, file);
}

// Pins run-types only in the packed manifest: checked in, the library install would try to resolve it,
// and the builds find run-types up the tree anyway.
function pack(name) {
  const dir = path.join(LIBS, name);
  const manifestFile = path.join(dir, 'package.json');
  const original = readFileSync(manifestFile, 'utf8');
  const manifest = JSON.parse(original);
  manifest.dependencies = {...manifest.dependencies, '@mionjs/run-types': VERSION};
  writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
  try {
    run('npm', ['pack', '--pack-destination', TARBALLS], dir);
  } finally {
    writeFileSync(manifestFile, original);
  }
}

function clean() {
  rmSync(OUT, {recursive: true, force: true});
  for (const lib of readdirSync(LIBS)) {
    for (const scratch of ['dist', 'node_modules', '.mion']) rmSync(path.join(LIBS, lib, scratch), {recursive: true, force: true});
  }
  for (const consumer of [CONSUMER, CONSUMER_PLAIN]) {
    for (const scratch of ['dist-vite', 'dist-cli', 'node_modules', '.mion', '.mion-cli', 'src/ids.ts']) {
      rmSync(path.join(consumer, scratch), {recursive: true, force: true});
    }
  }
  mkdirSync(TARBALLS, {recursive: true});
}

function readIndex(dir) {
  return JSON.parse(readFileSync(path.join(dir, 'dist', ARTIFACT_DIR, 'index.json'), 'utf8'));
}

function buildLibraries() {
  log('@acme/text: Vite adapter build, declarations by tsc, then pack');
  const text = path.join(LIBS, 'text');
  run(process.execPath, [path.join(HERE, 'vite-build.mjs'), 'lib', text], HERE);
  run(TSC, ['-p', path.join(text, 'tsconfig.json')], text);
  // Build scratch; what ships is the bundle and dist/mion-pure-fns/.
  rmSync(path.join(text, '.mion'), {recursive: true, force: true});
  pack('text');

  log('@acme/dates: installs the @acme/text tarball, `mion compile` with the gen dir inside dist, then pack');
  const dates = path.join(LIBS, 'dates');
  npmInstall(dates, [tarballOf('text')]);
  run(MION, ['compile', '--cwd', dates, '--tsconfig', 'tsconfig.json', '--gen-dir', 'dist/.mion'], dates);
  pack('dates');

  log('@acme/plain: plain tsc, no mion, then pack');
  const plain = path.join(LIBS, 'plain');
  run(TSC, ['-p', path.join(plain, 'tsconfig.json')], plain);
  if (existsSync(path.join(plain, 'dist', ARTIFACT_DIR))) throw new Error('pure-fns: a plain tsc build must write no artifact');
  pack('plain');
}

function runNode(file, cwd) {
  const {status, output} = capture(process.execPath, [file], cwd);
  const payload = /<<RT>>(.*)<<RT>>/s.exec(output);
  if (status !== 0 || !payload) throw new Error(`pure-fns: ${path.relative(HERE, file)} exited ${status} without a report:\n${output}`);
  return JSON.parse(payload[1]);
}

function buildConsumer() {
  log('@acme/consumer: installs both tarballs, builds with the Vite adapter and with `mion compile`, runs both');
  npmInstall(CONSUMER, [tarballOf('text'), tarballOf('dates'), `@mionjs/run-types@${VERSION}`]);
  // Nothing demands title, so its id comes from text's built index.
  const titleId = readIndex(path.join(CONSUMER, 'node_modules/@acme/text')).pureFns.find((row) => row.bindingName === 'title').id;
  writeFileSync(path.join(CONSUMER, 'src/ids.ts'), `export const TITLE_ID = '${titleId}';\n`);

  const vite = capture(process.execPath, [path.join(HERE, 'vite-build.mjs'), 'app', CONSUMER], HERE);
  writeFileSync(path.join(OUT, 'build-vite.log'), vite.output);
  if (vite.status !== 0) throw new Error(`pure-fns: the consumer's Vite build failed:\n${vite.output}`);
  writeFileSync(path.join(OUT, 'report-vite.json'), JSON.stringify(runNode(path.join(CONSUMER, 'dist-vite/main.js'), CONSUMER), null, 2));

  const cli = capture(MION, ['compile', '--cwd', CONSUMER, '--tsconfig', 'tsconfig.json', '--gen-dir', '.mion-cli'], CONSUMER);
  writeFileSync(path.join(OUT, 'build-cli.log'), cli.output);
  if (cli.status !== 0) throw new Error(`pure-fns: the consumer's mion compile failed:\n${cli.output}`);
  writeFileSync(path.join(OUT, 'report-cli.json'), JSON.stringify(runNode(path.join(CONSUMER, 'dist-cli/main.js'), CONSUMER), null, 2));
}

// The test reads the saved output for PFE9016.
function buildPlainConsumer() {
  log('@acme/consumer-plain: installs the @acme/plain tarball; both builds must fail');
  npmInstall(CONSUMER_PLAIN, [tarballOf('plain'), `@mionjs/run-types@${VERSION}`]);
  const vite = capture(process.execPath, [path.join(HERE, 'vite-build.mjs'), 'app', CONSUMER_PLAIN], HERE);
  writeFileSync(path.join(OUT, 'plain-vite.json'), JSON.stringify(vite, null, 2));
  if (vite.status === 0) throw new Error('pure-fns: the Vite build of a consumer of @acme/plain must fail, but it passed');
  const cli = capture(MION, ['compile', '--cwd', CONSUMER_PLAIN, '--tsconfig', 'tsconfig.json', '--gen-dir', '.mion-cli'], CONSUMER_PLAIN);
  writeFileSync(path.join(OUT, 'plain-cli.json'), JSON.stringify(cli, null, 2));
  if (cli.status === 0) throw new Error('pure-fns: `mion compile` of a consumer of @acme/plain must fail, but it passed');
}

clean();
buildLibraries();
buildConsumer();
buildPlainConsumer();
log('done');
