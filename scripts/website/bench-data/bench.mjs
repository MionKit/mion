// bench.mjs — drive the validation benchmarks inside the tsrt-website (podman) image.
// Port of the former scripts/website/bench-data/bench.sh.
//
// The image is BUILT + PUBLISHED by scripts/container/image.mjs: the tsrt-website
// image holds the website deps (at /app) and the benchmark deps (at /bench), in
// separate dirs with separate node_modules (the pre-publish e2e's verdaccio +
// builder toolchains live in a SEPARATE tsrt-e2e image, not here). This module runs
// the benchmark half under WORKDIR /bench and delegates image build/login/push/pull
// to image.mjs (mapping the RT_BENCH_* knobs onto RT_WEBSITE_* via an explicit env
// override, replacing the old run_manager subshell). The in-container `sh -c '…'`
// blocks stay shell.
//
// Commands: prep | build-image | bench | bench-one <name> | fullbench | serialization
// | website-bench | build [<name>] | smoke | audit | typecost | compiletime |
// transform-wire | capture-env | shell | login | push | pull | clean. A `--quick`
// flag anywhere maps onto every stage's native fast lever.

import {accessSync, constants, copyFileSync, existsSync, globSync, mkdirSync, readdirSync, rmSync} from 'node:fs';
import {cpus} from 'node:os';
import {join} from 'node:path';
import {main as coreBuild} from '../../core/build.mjs';
import * as image from '../../container/image.mjs';
import {ghcrConfig} from '../../lib/engine.mjs';
import {loadEnv, REPO_ROOT} from '../../lib/env.mjs';
import {capture, die, hostGoArch, note, reportCliError, run, which} from '../../lib/proc.mjs';

// Env-independent paths.
const BENCH_DIR = join(REPO_ROOT, 'container/benchmarks');
const RESULTS_DIR = join(BENCH_DIR, 'results');
const MARKER_PKG = join(REPO_ROOT, 'packages/ts-runtypes');
const PLUGIN_PKG = join(REPO_ROOT, 'packages/ts-runtypes-devtools');
const BIN_PKG = join(REPO_ROOT, 'packages/ts-runtypes-bin');
const GOARCH = hostGoArch();
const LINUX_BIN = join(REPO_ROOT, `bin/ts-runtypes-linux-${GOARCH}`);
const LINUX_EXTRACT_BIN = join(REPO_ROOT, `bin/extract-fn-bodies-linux-${GOARCH}`);
const SCRIPT_DIR = join(REPO_ROOT, 'scripts/website/bench-data');

function config(env = process.env) {
  const {registry, owner} = ghcrConfig();
  const containerBase = env.RT_BENCH_CONTAINER || 'tsrt-bench';
  return {
    engine: env.RT_BENCH_ENGINE || 'podman',
    image: env.RT_BENCH_IMAGE || 'tsrt-website:dev',
    containerBase,
    mountOpts: env.RT_BENCH_MOUNT_OPTS || '',
    runNetwork: env.RT_BENCH_RUN_NETWORK || '',
    docdataDir: env.RT_BENCH_DOCDATA || join(REPO_ROOT, '.docdata'),
    remoteImage: env.RT_BENCH_REMOTE_IMAGE || `${registry}/${owner}/tsrt-website:latest`,
    // typia's one-time native-plugin compile (.ttsc) persisted across --rm runs.
    volTtsc: `${containerBase}-typia-ttsc`,
  };
}

// Competitors run in this order; typia is included by default (RT_BENCH_NO_TYPIA skips).
function competitorList() {
  const list = ['ts-runtypes', 'zod', 'typebox', 'ajv'];
  if (!process.env.RT_BENCH_NO_TYPIA) list.push('typia');
  return list;
}

const requireEngine = (cfg) => {
  if (!which(cfg.engine)) die(`bench: container engine '${cfg.engine}' not found. Install podman (https://podman.io).`);
};
const isExec = (p) => {
  try {
    accessSync(p, constants.X_OK);
    return true;
  } catch {
    return false;
  }
};

// Stale-build checks delegated to core/build.mjs (the same the JS tests use).
const ensureArtifacts = (...targets) => coreBuild(targets);

