// build.mjs — ensure the build artifacts the rest of the workspace depends on
// match the current source. Port of the former scripts/core/build.sh (same job for
// the Go binary, plus structural checks on the two TS package dists the bench and
// `pnpm test` load). Behavior is IDENTICAL to the shell version — build-id compare,
// orphan-.d.ts.map detection, and mtime staleness are ported line-for-line.
//
// Targets (positional):
//   go            bin/ts-runtypes matches cmd/ + internal/ (build-id compare).
//   linux-go      bin/ts-runtypes-linux-<arch> matches the host binary —
//                 cross-compiled on macOS, copied on Linux. Used by the bench
//                 container to mount a Linux ELF on the host.
//   linux-extract bin/extract-fn-bodies-linux-<arch> — the source-body extractor
//                 as a Linux ELF, mounted into the bench container so the
//                 in-container serialization bench needs no Go toolchain.
//   marker-dist   packages/ts-runtypes/dist is internally consistent
//                 (every .d.ts.map has a matching .d.ts, sentinel files present,
//                 src not newer than dist). Repairs by wiping tsbuildinfo and
//                 running the package's `build` script — incremental tsc on its
//                 own would trust the corrupt buildinfo and re-skip emit.
//   plugin-dist   packages/ts-runtypes-devtools/dist, same checks.
//   all           go + marker-dist + plugin-dist. Default when no args given.
//                 NOT linux-go — that's bench-only; the bench script asks for it
//                 explicitly so `pnpm test` doesn't pay the cross-compile cost.
//
// Why the dist checks are paired (sentinel + .d.ts.map / .d.ts pairing): tsc with
// `incremental: true` writes tsconfig.tsbuildinfo recording which inputs produced
// which outputs. If a previous emit was interrupted the cheap .d.ts.map files can
// land without their .d.ts siblings; the buildinfo then memorizes that state and
// every subsequent incremental `tsc` skips emitting the missing .d.ts. Detecting
// the orphan map + wiping the buildinfo forces tsc to emit from scratch.
//
// Exit codes: 0 = everything up to date or repaired; non-zero = a build itself
// failed (toolchain broken, source error). Staleness alone is never a failure.

