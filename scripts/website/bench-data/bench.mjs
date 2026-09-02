// bench.mjs — drive the validation benchmarks inside the tsrt-website (podman) image.
// Port of the former scripts/website/bench-data/bench.sh.
//
// The image is BUILT + PUBLISHED by scripts/container/image.mjs: the tsrt-website
// image holds the website deps (at /app) and the benchmark deps (at /bench), in
// separate dirs with separate node_modules (the pre-publish e2e's verdaccio +
// builder toolchains live in a SEPARATE tsrt-e2e image, not here). This module runs
// the benchmark half under WORKDIR /bench and delegates image build/login/push/pull
// to image.mjs (mapping the MION_VALIDATION_BENCH_* knobs onto MION_WEBSITE_* via an explicit env
// override, replacing the old run_manager subshell). The in-container `sh -c '…'`
// blocks stay shell.
//
// Commands: prep | build-image | bench | bench-one <name> | fullbench | serialization
// | website-bench | build [<name>] | typecheck | smoke | audit | typecost |
// compiletime | transform-wire | capture-env | shell | login | push | pull | clean.
// A `--quick` flag anywhere maps onto every stage's native fast lever.

import {accessSync, constants, copyFileSync, existsSync, globSync, mkdirSync, readFileSync, readdirSync, rmSync} from 'node:fs';
import {cpus} from 'node:os';
import {join} from 'node:path';
import {main as coreBuild} from '../../core/build.mjs';
import * as image from '../../container/image.mjs';
import {ghcrConfig} from '../../lib/engine.mjs';
import {loadEnv, REPO_ROOT} from '../../lib/env.mjs';
import {capture, die, hostGoArch, note, reportCliError, run, which} from '../../lib/proc.mjs';
import {main as mionBenchMain} from './mion-bench.mjs';

// Env-independent paths.
const BENCH_DIR = join(REPO_ROOT, 'container/benchmarks');
const RESULTS_DIR = join(BENCH_DIR, 'results');
const MARKER_PKG = join(REPO_ROOT, 'packages/run-types');
const PLUGIN_PKG = join(REPO_ROOT, 'packages/devtools');
const BIN_PKG = join(REPO_ROOT, 'packages/bin');
const GOARCH = hostGoArch();
const LINUX_BIN = join(REPO_ROOT, `bin/mion-linux-${GOARCH}`);
const LINUX_EXTRACT_BIN = join(REPO_ROOT, `bin/extract-fn-bodies-linux-${GOARCH}`);
const SCRIPT_DIR = join(REPO_ROOT, 'scripts/website/bench-data');

function config(env = process.env) {
  const {registry, owner} = ghcrConfig();
  const containerBase = env.MION_VALIDATION_BENCH_CONTAINER || 'tsrt-bench';
  return {
    engine: env.MION_VALIDATION_BENCH_ENGINE || 'podman',
    image: env.MION_VALIDATION_BENCH_IMAGE || 'tsrt-website:dev',
    containerBase,
    mountOpts: env.MION_VALIDATION_BENCH_MOUNT_OPTS || '',
    runNetwork: env.MION_VALIDATION_BENCH_RUN_NETWORK || '',
    docdataDir: env.MION_VALIDATION_BENCH_DOCDATA || join(REPO_ROOT, '.docdata'),
    remoteImage: env.MION_VALIDATION_BENCH_REMOTE_IMAGE || `${registry}/${owner}/tsrt-website:latest`,
    // typia's LEGACY plugin volume, from before the image baked the compiled plugin:
    // only ever removed (`clean`), never mounted.
    volTtsc: `${containerBase}-typia-ttsc`,
  };
}

