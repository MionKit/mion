// build.mjs — ensure the build artifacts the rest of the workspace depends on
// match the current source. Port of the former scripts/core/build.sh (same job for
// the Go binary, plus structural checks on the two TS package dists the bench and
// `pnpm test` load). Behavior is IDENTICAL to the shell version — build-id compare,
// orphan-.d.ts.map detection, and mtime staleness are ported line-for-line.
//
// Targets (positional):
//   go            mion-bin/mion matches cmd/ + internal/ (build-id compare).
//   extract       mion-bin/extract-fn-bodies (the enrich tests spawn it), same checks as `go`.
//   linux-go      mion-bin/mion-linux-<arch> matches the host binary —
//                 cross-compiled on macOS, copied on Linux. Used by the bench
//                 container to mount a Linux ELF on the host.
//   linux-extract the same for extract-fn-bodies, so the in-container serialization bench needs no Go.
//   marker-dist   packages/run-types/dist is internally consistent
//                 (every .d.ts.map has a matching .d.ts, sentinel files present,
//                 src not newer than dist). Repairs by wiping tsbuildinfo and
//                 running the package's `build` script — incremental tsc on its
//                 own would trust the corrupt buildinfo and re-skip emit.
//   plugin-dist   packages/devtools/dist, same checks. ONE target since the two
//                 devtools packages merged: the same tsc build now emits the
//                 transform, every bundler entry AND the lint plugin the root
//                 eslint config loads through node (no `source` condition), so a
//                 missing dist means eslint cannot even load its config.
//   uws           packages/bin-uws/.uws-cache holds the host's uWebSockets.js
//                 prebuilt binary (fetched on demand, sha256-verified against
//                 packages/bin-uws/uws-checksums.json by scripts/lib/fetch-uws.mjs).
//   all           go + extract + marker-dist + plugin-dist + uws.
//                 Default when no args given.
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
// The stamps (mion-bin/.mion.stamp, .extract-fn-bodies.stamp) let the build gate ({trustStamp: true}) skip
// the reference build, a full link, when the inputs digest (scripts/lib/go-inputs.mjs) matches, ~100ms.
// The digest needs no Go and no submodule, so a binary restored from the CI cache (`--cache-key`) is
// trusted on a runner without Go. An explicit `miondevx core build` never trusts a stamp, so it still
// catches what the digest cannot see (a hand edit inside third_party/ outside the patches).
//
// Exit codes: 0 = everything up to date or repaired; non-zero = a build itself
// failed (toolchain broken, source error). Staleness alone is never a failure.

