// build.mjs — the WHOLE docs-site publish pipeline in one command. Port of the
// former scripts/website/build.sh. Chains the stages the Cloudflare Pages artifact
// needs, in dependency order, composing the migrated area modules:
//
//   1. shared website+benchmark podman image   (image.mjs ensureImage)
//   2. Go resolver binary + marker/plugin dist  (bench prep)
//   3. all benchmark data -> bench-data/        (bench website-bench)
//   4. playground assets -> public/playground-app/ (build-playground.mjs, host)
//      + homepage test counts -> app/data/test-counts.json (gen-test-counts.mjs)
//   5. static Nuxt build -> .output/<site>/public  (site.mjs generate, ONCE PER SITE)
//   6. check the built site is not hollow          (check-static.mjs, generate only)
//
// ONE Nuxt install builds TWO sites (runtypes + mion). Stages 1-4 are shared; 5 and 6
// run per site. `--site runtypes|mion` narrows it to one; `--parallel` (or
// MION_WEBSITE_PARALLEL=1) runs the two stage-5 builds AT ONCE, in two containers.
// Off by default: each build may take a ~6 GB heap, so it wants a 16 GB host.
//
// The Nuxt pages FETCH public/bench-data/ at runtime and the /playground page loads
// public/playground-app/ — both git-ignored, so stages 3-4 regenerate them before the
// site build (stage 5) bakes them in, and stage 6 serves the result and verifies every
// benchmark page's data actually made it in (a silently-empty dataset ships a page that
// renders "data not generated yet" — see scripts/website/check-static.mjs).
//
// Usage (via `pnpm miondevx website build …`): [generate|build] [--quick] [--no-bench]
// [--site runtypes|mion|both] [--parallel]. --quick maps onto MION_VALIDATION_BENCH_QUICK;
// --no-bench reuses existing bench data.

import {existsSync, globSync, rmSync, statSync} from 'node:fs';
import {join} from 'node:path';
import {ensureImage} from '../container/image.mjs';
import {loadEnv, REPO_ROOT} from '../lib/env.mjs';
import {capture, CliError, die, reportCliError, run, warn, which} from '../lib/proc.mjs';
import {main as benchMain} from './bench-data/bench.mjs';
import {main as checkStaticMain} from './check-static.mjs';
import {buildSite, ensureMionDists, outputDir as siteOutputDir, SITES} from './site.mjs';
import {main as testCountsMain} from './gen-test-counts.mjs';

const WEBSITE_DIR = join(REPO_ROOT, 'container/website');

const step = (msg) => console.log(`\n========== website build  ${msg} ==========`);

// Run a node script from the repo root; throw CliError on non-zero.
function node(rel, args = []) {
  if (run('node', [join(REPO_ROOT, rel), ...args]) !== 0) die(`website build: ${rel} failed`);
}

// --no-bench reuses already-generated data instead of re-running the (multi-minute)
// benchmark stage. The dir is git-ignored and produced ONLY by that stage, so assert
// UP FRONT and fail LOUD rather than shipping a wrong build.
function requireBenchArtifacts() {
  const dir = join(WEBSITE_DIR, 'public/bench-data');
  if (existsSync(dir) && globSync('**/*.json', {cwd: dir}).length > 0) return;
  console.error(`website build: --no-bench needs '${dir}' to already exist with data, but it is missing or empty.`);
  die("website build: run a full 'pnpm miondevx website build' once to generate bench-data, then re-run with --no-bench.");
}

// Human-readable byte size (KB/MB), for the zip line.
function humanSize(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}M`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)}K`;
  return `${bytes}B`;
}

// Two concurrent Nuxt builds each get a 6 GB V8 heap (site.mjs) plus native memory,
// so a host under ~14 GiB is likely to OOM-kill one. Soft guard: warn, never refuse
// (the engine may under-report a VM's memory).
const PARALLEL_MIN_GIB = 14;
function warnIfLowMemory(engine) {
  const bytes = Number(capture(engine, ['info', '--format', '{{.Host.MemTotal}}']).stdout.trim());
  if (!Number.isFinite(bytes) || bytes <= 0) return;
  const gib = bytes / 1024 ** 3;
  if (gib < PARALLEL_MIN_GIB) warn(`--parallel runs two Nuxt builds at once (up to ~6 GB heap each) but the ${engine} host reports only ${gib.toFixed(1)} GiB; drop --parallel if a build gets OOM-killed`);
}