// Competitors run in this order; typia is included by default (MION_VALIDATION_BENCH_NO_TYPIA skips).
function competitorList() {
  const list = ['mion', 'zod', 'typebox', 'ajv'];
  if (!process.env.MION_VALIDATION_BENCH_NO_TYPIA) list.push('typia');
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

// Map the MION_VALIDATION_BENCH_* knobs onto image.mjs's MION_WEBSITE_* env (the old run_manager
// subshell), so the shared image has one owner.
function benchImageEnv(cfg) {
  const env = {...process.env, MION_WEBSITE_IMAGE: cfg.image, MION_WEBSITE_REMOTE_IMAGE: cfg.remoteImage};
  if (process.env.MION_VALIDATION_BENCH_ENGINE) env.MION_WEBSITE_ENGINE = process.env.MION_VALIDATION_BENCH_ENGINE;
  if (process.env.MION_VALIDATION_BENCH_BASE_IMAGE) env.MION_WEBSITE_BASE_IMAGE = process.env.MION_VALIDATION_BENCH_BASE_IMAGE;
  if (process.env.MION_VALIDATION_BENCH_PNPM_VERSION) env.MION_WEBSITE_PNPM_VERSION = process.env.MION_VALIDATION_BENCH_PNPM_VERSION;
  if (process.env.MION_VALIDATION_BENCH_CA_CERT) env.MION_WEBSITE_CA_CERT = process.env.MION_VALIDATION_BENCH_CA_CERT;
  if (process.env.MION_VALIDATION_BENCH_BUILD_NETWORK) env.MION_WEBSITE_BUILD_NETWORK = process.env.MION_VALIDATION_BENCH_BUILD_NETWORK;
  if (process.env.MION_VALIDATION_BENCH_USE_LOCAL) env.MION_WEBSITE_USE_LOCAL = '1';
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
    // dist is build OUTPUT (excluded from the ro mounts above), so it used to land
    // in the --rm container's throwaway layer — and buildAndRunOne builds and runs
    // in SEPARATE containers, so node/bun found no dist/run.mjs. Mount it rw from
    // the host (gitignored) so the emitted bundle survives across those runs.
    const distDir = join(competitorsDir, competitor, 'dist');
    mkdirSync(distDir, {recursive: true});
    args.push('-v', `${distDir}:/bench/competitors/${competitor}/dist${mo}`);
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
  const tsgo = '/bench/competitors/mion';
  args.push('-v', `${LINUX_BIN}:${tsgo}/bin/mion:ro${mo}`);
  args.push('-v', `${MARKER_PKG}:${tsgo}/node_modules/@mionjs/run-types:ro${mo}`);
  args.push('-v', `${PLUGIN_PKG}:${tsgo}/node_modules/@mionjs/devtools:ro${mo}`);
  if (existsSync(join(BIN_PKG, 'lib/index.js'))) args.push('-v', `${BIN_PKG}:${tsgo}/node_modules/@mionjs/bin:ro${mo}`);

  // typia's native ttsc plugin is BAKED into the image (node_modules/.cache/ttsc);
  // do NOT mount a volume there (an empty named volume would shadow it and force a
  // multi-minute recompile).
  args.push('-v', `${RESULTS_DIR}:/bench/results${mo}`);
  return args;
}

const netArgs = (cfg) => (cfg.runNetwork ? [`--network=${cfg.runNetwork}`] : []);

// Host CPU model (the container can't see it): os.cpus() gives the brand string on
// macOS + Linux (matches the shell's sysctl / /proc/cpuinfo read).
const hostCpu = () => cpus()[0]?.model ?? '';

function envArgs() {
  const args = ['-e', 'MION_VALIDATION_BENCH_RESULTS_DIR=/bench/results'];
  const cpu = hostCpu();
  if (cpu) args.push('-e', `MION_VALIDATION_BENCH_HOST_CPU=${cpu}`);
  const pass = (name) => {
    if (process.env[name]) args.push('-e', `${name}=${process.env[name]}`);
  };
  pass('MION_VALIDATION_BENCH_NO_TIMING');
  pass('MION_VALIDATION_BENCH_TIME_MS');
  pass('MION_VALIDATION_BENCH_CASE');
  pass('MION_VALIDATION_BENCH_DUMP');
  pass('MION_VALIDATION_BENCH_BUN');
  pass('MION_VALIDATION_BENCH_ENGINE_ASSERT');
  pass('MION_VALIDATION_BENCH_ENGINE_MARGIN');
  pass('MION_VALIDATION_BENCH_ENGINE_ITERS');
  pass('MION_COMPILETIME_N');
  pass('MION_TRANSFORM_WIRE_N');
  if (process.env.MION_VALIDATION_BENCH_QUICK === '1') args.push('-e', 'MION_VALIDATION_BENCH_QUICK=1');
  return args;
}

// Run a command in a fresh --rm container. Attach a TTY only when stdin is
// interactive; otherwise feed /dev/null so podman never swallows the caller's stdin.
function runInContainer(cfg, cmd) {
  const common = [...netArgs(cfg), ...mountArgs(cfg), ...envArgs(), '-w', '/bench', cfg.image, ...cmd];
  if (process.stdin.isTTY) return run(cfg.engine, ['run', '--rm', '-it', '--init', ...common]);
  return run(cfg.engine, ['run', '--rm', '--init', ...common], {stdio: ['ignore', 'inherit', 'inherit']});
}

// Bun (1.3.x) implements no `Temporal` global, so the DATETIME groups cannot build
// their samples there at all. The runner records them as not-supported (and lists them
// in the result's skippedGroups) rather than erroring the whole lane. A runtime
// capability gap, NOT a coverage choice - and it is logged on every bun run, so a
// bounded lane can never read as a complete one.
const BUN_SKIP_GROUPS = 'DATETIME';

// The bun lane is opt-OUT (MION_VALIDATION_BENCH_BUN=0), never opt-in, so a release lane cannot
// quietly lose it by forgetting a flag. Needs bun on PATH in the image.
function benchBun() {
  return process.env.MION_VALIDATION_BENCH_BUN !== '0';
}

// Where a given runtime's results land (result.ts: node keeps the canonical path,
// every other runtime gets a subdir so the published node table is untouched).
const runtimeResultsDir = (runtime) => (runtime === 'node' ? RESULTS_DIR : join(RESULTS_DIR, runtime));

// Build + run one competitor; a failure is reported but never aborts the loop, so
// every other lane still gets to write its results. Returns true when EVERY runtime
// lane ran.
//
// The message names WHICH of the two things went wrong, because they need opposite
// reactions and used to read identically. A lane that wrote no results/<name>.json
// did not run at all (its build broke) and its column will be missing from every
// page; a non-zero exit WITH a results file means the run finished and hit errored
// case(s). A correctness divergence never reaches here: each competitor's main.ts
// exits 0 on `fail`, because disagreeing with RunTypes on a sample is data for the
// Correctness page, not a broken lane (see shared/harness/result.ts).
//
// The build happens ONCE and every runtime then executes that same emitted bundle:
// bun is never asked to transpile TypeScript, it runs the identical dist/run.mjs node
// ran. That also makes this the only check in the repo that the emitted bundle is
// runtime-portable.
function buildAndRunOne(cfg, competitor, withBun = benchBun()) {
  console.log(`-------- competitor: ${competitor} --------`);
  if (runInContainer(cfg, ['sh', '-c', `cd competitors/${competitor} && pnpm run build`]) !== 0) {
    console.log(`==> competitor '${competitor}' DID NOT RUN (build failed) - no results written, its column will be missing from the tables`);
    return false;
  }
  const runs = [['node', 'node dist/run.mjs']];
  if (withBun) runs.push(['bun', `MION_VALIDATION_BENCH_SKIP_GROUPS=${BUN_SKIP_GROUPS} bun dist/run.mjs`]);
  let allRan = true;
  for (const [runtime, cmd] of runs) {
    if (runInContainer(cfg, ['sh', '-c', `cd competitors/${competitor} && ${cmd}`]) === 0) continue;
    const label = `competitor '${competitor}' (${runtime})`;
    // An MION_VALIDATION_BENCH_CASE inspection run writes no results file by design, so the
    // "did it write results?" signal does not apply to it.
    if (process.env.MION_VALIDATION_BENCH_CASE) console.log(`==> ${label} FAILED - see output above`);
    else if (existsSync(join(runtimeResultsDir(runtime), `${competitor}.json`)))
      console.log(`==> ${label}: errored case(s) - its results JSON WAS written, see the errors above`);
    else console.log(`==> ${label} DID NOT RUN (startup failed) - no results JSON, its column will be missing from the tables`);
    allRan = false;
  }
  return allRan;
}

// The engine-branch tripwire. rt::countEnumKeys picks a different counter per JS
// engine, and both counters are pinned to answer identically, so a WRONG pick costs
// throughput and never correctness - which is exactly why it can rot unnoticed. Each
// mion result records which counter was live; this asserts the recorded value
// matches the runtime that produced it. HARD failure by design: unlike throughput this
// is a discrete fact with no measurement noise, so it cannot flake.
function checkEngineBranch(withBun = benchBun()) {
  const expectations = [{dir: RESULTS_DIR, runtime: 'node', branch: 'v8'}];
  if (withBun) expectations.push({dir: join(RESULTS_DIR, 'bun'), runtime: 'bun', branch: 'jsc'});
  for (const {dir, runtime, branch} of expectations) {
    const file = join(dir, 'mion.json');
    if (!existsSync(file)) die(`bench: ${file} missing - the ${runtime} lane produced no mion result.`);
    const result = JSON.parse(readFileSync(file, 'utf8'));
    if (result.runtime !== runtime) {
      die(`bench: ${file} reports runtime '${result.runtime}' but must be '${runtime}' - that lane ran the wrong runtime.`);
    }
    if (result.engineBranch !== branch) {
      die(
        `bench: ${file} reports engineBranch '${result.engineBranch}' but ${runtime} must select '${branch}'. ` +
          `The rt::countEnumKeys per-engine branch is not doing its job (packages/run-types/src/runtypes/pure-fns-utils.ts).`
      );
    }
    if (result.skippedGroups?.length) {
      note(`${runtime} lane skipped group(s): ${result.skippedGroups.join(', ')} - runtime capability gap, recorded in the result`);
    }
    note(`${runtime} lane OK - rt::countEnumKeys selected the '${branch}' counter`);
  }
}

// Loud, single-line verdict for a set of lanes that did not run. Kept separate so
// every caller words it the same way.
const brokenLanesMessage = (broken) => `bench: ${broken.length} competitor lane(s) failed: ${broken.join(', ')} - see the per-competitor output above`;

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
  // The per-runtime subdirs too: a stale bun result surviving a failed bun run would
  // let checkEngineBranch pass on last week's numbers.
  const bunDir = join(RESULTS_DIR, 'bun');
  if (existsSync(bunDir)) for (const f of globSync('*.json', {cwd: bunDir})) if (pred(f)) rmSync(join(bunDir, f), {force: true});
}

