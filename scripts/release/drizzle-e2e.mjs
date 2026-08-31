// drizzle-e2e.mjs — the one front door to the drizzle-e2e lane.
//
// The lane proves that a toDrizzle() table works against a REAL database, by
// running the tests drizzle already trusts: its own driver-agnostic suites,
// translated onto the slim @mionjs/drizzle-orm-* packages by
// `mion drizzle-migrate` and run against postgres, mysql and sqlite, plus
// the two Cloudflare storage drivers (D1 and Durable Objects SQLite) on workerd.
//
// Nothing about it is incremental: every run re-fetches the pinned suites,
// re-translates them and re-installs the packages from a throwaway verdaccio, so
// a green run always describes the current tree.
//
// It is the same lane shape as `pnpm rtx core converted-suites`:
//
//   converted-suites  our suites  --[mion convert]---------> tree -> vitest
//   drizzle-e2e       drizzle's   --[mion drizzle-migrate]-> tree -> vitest + a real db
//
// Usage:
//   pnpm rtx release drizzle-e2e                      # every lane
//   pnpm rtx release drizzle-e2e --dialect pg         # one
//   pnpm rtx release drizzle-e2e --pack               # repack the tarballs first
//   pnpm rtx release drizzle-e2e --keep               # leave the container up to inspect
//   pnpm rtx release drizzle-e2e --skip-types         # builders road only (local iteration)
import {existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {ensureImage, caRunArgs, stopRegistry, waitContainerHealthy} from '../container/image.mjs';
import {readDialectPackages, REPO_ROOT, unreleasedChanges} from '../lib/drizzle-line.mjs';
import {loadEnv} from '../lib/env.mjs';
import {capture, die, info, note, noteErr, reportCliError, runOrThrow, success} from '../lib/proc.mjs';
import {requireEngine} from '../lib/engine.mjs';
import {ensureDrizzleSuites, readPin} from '../drizzle/fetch-suites.mjs';

// The LANES. pg / mysql / sqlite are dialects; d1 and durable are the two
// Cloudflare storage DRIVERS, which ride the sqlite package's builders and
// therefore share one image (see IMAGE_FOR).
const DIALECTS = ['pg', 'mysql', 'sqlite', 'd1', 'durable'];
// A lane's image. Only the Cloudflare pair differs from its own name: neither is
// a dialect, and a second image would be a byte-for-byte copy of the first.
const IMAGE_FOR = {d1: 'cloudflare', durable: 'cloudflare'};
const imageFor = (dialect) => IMAGE_FOR[dialect] ?? dialect;
const SHARED_DIR = path.join(REPO_ROOT, 'container/drizzle-e2e/shared');
const TARBALLS_DIR = path.join(REPO_ROOT, 'tarballs');
const DIST_BINARIES = path.join(REPO_ROOT, 'dist-binaries');
const OUT_DIR = path.join(REPO_ROOT, 'logs/drizzle-e2e');

// The four manifests, as ONE file the in-container coverage gate reads. They are
// not in the published tarballs (the packages ship .dist + src), so the lane
// cannot read them from the installed packages.
function writeManifests(outDir) {
  const combined = {};
  for (const dialect of readDialectPackages(REPO_ROOT)) {
    const file = path.join(REPO_ROOT, dialect.packageDir, dialect.manifest);
    combined[dialect.dialect] = JSON.parse(readFileSync(file, 'utf8')).entries;
  }
  writeFileSync(path.join(outDir, 'manifests.json'), `${JSON.stringify(combined, null, 2)}\n`);
}

// The version the tarballs were packed at — what the in-container install asks
// verdaccio for. The two families are on separate version lines: the launcher
// rides the lockstep one, the drizzle packages their own drizzle-aligned one.
function packedVersions() {
  const launcher = JSON.parse(readFileSync(path.join(REPO_ROOT, 'packages/ts-runtypes-bin/package.json'), 'utf8')).version;
  const drizzle = JSON.parse(readFileSync(path.join(REPO_ROOT, 'packages/drizzle-orm/package.json'), 'utf8')).version;
  // drizzle-orm ITSELF, from the suites pin, so the in-container install can
  // name it and npm never sees an unresolvable peer.
  return {launcher, drizzle, drizzleOrm: readPin().drizzleOrm};
}

// Newest mtime under a directory, ignoring node_modules. 0 when it is missing.
function newestMtime(dir) {
  if (!existsSync(dir)) return 0;
  let newest = 0;
  for (const entry of readdirSync(dir, {withFileTypes: true})) {
    if (entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    newest = Math.max(newest, entry.isDirectory() ? newestMtime(full) : statSync(full).mtimeMs);
  }
  return newest;
}

// Newest mtime among the sources the lane's installed packages are built from.
// Both halves count: the JS packages, and the Go resolver that rides in as the
// @ts-runtypes/binary-* payload — a stale resolver is the harder one to notice,
// because it fails as a translation result rather than as a build error.
function newestSourceMtime() {
  let newest = 0;
  for (const pkg of readdirSync(path.join(REPO_ROOT, 'packages'))) {
    const dir = path.join(REPO_ROOT, 'packages', pkg);
    for (const part of ['src', '.dist', 'package.json']) {
      const full = path.join(dir, part);
      if (!existsSync(full)) continue;
      newest = Math.max(newest, statSync(full).isDirectory() ? newestMtime(full) : statSync(full).mtimeMs);
    }
  }
  for (const part of ['internal', 'cmd']) {
    newest = Math.max(newest, newestMtime(path.join(REPO_ROOT, 'ts-go-runtypes', part)));
  }
  return newest;
}

// The lane installs PACKED tarballs, so a tarball older than the sources it was
// packed from would silently prove an old tree green. Repack when that happens
// rather than trusting whatever is on disk.
function tarballsAreStale() {
  const tgz = readdirSync(TARBALLS_DIR).filter((name) => name.endsWith('.tgz'));
  if (tgz.length === 0) return true;
  const packedAt = Math.min(...tgz.map((name) => statSync(path.join(TARBALLS_DIR, name)).mtimeMs));
  return newestSourceMtime() > packedAt;
}

// Whether this checkout can build the Go resolver at all. CI splits the lane in
// two: one job with `submodules: recursive` builds and packs, the dialect jobs
// download those tarballs and check out WITHOUT submodules, so there the packed
// artifact IS the source of truth and there is nothing to rebuild from.
function canBuildResolver() {
  return existsSync(path.join(REPO_ROOT, 'ts-go-runtypes/third_party/tsgolint/go.mod'));
}

// pack.mjs copies the platform payloads out of dist-binaries/, which no JS build
// regenerates, so a Go fix reaches the container only once the binaries are
// rebuilt. Checked separately for that reason.
function binariesAreStale() {
  if (!canBuildResolver()) return false;
  // publish-order.json is written LAST, so it is the completion marker: a build
  // that died partway (the disk filling is the usual way) leaves a directory of
  // fresh mtimes and no manifest, which would otherwise read as up to date.
  if (!existsSync(path.join(DIST_BINARIES, 'publish-order.json'))) return true;
  const builtAt = newestMtime(DIST_BINARIES);
  for (const part of ['internal', 'cmd']) {
    if (newestMtime(path.join(REPO_ROOT, 'ts-go-runtypes', part)) > builtAt) return true;
  }
  return false;
}

function ensureTarballs({pack}) {
  const missing = !existsSync(TARBALLS_DIR) || readdirSync(TARBALLS_DIR).length === 0;
  // Same reason as canBuildResolver(): without the submodules nothing here can
  // be rebuilt, so the tarballs on disk are taken as given. The required-tarball
  // checks below still refuse an empty or incomplete set.
  const rebuildable = canBuildResolver();
  if (pack && !rebuildable) {
    die('drizzle-e2e: --pack needs the submodules bootstrapped (ts-go-runtypes/third_party) to rebuild the resolver - run `pnpm rtx core build` on a bootstrapped host, or drop --pack to use the tarballs as they are');
  }
  if (pack || (rebuildable && (missing || tarballsAreStale() || binariesAreStale()))) {
    info(
      missing
        ? 'packing the tarballs the lane installs from'
        : 'a package or the resolver changed since the tarballs were packed - rebuilding and repacking, or the lane would prove an old tree'
    );
    // Order matters. pack.mjs copies whatever .dist and dist-binaries/ hold, so
    // both are rebuilt first: a source edit that never reached them would be
    // packed away silently. Both are checked on EVERY path, an empty tarballs/
    // included, since that is what an interrupted pack leaves behind.
    if (binariesAreStale()) runOrThrow('node', ['scripts/release/build-binaries.mjs'], {cwd: REPO_ROOT});
    runOrThrow('pnpm', ['run', 'build'], {cwd: REPO_ROOT});
    runOrThrow('node', ['scripts/release/pack.mjs'], {cwd: REPO_ROOT});
  }
  const packed = readdirSync(TARBALLS_DIR);
  for (const required of ['ts-runtypes-bin-', 'ts-runtypes-core-', 'mionjs-drizzle-orm-']) {
    if (!packed.some((name) => name.startsWith(required))) {
      die(`drizzle-e2e: no ${required}*.tgz in ${path.relative(REPO_ROOT, TARBALLS_DIR)} — run \`pnpm rtx release pack\` (and \`binaries\` for the platform payloads)`);
    }
  }
  if (!packed.some((name) => name.startsWith('ts-runtypes-binary-'))) {
    die('drizzle-e2e: no ts-runtypes-binary-*.tgz — the lane installs @ts-runtypes/bin, which resolves one of those as its platform binary. Run `pnpm rtx release binaries` first.');
  }
}

// Start one dialect's container: verdaccio in the foreground of its own process,
// the database and the suite driven by a follow-up exec.
function startContainer(dialect, suitesDir, versions, {skipTypes}) {
  const target = `drizzle-${imageFor(dialect)}`;
  ensureImage({target});
  const engine = process.env.RT_WEBSITE_ENGINE || 'podman';
  const image = `mion-drizzle-${imageFor(dialect)}:dev`;
  const container = `mion-drizzle-e2e-${dialect}`;
  const outDir = path.join(OUT_DIR, dialect);
  rmSync(outDir, {recursive: true, force: true});
  mkdirSync(outDir, {recursive: true});
  writeManifests(outDir);
  const mountOpts = process.env.RT_WEBSITE_MOUNT_OPTS || '';
  const net = process.env.RT_WEBSITE_RUN_NETWORK ? [`--network=${process.env.RT_WEBSITE_RUN_NETWORK}`] : [];
  capture(engine, ['rm', '-f', container]); // drop any stale container
  note(`starting ${container} (${image})`);
  runOrThrow(
    engine,
    [
      'run', '-d', '--init', '--name', container,
      '-v', `${TARBALLS_DIR}:/tarballs:ro${mountOpts}`,
      '-v', `${SHARED_DIR}:/drizzle-src:ro${mountOpts}`,
      '-v', `${suitesDir}:/suites:ro${mountOpts}`,
      '-v', `${outDir}:/out${mountOpts}`,
      '-e', `RT_DRIZZLE_DIALECT=${dialect}`,
      '-e', `RT_DRIZZLE_VERSION=${versions.launcher}`,
      '-e', `RT_DRIZZLE_PKG_VERSION=${versions.drizzle}`,
      '-e', `RT_DRIZZLE_ORM_VERSION=${versions.drizzleOrm}`,
      '-e', 'RT_DRIZZLE_REGISTRY=http://127.0.0.1:4873',
      '-e', 'RT_DRIZZLE_VERDACCIO_CONFIG=/drizzle-src/registry/verdaccio.yaml',
      '-e', `RT_DRIZZLE_TYPE_PASS=${skipTypes ? '0' : '1'}`,
      ...net,
      // This host may carry a proxy CA as a DIRECTORY of certs, which has to be
      // concatenated into one file somewhere: the dialect's own build context,
      // whose .cacerts/ is git-ignored. mountOpts must match the mounts above.
      ...caRunArgs({caSrc: process.env.RT_WEBSITE_CA_CERT || '', dir: path.join(REPO_ROOT, 'container/drizzle-e2e', imageFor(dialect)), mountOpts}),
      '--health-cmd', 'test -f /tmp/registry-ready',
      '--health-interval', '2s',
      '--health-retries', '90',
      '--health-start-period', '2s',
      image,
      '/usr/local/bin/drizzle-serve.sh',
    ],
    {stdio: ['inherit', 'ignore', 'inherit']}
  );
  return {engine, container, outDir};
}

async function runDialect(dialect, suitesDir, versions, {keep, skipTypes}) {
  const {engine, container, outDir} = startContainer(dialect, suitesDir, versions, {skipTypes});
  try {
    if (!(await waitContainerHealthy(engine, container, {logTail: 80}))) die(`drizzle-e2e: the ${container} registry never became healthy`);
    runOrThrow(engine, ['exec', container, 'node', '/drizzle-src/run-suite.mjs'], {stdio: 'inherit'});
    success(`${dialect}: ${skipTypes ? 'the translated suite is' : 'both roads are'} green against a real database`);
    return true;
  } catch {
    noteErr(`drizzle-e2e: ${dialect} FAILED — the report and logs are in ${path.relative(REPO_ROOT, outDir)}`);
    return false;
  } finally {
    if (keep) note(`--keep: left ${container} running (podman exec -it ${container} bash)`);
    else stopRegistry(engine, container);
  }
}

// Should CI spend the lane on this PR? Two audiences, one answer, printed as a
// GITHUB_OUTPUT line so the workflow stays free of logic:
//
//   any PR carrying the `drizzle-e2e` label   -> yes, that is the point of it
//   a PR into prod                            -> yes IFF the drizzle packages'
//                                                published sources changed since
//                                                their last version bump
//
// `unreleasedChanges()` answering {known: false} means "cannot tell" — a shallow
// clone, no release point yet — and that MUST run the lane. Never skip on doubt:
// the cost of a needless run is minutes, the cost of a missed one is a broken
// release.
function shouldRun() {
  if (process.env.LABELLED === 'true') return {run: true, why: 'the PR carries the drizzle-e2e label'};
  if ((process.env.BASE_REF ?? '') !== 'prod') return {run: false, why: 'not a prod PR and not labelled'};
  for (const dialect of readDialectPackages(REPO_ROOT)) {
    const changes = unreleasedChanges(REPO_ROOT, dialect.packageDir);
    if (!changes.known) return {run: true, why: `cannot tell whether ${dialect.packageDir} changed since its release point`};
    if (changes.files.length > 0) return {run: true, why: `${dialect.packageDir} has ${changes.files.length} unreleased source change(s)`};
  }
  return {run: false, why: 'no drizzle package changed since its last version bump'};
}

export async function main(args) {
  if (args.includes('--should-run')) {
    const {run, why} = shouldRun();
    process.stderr.write(`drizzle-e2e: ${run ? 'running' : 'skipping'} — ${why}\n`);
    process.stdout.write(`run=${run}\n`);
    return;
  }
  const only = args.includes('--dialect') ? args[args.indexOf('--dialect') + 1] : 'all';
  const dialects = only === 'all' ? DIALECTS : [only];
  for (const dialect of dialects) {
    if (!DIALECTS.includes(dialect)) die(`drizzle-e2e: unknown --dialect '${dialect}' (expected ${DIALECTS.join(' | ')} | all)`);
  }
  requireEngine(process.env.RT_WEBSITE_ENGINE || 'podman');
  ensureTarballs({pack: args.includes('--pack')});
  // Fetch + verify on the HOST, not in the container: the pin lives here, and a
  // verified cache is then mounted read-only, so no lane ever trusts the network.
  const suitesDir = await ensureDrizzleSuites();
  const pin = readPin();
  info(`drizzle suites pinned at ${pin.tag} (drizzle-orm ${pin.drizzleOrm})`);
  const versions = packedVersions();
  mkdirSync(OUT_DIR, {recursive: true});

  const failed = [];
  for (const dialect of dialects) {
    if (!(await runDialect(dialect, suitesDir, versions, {keep: args.includes('--keep'), skipTypes: args.includes('--skip-types')}))) failed.push(dialect);
  }
  if (failed.length > 0) die(`drizzle-e2e: ${failed.join(', ')} failed`);
  success(`drizzle-e2e: ${dialects.join(', ')} green`);
}

if (import.meta.main) {
  loadEnv();
  main(process.argv.slice(2)).catch(reportCliError);
}
