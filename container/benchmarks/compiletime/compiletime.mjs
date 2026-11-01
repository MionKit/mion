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
//                mion  `vite build` + the @mionjs/devtools plugin (the Go resolver,
//                             itself tsgo, generates the validators; the bundler emits
//                             them). RT's transform is not a tsgo plugin, so this is its
//                             real build path rather than a `tsgo` CLI call. Spawned as a
//                             process like ttsc, so both pay the same process start.
//
// Both lanes compile the SAME cases: only those both libraries support, each call
// emitted verbatim (options and typia's STRICT `createEquals` included).
//
// The deltas read the story: typecheck - strip = the cost of type-checking; full -
// typecheck = the cost of the transform + emitting the functions.
//
// Run with cwd = competitors/<name>; tsgo/ttsc/vite + the bind-mounted plugin all live
// in that competitor's node_modules. Each number is the median of N (default 5); a
// warm-up build runs first so typia's ttsc plugin compile (if the image did not bake
// it) never lands in a tier. Any build that exits non-zero fails the run.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {hasParserApi, makeExtractors} from '../_lib/extract-cases.mjs';

const argOf = (flag) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const intEnv = (name, dflt) => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : dflt;
};

const COMPETITOR = argOf('--competitor');
if (COMPETITOR !== 'mion' && COMPETITOR !== 'typia') {
  console.error('compiletime: --competitor must be mion or typia');
  process.exit(1);
}
const COMPETITOR_DIR = process.cwd();
const RESULTS_DIR = process.env.MION_VALIDATION_BENCH_RESULTS_DIR ?? '/bench/results';
const N = intEnv('MION_COMPILETIME_N', 5);

const PROBE = path.join(COMPETITOR_DIR, '__compiletime_probe.ts');
const PROBE_TSCONFIG = path.join(COMPETITOR_DIR, '__compiletime_tsconfig.json');
const OUT_DIR = path.join(COMPETITOR_DIR, '.compiletime-out');
const MION_CACHE = path.join(COMPETITOR_DIR, '.compiletime-rt-cache');
const VITE_CACHE = path.join(COMPETITOR_DIR, '.compiletime-vite-cache');
const MION_BINARY = process.env.MION_BINARY ?? path.join(COMPETITOR_DIR, 'bin', 'mion');
// The native compiler: `@typescript/native-preview` exposes it as `tsgo`, TypeScript 7
// (what the typia lane installs, since ttsc resolves the `typescript` package) exposes
// the same binary as `tsc`. Prefer the explicit preview bin, fall back to typescript's.
const TSGO =
  ['tsgo', 'tsc'].map((bin) => path.join(COMPETITOR_DIR, 'node_modules', '.bin', bin)).find((bin) => fs.existsSync(bin)) ??
  path.join(COMPETITOR_DIR, 'node_modules', '.bin', 'tsgo');
const TTSC = path.join(COMPETITOR_DIR, 'node_modules', '.bin', 'ttsc');
const VITE = path.join(COMPETITOR_DIR, 'node_modules', '.bin', 'vite');
const VITE_CONFIG = path.join(COMPETITOR_DIR, '__compiletime_vite.config.mjs');
async function resolveTypescript() {
  const competitors = path.resolve(COMPETITOR_DIR, '..');
  for (const dir of [COMPETITOR_DIR, path.join(competitors, 'mion'), path.join(competitors, 'zod')]) {
    try {
      const r = createRequire(path.join(dir, '__rt_resolve.cjs'));
      const mod = await import(pathToFileURL(r.resolve('typescript')).href);
      if (hasParserApi(mod)) return mod;
    } catch {
      /* next */
    }
  }
  throw new Error('no typescript with a parser API (createSourceFile) resolvable');
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
  const blocks = keys.map((key, i) => {
    const e = model.entries[key];
    return `{\n${decls(e.locals)}const __v${i} = ${e.callText};\nvoid __v${i};\n}`;
  });
  return `${model.preamble.join('\n')}\n${blocks.join('\n')}\n`;
}