// The counter-inversion tripwire, run INSIDE the image — bun is installed there, not
// on the CI runner host, and the check needs BOTH runtimes to compare per-engine. The
// script is dependency-free, so mounting the single file is enough.
//
// Report-only unless MION_VALIDATION_BENCH_ENGINE_ASSERT=1 is passed through; see the script header
// for why that default is deliberate (arm64 is unmeasured).
function cmdEngineCheck(cfg) {
  ensurePrereqs(cfg);
  const mo = cfg.mountOpts;
  const extra = ['-v', `${join(SCRIPT_DIR, 'engine-perf-check.mjs')}:/bench/engine-perf-check.mjs:ro${mo}`];
  const cmd = ['node', 'engine-perf-check.mjs'];
  const common = [...netArgs(cfg), ...mountArgs(cfg), ...envArgs(), ...extra, '-w', '/bench', cfg.image, ...cmd];
  const code = run(cfg.engine, ['run', '--rm', '--init', ...common], {stdio: ['ignore', 'inherit', 'inherit']});
  if (code !== 0) die('bench: engine-perf-check FAILED - see output above.');
}

function cmdBench(cfg) {
  ensurePrereqs(cfg);
  // MION_VALIDATION_BENCH_CASE inspection run: leave the canonical results JSON untouched.
  if (!process.env.MION_VALIDATION_BENCH_CASE) clearResults((f) => f !== 'env.json');
  const broken = competitorList().filter((competitor) => !buildAndRunOne(cfg, competitor));
  if (process.env.MION_VALIDATION_BENCH_CASE) return note(`MION_VALIDATION_BENCH_CASE='${process.env.MION_VALIDATION_BENCH_CASE}': per-case console output above; results JSON, aggregate and docdata left untouched.`);
  console.log('-------- engine branch --------');
  checkEngineBranch();
  console.log('-------- aggregate --------');
  runInContainer(cfg, ['node', 'aggregate.mjs']);
  publishDocdata(cfg);
  // Aggregate + docdata first: the lanes that DID run still publish their results.
  if (broken.length > 0) die(brokenLanesMessage(broken));
}