// Map the RT_BENCH_* knobs onto image.mjs's RT_WEBSITE_* env (the old run_manager
// subshell), so the shared image has one owner.
function benchImageEnv(cfg) {
  const env = {...process.env, RT_WEBSITE_IMAGE: cfg.image, RT_WEBSITE_REMOTE_IMAGE: cfg.remoteImage};
  if (process.env.RT_BENCH_ENGINE) env.RT_WEBSITE_ENGINE = process.env.RT_BENCH_ENGINE;
  if (process.env.RT_BENCH_BASE_IMAGE) env.RT_WEBSITE_BASE_IMAGE = process.env.RT_BENCH_BASE_IMAGE;
  if (process.env.RT_BENCH_PNPM_VERSION) env.RT_WEBSITE_PNPM_VERSION = process.env.RT_BENCH_PNPM_VERSION;
  if (process.env.RT_BENCH_CA_CERT) env.RT_WEBSITE_CA_CERT = process.env.RT_BENCH_CA_CERT;
  if (process.env.RT_BENCH_BUILD_NETWORK) env.RT_WEBSITE_BUILD_NETWORK = process.env.RT_BENCH_BUILD_NETWORK;
  if (process.env.RT_BENCH_USE_LOCAL) env.RT_WEBSITE_USE_LOCAL = '1';
  return env;
}
const buildImage = (cfg) => image.buildImageCmd({env: benchImageEnv(cfg)});
const ensureSharedImage = (cfg) => image.ensureImage({env: benchImageEnv(cfg)});

function ensurePrereqs(cfg) {
  ensureArtifacts('all', 'linux-go', 'linux-extract');
  ensureSharedImage(cfg);
}

// The bind-mount `-v …` args. The image is deps-only, so ALL first-party benchmark
// source is mounted from the host under /bench.
function mountArgs(cfg) {
  if (!isExec(LINUX_BIN)) die(`bench: missing ${LINUX_BIN} - run 'pnpm rtx bench prep' first.`);
  if (!existsSync(join(MARKER_PKG, 'dist/index.js'))) die("bench: missing marker dist - run 'pnpm rtx bench prep' first.");
  if (!existsSync(join(PLUGIN_PKG, 'dist/index.js'))) die("bench: missing plugin dist - run 'pnpm rtx bench prep' first.");
  mkdirSync(RESULTS_DIR, {recursive: true});
  const mo = cfg.mountOpts;
  const args = [];
  const skip = new Set(['node_modules', 'package.json', 'dist']);

  // Per-competitor source files (skip package.json/node_modules so they stay baked).
  const competitorsDir = join(BENCH_DIR, 'competitors');
  for (const entry of readdirSync(competitorsDir, {withFileTypes: true})) {
    if (!entry.isDirectory()) continue;
    const competitor = entry.name;
    for (const base of readdirSync(join(competitorsDir, competitor))) {
      if (skip.has(base)) continue;
      args.push('-v', `${join(competitorsDir, competitor, base)}:/bench/competitors/${competitor}/${base}:ro${mo}`);
    }
  }

  // Shared suite (no deps) + the typecost runner + the harness-level files.
  args.push('-v', `${join(BENCH_DIR, 'shared')}:/bench/shared:ro${mo}`);
  for (const base of readdirSync(join(BENCH_DIR, 'typecost'))) {
    if (skip.has(base)) continue;
    args.push('-v', `${join(BENCH_DIR, 'typecost', base)}:/bench/typecost/${base}:ro${mo}`);
  }
  // The compile-time runner + the shared AST extractor (_lib) both import.
  args.push('-v', `${join(BENCH_DIR, '_lib')}:/bench/_lib:ro${mo}`);
  for (const base of readdirSync(join(BENCH_DIR, 'compiletime'))) {
    if (skip.has(base)) continue;
    args.push('-v', `${join(BENCH_DIR, 'compiletime', base)}:/bench/compiletime/${base}:ro${mo}`);
  }
  // The transform-wire runner ('go' vs 'edits' transform wire cost).
  for (const base of readdirSync(join(BENCH_DIR, 'transform-wire'))) {
    if (skip.has(base)) continue;
    args.push('-v', `${join(BENCH_DIR, 'transform-wire', base)}:/bench/transform-wire/${base}:ro${mo}`);
  }
  args.push('-v', `${join(BENCH_DIR, 'aggregate.mjs')}:/bench/aggregate.mjs:ro${mo}`);
  args.push('-v', `${join(BENCH_DIR, 'capture-env.mjs')}:/bench/capture-env.mjs:ro${mo}`);
  args.push('-v', `${join(BENCH_DIR, 'tsconfig.base.json')}:/bench/tsconfig.base.json:ro${mo}`);

  // TS-GO competitor: host Go binary + first-party packages.
  const tsgo = '/bench/competitors/ts-runtypes';
  args.push('-v', `${LINUX_BIN}:${tsgo}/bin/ts-runtypes:ro${mo}`);
  args.push('-v', `${MARKER_PKG}:${tsgo}/node_modules/@ts-runtypes/core:ro${mo}`);
  args.push('-v', `${PLUGIN_PKG}:${tsgo}/node_modules/@ts-runtypes/devtools:ro${mo}`);
  if (existsSync(join(BIN_PKG, 'lib/index.js'))) args.push('-v', `${BIN_PKG}:${tsgo}/node_modules/@ts-runtypes/bin:ro${mo}`);

  // typia's native ttsc plugin is BAKED into the image; do NOT mount a volume (an
  // empty named volume would shadow it and force a ~90-200s recompile).
  args.push('-v', `${RESULTS_DIR}:/bench/results${mo}`);
  return args;
}

