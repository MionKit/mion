// mion-bench.mjs — drive the mion HTTP server benchmarks inside the mion-bench
// (podman) image.
//
// The twin of bench.mjs, for the OTHER benchmark family. The image is BUILT +
// PUBLISHED by scripts/container/image.mjs (target `mion-bench`) and bakes ONLY the
// per-app dependency trees; every first-party file — the apps, the shared models /
// payloads, the harness — is bind-mounted at run time, and the mion lanes
// additionally get the workspace @mionjs/* + @mionjs/* packages, the Linux
// resolver binary and the uWebSockets.js binary mounted in. So the numbers always
// describe the CURRENT tree, and the image is invalidated only by a manifest change.
//
// Commands: prep | build-image | servers | one <app> | suite <key> | sweep |
// repeat <app> [suite] | gcprobe | aggregate | build | shell | login | push | pull | clean.
// Every lane is measured in interleaved rounds (container/mion-bench/shared/rounds.mjs).
// `--rounds <n>` sets how many; `--quick` anywhere is one short round (a dev loop, not a
// number to publish).

import {existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {cpus} from 'node:os';
import {join} from 'node:path';
import {main as coreBuild} from '../../core/build.mjs';
import * as image from '../../container/image.mjs';
import {loadEnv, REPO_ROOT} from '../../lib/env.mjs';
import {capture, die, hostGoArch, note, reportCliError, run, which} from '../../lib/proc.mjs';
// The app registry and the suite list are imported from the benchmark tree itself,
// so the driver and the in-container harness can never disagree about what exists.
import {APP_NAMES, APPS, findApp} from '../../../container/mion-bench/shared/apps.mjs';
import {SUITE_KEYS} from '../../../container/mion-bench/shared/suites.mjs';
import {SWEEP_SIZES as SWEEP_SIZE_DEFS} from '../../../container/mion-bench/shared/payloads.mjs';
import {DEFAULT_WARMUP, laneDir, mergeRounds, planFor, roundFile, schedule, warmupFor} from '../../../container/mion-bench/shared/rounds.mjs';

const BENCH_DIR = join(REPO_ROOT, 'container/mion-bench');
const RESULTS_DIR = join(BENCH_DIR, 'results');
const APPS_DIR = join(BENCH_DIR, 'apps');
const GOARCH = hostGoArch();
const LINUX_BIN = join(REPO_ROOT, `mion-bin/mion-linux-${GOARCH}`);
const UWS_PKG = join(REPO_ROOT, 'packages/bin-uws');
const SCRIPT_DIR = join(REPO_ROOT, 'scripts/website/bench-data');
// Where the Linux resolver binary is mounted, and what MION_BIN points the plugin at.
// Without MION_BIN, @mionjs/bin-compiler looks for the per-platform @mionjs/native-compiler-*
// npm package, which a deps-only image deliberately does not install.
const MION_BIN_PATH = '/mion-bench/apps/mion/bin/mion';

const SWEEP_SIZES = SWEEP_SIZE_DEFS.map((size) => size.key);

// The spread a lane's rounds are expected to stay inside, as a percentage. Recorded on
// every result so the docs pages can print it, warned about on every run and enforced by
// `pnpm miondevx bench servers repeat <app>`.
// A function, not a constant: `.env` is loaded after this module is evaluated.
const tolerance = () => Number(process.env.MION_BENCH_TOLERANCE || 10);

/** The round plan for one lane, with every MION_BENCH_* knob the user set taking precedence. */
export function lanePlan(sizeKey, env = process.env) {
  const knob = (name) => {
    if (!env[name]) return undefined;
    const value = Number(env[name]);
    if (!Number.isFinite(value)) throw new Error(`mion-bench: ${name} must be a number, got '${env[name]}'`);
    return value;
  };
  const plan = planFor(sizeKey, {
    rounds: knob('MION_BENCH_ROUNDS'),
    seconds: knob('MION_BENCH_DURATION'),
    warmup: knob('MION_BENCH_WARMUP'),
    rewarmup: knob('MION_BENCH_REWARMUP'),
  });
  // Zero or a fraction would schedule no final round: nothing merged, nothing failed, an empty site.
  if (!Number.isInteger(plan.rounds) || plan.rounds < 1) throw new Error(`mion-bench: rounds must be a whole number of 1 or more, got '${env.MION_BENCH_ROUNDS}'`);
  if (!(plan.seconds > 0)) throw new Error(`mion-bench: MION_BENCH_DURATION must be above 0, got '${env.MION_BENCH_DURATION}'`);
  return plan;
}

// Mounted into a mion lane's node_modules: the app declares no runtime dependency, so these are the live source.
const MION_PACKAGES = [
  ['packages/core', '@mionjs/core'],
  ['packages/rpc-router', '@mionjs/router'],
  ['packages/rpc-client', '@mionjs/client'],
  ['packages/devtools', '@mionjs/devtools'],
  ['packages/platform-node', '@mionjs/platform-node'],
  ['packages/platform-uws', '@mionjs/platform-uws'],
  ['packages/platform-bun', '@mionjs/platform-bun'],
  ['packages/bin-uws', '@mionjs/bin-uws'],
  ['packages/run-types', '@mionjs/run-types'],
  ['packages/bin-compiler', '@mionjs/bin-compiler'],
];

function config(env = process.env) {
  return {
    engine: env.MION_BENCH_ENGINE || env.MION_WEBSITE_ENGINE || 'podman',
    image: env.MION_BENCH_IMAGE || 'mion-bench:dev',
    mountOpts: env.MION_BENCH_MOUNT_OPTS || env.MION_WEBSITE_MOUNT_OPTS || '',
    runNetwork: env.MION_BENCH_RUN_NETWORK || '',
    docdataDir: env.MION_BENCH_DOCDATA || join(REPO_ROOT, '.docdata'),
  };
}

const requireEngine = (cfg) => {
  if (!which(cfg.engine)) die(`mion-bench: container engine '${cfg.engine}' not found. Install podman (https://podman.io).`);
};

const ensureSharedImage = () => image.ensureImage({target: 'mion-bench'});

// The uWebSockets.js binary the CONTAINER needs: linux, the container's arch, and the
// Node 26 ABI (147) the image runs — never the host's ABI, which is whatever node the
// developer happens to have. Fetched by `prep` into the same cache the loader reads.
const UWS_ABI = '147';
const uwsTag = () => JSON.parse(readFileSync(join(UWS_PKG, 'package.json'), 'utf8')).uwsTag;
const uwsBinaryFile = () => `uws_linux_${GOARCH === 'arm64' ? 'arm64' : 'x64'}_${UWS_ABI}.node`;
const uwsCacheDir = () => join(UWS_PKG, '.uws-cache', uwsTag());

function ensureUwsBinary() {
  const file = join(uwsCacheDir(), uwsBinaryFile());
  if (existsSync(file)) return true;
  note(`fetching the container's uWebSockets.js binary (${uwsBinaryFile()})`);
  const code = run('node', [join(REPO_ROOT, 'scripts/lib/fetch-uws.mjs'), '--file', uwsBinaryFile()]);
  if (code !== 0 || !existsSync(file)) {
    note(`could not fetch ${uwsBinaryFile()} - the mion.uws lane will be skipped`);
    return false;
  }
  return true;
}

// The mion app consumes each @mionjs package's BUILT dist (see apps/mion/vite.config.ts
// for why raw source cannot work), so those dists must be current before a run or the
// benchmark measures whatever was built last. Same step, same reason, as
// scripts/website/site.mjs:ensureMionDists. test-server is excluded: its build bundles
// the edge/cloudflare workers, minutes of work no benchmark uses.
function ensureMionDists() {
  note('building the @mionjs dists from the current workspace');
  const args = ['--filter', '@mionjs/*', '--filter', '!@mionjs/test-server', 'run', 'build'];
  if (run('pnpm', args, {cwd: REPO_ROOT}) !== 0) die('mion-bench: building the @mionjs dists failed - see output above.');
}

function ensurePrereqs(cfg) {
  // The mion lanes build in-container against the mounted workspace packages, so the
  // resolver binary and the compiled devtools have to exist on the host first.
  coreBuild(['all', 'linux-go'], {trustStamp: true});
  ensureMionDists();
  ensureUwsBinary();
  ensureSharedImage();
}

function mountArgs(cfg, app) {
  if (!existsSync(LINUX_BIN)) die(`mion-bench: missing ${LINUX_BIN} - run 'pnpm miondevx bench servers prep' first.`);
  mkdirSync(RESULTS_DIR, {recursive: true});
  const mo = cfg.mountOpts;
  const args = [];
  const skip = new Set(['node_modules', 'package.json', 'dist']);

  // Every app's source (package.json + node_modules stay baked).
  for (const entry of readdirSync(APPS_DIR, {withFileTypes: true})) {
    if (!entry.isDirectory()) continue;
    for (const base of readdirSync(join(APPS_DIR, entry.name))) {
      if (skip.has(base)) continue;
      args.push('-v', `${join(APPS_DIR, entry.name, base)}:/mion-bench/apps/${entry.name}/${base}:ro${mo}`);
    }
  }

  // The mion app is BUILT in one container and RUN in another, so its dist has to
  // survive between them: mount it rw from the host (git-ignored) rather than letting
  // it land in a --rm container's throwaway layer.
  const mionDist = join(APPS_DIR, 'mion/dist');
  mkdirSync(mionDist, {recursive: true});
  args.push('-v', `${mionDist}:/mion-bench/apps/mion/dist${mo}`);

  args.push('-v', `${join(BENCH_DIR, 'shared')}:/mion-bench/shared:ro${mo}`);
  args.push('-v', `${join(BENCH_DIR, 'harness/run.mjs')}:/mion-bench/harness/run.mjs:ro${mo}`);
  args.push('-v', `${join(BENCH_DIR, 'harness/gc-trace.mjs')}:/mion-bench/harness/gc-trace.mjs:ro${mo}`);
  args.push('-v', `${join(BENCH_DIR, 'harness/wire.mjs')}:/mion-bench/harness/wire.mjs:ro${mo}`);
  // The load generator's request script. The image bakes only dependencies, so a script
  // that is not mounted is simply not there when wrk goes looking for it.
  args.push('-v', `${join(BENCH_DIR, 'harness/wrk.lua')}:/mion-bench/harness/wrk.lua:ro${mo}`);
  args.push('-v', `${join(BENCH_DIR, 'aggregate.mjs')}:/mion-bench/aggregate.mjs:ro${mo}`);
  args.push('-v', `${RESULTS_DIR}:/mion-bench/results${mo}`);

  // First-party packages for the mion lanes: the live workspace source, mounted into
  // the app's node_modules so its vite build resolves them by name.
  const mionModules = '/mion-bench/apps/mion/node_modules';
  for (const [rel, name] of MION_PACKAGES) {
    const dir = join(REPO_ROOT, rel);
    if (existsSync(dir)) args.push('-v', `${dir}:${mionModules}/${name}:ro${mo}`);
  }
  args.push('-v', `${LINUX_BIN}:${MION_BIN_PATH}:ro${mo}`);
  // Each mounted package's tsconfig extends the repo-root one as '../../tsconfig.json';
  // from a scoped mount that path lands inside node_modules, so mount the real root
  // config there too (the same fix serializationRunArgs needs in bench.mjs).
  args.push('-v', `${join(REPO_ROOT, 'tsconfig.json')}:${mionModules}/tsconfig.json:ro${mo}`);

  // The uWebSockets.js native binary. The loader's dev-tree lookup expects to sit at
  // <pkg>/lib, which is not where a node_modules mount puts it, so point it here.
  const uwsDir = uwsCacheDir();
  if (existsSync(uwsDir)) args.push('-v', `${uwsDir}:/mion-bench/uws-binary:ro${mo}`);
  return args;
}

function envArgs(extra = {}) {
  const args = [
    '-e', 'MION_BENCH_RESULTS_DIR=/mion-bench/results',
    '-e', 'MION_UWS_BINARY_DIR=/mion-bench/uws-binary',
    '-e', `MION_BIN=${MION_BIN_PATH}`,
  ];
  const cpu = cpus()[0]?.model ?? '';
  if (cpu) args.push('-e', `MION_BENCH_HOST_CPU=${cpu}`);
  // Every load knob the harness reads. TIMEOUT and INFLIGHT_BUDGET were missing here,
  // so setting them on the host quietly did nothing to the run inside the container.
  // The round knobs are not here: the driver reads them and passes each round's lengths.
  const knobs = [
    'MION_BENCH_PORT',
    'MION_BENCH_CONNECTIONS',
    'MION_BENCH_PIPELINING',
    'MION_BENCH_THREADS',
    'MION_BENCH_TIMEOUT',
    'MION_BENCH_INFLIGHT_BUDGET',
  ];
  for (const name of knobs) {
    if (process.env[name]) args.push('-e', `${name}=${process.env[name]}`);
  }
  for (const [name, value] of Object.entries(extra)) args.push('-e', `${name}=${value}`);
  return args;
}

function runInContainer(cfg, app, cmd, extraEnv) {
  const net = cfg.runNetwork ? [`--network=${cfg.runNetwork}`] : [];
  const common = [...net, ...mountArgs(cfg, app), ...envArgs(extraEnv), '-w', '/mion-bench', cfg.image, ...cmd];
  return run(cfg.engine, ['run', '--rm', '--init', ...common], {stdio: ['ignore', 'inherit', 'inherit']});
}

// Runs the real mion vite plugin, so this doubles as the check that the workspace build still compiles a server.
function buildMionApp(cfg) {
  note('building the mion server bundles (vite + @mionjs/devtools, in-container)');
  if (runInContainer(cfg, findApp('mion'), ['sh', '-c', 'cd apps/mion && pnpm run build']) !== 0) {
    die('mion-bench: the mion app build FAILED - see output above.');
  }
}

const needsMionBuild = (apps) => apps.some((app) => app.family === 'mion');

const roundRunner = (cfg) => ({runRound: (app, lane, round) => runRound(cfg, app, lane, round)});

function runRound(cfg, app, lane, round) {
  const target = lane.size ? ['--size', lane.size] : ['--suite', lane.suite];
  const timing = ['--round', String(round), '--warmup', String(warmupFor(lane.plan, round)), '--duration', String(lane.plan.seconds)];
  return runInContainer(cfg, app, ['node', 'harness/run.mjs', '--app', app.name, ...target, ...timing]) === 0;
}

const suiteLanes = () => SUITE_KEYS.map((suite) => ({key: suite, suite, plan: lanePlan(undefined)}));
const sweepLanes = () => SWEEP_SIZES.map((size) => ({key: `payload-sizes/${size}`, size, plan: lanePlan(size)}));

/**
 * Measures every app on every lane in interleaved rounds (shared/rounds.mjs) and writes each
 * lane's merged record, the median round, where the site generator reads it. Returns the
 * failed `<app>/<lane>` names. A failed round drops that app's lane: its later rounds are
 * skipped and no record is left for the site to publish.
 */
export function runLanes(apps, lanes, {runRound, resultsDir = RESULTS_DIR}) {
  const failed = new Set();
  const wide = [];
  const limit = tolerance();
  const id = (app, lane) => `${app.name}/${lane.size ?? lane.suite}`;
  // Only the round files go up front. A merged record stays until its lane fails or is
  // replaced, so an aborted run leaves the previous results whole.
  for (const lane of lanes) {
    const dir = laneDir(resultsDir, lane);
    for (const app of apps) {
      for (let round = 1; round <= lane.plan.rounds; round++) rmSync(roundFile(dir, app.name, round), {force: true});
    }
  }

  for (const {round, lane, app, last} of schedule(lanes, apps)) {
    if (failed.has(id(app, lane))) continue;
    note(`round ${round}/${lane.plan.rounds} · ${lane.key} · ${app.name}`);
    const dir = laneDir(resultsDir, lane);
    if (!runRound(app, lane, round)) {
      failed.add(id(app, lane));
      rmSync(join(dir, `${app.name}.json`), {force: true});
      continue;
    }
    if (!last) continue;
    const rounds = Array.from({length: lane.plan.rounds}, (_, i) => JSON.parse(readFileSync(roundFile(dir, app.name, i + 1), 'utf8')));
    const record = mergeRounds(rounds, {tolerance: limit});
    writeFileSync(join(dir, `${app.name}.json`), `${JSON.stringify(record, null, 2)}\n`);
    const seen = record.rounds.map((entry) => Math.round(entry.requests)).join(' / ');
    note(`${id(app, lane)}: median ${Math.round(record.requests.mean)} req/s (rounds ${seen}, spread ${record.spread}%)`);
    if (lane.plan.rounds > 1 && record.spread > limit) wide.push(`${id(app, lane)} ${record.spread}%`);
  }
  // A warning, not a failure: the median already drops the slow round, and a deploy should
  // not die on a noisy box. `repeat` is the command that fails on it.
  if (wide.length > 0) note(`rounds spread wider than the ${limit}% tolerance: ${wide.join(', ')}`);
  return [...failed];
}

function cmdServers(cfg, only) {
  ensurePrereqs(cfg);
  const apps = only ? [findApp(only)] : APPS;
  if (only && !apps[0]) die(`mion-bench: unknown app '${only}'. Try one of: ${APP_NAMES.join(', ')}`);
  if (needsMionBuild(apps)) buildMionApp(cfg);

  const failed = runLanes(apps, suiteLanes(), roundRunner(cfg));
  aggregate(cfg);
  genDocs();
  if (failed.length > 0) die(`mion-bench: ${failed.length} lane(s) failed: ${failed.join(', ')} - see the output above`);
}

function cmdSuite(cfg, suite) {
  if (!SUITE_KEYS.includes(suite)) die(`mion-bench: unknown suite '${suite}'. Try one of: ${SUITE_KEYS.join(', ')}`);
  ensurePrereqs(cfg);
  buildMionApp(cfg);
  const failed = runLanes(APPS, suiteLanes().filter((lane) => lane.suite === suite), roundRunner(cfg));
  aggregate(cfg);
  genDocs();
  if (failed.length > 0) die(`mion-bench: ${failed.length} lane(s) failed: ${failed.join(', ')}`);
}

// The payload sweep over every lane. It began as a mion-only lane (how mion's own
// body handling scales, notably uws' zero-copy path above 512 KiB) but the question a
// reader actually has is how the frameworks compare as the body grows, and every
// competitor already raises its body limit for exactly these sizes.
function cmdSweep(cfg, only) {
  ensurePrereqs(cfg);
  buildMionApp(cfg);
  // `sweep <app>` runs the sizes for one lane, the way `one <app>` runs the suites for one
  const apps = only ? [findApp(only)] : APPS;
  if (only && !apps[0]) die(`mion-bench: unknown app '${only}'. Try one of: ${APP_NAMES.join(', ')}`);
  const failed = runLanes(apps, sweepLanes(), roundRunner(cfg));
  aggregate(cfg);
  genDocs();
  if (failed.length > 0) die(`mion-bench: ${failed.length} sweep lane(s) failed: ${failed.join(', ')}`);
}

// Run ONE lane in its rounds and fail when they land further apart than the tolerance the
// pages publish. A number is only worth publishing if the lane agrees with itself, and the
// bun lanes are why this exists: they are the ones a node-based load generator could not
// measure repeatably.
function cmdRepeat(cfg, appName, suiteArg) {
  if (!appName) die(`mion-bench: repeat needs an app. Try one of: ${APP_NAMES.join(', ')}`);
  const app = findApp(appName);
  if (!app) die(`mion-bench: unknown app '${appName}'. Try one of: ${APP_NAMES.join(', ')}`);
  const suite = suiteArg || SUITE_KEYS[0];
  if (!SUITE_KEYS.includes(suite)) die(`mion-bench: unknown suite '${suite}'. Try one of: ${SUITE_KEYS.join(', ')}`);
  const lane = suiteLanes().find((entry) => entry.suite === suite);
  if (lane.plan.rounds < 2) die('mion-bench: repeat needs --rounds 2 or more (two rounds is the smallest comparison).');
  ensurePrereqs(cfg);
  if (app.family === 'mion') buildMionApp(cfg);

  if (runLanes([app], [lane], roundRunner(cfg)).length > 0) die(`mion-bench: ${app.name}/${suite} failed - see the output above`);
  const record = JSON.parse(readFileSync(join(laneDir(RESULTS_DIR, lane), `${app.name}.json`), 'utf8'));
  const seen = record.rounds.map((entry) => entry.requests);
  console.log(
    `\n${app.name} - ${suite}: ${seen.length} rounds, ${Math.round(Math.min(...seen))} to ${Math.round(Math.max(...seen))} req/s, ` +
      `spread ${record.spread}% (tolerance ${record.tolerance}%)`
  );
  if (record.spread > record.tolerance) {
    die(
      `mion-bench: ${app.name}/${suite} is not repeatable - ${record.spread}% apart across ${seen.length} rounds, ` +
        `over the ${record.tolerance}% tolerance. A busy machine is the usual cause; MION_BENCH_TOLERANCE moves the bar ` +
        `if this box really is that noisy.`
    );
  }
}

function aggregate(cfg, rest = []) {
  // `aggregate --compare <before> <after>` reads two results dirs and needs neither to be ours
  if (rest[0] === '--compare') return run('node', [join(BENCH_DIR, 'aggregate.mjs'), ...rest]);
  if (!existsSync(RESULTS_DIR)) return;
  run('node', [join(BENCH_DIR, 'aggregate.mjs')]);
}

// Regenerate the JSON the mion docs pages fetch. Runs on the host (it only reads the
// result files), right after a run, so the site can never render one run's table
// beside another run's charts.
function genDocs() {
  note('gen-servers-docs (host transform -> container/website/public/bench-data)');
  if (run('node', [join(SCRIPT_DIR, 'gen-servers-docs.mjs')]) !== 0) die('mion-bench: gen-servers-docs failed - the site data was not regenerated.');
}

// Everything the mion docs pages render: the three suites for every app, then the
// payload sweep. What `miondevx bench --website` calls so ONE command regenerates both
// sites' numbers.
function cmdWebsite(cfg) {
  ensurePrereqs(cfg);
  buildMionApp(cfg);
  const failed = runLanes(APPS, [...suiteLanes(), ...sweepLanes()], roundRunner(cfg));
  aggregate(cfg);
  genDocs();
  if (failed.length > 0) die(`mion-bench: ${failed.length} lane(s) failed: ${failed.join(', ')} - the pages for them would render an empty column`);
}

// ── gcprobe ─────────────────────────────────────────────────────────────────────────
// A/B a router change on MEMORY, which the published lanes cannot answer: their run-to-run
// drift is many times the effect being looked for (the same unchanged code has measured 46.5
// and 63.4 req/s on the 4 MB lane an hour apart). What makes a SHORT window usable here is
// that every metric below is a per-request RATIO, so that drift cancels out of it instead of
// swamping it.
//
// Each run measures the CURRENT build and saves its rounds under a --label. Comparing two
// versions is two runs with a checkout between them, then --compare:
//
//   git checkout <base> -- packages/ && miondevx bench servers gcprobe --label before
//   git checkout HEAD   -- packages/ && miondevx bench servers gcprobe --label after
//   miondevx bench servers gcprobe --compare before after
//
// Restoring only packages/ is what keeps the harness constant while the measured code varies.

const GCPROBE_LANES = ['mion', 'mion.uws', 'mion.bun'];

/** The metrics a candidate is judged on. Bun has no V8 trace, so its `gc` block is absent and
 *  it is judged on peak memory and throughput alone, as a veto rather than as a source of wins. */
function gcProbeMetrics(record) {
  return {
    promotedPerReq: record.gc?.promotedPerReq ?? null,
    majorsPerKReq: record.gc?.majorsPerKReq ?? null,
    gcPauseMsPerReq: record.gc?.gcPauseMsPerReq ?? null,
    peakHeapUsedMb: record.gc ? Math.round((record.gc.peakHeapUsed / 1024 / 1024) * 100) / 100 : null,
    peakRssMb: record.peakRss ? Math.round((record.peakRss / 1024 / 1024) * 100) / 100 : null,
    reqPerSec: Math.round(record.requests.mean),
    requestsTotal: record.requestsTotal,
  };
}

// A directory per label, so ONE label holds the whole sweep: a lane name carries a dot
// (`mion.uws`) and a size carries none, which makes filenames a poor key. The records are read back
// by what they say about themselves instead.
const gcProbeDir = (label) => join(RESULTS_DIR, 'gcprobe', label);

// Longer than a published round: the GC ratios need MIN_SAMPLE_REQUESTS per window, and
// the 4 MB lane collects ~30 a second. Every round restarts the server, so each warms in full.
const GCPROBE_SECONDS = 20;

function gcProbeRun(cfg, app, size, label, round) {
  const seconds = process.env.MION_BENCH_DURATION || String(GCPROBE_SECONDS);
  const warmup = process.env.MION_BENCH_WARMUP || String(DEFAULT_WARMUP);
  const timing = ['--round', String(round), '--warmup', warmup, '--duration', seconds];
  const args = ['node', 'harness/run.mjs', '--app', app.name, '--size', size, '--gc', '1', ...timing];
  if (runInContainer(cfg, app, args) !== 0) return null;
  const laneFile = roundFile(laneDir(RESULTS_DIR, {size}), app.name, round);
  if (!existsSync(laneFile)) return null;
  const record = JSON.parse(readFileSync(laneFile, 'utf8'));
  mkdirSync(gcProbeDir(label), {recursive: true});
  writeFileSync(join(gcProbeDir(label), `${app.name}-${size}-r${round}.json`), `${JSON.stringify(record, null, 2)}\n`);
  return record;
}

/** Every round saved under a label, keyed by what each record says it is rather than by its name.
 *  A label with no records is an error worth naming: the run meant to produce them never finished. */
function gcProbeSamples(label) {
  const dir = gcProbeDir(label);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((file) => file.endsWith('.json'))
    .map((file) => JSON.parse(readFileSync(join(dir, file), 'utf8')))
    .map((record) => ({lane: record.app, size: record.size?.key ?? 'unknown', label, ...gcProbeMetrics(record)}));
}

const METRIC_ROWS = [
  ['promotedPerReq', 'bytes promoted per request', 'lower'],
  ['majorsPerKReq', 'major GCs per 1000 requests', 'lower'],
  ['gcPauseMsPerReq', 'GC pause ms per request', 'lower'],
  // JS heap against process RSS: when these two disagree the difference is memory V8 reserved
  // rather than memory the change actually used, which is a different finding entirely.
  ['peakHeapUsedMb', 'peak JS heap MB', 'lower'],
  ['peakRssMb', 'peak RSS MB', 'lower'],
  ['reqPerSec', 'requests per second', 'higher'],
];

// Below this many requests in a window the GC ratios are dominated by whether a single collection
// happened to land inside it: measured 15x swings WITHIN one arm at ~160 requests. Printed as a
// warning rather than enforced, because a deliberately short smoke run is still useful.
const MIN_SAMPLE_REQUESTS = 600;

/** Prints each arm as its RANGE, not its mean. The rule this probe exists to serve is that a
 *  candidate counts only when the groups do not overlap; a difference of means proves nothing. */
function printGcProbe(samples, labels, title) {
  // size first, then lane: the question is how one payload behaves, and the lanes answer it
  const sizes = SWEEP_SIZES.filter((size) => samples.some((sample) => sample.size === size));
  const groupsOf = (size, lane) => samples.filter((sample) => sample.size === size && sample.lane === lane);
  for (const size of sizes) {
    for (const lane of [...new Set(samples.filter((sample) => sample.size === size).map((sample) => sample.lane))]) {
      printOneTable(groupsOf(size, lane), labels, `${title} · ${size} · ${lane}`);
    }
  }
}

function printOneTable(samples, labels, title) {
  {
    const requests = samples.map((sample) => sample.requestsTotal);
    const smallest = Math.min(...requests);
    console.log(`\n── ${title} ─────────────────────────────`);
    console.log(`  requests per window            ${smallest}..${Math.max(...requests)}`);
    if (smallest < MIN_SAMPLE_REQUESTS) {
      console.log(`  ⚠ UNDER-POWERED: fewer than ${MIN_SAMPLE_REQUESTS} requests per window, the GC ratios are noise.`);
      console.log(`    Drop --quick, or raise MION_BENCH_DURATION, until every window clears that.`);
    }
    const groups = labels.map((label) => ({label, values: samples.filter((sample) => sample.label === label)}));
    for (const [key, label, better] of METRIC_ROWS) {
      const ranges = groups.map(({label: arm, values}) => {
        const numbers = values.map((value) => value[key]).filter((value) => value !== null);
        return {label: arm, numbers, low: Math.min(...numbers), high: Math.max(...numbers)};
      });
      if (ranges.some((range) => range.numbers.length === 0)) continue;
      const cells = ranges.map((range) => `${range.label} ${range.low}..${range.high}`).join('   ');
      console.log(`  ${label.padEnd(28)} ${cells}   [${gcProbeVerdict(ranges, better)}]`);
    }
  }
}

/** Overlapping ranges mean the run cannot tell the arms apart, which is an answer in itself. */
function gcProbeVerdict(ranges, better) {
  const [first, ...rest] = ranges;
  for (const range of rest) {
    if (range.low <= first.high && first.low <= range.high) return 'overlap, no call';
  }
  const best = ranges.reduce((winner, range) =>
    (better === 'lower' ? range.high < winner.high : range.low > winner.low) ? range : winner
  );
  return `${best.label} wins`;
}

function cmdGcProbe(cfg, {lanes, label, rounds, sizes, compare}) {
  if (compare) return cmdGcProbeCompare(compare);
  for (const size of sizes) {
    if (!SWEEP_SIZES.includes(size)) die(`mion-bench: unknown size '${size}'. Try one of: ${SWEEP_SIZES.join(', ')}`);
  }
  const apps = lanes.map((name) => findApp(name) ?? die(`mion-bench: unknown lane '${name}'. Try one of: ${APP_NAMES.join(', ')}`));
  ensurePrereqs(cfg);
  buildMionApp(cfg);

  const samples = [];
  for (const size of sizes) {
    for (let round = 1; round <= rounds; round++) {
      for (const app of apps) {
        note(`gcprobe ${label} · ${size} · round ${round}/${rounds}: ${app.name}`);
        const record = gcProbeRun(cfg, app, size, label, round);
        if (!record) die(`mion-bench: gcprobe lane '${app.name}' failed on ${size} in round ${round} - see the output above`);
        samples.push({lane: app.name, size, label, round, ...gcProbeMetrics(record)});
      }
    }
  }
  printGcProbe(samples, [label], label);
  console.log(`\nsaved as '${label}' in ${gcProbeDir(label)}`);
  console.log(`compare it with:  pnpm miondevx bench servers gcprobe --compare <other> ${label}`);
}

/** Reads two saved label sets and prints the same range table. Runs nothing, so the two arms can
 *  come from two checkouts, which is the only way to compare code that is not switchable at run
 *  time. Order matters only for reading: the verdict is symmetric. */
function cmdGcProbeCompare(labels) {
  const samples = labels.flatMap((label) => {
    const found = gcProbeSamples(label);
    if (found.length === 0) die(`mion-bench: no records saved under '${label}' in ${gcProbeDir(label)}. Run gcprobe --label ${label} first.`);
    return found;
  });
  printGcProbe(samples, labels, labels.join(' vs '));
}

function cmdClean() {
  rmSync(RESULTS_DIR, {recursive: true, force: true});
  rmSync(join(APPS_DIR, 'mion/dist'), {recursive: true, force: true});
  note('removed results/ and the mion app dist');
}

/** The env quick mode runs under: one short round, unless the user set a knob themselves. */
export function quickEnv(env) {
  return {
    MION_BENCH_ROUNDS: '1',
    MION_BENCH_DURATION: '3',
    MION_BENCH_WARMUP: '1',
    MION_BENCH_REWARMUP: '1',
    MION_BENCH_CONNECTIONS: '25',
    ...env,
  };
}

function applyQuick() {
  if (process.env.MION_BENCH_QUICK !== '1') return;
  Object.assign(process.env, quickEnv(process.env));
  console.error('==> MION_BENCH_QUICK on: one short round. The numbers are noisy and must NOT be published.');
}

function dispatch(cfg, args, opts) {
  const [cmd, ...rest] = args;
  switch (cmd) {
    case 'prep': return ensurePrereqs(cfg);
    case 'build-image': return image.buildImageCmd({target: 'mion-bench'});
    case undefined:
    case 'servers': return (requireEngine(cfg), cmdServers(cfg));
    case 'one': return (requireEngine(cfg), cmdServers(cfg, rest[0]));
    case 'suite': return (requireEngine(cfg), cmdSuite(cfg, rest[0]));
    case 'sweep': return (requireEngine(cfg), cmdSweep(cfg, rest[0]));
    case 'repeat': return (requireEngine(cfg), cmdRepeat(cfg, rest[0], rest[1]));
    case 'gcprobe': return (requireEngine(cfg), cmdGcProbe(cfg, opts.gcprobe));
    case 'build': return (requireEngine(cfg), ensurePrereqs(cfg), buildMionApp(cfg));
    case 'website': return (requireEngine(cfg), cmdWebsite(cfg));
    case 'gen-docs': return genDocs();
    case 'aggregate': return aggregate(cfg, rest);
    case 'shell': return (requireEngine(cfg), ensurePrereqs(cfg), runInContainer(cfg, findApp('mion'), ['bash']));
    case 'login': return image.cmdLogin({target: 'mion-bench'});
    case 'push': return image.cmdPush({target: 'mion-bench'});
    case 'pull': return image.cmdPull({target: 'mion-bench'});
    case 'clean': return cmdClean();
    default: die(`mion-bench: unknown command '${cmd}'. Try: prep | build-image | servers | one <app> | suite <key> | sweep | repeat <app> [suite] | gcprobe | website | gen-docs | build | aggregate | shell | login | push | pull | clean`);
  }
}

export function main(rawArgs) {
  const args = [];
  const gcprobe = {lanes: GCPROBE_LANES, label: 'current', rounds: 3, sizes: ['huge'], compare: null};
  const listArg = (value) => value.split(',').map((item) => item.trim()).filter(Boolean);
  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i];
    if (arg === '--quick') process.env.MION_BENCH_QUICK = '1';
    else if (arg === '--rounds') {
      // One flag for both: rounds per lane for a measured run, rounds per label for gcprobe.
      gcprobe.rounds = Number(rawArgs[++i]);
      process.env.MION_BENCH_ROUNDS = String(gcprobe.rounds);
    }
    else if (arg === '--size' || arg === '--sizes') gcprobe.sizes = listArg(rawArgs[++i]);
    else if (arg === '--label') gcprobe.label = rawArgs[++i];
    else if (arg === '--compare') gcprobe.compare = [rawArgs[++i], rawArgs[++i]];
    else if (arg === '--lanes') gcprobe.lanes = listArg(rawArgs[++i]);
    else args.push(arg);
  }
  applyQuick();
  dispatch(config(), args, {gcprobe});
}

if (import.meta.main) {
  loadEnv();
  try {
    main(process.argv.slice(2));
  } catch (err) {
    reportCliError(err);
  }
}