export async function main(args) {
  // generate = static prerender -> .output/<site>/public (Cloudflare Pages default).
  // build    = SSR/nitro build  -> .output/<site>         (needs a server runtime).
  let target = 'generate';
  let skipBench = false;
  let site = process.env.MION_SITE || 'both';
  let parallel = process.env.MION_WEBSITE_PARALLEL === '1';
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--quick') process.env.MION_VALIDATION_BENCH_QUICK = '1';
    else if (arg === '--no-bench') skipBench = true;
    else if (arg === '--parallel') parallel = true;
    else if (arg === '--site') site = args[++i];
    else if (arg.startsWith('--site=')) site = arg.slice('--site='.length);
    else if (arg === 'generate' || arg === 'build') target = arg;
    else die(`website build: unknown arg '${arg}' (want: [generate|build] [--quick] [--no-bench] [--site runtypes|mion|both] [--parallel])`, 2);
  }
  const sites = site === 'both' ? [...SITES] : [site];
  for (const one of sites) {
    if (!SITES.includes(one)) die(`website build: unknown site '${one}' (want: ${SITES.join(' | ')} | both)`, 2);
  }

  // One USE_LOCAL knob across image + bench: mirror whichever is set so a single
  // knob steers the whole run and the stages can't pick different images.
  if (process.env.MION_WEBSITE_USE_LOCAL || process.env.MION_VALIDATION_BENCH_USE_LOCAL) {
    process.env.MION_WEBSITE_USE_LOCAL = '1';
    process.env.MION_VALIDATION_BENCH_USE_LOCAL = '1';
  }

  // Fail fast: verify the reused data exists before spending time on the prereqs.
  if (skipBench) requireBenchArtifacts();

  step('1/6  shared website+benchmark podman image');
  ensureImage();

  step('2/6  Go resolver binary (+ marker/plugin dist)');
  benchMain(['prep']);

  // The @mionjs/* dists the mion site's type hovers read. Staged HERE, once, rather
  // than per site inside site.mjs: they land in the bind-mounted packages/*/dist,
  // which two parallel builds must not race on.
  if (sites.includes('mion')) {
    step('     @mionjs dists (the mion site renders type hovers from them)');
    ensureMionDists('mion');
  }

  if (skipBench) {
    step('3/6  SKIPPED (--no-bench): reusing existing bench-data');
  } else {
    step('3/6  benchmarks -> container/website/public/bench-data/');
    benchMain(['website-bench']);
  }

  // The playground bundle is independent of the bench data (runs even under
  // --no-bench) but needs the stage-2 Go binary for its WASM.
  step('4/6  playground assets -> container/website/public/playground-app/');
  node('container/website/scripts/build-playground.mjs');

  // Refresh the homepage's test-count tiles. Placed after stage 2 because
  // collecting the Vitest suite needs the resolver binary + dists that stage
  // builds. NOT fatal: the counts are committed, so a host that cannot recount
  // ships the last known-good numbers rather than failing the whole site build.
  step('     homepage test counts -> container/website/app/data/test-counts.json');
  testCountsMain([]);

  // Stage 5 runs ONCE PER SITE: one Nuxt install, two static outputs. Sequential by
  // default; --parallel overlaps the two containers (per-site names, cache volumes
  // and output staging keep them apart, see site.mjs). Elapsed seconds are logged
  // per site so the two modes can be compared on a real host.
  const elapsed = {};
  const buildOne = async (one) => {
    const started = Date.now();
    step(`5/6  Nuxt ${target} (${one}) -> ${siteOutputDir(one)}${parallel && sites.length > 1 ? '  [parallel]' : ''}`);
    await buildSite(target, one, {parallel: parallel && sites.length > 1});
    elapsed[one] = Math.round((Date.now() - started) / 1000);
    console.log(`==> Nuxt ${target} (${one}) took ${elapsed[one]}s`);
  };
  if (parallel && sites.length > 1) {
    warnIfLowMemory(process.env.MION_WEBSITE_ENGINE || 'podman');
    const results = await Promise.allSettled(sites.map(buildOne));
    const failed = sites.filter((_, i) => results[i].status === 'rejected');
    for (const result of results) {
      // A CliError is the build's own failure (already printed); anything else is a bug.
      if (result.status === 'rejected' && !(result.reason instanceof CliError)) throw result.reason;
    }
    if (failed.length > 0) die(`website build: Nuxt ${target} failed for ${failed.join(' + ')}`);
  } else {
    for (const one of sites) await buildOne(one);
  }

  // Stage 6 + the zip stay sequential: check-static serves each artifact on its own port.
  for (const one of sites) {
    // Gate the artifact: serve the static output and assert the site is not hollow
    // (see check-static.mjs for what that means per site). Only `generate` produces
    // a public/ tree — an SSR `build` has nothing static to serve, so it skips.
    if (target === 'generate') {
      step(`6/6  check the built ${one} site`);
      await checkStaticMain(['--site', one]);
    }

    // Package the static artifact into a single zip beside it (manual Cloudflare
    // dashboard "direct upload" / backup). The zip holds the CONTENTS of public/ at
    // its root; it lands at .output/<site>/site.zip, a SIBLING of public/, so it is
    // never swept into the deploy.
    const out = siteOutputDir(one);
    if (target === 'generate' && existsSync(join(out, 'public'))) {
      step(`zip  ${join(out, 'public')} -> site.zip`);
      if (which('zip')) {
        rmSync(join(out, 'site.zip'), {force: true});
        if (run('zip', ['-r', '-q', '-X', '../site.zip', '.'], {cwd: join(out, 'public')}) !== 0) die('website build: zip failed');
        console.log(`    wrote ${join(out, 'site.zip')} (${humanSize(statSync(join(out, 'site.zip')).size)})`);
      } else {
        warn("'zip' not on PATH - skipped site.zip (install 'zip' to enable)");
      }
    }
  }

  console.log('');
  const quick = process.env.MION_VALIDATION_BENCH_QUICK ? ', quick benchmarks' : '';
  const nobench = skipBench ? ', no-bench: reused bench data' : '';
  const mode = parallel && sites.length > 1 ? ', parallel' : '';
  console.log(`==> website build DONE (target: ${target}, sites: ${sites.join(' + ')}${mode}${quick}${nobench})`);
  for (const one of sites) {
    const out = siteOutputDir(one);
    console.log(`    ${one.padEnd(9)} Nuxt ${target}: ${elapsed[one]}s`);
    if (target === 'generate') {
      console.log(`    ${' '.repeat(9)} static site: ${join(out, 'public')}`);
      if (existsSync(join(out, 'site.zip'))) console.log(`    ${' '.repeat(9)} static zip:  ${join(out, 'site.zip')}`);
    } else {
      console.log(`    ${one.padEnd(9)} server build: ${out}  (needs a Node/nitro runtime)`);
    }
  }
}

if (import.meta.main) {
  loadEnv();
  try {
    await main(process.argv.slice(2));
  } catch (err) {
    reportCliError(err);
  }
}
