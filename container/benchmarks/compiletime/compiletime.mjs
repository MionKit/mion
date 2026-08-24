// Compile-time benchmark — the build-time cost of each transform-based library, in
// three tiers, all measured on tsgo (the Go TypeScript both libraries transform on),
// over the WHOLE suite as a single file (one build, not per case):
//
//   strip      tsgo transpile + EMIT, types stripped, NO type-checking (the floor).
//   typecheck  tsgo full type-check + EMIT (a "normal" compile, no validators). It
//              emits the SAME as strip so the two are apples-to-apples: the only
//              difference is the type-checking, so typecheck - strip is its pure cost.
//   full       type-check + transform + emit the generated validators:
//                typia        `ttsc` (tsgo + the typia transform, emit)
//                ts-runtypes  `vite` + the ts-runtypes-devtools plugin (the Go resolver,
//                             itself tsgo, generates the validators; the bundler emits
//                             them). RT's transform is not a tsgo plugin, so this is its
//                             real build path rather than a `tsgo` CLI call.
//
// The deltas read the story: typecheck - strip = the cost of type-checking; full -
// typecheck = the cost of the transform + emitting the functions.
//
// Run with cwd = competitors/<name>; tsgo/ttsc/vite + the bind-mounted plugin all live
// in that competitor's node_modules. Each number is the median of N (default 5); a
// warm-up build runs first so the cold process-start (and typia's one-time ~200s ttsc
// plugin compile, cached in the .ttsc volume) never lands in a tier.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {makeExtractors} from '../_lib/extract-cases.mjs';

const argOf = (flag) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const intEnv = (name, dflt) => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : dflt;
};

const COMPETITOR = argOf('--competitor');
if (COMPETITOR !== 'ts-runtypes' && COMPETITOR !== 'typia') {
  console.error('compiletime: --competitor must be ts-runtypes or typia');
  process.exit(1);
}
const COMPETITOR_DIR = process.cwd();
const RESULTS_DIR = process.env.RT_BENCH_RESULTS_DIR ?? '/bench/results';
const N = intEnv('RT_COMPILETIME_N', 5);

const PROBE = path.join(COMPETITOR_DIR, '__compiletime_probe.ts');
const PROBE_TSCONFIG = path.join(COMPETITOR_DIR, '__compiletime_tsconfig.json');
const OUT_DIR = path.join(COMPETITOR_DIR, '.compiletime-out');
const RT_CACHE = path.join(COMPETITOR_DIR, '.compiletime-rt-cache');
const VITE_CACHE = path.join(COMPETITOR_DIR, '.compiletime-vite-cache');
const RT_BINARY = process.env.RT_BINARY ?? path.join(COMPETITOR_DIR, 'bin', 'ts-runtypes');
const TSGO = path.join(COMPETITOR_DIR, 'node_modules', '.bin', 'tsgo');
const TTSC = path.join(COMPETITOR_DIR, 'node_modules', '.bin', 'ttsc');

const req = createRequire(path.join(COMPETITOR_DIR, '__compiletime_resolve.cjs'));
const importFrom = async (spec) => import(pathToFileURL(req.resolve(spec)).href);
async function importExport(packageRoot, subpath) {
  const pkg = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
  const entry = pkg.exports?.[subpath] ?? pkg.exports?.['.'];
  const rel = typeof entry === 'string' ? entry : entry?.import ?? entry?.node ?? entry?.default;
  return import(pathToFileURL(path.join(packageRoot, rel)).href);
}
async function resolveTypescript() {
  const competitors = path.resolve(COMPETITOR_DIR, '..');
  for (const dir of [COMPETITOR_DIR, path.join(competitors, 'ts-runtypes'), path.join(competitors, 'zod')]) {
    try {
      const r = createRequire(path.join(dir, '__rt_resolve.cjs'));
      return await import(pathToFileURL(r.resolve('typescript')).href);
    } catch {
      /* next */
    }
  }
  throw new Error('typescript not resolvable');
}
const tsMod = await resolveTypescript();
const ts = tsMod.default ?? tsMod;
const {extractTypeForm} = makeExtractors(ts);

const wipe = (p) => {
  try {
    fs.rmSync(p, {recursive: true, force: true});
  } catch {
    /* best effort */
  }
};
const decls = (locals) => (locals.length ? locals.join('\n') + '\n' : '');

// ── whole-suite probe: every supported call site in one file ─────────────────
function buildProbeSource(model, keys) {
  const callOf = (typeText) =>
    COMPETITOR === 'typia' ? `typia.createIs<${typeText}>()` : `createValidateFn<${typeText}>()`;
  const blocks = keys.map((key, i) => {
    const e = model.entries[key];
    return `{\n${decls(e.locals)}const __v${i} = ${callOf(e.typeText)};\nvoid __v${i};\n}`;
  });
  return `${model.preamble.join('\n')}\n${blocks.join('\n')}\n`;
}

// ── tiers ────────────────────────────────────────────────────────────────────
// Each returns wall-clock ms for one build of the current PROBE. tsgo/ttsc are
// spawned; exit code is ignored (a type error in the suite still does the work we
// time — we measure cost, not correctness).
function spawnMs(bin, args) {
  const t0 = process.hrtime.bigint();
  spawnSync(bin, args, {cwd: COMPETITOR_DIR, stdio: 'ignore'});
  return Number(process.hrtime.bigint() - t0) / 1e6;
}

