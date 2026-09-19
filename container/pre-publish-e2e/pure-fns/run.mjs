// Pure functions shipped in real npm tarballs. Builds two libraries with the PUBLISHED
// packages (@acme/text with the Vite adapter, @acme/dates with `mion compile`, the second
// reaching a pure function of the first), packs them with `npm pack`, installs the tarballs
// into a consumer with `npm install`, and builds that consumer twice (Vite adapter, `mion
// compile`), running each output under a fresh node. A third library built with plain tsc
// ships no compiled pure functions, and a consumer reaching it must fail both builds.
// Everything the assertions read (tarballs, reports, build logs) lands under out/.
//
// Runs from the matrix root (/e2e in the container), where the published @mionjs/* are
// installed and vite + typescript are baked. Needs MION_E2E_VERSION and MION_E2E_REGISTRY;
// MION_E2E_BINARY overrides the launcher for host iteration, as in build-all.mjs.
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

// Captures both streams so a diagnostic printed by the plugin is kept with the exit code.
function capture(file, args, cwd) {
  const result = spawnSync(file, args, {cwd, encoding: 'utf8', env: process.env});
  return {status: result.status, output: `${result.stdout ?? ''}${result.stderr ?? ''}`};
}

// Like a real consumer: npm, from the same registry the published packages come from, and --no-save so a
// tarball path never lands in a manifest that gets packed.
function npmInstall(cwd, specs) {
  run('npm', ['install', ...specs, '--no-save', '--registry', REGISTRY, '--no-audit', '--no-fund', '--legacy-peer-deps'], cwd);
}

function tarballOf(name) {
  const file = readdirSync(TARBALLS).find((entry) => entry.startsWith(`acme-${name}-`) && entry.endsWith('.tgz'));
  if (!file) throw new Error(`pure-fns: no tarball for @acme/${name} under ${TARBALLS}`);
  return path.join(TARBALLS, file);
}

// The checked-in manifest pins a placeholder; the packed one pins the published version, like a library would.
function pack(name) {
  const dir = path.join(LIBS, name);
  const manifestFile = path.join(dir, 'package.json');
  const original = readFileSync(manifestFile, 'utf8');
  const manifest = JSON.parse(original);
  manifest.dependencies['@mionjs/run-types'] = VERSION;
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
  // The gen dir is build scratch: what ships is the bundle and dist/mion-pure-fns/.
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
  // The consumer asks the registry about title, which nothing demands; its id is only known once text is built.
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

// A build that succeeds here is the failure: the assertions read the captured output for PFE9016.
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