const netArgs = (cfg) => (cfg.runNetwork ? [`--network=${cfg.runNetwork}`] : []);

// Host CPU model (the container can't see it): os.cpus() gives the brand string on
// macOS + Linux (matches the shell's sysctl / /proc/cpuinfo read).
const hostCpu = () => cpus()[0]?.model ?? '';

function envArgs() {
  const args = ['-e', 'RT_BENCH_RESULTS_DIR=/bench/results'];
  const cpu = hostCpu();
  if (cpu) args.push('-e', `RT_BENCH_HOST_CPU=${cpu}`);
  const pass = (name) => {
    if (process.env[name]) args.push('-e', `${name}=${process.env[name]}`);
  };
  pass('RT_BENCH_NO_TIMING');
  pass('RT_BENCH_TIME_MS');
  pass('RT_BENCH_CASE');
  pass('RT_BENCH_DUMP');
  pass('RT_COMPILETIME_N');
  pass('RT_TRANSFORM_WIRE_N');
  if (process.env.RT_BENCH_QUICK === '1') args.push('-e', 'RT_BENCH_QUICK=1');
  return args;
}

// Run a command in a fresh --rm container. Attach a TTY only when stdin is
// interactive; otherwise feed /dev/null so podman never swallows the caller's stdin.
function runInContainer(cfg, cmd) {
  const common = [...netArgs(cfg), ...mountArgs(cfg), ...envArgs(), '-w', '/bench', cfg.image, ...cmd];
  if (process.stdin.isTTY) return run(cfg.engine, ['run', '--rm', '-it', '--init', ...common]);
  return run(cfg.engine, ['run', '--rm', '--init', ...common], {stdio: ['ignore', 'inherit', 'inherit']});
}

// Build + run one competitor; failure is reported but never aborts the loop.
function buildAndRunOne(cfg, competitor) {
  console.log(`-------- competitor: ${competitor} --------`);
  if (runInContainer(cfg, ['sh', '-c', `cd competitors/${competitor} && pnpm run build && node dist/run.mjs`]) !== 0) {
    console.log(`==> competitor '${competitor}' FAILED (build or run) - see output above`);
  }
}

// Copy the per-competitor result JSON into .docdata/benchmarks (what the docs read).
function publishDocdata(cfg) {
  const dest = join(cfg.docdataDir, 'benchmarks');
  mkdirSync(dest, {recursive: true});
  for (const f of globSync('*.json', {cwd: RESULTS_DIR})) copyFileSync(join(RESULTS_DIR, f), join(dest, f));
  note(`published results -> ${dest}`);
}