const stripMs = () => spawnMs(TSGO, ['-p', PROBE_TSCONFIG, '--noCheck', '--noEmit', 'false', '--outDir', OUT_DIR]);
// type-check AND emit (NOT --noEmit), so it is apples-to-apples with strip (which also
// emits): the ONLY difference is the type-checking, making typecheck - strip the pure
// cost of type-checking rather than (check - emit).
const typecheckMs = () => spawnMs(TSGO, ['-p', PROBE_TSCONFIG, '--noEmit', 'false', '--outDir', OUT_DIR]);

let fullMs; // set per competitor

async function setupFull() {
  if (COMPETITOR === 'typia') {
    fullMs = () => spawnMs(TTSC, ['-p', PROBE_TSCONFIG, '--outDir', OUT_DIR]);
    return;
  }
  const viteMod = await importFrom('vite');
  const viteBuild = viteMod.build ?? viteMod.default?.build;
  const rtPlugin = (await importExport(path.join(COMPETITOR_DIR, 'node_modules', '@ts-runtypes/devtools'), './vite')).default;
  fullMs = async () => {
    wipe(RT_CACHE);
    wipe(VITE_CACHE);
    // The RT disk cache follows the project's incremental setting; force it on
    // at RT_CACHE (a wipeable location) via the internal RT_CACHE_DIR env so
    // each run starts cold (wiped above) and the cache never lands in the
    // competitor's node_modules. The plugin's resolver child inherits this env.
    process.env.RT_CACHE_DIR = RT_CACHE;
    const t0 = process.hrtime.bigint();
    await viteBuild({
      configFile: false,
      root: COMPETITOR_DIR,
      logLevel: 'silent',
      clearScreen: false,
      cacheDir: VITE_CACHE,
      plugins: [rtPlugin({binary: RT_BINARY, cwd: COMPETITOR_DIR, tsconfig: '__compiletime_tsconfig.json'})],
      build: {ssr: PROBE, outDir: OUT_DIR, write: true, minify: false, target: 'node22', emptyOutDir: true, reportCompressedSize: false, rollupOptions: {onwarn() {}}},
    });
    return Number(process.hrtime.bigint() - t0) / 1e6;
  };
}

function median(xs) {
  const s = [...xs].sort((a, b) => a - b);
  if (s.length >= 3) {
    s.shift();
    s.pop();
  }
  return s.reduce((a, b) => a + b, 0) / s.length || 0;
}
const round = (n) => Math.round(n * 100) / 100;

function cleanup() {
  for (const p of [PROBE, PROBE_TSCONFIG, OUT_DIR, RT_CACHE, VITE_CACHE]) wipe(p);
}

async function main() {
  const callName = COMPETITOR === 'typia' ? 'typia.createIs' : 'createValidateFn';
  const model = extractTypeForm(path.join(COMPETITOR_DIR, 'cases.ts'), 'cases', callName);
  const keys = model.keys.filter((k) => model.entries[k]);
  if (!keys.length) {
    console.error(`compiletime[${COMPETITOR}]: no supported cases`);
    process.exit(1);
  }

  fs.writeFileSync(PROBE, buildProbeSource(model, keys));
  fs.writeFileSync(
    PROBE_TSCONFIG,
    JSON.stringify({extends: './tsconfig.json', include: ['__compiletime_probe.ts', '../../shared']}, null, 2)
  );
  await setupFull();

  // Warm up each tier once (discarded): Node JIT, tsgo/vite init, and typia's one-time
  // ttsc plugin compile (~200s, cached in .ttsc) — none of it lands in a measured cell.
  console.error(`compiletime[${COMPETITOR}]: warming up (${keys.length} types)...`);
  try {
    stripMs();
    typecheckMs();
    await fullMs();
  } catch (err) {
    console.error(`compiletime[${COMPETITOR}]: warm-up note: ${err?.message ?? err}`);
  }

  console.error(`compiletime[${COMPETITOR}]: timing strip / typecheck / full (median of ${N}, interleaved)...`);
  // Interleave the tiers per round (strip, typecheck, full, then repeat) instead of
  // timing them in separate blocks. Sequential blocks biased the FIRST tier (strip)
  // slow — it ran on the coldest system (fresh outDir + disk cache) while later tiers
  // warmed up — which wrongly made strip look slower than typecheck. Interleaving gives
  // every tier the same distribution of warm/cold rounds, so strip <= typecheck <= full
  // reflects the real work each does.
  const samples = {strip: [], typecheck: [], full: []};
  for (let i = 0; i < N; i++) {
    samples.strip.push(stripMs());
    samples.typecheck.push(typecheckMs());
    samples.full.push(await fullMs());
  }
  const strip = median(samples.strip);
  const typecheck = median(samples.typecheck);
  const full = median(samples.full);

  cleanup();
  const out = {
    competitor: COMPETITOR,
    types: keys.length,
    strip_ms: round(strip),
    typecheck_ms: round(typecheck),
    full_ms: round(full),
  };
  console.log(
    `\nCompile-time — ${COMPETITOR} (${keys.length} types, whole suite, tsgo, median of ${N})\n` +
      `  strip (transpile+emit)  ${out.strip_ms}ms\n` +
      `  typecheck (+emit)       ${out.typecheck_ms}ms\n` +
      `  full (+transform+emit)  ${out.full_ms}ms\n` +
      `  → type-check cost ${round(typecheck - strip)}ms · transform+emit cost ${round(full - typecheck)}ms`
  );
  fs.mkdirSync(RESULTS_DIR, {recursive: true});
  fs.writeFileSync(path.join(RESULTS_DIR, `${COMPETITOR}.compiletime.json`), JSON.stringify(out, null, 2) + '\n');
  console.log(`wrote ${path.join(RESULTS_DIR, `${COMPETITOR}.compiletime.json`)}`);
}

main().catch((err) => {
  console.error(err);
  cleanup();
  process.exit(1);
});