// ── tiers ────────────────────────────────────────────────────────────────────
// Each returns wall-clock ms for one build of the current PROBE. A non-zero exit fails
// the run: a build that errored did not do the work being timed.
function spawnMs(bin, args, env) {
  const t0 = process.hrtime.bigint();
  const r = spawnSync(bin, args, {
    cwd: COMPETITOR_DIR,
    stdio: 'pipe',
    maxBuffer: 64 * 1024 * 1024,
    env: env ? {...process.env, ...env} : process.env,
  });
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  if (r.error || r.status !== 0) {
    const out = `${r.stdout ?? ''}${r.stderr ?? ''}`.slice(0, 4000);
    throw new Error(`${path.basename(bin)} ${args.join(' ')} exited ${r.status ?? r.error?.message}\n${out}`);
  }
  return ms;
}

const stripMs = () => spawnMs(TSGO, ['-p', PROBE_TSCONFIG, '--noCheck', '--noEmit', 'false', '--outDir', OUT_DIR]);
// type-check AND emit (NOT --noEmit), so it is apples-to-apples with strip (which also
// emits): the ONLY difference is the type-checking, making typecheck - strip the pure
// cost of type-checking rather than (check - emit).
const typecheckMs = () => spawnMs(TSGO, ['-p', PROBE_TSCONFIG, '--noEmit', 'false', '--outDir', OUT_DIR]);

let fullMs; // set per competitor

function setupFull() {
  if (COMPETITOR === 'typia') {
    fullMs = () => spawnMs(TTSC, ['-p', PROBE_TSCONFIG, '--outDir', OUT_DIR]);
    return;
  }
  const j = JSON.stringify;
  fs.writeFileSync(
    VITE_CONFIG,
    `import rt from '@mionjs/devtools/runtypes/vite';\n` +
      `export default {root: ${j(COMPETITOR_DIR)}, logLevel: 'silent', clearScreen: false, cacheDir: ${j(VITE_CACHE)},\n` +
      `  plugins: [rt({binary: ${j(MION_BINARY)}, cwd: ${j(COMPETITOR_DIR)}, tsconfig: '__compiletime_tsconfig.json'})],\n` +
      `  build: {ssr: ${j(PROBE)}, outDir: ${j(OUT_DIR)}, write: true, minify: false, target: 'node22', emptyOutDir: true, reportCompressedSize: false, rollupOptions: {onwarn() {}}}};\n`
  );
  fullMs = () => {
    wipe(MION_CACHE);
    wipe(VITE_CACHE);
    // The RT disk cache follows the project's incremental setting; force it on at MION_CACHE (wiped above, so each
    // run starts cold) via the internal MION_CACHE_DIR env. The plugin's resolver child inherits it.
    return spawnMs(VITE, ['build', '--config', VITE_CONFIG], {MION_CACHE_DIR: MION_CACHE});
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
  for (const p of [PROBE, PROBE_TSCONFIG, VITE_CONFIG, OUT_DIR, MION_CACHE, VITE_CACHE]) wipe(p);
}

async function main() {
  const CALLS = {mion: ['createValidateFn'], typia: ['typia.createIs', 'typia.createEquals']};
  const extract = (lib) =>
    extractTypeForm(path.join(COMPETITOR_DIR, '..', lib, 'cases.ts'), 'cases', CALLS[lib], {allowUntyped: true});
  const model = extract(COMPETITOR);
  const other = extract(COMPETITOR === 'typia' ? 'mion' : 'typia');
  // Same set for both lanes: only the cases BOTH libraries support.
  const keys = model.keys.filter((k) => model.entries[k] && other.entries[k]);
  if (!keys.length) {
    console.error(`compiletime[${COMPETITOR}]: no supported cases`);
    process.exit(1);
  }

  fs.writeFileSync(PROBE, buildProbeSource(model, keys));
  fs.writeFileSync(
    PROBE_TSCONFIG,
    // Every tier emits (the base config is noEmit, which would also skip typia's emit-time transform). rootDir = the
    // bench root (probe + ../../shared) keeps all output under OUT_DIR; `.ts` import specifiers need the rewrite to emit.
    JSON.stringify(
      {
        extends: './tsconfig.json',
        compilerOptions: {noEmit: false, rootDir: '../..', rewriteRelativeImportExtensions: true},
        include: ['__compiletime_probe.ts', '../../shared'],
      },
      null,
      2
    )
  );
  setupFull();

  // Warm up each tier once (discarded): disk caches, and typia's ttsc plugin compile (if the image did not bake it
  // under node_modules/.cache/ttsc). A failing build aborts here.
  console.error(`compiletime[${COMPETITOR}]: warming up (${keys.length} types)...`);
  stripMs();
  typecheckMs();
  fullMs();

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
    samples.full.push(fullMs());
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