// Delete top-level results JSON matching a predicate (the `find -maxdepth 1 -delete`).
function clearResults(pred) {
  mkdirSync(RESULTS_DIR, {recursive: true});
  for (const f of globSync('*.json', {cwd: RESULTS_DIR})) if (pred(f)) rmSync(join(RESULTS_DIR, f), {force: true});
}

function cmdBench(cfg) {
  ensurePrereqs(cfg);
  // RT_BENCH_CASE inspection run: leave the canonical results JSON untouched.
  if (!process.env.RT_BENCH_CASE) clearResults((f) => f !== 'env.json');
  for (const competitor of competitorList()) buildAndRunOne(cfg, competitor);
  if (process.env.RT_BENCH_CASE) return note(`RT_BENCH_CASE='${process.env.RT_BENCH_CASE}': per-case console output above; results JSON, aggregate and docdata left untouched.`);
  console.log('-------- aggregate --------');
  runInContainer(cfg, ['node', 'aggregate.mjs']);
  publishDocdata(cfg);
}

function cmdBenchOne(cfg, name) {
  if (!name) die('bench: usage: bench-one <competitor> (ts-runtypes|zod|typebox|ajv|typia)');
  ensurePrereqs(cfg);
  if (!process.env.RT_BENCH_CASE) clearResults((f) => f === `${name}.json`);
  buildAndRunOne(cfg, name);
  if (process.env.RT_BENCH_CASE) return note(`RT_BENCH_CASE='${process.env.RT_BENCH_CASE}': per-case console output above; results JSON, aggregate and docdata left untouched.`);
  console.log('-------- aggregate --------');
  runInContainer(cfg, ['node', 'aggregate.mjs']);
  publishDocdata(cfg);
}

function cmdFullbench(cfg) {
  ensurePrereqs(cfg);
  clearResults((f) => f !== 'env.json');
  for (const competitor of competitorList()) buildAndRunOne(cfg, competitor);
  note('aggregate');
  // aggregate.mjs exits non-zero on an EXPECTED cross-library divergence (the
  // Correctness page is built from them); every competitor already wrote its
  // results, so a non-zero exit here is a REPORT, not a run failure.
  if (runInContainer(cfg, ['node', 'aggregate.mjs']) !== 0) note('aggregate: cross-library correctness divergences reported above (non-zero exit) - continuing the publish pipeline');
  note('typecost');
  if (runInContainer(cfg, ['node', 'typecost/typecost.mjs']) !== 0) die('bench: typecost FAILED - see output above (the Compile Time page reads its results).');
  note('capture run environment (os / cpu / library versions)');
  runInContainer(cfg, ['node', 'capture-env.mjs']);
  publishDocdata(cfg);
  note(`fullbench: done. Published runtime + typecost results to ${cfg.docdataDir}/benchmarks`);
}

// The in-container serialization run (native Temporal). Stays `sh -c`.
const SERIALIZATION_SCRIPT = 'node gen-serialization.mjs --suite serialization && node gen-serialization.mjs --suite format-serialization';

// The marker-package tsconfig the serialization run points the resolver at.
// gen-serialization.mjs hands this exact name to the plugin; pinned by
// repo-contracts.test.ts so the two can't drift.
export const SERIALIZATION_TSCONFIG = 'tsconfig.test.json';