import {createHash} from 'node:crypto';
import {cpSync, existsSync, globSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {GO_ROOT, loadEnv, REPO_ROOT} from '../lib/env.mjs';
import {goInputsDigest, readStamp, writeStamp} from '../lib/go-inputs.mjs';
import {capture, die, hostGoArch, info, red, reportCliError, run, success, warn, which} from '../lib/proc.mjs';
import {describe, headCommit, patchState, readPin, rel, submoduleInitialised, tsgolintCommit} from '../lib/tsgolint.mjs';

const GO_MODULE = 'github.com/mionkit/mion/ts-go-runtypes';
const GO_BIN = join(REPO_ROOT, 'mion-bin/mion');
const GO_STAMP = join(REPO_ROOT, 'mion-bin/.mion.stamp');
// Every Go input mion-bin/mion links, repo-relative (the wasm has its own list in
// scripts/website/playground-wasm-inputs.mjs).
export const RESOLVER_INPUTS = ['ts-go-runtypes/cmd/mion', 'ts-go-runtypes/internal', 'ts-go-runtypes/go.mod', 'ts-go-runtypes/go.sum', 'ts-go-runtypes/go.work', 'ts-go-runtypes/go.work.sum'];
const GO_PKG = './cmd/mion';
const EXTRACT_PKG = './cmd/extract-fn-bodies';
const EXTRACT_BIN = join(REPO_ROOT, 'mion-bin/extract-fn-bodies');
const EXTRACT_STAMP = join(REPO_ROOT, 'mion-bin/.extract-fn-bodies.stamp');
export const EXTRACT_INPUTS = ['ts-go-runtypes/cmd/extract-fn-bodies', ...RESOLVER_INPUTS.slice(1)];
const GO_VERSION_FILE = join(GO_ROOT, '.go-version');
const MARKER_PKG_DIR = join(REPO_ROOT, 'packages/run-types');
const PLUGIN_PKG_DIR = join(REPO_ROOT, 'packages/devtools');

// Marker dist sentinels — the .d.ts files whose absence in a "fresh" dist is a
// strong signal that declaration emit was interrupted. markers.d.ts in particular
// is the file the Go marker scanner needs to resolve InjectRunTypeId.
const MARKER_SENTINELS = [join(MARKER_PKG_DIR, 'dist/index.d.ts'), join(MARKER_PKG_DIR, 'dist/markers.d.ts'), join(MARKER_PKG_DIR, 'dist/createRTFunctions.d.ts')];
// One sentinel per surface the merged package now emits: the shared root, the
// mion vite preset, and the lint plugin the root eslint config loads through node.
const PLUGIN_SENTINELS = [
  join(PLUGIN_PKG_DIR, 'dist/index.d.ts'),
  join(PLUGIN_PKG_DIR, 'dist/vite/index.js'),
  join(PLUGIN_PKG_DIR, 'dist/lint/index.js'),
];

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
export function goVersionLdflags() {
  let version = 'dev';
  try {
    version = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')).version || 'dev';
  } catch {
    version = 'dev';
  }
  // A fixed length: `--short` grows with the object count, which would move the digest between clones.
  const tsgo = tsgolintCommit().slice(0, 7) || 'dev';
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
// mion-bin/mion would then be built against a NON-pinned typescript-go, which the
// build-id freshness check below CANNOT catch (it compares the binary to whatever
// source is checked out, not to the pin). `pnpm miondevx core ensure-tsgolint` realigns it.
// Non-fatal so it never blocks a legitimate in-progress bump or local experiment.
function checkTsgolintPin() {
  if (!submoduleInitialised()) return;
  const pin = readPin();
  if (!pin) return;
  const head = headCommit();
  if (head === pin.commit || (pin.commit.length < 40 && head.startsWith(pin.commit))) return;
  warn(`tsgolint submodule is at ${describe()} (${head.slice(0, 7)}) but tsgolint.pin.json declares ${pin.ref} (${pin.commit.slice(0, 7)}). mion-bin/mion will build against a NON-pinned typescript-go — run \`pnpm miondevx core ensure-tsgolint\` to realign.`);
}

// The pinned Go, not `go version`: a runner image ships its own Go, which would split one tree into two keys.
export const pinnedGoVersion = () => `go${readFileSync(GO_VERSION_FILE, 'utf8').trim()}`;

// Needs no Go and no checkout: the gitlink pins the commit and its patches, so only UNapplied patches count.
export const pendingPatches = (states) => states.filter((state) => !state.endsWith('=applied'));

export function goIdentity() {
  const identity = [pinnedGoVersion(), `${process.platform}/${process.arch}`, tsgolintCommit()];
  if (submoduleInitialised()) identity.push(...pendingPatches(patchState()));
  return identity;
}

// Exported for the build-gate test.
export const resolverDigest = (ldflags = goVersionLdflags()) => goInputsDigest(REPO_ROOT, RESOLVER_INPUTS, [ldflags, ...goIdentity()]);
export const extractDigest = () => goInputsDigest(REPO_ROOT, EXTRACT_INPUTS, goIdentity());

// CI cache key for both prebuilt Go binaries; needs no Go and no submodule.
export function goBinCacheKey() {
  const combined = createHash('sha256').update(`${resolverDigest()}\n${extractDigest()}`).digest('hex');
  return `mion-go-bins-${process.platform}-${process.arch}-${combined.slice(0, 32)}`;
}

export const readResolverStamp = () => readStamp(GO_STAMP);

// Go is checked only after the stamp, so a trusted cached binary needs no toolchain.
function checkStampedGoBin({bin, stamp, pkg, digest, ldflags, trustStamp}) {
  const name = rel(bin);
  const ldArgs = ldflags ? ['-ldflags', ldflags] : [];
  info(`Checking ${name}...`);
  if (trustStamp && existsSync(bin) && readStamp(stamp) === digest) return success(`${name} is up to date (stamp).`);
  if (!which('go')) fail(`Go toolchain not found on PATH (needed to build ${name}).`);
  const localGo = capture('go', ['env', 'GOVERSION']).stdout.trim();
  // The stamp names the pin, so a build with another Go is a binary CI would not make.
  if (localGo && localGo !== pinnedGoVersion()) warn(`building ${name} with ${localGo}, but CI pins ${pinnedGoVersion()} (ts-go-runtypes/.go-version); the result can differ from the CI build.`);
  if (!existsSync(bin)) {
    info(`Building ${name} (missing; may take a moment on a cold cache)...`);
    mkdirSync(dirname(bin), {recursive: true});
    if (run('go', ['build', ...ldArgs, '-o', bin, pkg], {cwd: GO_ROOT}) !== 0) fail('Build failed.');
    writeStamp(stamp, digest);
    return success(`Built ${name}.`);
  }

  // `go list .Stale` is unreliable with `-o` to a custom path, so compare build IDs with a reference build.
  info(`Verifying ${name} matches current source...`);
  const tmpBin = tempBesideBin(bin);
  try {
    if (run('go', ['build', ...ldArgs, '-o', tmpBin, pkg], {cwd: GO_ROOT}) !== 0) fail('Reference build failed.');
    const diskId = buildId(bin);
    const refId = buildId(tmpBin);
    if (!diskId || !refId) fail(`Could not read build IDs from ${name} or reference binary.`);
    if (diskId !== refId) {
      info(`Replacing ${name} (stale: build ID mismatch)...`);
      renameSync(tmpBin, bin);
      success(`Built ${name}.`);
    } else {
      success(`${name} is up to date with source.`);
    }
    writeStamp(stamp, digest);
  } finally {
    rmSync(tmpBin, {force: true});
  }
}

function checkGo({trustStamp = false} = {}) {
  checkTsgolintPin();
  const ldflags = goVersionLdflags();
  checkStampedGoBin({bin: GO_BIN, stamp: GO_STAMP, pkg: GO_PKG, digest: resolverDigest(ldflags), ldflags, trustStamp});
}

// ── extract ─────────────────────────────────────────────────────────────────

// Prebuilt so the enrich tests and the serialization bench need no Go toolchain.
function checkExtract({trustStamp = false} = {}) {
  checkStampedGoBin({bin: EXTRACT_BIN, stamp: EXTRACT_STAMP, pkg: EXTRACT_PKG, digest: extractDigest(), ldflags: '', trustStamp});
}

// ── linux-go / linux-extract ────────────────────────────────────────────────

// The bench container needs a Linux ELF: cross-built on macOS (Mach-O host), a copy under a stable name on Linux.
function checkLinuxCopy({hostBin, check, pkg, ldflags, name, opts}) {
  const goarch = hostGoArch();
  const linuxBin = join(REPO_ROOT, `mion-bin/${name}-linux-${goarch}`);

  // Host binary first, or a stale one is carried forward into the linux slot.
  check(opts);

  info(`Checking mion-bin/${name}-linux-${goarch}...`);
  const ldArgs = ldflags ? ['-ldflags', ldflags] : [];
  if (process.platform === 'darwin') {
    if (!which('go')) fail('Go toolchain not found.');
    if (!existsSync(linuxBin) || statSync(linuxBin).size === 0) {
      info(`Cross-building (linux/${goarch})...`);
      if (run('go', ['build', ...ldArgs, '-o', linuxBin, pkg], {cwd: GO_ROOT, env: {GOOS: 'linux', GOARCH: goarch}}) !== 0) fail('Cross-build failed.');
      return success(`Built mion-bin/${name}-linux-${goarch}.`);
    }
    const tmpBin = tempBesideBin(linuxBin);
    try {
      if (run('go', ['build', ...ldArgs, '-o', tmpBin, pkg], {cwd: GO_ROOT, env: {GOOS: 'linux', GOARCH: goarch}}) !== 0) fail('Cross-build (reference) failed.');
      const diskId = buildId(linuxBin);
      const refId = buildId(tmpBin);
      if (!diskId || diskId !== refId) {
        info(`Replacing mion-bin/${name}-linux-${goarch} (stale)...`);
        renameSync(tmpBin, linuxBin);
        success(`Built mion-bin/${name}-linux-${goarch}.`);
      } else {
        success(`mion-bin/${name}-linux-${goarch} is up to date with source.`);
      }
    } finally {
      rmSync(tmpBin, {force: true});
    }
  } else if (!existsSync(linuxBin) || statSync(hostBin).mtimeMs > statSync(linuxBin).mtimeMs) {
    cpSync(hostBin, linuxBin, {force: true});
    success(`Synced mion-bin/${name}-linux-${goarch} from ${rel(hostBin)}.`);
  } else {
    success(`mion-bin/${name}-linux-${goarch} is up to date with ${rel(hostBin)}.`);
  }
}

const checkLinuxGo = (opts) => checkLinuxCopy({hostBin: GO_BIN, check: checkGo, pkg: GO_PKG, ldflags: goVersionLdflags(), name: 'mion', opts});
const checkLinuxExtract = (opts) => checkLinuxCopy({hostBin: EXTRACT_BIN, check: checkExtract, pkg: EXTRACT_PKG, ldflags: '', name: 'extract-fn-bodies', opts});

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

function rebuildPkgDist(pkgDir, pkgName, outDirName) {
  // Never trust incremental tsc here: its cache can memorize a half-emitted state and refuse to recover.
  // EVERY tsbuildinfo, not just the default name: `tsc --build` names the file after the config it was given.
  rmSync(join(pkgDir, outDirName), {recursive: true, force: true});
  for (const entry of readdirSync(pkgDir)) {
    if (entry.endsWith('.tsbuildinfo')) rmSync(join(pkgDir, entry), {force: true});
  }
  info(`Rebuilding ${pkgName} ${outDirName}...`);
  if (run('pnpm', ['--filter', pkgName, 'run', 'build']) !== 0) fail(`${pkgName} build failed.`);
}

function checkPkgDist(pkgDir, srcName, sentinels, pkgName, outDirName = 'dist') {
  const distDir = join(pkgDir, outDirName);
  const srcDir = join(pkgDir, 'src');
  info(`Checking ${srcName}/${outDirName}...`);
  if (distIsStale(distDir, srcDir, sentinels)) {
    info(`${srcName}/${outDirName} is stale or incomplete - rebuilding clean`);
    rebuildPkgDist(pkgDir, pkgName, outDirName);
    if (distIsStale(distDir, srcDir, sentinels)) fail(`${srcName}/${outDirName} still incomplete after rebuild (build script bug).`);
    success(`Rebuilt ${srcName}/${outDirName}.`);
  } else {
    success(`${srcName}/${outDirName} is up to date.`);
  }
}

const checkMarkerDist = () => checkPkgDist(MARKER_PKG_DIR, 'packages/run-types', MARKER_SENTINELS, '@mionjs/run-types');
const checkPluginDist = () => checkPkgDist(PLUGIN_PKG_DIR, 'packages/devtools', PLUGIN_SENTINELS, '@mionjs/devtools');

// ── uws ─────────────────────────────────────────────────────────────────────

// The @mionjs/bin-uws loader resolves an on-demand-fetched uWebSockets.js prebuilt
// binary in the dev tree (packages/bin-uws/.uws-cache/). fetch-uws.mjs verifies the
// sha256 of a cached file before trusting it and skips the download when the
// cache is warm, so this is cheap on every pretest run.
function checkUws() {
  info('Checking packages/bin-uws/.uws-cache (uWebSockets.js host binary)...');
  if (run('node', [join(REPO_ROOT, 'scripts/lib/fetch-uws.mjs')]) !== 0) fail('uWebSockets.js binary fetch failed.');
}

// ── dispatch ────────────────────────────────────────────────────────────────

function runTarget(target, opts) {
  switch (target) {
    case 'go': return checkGo(opts);
    case 'extract': return checkExtract(opts);
    case 'linux-go': return checkLinuxGo(opts);
    case 'linux-extract': return checkLinuxExtract(opts);
    case 'marker-dist': return checkMarkerDist();
    case 'plugin-dist': return checkPluginDist();
    case 'uws': return checkUws();
    case 'all': checkGo(opts); checkExtract(opts); checkMarkerDist(); checkPluginDist(); checkUws(); return;
    default: fail(`unknown target '${target}'. Valid: go | extract | linux-go | linux-extract | marker-dist | plugin-dist | uws | all`);
  }
}

// opts.trustStamp: the entry point's gate; an explicit `core build` never sets it.
export function main(args, opts = {}) {
  if (args.includes('--cache-key')) return console.log(goBinCacheKey());
  if (args.length === 0) return runTarget('all', opts);
  for (const target of args) runTarget(target, opts);
}

if (import.meta.main) {
  loadEnv();
  try {
    main(process.argv.slice(2));
  } catch (err) {
    reportCliError(err);
  }
}