function cmdBenchOne(cfg, name) {
  if (!name) die('bench: usage: bench-one <competitor> (mion|zod|typebox|ajv|typia)');
  ensurePrereqs(cfg);
  if (!process.env.MION_VALIDATION_BENCH_CASE) clearResults((f) => f === `${name}.json`);
  const ok = buildAndRunOne(cfg, name);
  if (process.env.MION_VALIDATION_BENCH_CASE) return note(`MION_VALIDATION_BENCH_CASE='${process.env.MION_VALIDATION_BENCH_CASE}': per-case console output above; results JSON, aggregate and docdata left untouched.`);
  console.log('-------- aggregate --------');
  runInContainer(cfg, ['node', 'aggregate.mjs']);
  publishDocdata(cfg);
  // Re-running one competitor has to refresh the SITE's data too, not just
  // .docdata/ — otherwise the pages keep rendering the previous run's numbers.
  // Non-fatal here (unlike the publish path): this is the single-competitor dev
  // loop, and gen-docs legitimately has nothing to transform on a results dir
  // that only ever held one lane.
  note('gen-bench-docs (host transform -> container/website/public/bench-data)');
  if (run('node', [join(SCRIPT_DIR, 'gen-docs.mjs')]) !== 0) note('gen-docs failed - .docdata/ is up to date, the site data is not; re-run `pnpm rtx bench --website` before building the site');
  if (!ok) die(brokenLanesMessage([name]));
}