// The whole `run …` argv for the serialization stage. Pure and exported so
// repo-contracts.test.ts can assert the mount set without a container engine.
export function serializationRunArgs(cfg, out) {
  const tsgo = '/bench/competitors/ts-runtypes';
  const markerMount = `${tsgo}/node_modules/@ts-runtypes/core`;
  const mo = cfg.mountOpts;
  const extraMounts = [];
  if (existsSync(join(BIN_PKG, 'lib/index.js'))) extraMounts.push('-v', `${BIN_PKG}:${tsgo}/node_modules/@ts-runtypes/bin:ro${mo}`);
  return [
    'run', '--rm', '--init', ...netArgs(cfg), ...extraMounts,
    '-v', `${LINUX_BIN}:${tsgo}/bin/ts-runtypes:ro${mo}`,
    '-v', `${LINUX_EXTRACT_BIN}:${tsgo}/bin/extract-fn-bodies:ro${mo}`,
    '-v', `${MARKER_PKG}:${markerMount}:ro${mo}`,
    // The marker package's tsconfig.json extends the REPO-ROOT one as
    // `../../tsconfig.json`. From the mount above that resolves to
    // <competitor>/node_modules/tsconfig.json, not the repo root — the scoped
    // name @ts-runtypes/core puts the package a segment deeper than
    // packages/ts-runtypes is in the repo. Without this the resolver dies with
    // "tsconfig parse failed: Cannot read file …/node_modules/tsconfig.json"
    // before scanning a single site, which is how the v0.11.0 website deploy
    // shipped no serialization data. Mounting the real root config (not a copy)
    // keeps the suite compiling under exactly the options it does on the host.
    // repo-contracts.test.ts walks the `extends` chain and fails if a link ever
    // lands somewhere this argv doesn't mount.
    '-v', `${join(REPO_ROOT, 'tsconfig.json')}:${tsgo}/node_modules/tsconfig.json:ro${mo}`,
    '-v', `${PLUGIN_PKG}:${tsgo}/node_modules/@ts-runtypes/devtools:ro${mo}`,
    '-v', `${join(SCRIPT_DIR, 'gen-serialization.mjs')}:${tsgo}/gen-serialization.mjs:ro${mo}`,
    '-v', `${out}:/bench/bench-out${mo}`,
    '-e', `RT_BENCH_REPO_ROOT=${tsgo}`,
    '-e', `RT_BENCH_VITE_ROOT=${tsgo}`,
    '-e', `RT_BENCH_PACKAGE_ROOT=${markerMount}`,
    '-e', `RT_BENCH_RT_OUTDIR=${tsgo}/.rt-bench-runtypes`,
    '-e', `RT_BENCH_BIN=${tsgo}/bin/ts-runtypes`,
    '-e', 'RT_BENCH_PLUGIN_ENTRY=@ts-runtypes/devtools/vite',
    '-e', `RT_EXTRACT_BIN=${tsgo}/bin/extract-fn-bodies`,
    '-e', 'RT_BENCH_OUT_DIR=/bench/bench-out',
    '-e', 'RT_BENCH_SSR_NOEXTERNAL=ts-runtypes,ts-runtypes-devtools',
    '-e', 'RT_BENCH_CACHE_DIR=false',
    '-e', `RT_BENCH_QUICK=${process.env.RT_BENCH_QUICK || ''}`,
    '-w', tsgo, cfg.image, 'sh', '-c', SERIALIZATION_SCRIPT,
  ];
}

function cmdSerialization(cfg) {
  ensurePrereqs(cfg);
  if (!isExec(LINUX_EXTRACT_BIN)) die(`bench: missing ${LINUX_EXTRACT_BIN} - run 'pnpm rtx bench prep' first.`);
  if (!existsSync(join(MARKER_PKG, 'dist/index.js'))) die("bench: missing marker dist - run 'pnpm rtx bench prep' first.");
  if (!existsSync(join(PLUGIN_PKG, 'dist/index.js'))) die("bench: missing plugin dist - run 'pnpm rtx bench prep' first.");
  const out = process.env.RT_BENCH_SERIALIZATION_OUT || join(REPO_ROOT, 'container/website/public/bench-data');
  mkdirSync(out, {recursive: true});
  note(`serialization bench (in-container, native Temporal) -> ${out}`);
  // MUST be checked: gen-serialization.mjs WIPES its output dir before writing, so a
  // failed run leaves the serialization datasets deleted or half-written. Swallowing
  // this code let cmdWebsiteBench carry on and ship a green site whose two
  // serialization pages rendered "Benchmark data not generated yet".
  const code = run(cfg.engine, serializationRunArgs(cfg, out), {stdio: ['ignore', 'inherit', 'inherit']});
  if (code !== 0) die('bench: serialization bench FAILED - see output above. container/website/public/bench-data/serialization{,-formats}/ is now missing or half-written; re-run before building the site.');
}

