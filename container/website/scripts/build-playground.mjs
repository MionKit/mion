// build-playground.mjs: host-side prebuild of the static assets the docs site's
// <RuntypesPlayground> Vue component fetches from /playground-app/:
//
//   public/playground-app/ts-runtypes.wasm.gz   the resolver compiled to wasm (gz)
//   public/playground-app/wasm_exec.js          Go's wasm runtime shim
//   public/playground-app/runtypes-sources.json the mion source overlay the
//                                               resolver type-checks snippets against
//
// Run this on the HOST (needs the Go toolchain + bootstrapped submodule, see
// ../../../SETUP.md) before `pnpm miondevx website dev`. public/ is bind-mounted into the
// container, so the staged files ride in. Port of the former build-playground.sh.
//
// The WASM build is STALENESS-GATED so repeated dev/build starts do NOT recompile
// when nothing changed: a fast mtime pre-check over the Go inputs (against a stamp),
// then a `go tool buildid` compare (same mechanism as scripts/core/build.mjs) that
// only recompiles on a real input change. Gzip runs ONLY when the wasm bytes changed.

import {gzipSync} from 'node:zlib';
import {cpSync, copyFileSync, existsSync, globSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, utimesSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {GO_ROOT, loadEnv, REPO_ROOT} from '../../../scripts/lib/env.mjs';
import {capture, die, note, reportCliError, run, warn, which} from '../../../scripts/lib/proc.mjs';
import {readWasmStamp, wasmInputsDigest} from '../../../scripts/website/playground-wasm-inputs.mjs';

const WEBSITE_DIR = join(REPO_ROOT, 'container/website');
const CACHE_DIR = join(REPO_ROOT, '.cache/rt-wasm');
const RAW_WASM = join(CACHE_DIR, 'mion.wasm');
const RAW_GZ = join(CACHE_DIR, 'mion.wasm.gz');
const WASM_EXEC = join(CACHE_DIR, 'wasm_exec.js');
const SOURCES_JSON = join(CACHE_DIR, 'runtypes-sources.json');
const SIDECAR_HOOK = join(CACHE_DIR, 'sidecar-hook.js');
const STAMP = join(CACHE_DIR, '.wasm-stamp');
const OUT_DIR = join(WEBSITE_DIR, 'public/playground-app');
// The compiled DIST (not src) is vendored INTO the site (git-ignored, re-synced on
// change) because Vite's dev server only serves modules inside the Nuxt project root.
const VENDOR_DIR = join(WEBSITE_DIR, 'app/playground/.vendor/ts-runtypes-dist');

const WASM_PKG = './cmd/mion-wasm';
// The Go inputs the wasm links live in scripts/website/playground-wasm-inputs.mjs,
// shared with the test loader so both gates agree on what an input is.
// The source overlay tracks only the marker package's src.
const SOURCES_INPUT = 'packages/run-types/src';

const mtime = (p) => statSync(p).mtimeMs;
// True if any file at/under the given repo-relative inputs is newer than `anchorMs`.
function anyNewer(inputs, anchorMs) {
  for (const input of inputs) {
    const abs = join(REPO_ROOT, input);
    if (!existsSync(abs)) continue;
    if (statSync(abs).isFile()) {
      if (mtime(abs) > anchorMs) return true;
      continue;
    }
    for (const rel of globSync('**/*', {cwd: abs})) {
      const full = join(abs, rel);
      if (statSync(full).isFile() && mtime(full) > anchorMs) return true;
    }
  }
  return false;
}

function findWasmExecSrc() {
  const goroot = capture('go', ['env', 'GOROOT']).stdout.trim();
  for (const candidate of [join(goroot, 'lib/wasm/wasm_exec.js'), join(goroot, 'misc/wasm/wasm_exec.js')]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

// ── WASM: two-tier staleness gate (rebuilds the raw .wasm only on real change) ──

// Tier 1 (~60ms): missing wasm, or the digest recorded beside it no longer
// matches the Go tree. Content rather than mtimes, because a stale cache copied
// into a worktree can carry a stamp NEWER than the checkout it no longer matches;
// an mtime compare calls that fresh and hands the tests dead code.
const stampWasm = () => writeFileSync(STAMP, `${wasmInputsDigest(REPO_ROOT)}\n`);
const wasmMaybeStale = () => !existsSync(RAW_WASM) || readWasmStamp(STAMP) !== wasmInputsDigest(REPO_ROOT);

// sameAsDisk: would the freshly built wasm ship identically to what's on disk?
// Plain `go` output isn't byte-stable across builds but its buildid is, so compare buildids.
function sameAsDisk(builtPath, diskPath) {
  const diskId = capture('go', ['tool', 'buildid', diskPath]).stdout.trim();
  const refId = capture('go', ['tool', 'buildid', builtPath]).stdout.trim();
  return !!diskId && diskId === refId;
}

// Returns true when the raw wasm bytes changed (so derived artifacts must refresh).
function buildWasmIfStale() {
  if (!wasmMaybeStale()) {
    note('wasm up to date (Go inputs digest matches the stamp)');
    return false;
  }
  if (!which('go')) {
    warn('Go toolchain not found - skipping wasm build (/playground will 404 until built).');
    return false;
  }
  note('wasm inputs changed - building reference (GOOS=js GOARCH=wasm) ...');
  const tmp = join(CACHE_DIR, `.wasm-ref-${process.pid}`);
  try {
    // No version ldflags: the asset is dev-only, and matching flags is what lets the
    // staleness compare cache (see core/build.mjs checkGo). Keep it flagless.
    const built = run('go', ['build', '-o', tmp, WASM_PKG], {cwd: GO_ROOT, env: {GOOS: 'js', GOARCH: 'wasm'}});
    if (built !== 0) die('==> ERROR: wasm build failed.');
    if (existsSync(RAW_WASM) && sameAsDisk(tmp, RAW_WASM)) {
      // Inputs changed but the compiler produced the same bytes (comments, tests,
      // testdata). Record the new digest so tier 1 is quiet next time; skip the
      // expensive gzip + wasm_exec copy.
      stampWasm();
      note('wasm unchanged - skipped gzip');
      return false;
    }
    renameSync(tmp, RAW_WASM);
    stampWasm();
    note('wasm rebuilt');
    return true;
  } finally {
    rmSync(tmp, {force: true});
  }
}

// touch(path): create if missing, else bump mtime (the stamp is the freshness anchor).
function touch(path) {
  if (!existsSync(path)) writeFileSync(path, '');
  else {
    const now = new Date();
    utimesSync(path, now, now);
  }
}

// Ensure the browser-facing derived artifacts exist and are fresh vs the raw wasm.
// Self-heals a partial cache without a recompile; gzips ONLY when the wasm is newer.
// Returns true when it changed anything.
function ensureWasmDerived() {
  let changed = false;
  if (!existsSync(RAW_WASM)) {
    warn(`no raw wasm in ${CACHE_DIR} - /playground will 404 until built on a Go host`);
    return false;
  }
  if (!existsSync(RAW_GZ) || mtime(RAW_WASM) > mtime(RAW_GZ)) {
    // zlib gzip (browser inflates via DecompressionStream): no external `gzip`.
    note('gzip the wasm (browser inflates via DecompressionStream) ...');
    writeFileSync(RAW_GZ, gzipSync(readFileSync(RAW_WASM), {level: 9}));
    changed = true;
  }
  if (!existsSync(WASM_EXEC)) {
    if (!which('go')) {
      warn('wasm_exec.js missing and no Go to copy it from.');
      return changed;
    }
    const execSrc = findWasmExecSrc();
    if (!execSrc) die(`==> ERROR: wasm_exec.js not found under ${capture('go', ['env', 'GOROOT']).stdout.trim()}`);
    copyFileSync(execSrc, WASM_EXEC);
    changed = true;
  }
  return changed;
}

// ── Source overlay: staleness gate on packages/run-types/src ────────────────

function buildSourcesIfStale() {
  if (existsSync(SOURCES_JSON) && !anyNewer([SOURCES_INPUT], mtime(SOURCES_JSON))) {
    note('mion source overlay up to date');
    return false;
  }
  if (!which('node')) die('==> ERROR: node not found (needed to build the source overlay).');
  note('building mion source overlay ...');
  if (run('node', [join(REPO_ROOT, 'scripts/website/playground-overlay.mjs'), join(REPO_ROOT, SOURCES_INPUT), SOURCES_JSON]) !== 0) die('==> ERROR: source overlay build failed.');
  return true;
}

// ── Sidecar hook: the playground's JS engine for pattern generation ──────────

// The resolver WASM routes pattern validation + mockSample generation through
// the __tsRunTypesJsEngine host hook when it is installed (jsengine/wasm.go).
// The hook is the sidecar package's IIFE build (dist/sidecar-hook.js); loaded
// as a classic script before the WASM instantiates, the playground generates
// the SAME deterministic samples a native build does. Missing hook = the page
// still works, generation degrades to the declare-mockSamples diagnostic.
const SIDECAR_PKG_DIR = 'packages/go-be-sidecar';
const SIDECAR_HOOK_BUILT = join(REPO_ROOT, SIDECAR_PKG_DIR, 'dist/sidecar-hook.js');

function buildSidecarHookIfStale() {
  const inputs = [`${SIDECAR_PKG_DIR}/src`, `${SIDECAR_PKG_DIR}/vite.config.ts`, `${SIDECAR_PKG_DIR}/vite.hook.config.ts`];
  if (existsSync(SIDECAR_HOOK) && !anyNewer(inputs, mtime(SIDECAR_HOOK))) {
    note('sidecar hook up to date');
    return false;
  }
  if (!which('pnpm')) {
    warn('pnpm not found - skipping sidecar hook build (playground pattern generation will degrade)');
    return false;
  }
  note('building the sidecar hook (playground JS engine) ...');
  // gen-sidecar-js runs the package build (both vite configs) AND refreshes
  // the committed Go bundle: one command, no way for the two to drift.
  if (run('node', [join(REPO_ROOT, 'scripts/core/gen-sidecar-js.mjs')]) !== 0) {
    warn('sidecar hook build failed - playground pattern generation will degrade');
    return false;
  }
  if (!existsSync(SIDECAR_HOOK_BUILT)) {
    warn(`sidecar hook build produced no ${SIDECAR_HOOK_BUILT}`);
    return false;
  }
  copyFileSync(SIDECAR_HOOK_BUILT, SIDECAR_HOOK);
  return true;
}

// ── Vendor the mion runtime dist into the site (in-project) ────────────

function vendorRuntimeIfStale() {
  // Keep the marker dist fresh vs its src (the same check `pnpm test` runs), then
  // vendor it into the site. Output suppressed like the shell's `>/dev/null 2>&1`.
  if (run('node', [join(REPO_ROOT, 'scripts/core/build.mjs'), 'marker-dist'], {stdio: 'ignore'}) !== 0) {
    warn('mion dist freshness check failed - vendoring whatever exists');
  }
  const distSrc = join(REPO_ROOT, 'packages/run-types/dist');
  if (!existsSync(distSrc)) {
    warn("packages/run-types/dist missing - run 'pnpm run build' first");
    return false;
  }
  // Re-sync only when a dist file is newer than the vendor dir's stamp (cp preserves
  // mtimes, so the DIR mtime (set by touch after each sync)is the anchor).
  if (existsSync(VENDOR_DIR) && !anyNewerAbs(distSrc, mtime(VENDOR_DIR))) {
    note('mion runtime vendor up to date');
    return false;
  }
  note('vendoring mion runtime dist into the site ...');
  rmSync(VENDOR_DIR, {recursive: true, force: true});
  mkdirSync(VENDOR_DIR, {recursive: true});
  cpSync(distSrc, VENDOR_DIR, {recursive: true});
  touch(VENDOR_DIR);
  return true;
}

// True if any file under an ABSOLUTE dir is newer than anchorMs.
function anyNewerAbs(dir, anchorMs) {
  for (const rel of globSync('**/*', {cwd: dir})) {
    const full = join(dir, rel);
    if (statSync(full).isFile() && mtime(full) > anchorMs) return true;
  }
  return false;
}

// ── Stage into public/playground-app/ ─────────────────────────────────────────

function stage() {
  for (const [src, dst] of [
    [RAW_GZ, join(OUT_DIR, 'mion.wasm.gz')],
    [WASM_EXEC, join(OUT_DIR, 'wasm_exec.js')],
    [SOURCES_JSON, join(OUT_DIR, 'runtypes-sources.json')],
    [SIDECAR_HOOK, join(OUT_DIR, 'sidecar-hook.js')],
  ]) {
    if (!existsSync(src)) {
      warn(`missing ${src} - the /playground page will not load until it is built`);
      continue;
    }
    if (!existsSync(dst) || mtime(src) > mtime(dst)) copyFileSync(src, dst);
  }
}

export function main() {
  mkdirSync(CACHE_DIR, {recursive: true});
  mkdirSync(OUT_DIR, {recursive: true});
  const wasmChanged = buildWasmIfStale();
  const derivedChanged = ensureWasmDerived();
  const sourcesChanged = buildSourcesIfStale();
  const hookChanged = buildSidecarHookIfStale();
  const vendorChanged = vendorRuntimeIfStale();
  stage();
  if (wasmChanged || derivedChanged || sourcesChanged || hookChanged || vendorChanged) note(`staged playground assets -> ${OUT_DIR}`);
  else note(`playground assets already fresh -> ${OUT_DIR}`);
  for (const entry of readdirSync(OUT_DIR)) console.log(`  ${entry}`);
}

if (import.meta.main) {
  loadEnv();
  try {
    main();
  } catch (err) {
    reportCliError(err);
  }
}