function cmdFullbench(cfg) {
  ensurePrereqs(cfg);
  clearResults((f) => f !== 'env.json');
  const broken = competitorList().filter((competitor) => !buildAndRunOne(cfg, competitor));
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
  // Returned rather than fatal here: cmdWebsiteBench has more stages to run and a
  // site to regenerate, so the broken lanes are its LAST word, not its first.
  return broken;
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
  const tsgo = '/bench/competitors/mion';
  const markerMount = `${tsgo}/node_modules/@mionjs/run-types`;
  const mo = cfg.mountOpts;
  const extraMounts = [];
  if (existsSync(join(BIN_PKG, 'lib/index.js'))) extraMounts.push('-v', `${BIN_PKG}:${tsgo}/node_modules/@mionjs/bin:ro${mo}`);
  return [
    'run', '--rm', '--init', ...netArgs(cfg), ...extraMounts,
    '-v', `${LINUX_BIN}:${tsgo}/bin/mion:ro${mo}`,
    '-v', `${LINUX_EXTRACT_BIN}:${tsgo}/bin/extract-fn-bodies:ro${mo}`,
    '-v', `${MARKER_PKG}:${markerMount}:ro${mo}`,
    // The marker package's tsconfig.json extends the REPO-ROOT one as
    // `../../tsconfig.json`. From the mount above that resolves to
    // <competitor>/node_modules/tsconfig.json, not the repo root — the scoped
    // name @mionjs/run-types puts the package a segment deeper than
    // packages/run-types is in the repo. Without this the resolver dies with
    // "tsconfig parse failed: Cannot read file …/node_modules/tsconfig.json"
    // before scanning a single site, which is how the v0.11.0 website deploy
    // shipped no serialization data. Mounting the real root config (not a copy)
    // keeps the suite compiling under exactly the options it does on the host.
    // repo-contracts.test.ts walks the `extends` chain and fails if a link ever
    // lands somewhere this argv doesn't mount.
    '-v', `${join(REPO_ROOT, 'tsconfig.json')}:${tsgo}/node_modules/tsconfig.json:ro${mo}`,
    '-v', `${PLUGIN_PKG}:${tsgo}/node_modules/@mionjs/devtools:ro${mo}`,
    '-v', `${join(SCRIPT_DIR, 'gen-serialization.mjs')}:${tsgo}/gen-serialization.mjs:ro${mo}`,
    '-v', `${out}:/bench/bench-out${mo}`,
    '-e', `MION_VALIDATION_BENCH_REPO_ROOT=${tsgo}`,
    '-e', `MION_VALIDATION_BENCH_VITE_ROOT=${tsgo}`,
    '-e', `MION_VALIDATION_BENCH_PACKAGE_ROOT=${markerMount}`,
    '-e', `MION_VALIDATION_BENCH_RT_OUTDIR=${tsgo}/.rt-bench-runtypes`,
    '-e', `MION_VALIDATION_BENCH_BIN=${tsgo}/bin/mion`,
    '-e', 'MION_VALIDATION_BENCH_PLUGIN_ENTRY=@mionjs/devtools/runtypes/vite',
    '-e', `MION_EXTRACT_BIN=${tsgo}/bin/extract-fn-bodies`,
    '-e', 'MION_VALIDATION_BENCH_OUT_DIR=/bench/bench-out',
    '-e', 'MION_VALIDATION_BENCH_SSR_NOEXTERNAL=mion,@mionjs/devtools',
    '-e', 'MION_VALIDATION_BENCH_CACHE_DIR=false',
    '-e', `MION_VALIDATION_BENCH_QUICK=${process.env.MION_VALIDATION_BENCH_QUICK || ''}`,
    '-w', tsgo, cfg.image, 'sh', '-c', SERIALIZATION_SCRIPT,
  ];
}