function cmdWebsiteBench(cfg) {
  cmdFullbench(cfg);
  cmdSerialization(cfg);
  cmdCompiletime(cfg);
  cmdAudit(cfg); // correctness/alignment data for the "Correctness" page
  note('gen-bench-docs (host transform -> container/website/public/bench-data)');
  if (run('node', [join(SCRIPT_DIR, 'gen-docs.mjs')]) !== 0) die('bench: gen-docs failed');
  note('website-bench: done. container/website/public/bench-data/ regenerated (Node 26 / native Temporal).');
}

function cmdBuild(cfg, name) {
  ensurePrereqs(cfg);
  if (name) {
    if (runInContainer(cfg, ['sh', '-c', `cd competitors/${name} && pnpm run build && test -d dist`]) !== 0) die(`bench: build '${name}' FAILED - see output above`);
    return;
  }
  let failures = 0;
  for (const competitor of competitorList()) {
    console.log(`-------- build: ${competitor} --------`);
    // Keep building every competitor so all failures surface, but accumulate and
    // exit non-zero at the end so smoke is a real gate.
    if (runInContainer(cfg, ['sh', '-c', `cd competitors/${competitor} && pnpm run build && test -d dist`]) !== 0) {
      console.log(`==> build '${competitor}' FAILED`);
      failures++;
    }
  }
  if (failures !== 0) die(`bench: ${failures} competitor build(s) failed`);
}

function cmdTypecost(cfg) {
  ensurePrereqs(cfg);
  note('measuring per-competitor TS type-instantiation cost in the container');
  if (runInContainer(cfg, ['node', 'typecost/typecost.mjs']) !== 0) die('bench: typecost FAILED - see output above.');
}

function cmdCompiletime(cfg) {
  ensurePrereqs(cfg);
  mkdirSync(RESULTS_DIR, {recursive: true});
  note('measuring compile-time cost (strip / typecheck / full, whole suite, tsgo) in the container');
  const list = (process.env.RT_COMPILETIME_COMPETITORS || 'ts-runtypes typia').split(/\s+/).filter(Boolean);
  for (const competitor of list) {
    // Scoped refresh: only the competitors being run are cleared.
    rmSync(join(RESULTS_DIR, `${competitor}.compiletime.json`), {force: true});
    console.log(`-------- compiletime: ${competitor} --------`);
    if (runInContainer(cfg, ['sh', '-c', `cd competitors/${competitor} && node ../../compiletime/compiletime.mjs --competitor ${competitor}`]) !== 0) console.log(`==> compiletime '${competitor}' FAILED - see output above`);
  }
  publishDocdata(cfg);
}

function cmdTransformWire(cfg) {
  ensurePrereqs(cfg);
  mkdirSync(RESULTS_DIR, {recursive: true});
  note("measuring transform wire cost ('go' vs 'edits', swept over size x density x file count) in the container");
  rmSync(join(RESULTS_DIR, 'transform-wire.json'), {force: true});
  if (runInContainer(cfg, ['sh', '-c', 'cd competitors/ts-runtypes && node ../../transform-wire/transform-wire.mjs']) !== 0) console.log('==> transform-wire FAILED - see output above');
  publishDocdata(cfg);
}

function cmdSmoke(cfg) {
  ensurePrereqs(cfg);
  note("smoke: build every competitor's dist (no run)");
  cmdBuild(cfg);
}

// Cross-library validation alignment audit (analysis only, no timing).
function cmdAudit(cfg) {
  ensurePrereqs(cfg);
  clearResults((f) => f.endsWith('.alignment.json'));
  for (const competitor of competitorList()) {
    console.log(`-------- audit: ${competitor} --------`);
    if (runInContainer(cfg, ['sh', '-c', `cd competitors/${competitor} && pnpm run build && RT_AUDIT_ALIGNMENT=1 node dist/run.mjs`]) !== 0) console.log(`==> audit '${competitor}' FAILED (build or run) - see output above`);
  }
  console.log('-------- aggregate + classify (host) --------');
  if (run('node', [join(BENCH_DIR, '_audit/run-audit.mjs')]) !== 0) die('bench: audit run-audit failed');
  if (run('node', [join(BENCH_DIR, '_audit/classify.mjs')]) !== 0) die('bench: audit classify failed');
}