import {cpSync, existsSync, globSync, mkdirSync, readFileSync, renameSync, rmSync, statSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {GO_ROOT, loadEnv, REPO_ROOT} from '../lib/env.mjs';
import {capture, die, hostGoArch, info, red, reportCliError, run, success, warn, which} from '../lib/proc.mjs';
import {describe, headCommit, readPin, submoduleInitialised} from '../lib/tsgolint.mjs';

const GO_MODULE = 'github.com/mionkit/ts-runtypes';
const GO_BIN = join(REPO_ROOT, 'bin/ts-runtypes');
const GO_PKG = './cmd/ts-runtypes';
const EXTRACT_PKG = './cmd/extract-fn-bodies';
const MARKER_PKG_DIR = join(REPO_ROOT, 'packages/ts-runtypes');
const PLUGIN_PKG_DIR = join(REPO_ROOT, 'packages/ts-runtypes-devtools');

// Marker dist sentinels — the .d.ts files whose absence in a "fresh" dist is a
// strong signal that declaration emit was interrupted. markers.d.ts in particular
// is the file the Go marker scanner needs to resolve InjectRunTypeId.
const MARKER_SENTINELS = [join(MARKER_PKG_DIR, 'dist/index.d.ts'), join(MARKER_PKG_DIR, 'dist/markers.d.ts'), join(MARKER_PKG_DIR, 'dist/createRTFunctions.d.ts')];
const PLUGIN_SENTINELS = [join(PLUGIN_PKG_DIR, 'dist/index.d.ts')];

// Red "* core build: …" to stderr, then a code-only failure (staleness is never a
// failure; a build itself failing IS). Mirrors build.sh's fail().
function fail(msg) {
  console.error(red(`* core build: ${msg}`));
  die('', 1);
}

// ── go ───────────────────────────────────────────────────────────────────────

// Embed the workspace version into the binary so the on-disk RT cache is isolated
// across releases (internal/constants/version.go). The tsgo revision is pure
// metadata (surfaced by --version), never folded into the typeID hash.
function goVersionLdflags() {
  let version = 'dev';
  try {
    version = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')).version || 'dev';
  } catch {
    version = 'dev';
  }
  const tsgo = capture('git', ['-C', join(GO_ROOT, 'third_party/tsgolint'), 'rev-parse', '--short', 'HEAD']).stdout.trim() || 'dev';
  return `-X ${GO_MODULE}/internal/constants.Version=${version} -X ${GO_MODULE}/internal/constants.TsgoVersion=${tsgo}`;
}

// Read a Go build ID (empty string when the file is absent / unreadable).
const buildId = (bin) => capture('go', ['tool', 'buildid', bin]).stdout.trim();

// Build the reference into a temp file NEXT TO the target (same filesystem, so the
// rename into place is atomic and never hits EXDEV), returning the temp path.
function tempBesideBin(target) {
  return join(dirname(target), `.rt-build-ref-${process.pid}`);
}

// Warn (non-fatal) when the tsgolint submodule has drifted from the declared pin —
// bin/ts-runtypes would then be built against a NON-pinned typescript-go, which the
// build-id freshness check below CANNOT catch (it compares the binary to whatever
// source is checked out, not to the pin). `pnpm rtx core ensure-tsgolint` realigns it.
// Non-fatal so it never blocks a legitimate in-progress bump or local experiment.
function checkTsgolintPin() {
  if (!submoduleInitialised()) return;
  const pin = readPin();
  if (!pin) return;
  const head = headCommit();
  if (head === pin.commit || (pin.commit.length < 40 && head.startsWith(pin.commit))) return;
  warn(`tsgolint submodule is at ${describe()} (${head.slice(0, 7)}) but tsgolint.pin.json declares ${pin.ref} (${pin.commit.slice(0, 7)}). bin/ts-runtypes will build against a NON-pinned typescript-go — run \`pnpm rtx core ensure-tsgolint\` to realign.`);
}

function checkGo() {
  checkTsgolintPin();
  if (!which('go')) fail(`Go toolchain not found on PATH (needed to build ${GO_BIN}).`);
  const ldflags = goVersionLdflags();

  info('Checking bin/ts-runtypes...');
  if (!existsSync(GO_BIN)) {
    info('Building bin/ts-runtypes (missing; may take a moment on a cold cache)...');
    mkdirSync(dirname(GO_BIN), {recursive: true});
    if (run('go', ['build', '-ldflags', ldflags, '-o', GO_BIN, GO_PKG], {cwd: GO_ROOT}) !== 0) fail('Build failed.');
    return success('Built bin/ts-runtypes.');
  }

  // Build a reference and compare build IDs. `go list .Stale` is unreliable when we
  // build with `-o` to a custom location, so buildid is the reliable signal.
  info('Verifying bin/ts-runtypes matches current source...');
  const tmpBin = tempBesideBin(GO_BIN);
  try {
    if (run('go', ['build', '-ldflags', ldflags, '-o', tmpBin, GO_PKG], {cwd: GO_ROOT}) !== 0) fail('Reference build failed.');
    const diskId = buildId(GO_BIN);
    const refId = buildId(tmpBin);
    if (!diskId || !refId) fail('Could not read build IDs from bin/ts-runtypes or reference binary.');
    if (diskId !== refId) {
      info('Replacing bin/ts-runtypes (stale: build ID mismatch)...');
      renameSync(tmpBin, GO_BIN);
      success('Built bin/ts-runtypes.');
    } else {
      success('bin/ts-runtypes is up to date with source.');
    }
  } finally {
    rmSync(tmpBin, {force: true});
  }
}

// ── linux-go ────────────────────────────────────────────────────────────────

function checkLinuxGo() {
  // The bench container is Linux; the host bin is Mach-O on macOS, so we need a
  // parallel ELF at bin/ts-runtypes-linux-<arch>. On Linux hosts this is just a
  // copy of the host binary that the bench mount finds at a stable name.
  const goarch = hostGoArch();
  const linuxBin = join(REPO_ROOT, `bin/ts-runtypes-linux-${goarch}`);

  // The Go binary must be fresh first; otherwise we'd cross-compile (or copy) a
  // stale host binary forward into the linux slot.
  checkGo();

  info(`Checking bin/ts-runtypes-linux-${goarch}...`);
  if (process.platform === 'darwin') {
    if (!existsSync(linuxBin) || statSync(linuxBin).size === 0) {
      info(`Cross-building (linux/${goarch})...`);
      if (!which('go')) fail('Go toolchain not found.');
      if (run('go', ['build', '-ldflags', goVersionLdflags(), '-o', linuxBin, GO_PKG], {cwd: GO_ROOT, env: {GOOS: 'linux', GOARCH: goarch}}) !== 0) fail('Cross-build failed.');
      return success(`Built bin/ts-runtypes-linux-${goarch}.`);
    }
    // Compare against a freshly cross-compiled reference; same approach as `go`.
    const tmpBin = tempBesideBin(linuxBin);
    try {
      if (run('go', ['build', '-ldflags', goVersionLdflags(), '-o', tmpBin, GO_PKG], {cwd: GO_ROOT, env: {GOOS: 'linux', GOARCH: goarch}}) !== 0) fail('Cross-build (reference) failed.');
      const diskId = buildId(linuxBin);
      const refId = buildId(tmpBin);
      if (!diskId || diskId !== refId) {
        info(`Replacing bin/ts-runtypes-linux-${goarch} (stale)...`);
        renameSync(tmpBin, linuxBin);
        success(`Built bin/ts-runtypes-linux-${goarch}.`);
      } else {
        success(`bin/ts-runtypes-linux-${goarch} is up to date with source.`);
      }
    } finally {
      rmSync(tmpBin, {force: true});
    }
  } else {
    // Linux host: just keep the linux-tagged path in sync with the host bin.
    if (!existsSync(linuxBin) || statSync(GO_BIN).mtimeMs > statSync(linuxBin).mtimeMs) {
      cpSync(GO_BIN, linuxBin, {force: true});
      success(`Synced bin/ts-runtypes-linux-${goarch} from bin/ts-runtypes.`);
    } else {
      success(`bin/ts-runtypes-linux-${goarch} is up to date with bin/ts-runtypes.`);
    }
  }
}

// ── linux-extract ────────────────────────────────────────────────────────────

function checkLinuxExtract() {
  // The serialization benchmark runs inside the Node 26 container (no Go
  // toolchain), so `go run ./cmd/extract-fn-bodies` becomes a bind-mounted Linux
  // ELF at bin/extract-fn-bodies-linux-<arch>. No version ldflags (only ts-runtypes
  // embeds the cache version). A fresh reference build + build-id compare detects
  // staleness; on a Linux host GOOS=linux is native.
  const goarch = hostGoArch();
  const linuxBin = join(REPO_ROOT, `bin/extract-fn-bodies-linux-${goarch}`);
  if (!which('go')) fail(`Go toolchain not found (needed to build ${linuxBin}).`);

  info(`Checking bin/extract-fn-bodies-linux-${goarch}...`);
  const tmpBin = tempBesideBin(linuxBin);
  try {
    if (run('go', ['build', '-o', tmpBin, EXTRACT_PKG], {cwd: GO_ROOT, env: {GOOS: 'linux', GOARCH: goarch}}) !== 0) fail('Cross-build failed.');
    const diskId = buildId(linuxBin);
    const refId = buildId(tmpBin);
    if (!existsSync(linuxBin) || !diskId || diskId !== refId) {
      mkdirSync(dirname(linuxBin), {recursive: true});
      info(`Replacing bin/extract-fn-bodies-linux-${goarch} (stale or missing)...`);
      renameSync(tmpBin, linuxBin);
      success(`Built bin/extract-fn-bodies-linux-${goarch}.`);
    } else {
      success(`bin/extract-fn-bodies-linux-${goarch} is up to date with source.`);
    }
  } finally {
    rmSync(tmpBin, {force: true});
  }
}

// ── marker-dist / plugin-dist ───────────────────────────────────────────────

// True ("stale") if ANY of: the dist dir is missing, any sentinel file is missing,
// any .d.ts.map in dist/ has no matching .d.ts sibling (partial emit), or any file
// under src/ is newer than the dist sentinel index file.
function distIsStale(distDir, srcDir, sentinels) {
  if (!existsSync(distDir)) return true;
  for (const s of sentinels) if (!existsSync(s)) return true;
  // Orphan .d.ts.map → broken emit, the exact failure mode we keep hitting.
  for (const rel of globSync('**/*.d.ts.map', {cwd: distDir})) {
    if (!existsSync(join(distDir, rel.replace(/\.d\.ts\.map$/, '.d.ts')))) return true;
  }
  // mtime-based source drift; the first sentinel doubles as the freshness anchor.
  const anchor = statSync(sentinels[0]).mtimeMs;
  if (existsSync(srcDir)) {
    for (const rel of globSync('**/*', {cwd: srcDir})) {
      const full = join(srcDir, rel);
      const stat = statSync(full);
      if (stat.isFile() && stat.mtimeMs > anchor) return true;
    }
  }
  return false;
}

function rebuildPkgDist(pkgDir, pkgName) {
  // Clean wipe: rm both dist/ and tsbuildinfo. We deliberately don't trust
  // incremental tsc here — the entire reason this script exists is that tsc's
  // incremental cache can memorize a half-emitted state and refuse to recover.
  rmSync(join(pkgDir, 'dist'), {recursive: true, force: true});
  rmSync(join(pkgDir, 'tsconfig.tsbuildinfo'), {force: true});
  info(`Rebuilding ${pkgName} dist...`);
  if (run('pnpm', ['--filter', pkgName, 'run', 'build']) !== 0) fail(`${pkgName} build failed.`);
}

function checkPkgDist(pkgDir, srcName, sentinels, pkgName) {
  const distDir = join(pkgDir, 'dist');
  const srcDir = join(pkgDir, 'src');
  info(`Checking ${srcName}/dist...`);
  if (distIsStale(distDir, srcDir, sentinels)) {
    info(`${srcName}/dist is stale or incomplete - rebuilding clean`);
    rebuildPkgDist(pkgDir, pkgName);
    if (distIsStale(distDir, srcDir, sentinels)) fail(`${srcName}/dist still incomplete after rebuild (build script bug).`);
    success(`Rebuilt ${srcName}/dist.`);
  } else {
    success(`${srcName}/dist is up to date.`);
  }
}

const checkMarkerDist = () => checkPkgDist(MARKER_PKG_DIR, 'packages/ts-runtypes', MARKER_SENTINELS, '@ts-runtypes/core');
const checkPluginDist = () => checkPkgDist(PLUGIN_PKG_DIR, 'packages/ts-runtypes-devtools', PLUGIN_SENTINELS, '@ts-runtypes/devtools');

// ── dispatch ────────────────────────────────────────────────────────────────

function runTarget(target) {
  switch (target) {
    case 'go': return checkGo();
    case 'linux-go': return checkLinuxGo();
    case 'linux-extract': return checkLinuxExtract();
    case 'marker-dist': return checkMarkerDist();
    case 'plugin-dist': return checkPluginDist();
    case 'all': checkGo(); checkMarkerDist(); checkPluginDist(); return;
    default: fail(`unknown target '${target}'. Valid: go | linux-go | marker-dist | plugin-dist | all`);
  }
}

export function main(args) {
  if (args.length === 0) return runTarget('all');
  for (const target of args) runTarget(target);
}

if (import.meta.main) {
  loadEnv();
  try {
    main(process.argv.slice(2));
  } catch (err) {
    reportCliError(err);
  }
}