function cmdSerialization(cfg) {
  ensurePrereqs(cfg);
  if (!isExec(LINUX_EXTRACT_BIN)) die(`bench: missing ${LINUX_EXTRACT_BIN} - run 'pnpm rtx bench prep' first.`);
  if (!existsSync(join(MARKER_PKG, 'dist/index.js'))) die("bench: missing marker dist - run 'pnpm rtx bench prep' first.");
  if (!existsSync(join(PLUGIN_PKG, 'dist/index.js'))) die("bench: missing plugin dist - run 'pnpm rtx bench prep' first.");
  const out = process.env.MION_VALIDATION_BENCH_SERIALIZATION_OUT || join(REPO_ROOT, 'container/website/public/bench-data');
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
  const broken = cmdFullbench(cfg);
  cmdSerialization(cfg);
  cmdCompiletime(cfg);
  cmdAudit(cfg); // correctness/alignment data for the "Correctness" page
  note('gen-bench-docs (host transform -> container/website/public/bench-data)');
  if (run('node', [join(SCRIPT_DIR, 'gen-docs.mjs')]) !== 0) die('bench: gen-docs failed');
  // The OTHER family: the mion HTTP server benchmarks, in their own mion-bench image.
  // They run here so ONE command regenerates BOTH sites' numbers - the two sites are
  // built from one bench-data dir, and a website deploy runs this once.
  note('mion server benchmarks (mion-bench image)');
  // Carry --quick across the family boundary. The two drivers own separate arg spaces
  // and separate knobs (MION_VALIDATION_BENCH_QUICK vs MION_BENCH_QUICK), so without this the ONE
  // flag a caller passes only shortens the runtypes half and the mion half still runs
  // full 20s windows - a "quick" both-sites run that quietly takes ~25 minutes longer.
  mionBenchMain(['website', ...(process.env.MION_VALIDATION_BENCH_QUICK === '1' ? ['--quick'] : [])]);
  note('website-bench: done. container/website/public/bench-data/ regenerated (Node 26 / native Temporal).');
  // The site is regenerated either way; a lane that never ran shipped an EMPTY
  // column, so say so with a non-zero exit instead of a line lost in the log.
  if (broken.length > 0) die(brokenLanesMessage(broken));
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

// Type-check every competitor project (and, through each one's `include`, the
// shared cases + harness) inside the image.
//
// This is what makes the totality claim real. Each competitor's `cases.ts` is
// annotated `CompetitorCases` = `Record<CaseKey, CaseEntry>`, so a missing or
// misspelled case key is a compile error — but NOTHING used to compile these
// files: `vite build` and esbuild strip types without checking them, and the tree
// is outside every tsconfig on the host (its deps only exist in the image). So a
// dropped key was not a build failure, it was a silently absent column.
//
// The compiler comes from the competitor's OWN baked node_modules, so this needs
// no image rebuild. tsgo (the TypeScript 7 preview this project is built on) is
// preferred where it is installed and is the only option for typia, whose
// manifest carries no `typescript`; the mion lane's tsgo is the fallback
// for the competitors pinned to plain tsc, so every lane is checked by the same
// compiler the benchmarks are actually built with.
const TYPECHECK_SCRIPT = [
  // `../mion` is the COMPETITOR directory inside the image, not the repo package
    // directory. The rename read it as the latter and wrote ../run-types, which does
    // not exist in the image: every plain-tsc competitor then fell through to tsc and
    // lost Temporal from the default lib.
    'for candidate in node_modules/.bin/tsgo ../mion/node_modules/.bin/tsgo node_modules/.bin/tsc; do',
  '  [ -x "$candidate" ] && { compiler="$candidate"; break; }',
  'done',
  '[ -n "${compiler:-}" ] || { echo "no tsgo/tsc in this competitor\'s node_modules - rebuild the image"; exit 1; }',
  'echo "typecheck: $compiler -p tsconfig.json"',
  '"$compiler" -p tsconfig.json --noEmit',
].join('\n');

function cmdTypecheck(cfg) {
  ensurePrereqs(cfg);
  let failures = 0;
  for (const competitor of competitorList()) {
    console.log(`-------- typecheck: ${competitor} --------`);
    // Check every competitor before failing, so one drifted map does not hide the rest.
    if (runInContainer(cfg, ['sh', '-c', `cd competitors/${competitor} && ${TYPECHECK_SCRIPT}`]) !== 0) {
      console.log(`==> typecheck '${competitor}' FAILED - a case key is missing, excess or mistyped, or an API it calls no longer exists`);
      failures++;
    }
  }
  if (failures !== 0) die(`bench: ${failures} competitor project(s) failed to type-check`);
  note('typecheck: every competitor map is total over CaseKey (shared cases + harness checked with them)');
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
  const list = (process.env.MION_COMPILETIME_COMPETITORS || 'mion typia').split(/\s+/).filter(Boolean);
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
  if (runInContainer(cfg, ['sh', '-c', 'cd competitors/mion && node ../../transform-wire/transform-wire.mjs']) !== 0) console.log('==> transform-wire FAILED - see output above');
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
    if (runInContainer(cfg, ['sh', '-c', `cd competitors/${competitor} && pnpm run build && MION_AUDIT_ALIGNMENT=1 node dist/run.mjs`]) !== 0) console.log(`==> audit '${competitor}' FAILED (build or run) - see output above`);
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
  note("removing typia's legacy .ttsc volume, if any (the plugin is baked into the shared image now, which 'pnpm rtx container clean' manages)");
  capture(cfg.engine, ['volume', 'rm', '-f', cfg.volTtsc]);
}

// Map the single MION_VALIDATION_BENCH_QUICK knob onto each stage's native lever. Only fill a
// lever that is UNSET (`${VAR+set}` test), so an explicit value wins.
function applyQuick() {
  if (process.env.MION_VALIDATION_BENCH_QUICK !== '1') return;
  const setIfUnset = (name, value) => {
    if (!(name in process.env)) process.env[name] = value;
  };
  setIfUnset('MION_VALIDATION_BENCH_TIME_MS', '20'); // runtime: short per-cell window (vs 100ms)
  setIfUnset('MION_COMPILETIME_N', '1'); // compile-time: single repeat (vs 5)
  setIfUnset('MION_TRANSFORM_WIRE_N', '1'); // transform-wire: single repeat (vs 5)
  setIfUnset('MION_COMPILETIME_COMPETITORS', 'mion');
  console.error(`==> MION_VALIDATION_BENCH_QUICK on: fast/preview mode (MION_VALIDATION_BENCH_TIME_MS=${process.env.MION_VALIDATION_BENCH_TIME_MS}, MION_COMPILETIME_N=${process.env.MION_COMPILETIME_N}, serialization iters reduced). Numbers are noisy.`);
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
    case 'typecheck': return (requireEngine(cfg), cmdTypecheck(cfg));
    case 'smoke': return (requireEngine(cfg), cmdSmoke(cfg));
    case 'audit': return (requireEngine(cfg), cmdAudit(cfg));
    case 'typecost': return (requireEngine(cfg), cmdTypecost(cfg));
    case 'compiletime': return (requireEngine(cfg), cmdCompiletime(cfg));
    case 'transform-wire': return (requireEngine(cfg), cmdTransformWire(cfg));
    case 'engine-check': return (requireEngine(cfg), cmdEngineCheck(cfg));
    case 'capture-env': return (requireEngine(cfg), ensurePrereqs(cfg), runInContainer(cfg, ['node', 'capture-env.mjs']));
    case 'shell': return (requireEngine(cfg), cmdShell(cfg));
    case 'login': return image.cmdLogin({env: benchImageEnv(cfg)});
    case 'push': return image.cmdPush({env: benchImageEnv(cfg)});
    case 'pull': return image.cmdPull({env: benchImageEnv(cfg)});
    case 'clean': return (requireEngine(cfg), cmdClean(cfg));
    default: die(`bench: unknown command '${cmd}'. Try: prep | build-image | bench | bench-one <name> | fullbench | serialization | website-bench | build [<name>] | typecheck | smoke | audit | engine-check | typecost | compiletime | transform-wire | capture-env | shell | login | push | pull | clean`);
  }
}

export function main(rawArgs) {
  // Pull --quick out of the args from any position (sets MION_VALIDATION_BENCH_QUICK); everything
  // else is forwarded unchanged.
  const args = [];
  for (const arg of rawArgs) {
    if (arg === '--quick') process.env.MION_VALIDATION_BENCH_QUICK = '1';
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
