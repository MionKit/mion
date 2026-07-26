// build.mjs — the WHOLE docs-site publish pipeline in one command. Port of the
// former scripts/website/build.sh. Chains the stages the Cloudflare Pages artifact
// needs, in dependency order, composing the migrated area modules:
//
//   1. shared website+benchmark podman image   (image.mjs ensureImage)
//   2. Go resolver binary + marker/plugin dist  (bench prep)
//   3. all benchmark data -> bench-data/        (bench website-bench)
//   4. playground assets -> public/playground-app/ (build-playground.mjs, host)
//   5. static Nuxt build -> .output/public      (site.mjs generate)
//   6. check the built site renders every benchmark (check-static.mjs, generate only)
//
// The Nuxt pages FETCH public/bench-data/ at runtime and the /playground page loads
// public/playground-app/ — both git-ignored, so stages 3-4 regenerate them before the
// site build (stage 5) bakes them in, and stage 6 serves the result and verifies every
// benchmark page's data actually made it in (a silently-empty dataset ships a page that
// renders "data not generated yet" — see scripts/website/check-static.mjs).
//
// Usage (via `pnpm rtx website build …`): [generate|build] [--quick] [--no-bench].
// --quick maps onto RT_BENCH_QUICK; --no-bench reuses existing bench data.

import {existsSync, globSync, mkdirSync, rmSync, statSync} from 'node:fs';
import {join} from 'node:path';
import {ensureImage} from '../container/image.mjs';
import {loadEnv, REPO_ROOT} from '../lib/env.mjs';
import {die, note, reportCliError, run, warn, which} from '../lib/proc.mjs';
import {main as benchMain} from './bench-data/bench.mjs';
import {main as checkStaticMain} from './check-static.mjs';
import {main as siteMain} from './site.mjs';

const WEBSITE_DIR = join(REPO_ROOT, 'container/website');
const OUTPUT_DIR = join(WEBSITE_DIR, '.output');

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
  die("website build: run a full 'pnpm rtx website build' once to generate bench-data, then re-run with --no-bench.");
}

// Human-readable byte size (KB/MB), for the zip line.
function humanSize(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}M`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)}K`;
  return `${bytes}B`;
}

export async function main(args) {
  // generate = static prerender -> .output/public (Cloudflare Pages default).
  // build    = SSR/nitro build  -> .output         (needs a server runtime).
  let target = 'generate';
  let skipBench = false;
  for (const arg of args) {
    if (arg === '--quick') process.env.RT_BENCH_QUICK = '1';
    else if (arg === '--no-bench') skipBench = true;
    else if (arg === 'generate' || arg === 'build') target = arg;
    else die(`website build: unknown arg '${arg}' (want: [generate|build] [--quick] [--no-bench])`, 2);
  }

  // One USE_LOCAL knob across image + bench: mirror whichever is set so a single
  // knob steers the whole run and the stages can't pick different images.
  if (process.env.RT_WEBSITE_USE_LOCAL || process.env.RT_BENCH_USE_LOCAL) {
    process.env.RT_WEBSITE_USE_LOCAL = '1';
    process.env.RT_BENCH_USE_LOCAL = '1';
  }

  // Fail fast: verify the reused data exists before spending time on the prereqs.
  if (skipBench) requireBenchArtifacts();

  step('1/6  shared website+benchmark podman image');
  ensureImage();

  step('2/6  Go resolver binary (+ marker/plugin dist)');
  benchMain(['prep']);

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

  step(`5/6  Nuxt ${target} -> container/website/.output`);
  await siteMain([target]);

  // Gate the artifact: serve the static output and assert every benchmark page's
  // data is there and non-empty. Only `generate` produces .output/public — an SSR
  // `build` has no static tree to serve, so it skips.
  if (target === 'generate') {
    step('6/6  check the built site renders every benchmark');
    await checkStaticMain([]);
  }

  // Package the static artifact into a single zip beside it (manual Cloudflare
  // dashboard "direct upload" / backup). Only for generate — the self-contained
  // static site. The zip holds the CONTENTS of public/ at its root; it lands at
  // .output/site.zip, a SIBLING of public/, so it is never swept into the deploy.
  if (target === 'generate' && existsSync(join(OUTPUT_DIR, 'public'))) {
    step('zip  container/website/.output/public -> .output/site.zip');
    if (which('zip')) {
      rmSync(join(OUTPUT_DIR, 'site.zip'), {force: true});
      if (run('zip', ['-r', '-q', '-X', '../site.zip', '.'], {cwd: join(OUTPUT_DIR, 'public')}) !== 0) die('website build: zip failed');
      console.log(`    wrote ${join(OUTPUT_DIR, 'site.zip')} (${humanSize(statSync(join(OUTPUT_DIR, 'site.zip')).size)})`);
    } else {
      warn("'zip' not on PATH - skipped site.zip (install 'zip' to enable)");
    }
  }

  console.log('');
  const quick = process.env.RT_BENCH_QUICK ? ', quick benchmarks' : '';
  const nobench = skipBench ? ', no-bench: reused bench data' : '';
  console.log(`==> website build DONE (target: ${target}${quick}${nobench})`);
  if (target === 'generate') {
    console.log('    static site:   container/website/.output/public');
    if (existsSync(join(OUTPUT_DIR, 'site.zip'))) console.log('    static zip:    container/website/.output/site.zip');
    console.log("    Cloudflare Pages 'build output directory' -> .output/public");
  } else {
    console.log('    server build:  container/website/.output  (needs a Node/nitro runtime)');
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