function cmdShell(cfg) {
  ensurePrereqs(cfg);
  runInContainer(cfg, ['bash']);
}

function cmdClean(cfg) {
  note("removing the typia .ttsc volume (the shared image is managed by 'pnpm rtx container clean')");
  capture(cfg.engine, ['volume', 'rm', '-f', cfg.volTtsc]);
}

// Map the single RT_BENCH_QUICK knob onto each stage's native lever. Only fill a
// lever that is UNSET (`${VAR+set}` test), so an explicit value wins.
function applyQuick() {
  if (process.env.RT_BENCH_QUICK !== '1') return;
  const setIfUnset = (name, value) => {
    if (!(name in process.env)) process.env[name] = value;
  };
  setIfUnset('RT_BENCH_TIME_MS', '20'); // runtime: short per-cell window (vs 100ms)
  setIfUnset('RT_COMPILETIME_N', '1'); // compile-time: single repeat (vs 5)
  setIfUnset('RT_TRANSFORM_WIRE_N', '1'); // transform-wire: single repeat (vs 5)
  setIfUnset('RT_BENCH_NO_TYPIA', '1'); // skip typia (its native build dominates)
  setIfUnset('RT_COMPILETIME_COMPETITORS', 'ts-runtypes');
  console.error(`==> RT_BENCH_QUICK on: fast/preview mode (RT_BENCH_TIME_MS=${process.env.RT_BENCH_TIME_MS}, RT_COMPILETIME_N=${process.env.RT_COMPILETIME_N}, typia skipped, serialization iters reduced). Numbers are noisy.`);
}

function dispatch(cfg, args) {
  const [cmd, ...rest] = args;
  switch (cmd) {
    case 'prep': return ensureArtifacts('all', 'linux-go', 'linux-extract');
    case 'build-image': return buildImage(cfg);
    case undefined:
    case 'bench': return (requireEngine(cfg), cmdBench(cfg));
    case 'bench-one': return (requireEngine(cfg), cmdBenchOne(cfg, rest[0]));
    case 'fullbench': return (requireEngine(cfg), cmdFullbench(cfg));
    case 'serialization': return (requireEngine(cfg), cmdSerialization(cfg));
    case 'website-bench': return (requireEngine(cfg), cmdWebsiteBench(cfg));
    case 'build': return (requireEngine(cfg), cmdBuild(cfg, rest[0]));
    case 'smoke': return (requireEngine(cfg), cmdSmoke(cfg));
    case 'audit': return (requireEngine(cfg), cmdAudit(cfg));
    case 'typecost': return (requireEngine(cfg), cmdTypecost(cfg));
    case 'compiletime': return (requireEngine(cfg), cmdCompiletime(cfg));
    case 'transform-wire': return (requireEngine(cfg), cmdTransformWire(cfg));
    case 'capture-env': return (requireEngine(cfg), ensurePrereqs(cfg), runInContainer(cfg, ['node', 'capture-env.mjs']));
    case 'shell': return (requireEngine(cfg), cmdShell(cfg));
    case 'login': return image.cmdLogin({env: benchImageEnv(cfg)});
    case 'push': return image.cmdPush({env: benchImageEnv(cfg)});
    case 'pull': return image.cmdPull({env: benchImageEnv(cfg)});
    case 'clean': return (requireEngine(cfg), cmdClean(cfg));
    default: die(`bench: unknown command '${cmd}'. Try: prep | build-image | bench | bench-one <name> | fullbench | serialization | website-bench | build [<name>] | smoke | audit | typecost | compiletime | transform-wire | shell | login | push | pull | clean`);
  }
}

export function main(rawArgs) {
  // Pull --quick out of the args from any position (sets RT_BENCH_QUICK); everything
  // else is forwarded unchanged.
  const args = [];
  for (const arg of rawArgs) {
    if (arg === '--quick') process.env.RT_BENCH_QUICK = '1';
    else args.push(arg);
  }
  applyQuick();
  dispatch(config(), args);
}

if (import.meta.main) {
  loadEnv();
  try {
    main(process.argv.slice(2));
  } catch (err) {
    reportCliError(err);
  }
}
