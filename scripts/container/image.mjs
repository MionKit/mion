// image.mjs — own the lifecycle of the project's podman images. There are TWO:
//
//   tsrt-website (container/website/Containerfile) bakes BOTH the docs website and
//     the benchmark deps in separate dirs with separate node_modules:
//       /app    the Nuxt/Docus website deps   (run by scripts/website/site.mjs)
//       /bench  the benchmark deps            (run by scripts/website/bench-data/bench.mjs)
//     so CI can pull one image and build the whole site (benchmark data included).
//   tsrt-e2e (container/pre-publish-e2e/Containerfile) bakes verdaccio + the
//     multi-bundler builder toolchains under /e2e (run by scripts/release/e2e.mjs).
//     Split out of tsrt-website so the lightweight smoke/bench/website-build lanes
//     never pull the heavy e2e toolchains — only the release gate's e2e lane does.
//   mion-bench (container/mion-bench/Containerfile) bakes the HTTP server benchmark
//     deps under /mion-bench — one isolated pnpm project per framework under test
//     (run by scripts/website/bench-data/mion-bench.mjs). Its own image for the same
//     reason e2e is: a framework dep bump must never touch the validation lanes, and
//     the website/smoke lanes must not pull a load generator they never run.
//
// This module is the single image OWNER for both: build, ensure (pull-or-build),
// login, push, pull, clean, lock, and the e2e registry run. site.mjs and bench.mjs
// delegate their (website) image ops here; e2e.mjs delegates the registry run here.
// Port of the former scripts/container/image.sh; the lib.sh/ghcr.sh helpers it
// sourced now live in scripts/lib/engine.mjs.
//
// Env overrides (read fresh on every entry, so bench.mjs can map its MION_VALIDATION_BENCH_*
// knobs onto MION_WEBSITE_* by passing an env override): MION_WEBSITE_ENGINE,
// MION_WEBSITE_IMAGE, MION_WEBSITE_BASE_IMAGE, MION_WEBSITE_PNPM_VERSION, MION_WEBSITE_USE_LOCAL,
// MION_WEBSITE_REMOTE_IMAGE, GHCR_* (see lib/engine.mjs), MION_WEBSITE_MOUNT_OPTS,
// MION_WEBSITE_BUILD_NETWORK, MION_WEBSITE_RUN_NETWORK, MION_WEBSITE_CA_CERT. The engine /
// network / CA knobs are SHARED across both images; only the tsrt-website tag + ref
// are env-overridable (the maintainer/CI-only tsrt-e2e uses fixed GHCR coordinates).

import {createHash} from 'node:crypto';
import {cpSync, copyFileSync, existsSync, globSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {loadEnv, REPO_ROOT, SITES} from '../lib/env.mjs';
import {ghcrConfig, ghcrLogin, ghcrPullRetag, ghcrPushMultiarch, ghcrTryPullRetag, imageExists, requireEngine} from '../lib/engine.mjs';
import {capture, die, hostGoArch, note, noteErr, reportCliError, runOrThrow, sleep} from '../lib/proc.mjs';

// Env-INDEPENDENT paths + names.
const WEBSITE_DIR = join(REPO_ROOT, 'container/website');
const DEPS_DIR = join(WEBSITE_DIR, '_deps');
// The website image also bakes the benchmark deps (under /bench). Their manifests
// live in container/benchmarks/_deps (the source of truth); we stage a copy into the
// website build context (.bench-deps/, git-ignored) so the Containerfile can COPY them.
const BENCH_DEPS_SRC = join(REPO_ROOT, 'container/benchmarks/_deps');
const BENCH_DEPS_STAGE = join(WEBSITE_DIR, '.bench-deps');
// The e2e image builds from its OWN dir, so its toolchain manifests (_deps/) +
// verdaccio registry assets (registry/) are already in its build context — nothing
// to stage. These are only read for the local-image staleness check.
const E2E_DIR = join(REPO_ROOT, 'container/pre-publish-e2e');
const E2E_DEPS_SRC = join(E2E_DIR, '_deps');
// The mion consumer toolchain is its own baked root (/e2e-mion) — it cannot share
// /e2e's node_modules, which pins rolldown-vite + typescript 5 for the bundler matrix.
const E2E_MION_DEPS_SRC = join(E2E_DIR, '_deps-mion');
const E2E_REGISTRY_SRC = join(E2E_DIR, 'registry');
// The mion server-benchmark image builds from its own dir, so its per-app manifests
// (_deps/) are already in its build context — nothing to stage, like e2e.
const MION_BENCH_DIR = join(REPO_ROOT, 'container/mion-bench');
const MION_BENCH_DEPS_SRC = join(MION_BENCH_DIR, '_deps');
// The three drizzle-e2e images build from their own per-dialect dirs, but they
// SHARE the registry assets and the workspace policy, which live one level up in
// shared/. Those are staged into each build context as .shared/ (git-ignored),
// the same trick the website image uses for the benchmark manifests.
const DRIZZLE_DIR = join(REPO_ROOT, 'container/drizzle-e2e');
const DRIZZLE_SHARED_SRC = join(DRIZZLE_DIR, 'shared');
// The IMAGES, which is not the same list as the lanes. pg / mysql / sqlite are
// one image each; `cloudflare` serves BOTH Cloudflare lanes (d1 and durable),
// since neither is a dialect and a second image would be a byte-for-byte copy.
// scripts/release/drizzle-e2e.mjs maps a lane to its image.
const DRIZZLE_DIALECTS = ['pg', 'mysql', 'sqlite', 'cloudflare'];
// Only what is BAKED counts for the deps stamp: the workspace policy and the
// registry assets. The runners, the run script and the skip list are
// bind-mounted at run time, so editing one must not force a rebuild.
const DRIZZLE_BAKED_SHARED = ['_deps-common', 'registry'];

// Per-target image definitions. Engine / network / CA knobs are SHARED (MION_WEBSITE_*);
// only the build context, image tag, GHCR ref, manifest name + baked deps differ.
const TARGETS = {
  website: {dir: WEBSITE_DIR, repo: 'tsrt-website', manifest: 'tsrt-website-manifest'},
  e2e: {dir: E2E_DIR, repo: 'tsrt-e2e', manifest: 'tsrt-e2e-manifest'},
  'mion-bench': {dir: MION_BENCH_DIR, repo: 'mion-bench', manifest: 'mion-bench-manifest'},
  // One image per dialect, plus one for the two Cloudflare driver lanes. The
  // sqlite and cloudflare ones are far lighter than the other two (no server at
  // all), which is the payoff for several images rather than one.
  ...Object.fromEntries(
    DRIZZLE_DIALECTS.map((dialect) => [
      `drizzle-${dialect}`,
      {dir: join(DRIZZLE_DIR, dialect), repo: `mion-drizzle-${dialect}`, manifest: `mion-drizzle-${dialect}-manifest`},
    ])
  ),
};

// Which env prefix overrides a target's tag / GHCR ref / local-build toggle. The e2e
// image is maintainer + CI only, so its coordinates stay fixed and it keeps reading
// the shared MION_WEBSITE_USE_LOCAL.
const TAG_ENV = {website: 'MION_WEBSITE', 'mion-bench': 'MION_BENCH'};
const ALL_TARGETS = Object.keys(TARGETS);

// Resolve the env-dependent config fresh (so a caller that mutated the env — or
// passed an override map — always wins). `target` selects which image.
function config(env = process.env, target = 'website') {
  const spec = TARGETS[target];
  if (!spec) die(`image: unknown target '${target}' (expected ${ALL_TARGETS.join(' | ')})`);
  const {registry, owner} = ghcrConfig();
  const containerBase = env.MION_WEBSITE_CONTAINER || 'tsrt-website';
  // tsrt-website's tag/ref are env-overridable (bench.mjs maps MION_VALIDATION_BENCH_* onto
  // MION_WEBSITE_*), and so are mion-bench's (via MION_BENCH_*); the e2e image is
  // maintainer/CI-only with fixed coordinates.
  const tagEnv = TAG_ENV[target];
  const image = (tagEnv && env[`${tagEnv}_IMAGE`]) || `${spec.repo}:dev`;
  const remoteImage = (tagEnv && env[`${tagEnv}_REMOTE_IMAGE`]) || `${registry}/${owner}/${spec.repo}:latest`;
  return {
    target,
    dir: spec.dir,
    manifest: spec.manifest,
    engine: env.MION_WEBSITE_ENGINE || 'podman',
    image,
    remoteImage,
    containerBase,
    mountOpts: env.MION_WEBSITE_MOUNT_OPTS || '',
    buildNetwork: env.MION_WEBSITE_BUILD_NETWORK || '',
    runNetwork: env.MION_WEBSITE_RUN_NETWORK || '',
    caSrc: env.MION_WEBSITE_CA_CERT || '',
    baseImage: env.MION_WEBSITE_BASE_IMAGE || '',
    pnpmVersion: env.MION_WEBSITE_PNPM_VERSION || '',
    useLocal: Boolean(tagEnv ? env[`${tagEnv}_USE_LOCAL`] : env.MION_WEBSITE_USE_LOCAL),
    // Named volumes hold Nuxt's generated caches (website run side); clean drops them.
    // .nuxt and .data are PER SITE (see scripts/website/site.mjs), so clean has to
    // name every site's pair or the stale ones survive a clean and poison a rebuild.
    // The parallel build (`website build --parallel`) also gives each site its own
    // node_modules/.cache volume, so those are named here too.
    siteVolumes: SITES.flatMap((site) => [`${containerBase}-nuxt-${site}`, `${containerBase}-data-${site}`, `${containerBase}-cache-${site}`]),
    volCache: `${containerBase}-cache`,
  };
}

// Behind a corporate / MITM egress proxy the container must trust the proxy CA.
// Resolve the source once: the explicit MION_WEBSITE_CA_CERT, else the host's
// standard custom-CA dir IF it holds certs (a no-op on a normal host / macOS).
const HOST_CA_DIR = '/usr/local/share/ca-certificates';

function resolveCaSrc(caSrc, {quiet = false} = {}) {
  if (caSrc) return caSrc;
  if (existsSync(HOST_CA_DIR) && globSync('*.crt', {cwd: HOST_CA_DIR}).length > 0) {
    if (!quiet) note(`auto-detected host CA certs in ${HOST_CA_DIR} (corporate/MITM proxy); trusting them in the image`);
    return HOST_CA_DIR;
  }
  return '';
}

// Where the runtime CA bundle is mounted inside a container (see caRunArgs).
const CA_RUNTIME_MOUNT = '/etc/ssl/certs/rt-extra-ca.crt';

// The RUNTIME twin of prepareCacerts. Baking the CA only helps an image we BUILD;
// the normal path pulls a prebuilt image from GHCR, which never saw this host's
// proxy. Anything the container does over TLS at RUN time then fails - notably
// verdaccio's uplink to registry.npmjs.org, which 404s every proxied package with
// SELF_SIGNED_CERT_IN_CHAIN and strands the whole e2e lane. Mount the certs as ONE
// bundle file (NODE_EXTRA_CA_CERTS takes a file, never a dir) and point Node at it.
// Returns podman args, empty when there is no CA to add.
export function caRunArgs(cfg) {
  const caSrc = resolveCaSrc(cfg.caSrc, {quiet: true});
  if (!caSrc || !existsSync(caSrc)) return [];
  let bundle = caSrc;
  if (statSync(caSrc).isDirectory()) {
    const certs = globSync('*.crt', {cwd: caSrc});
    if (certs.length === 0) return [];
    // The concatenated bundle needs somewhere to live. A caller that passes no
    // build context (the drizzle lane runs a PULLED image and has none of its
    // own) still has to work, so say what is missing rather than failing inside
    // path.join with an undefined argument.
    if (!cfg.dir) throw new Error('caRunArgs: a host CA DIRECTORY needs cfg.dir to write the concatenated bundle into');
    // Concatenate the dir into one file next to the build context's staged certs
    // (.cacerts/ is git-ignored), since a dir cannot be handed to Node directly.
    bundle = join(cfg.dir, '.cacerts', 'runtime-bundle.crt');
    mkdirSync(join(cfg.dir, '.cacerts'), {recursive: true});
    writeFileSync(bundle, certs.map((crt) => readFileSync(join(caSrc, crt), 'utf8')).join('\n'));
  }
  return ['-v', `${bundle}:${CA_RUNTIME_MOUNT}:ro${cfg.mountOpts}`, '-e', `NODE_EXTRA_CA_CERTS=${CA_RUNTIME_MOUNT}`];
}

// Populate <build-context>/.cacerts/ from MION_WEBSITE_CA_CERT (file or dir). Always
// leaves the dir present (possibly empty) so the Containerfile COPY never fails.
function prepareCacerts(cfg) {
  const cacertsDir = join(cfg.dir, '.cacerts');
  rmSync(cacertsDir, {recursive: true, force: true});
  mkdirSync(cacertsDir, {recursive: true});
  const caSrc = resolveCaSrc(cfg.caSrc);
  if (caSrc) {
    if (existsSync(caSrc) && statSync(caSrc).isDirectory()) {
      for (const crt of globSync('*.crt', {cwd: caSrc})) copyFileSync(join(caSrc, crt), join(cacertsDir, crt));
    } else if (existsSync(caSrc) && statSync(caSrc).isFile()) {
      copyFileSync(caSrc, join(cacertsDir, 'extra-ca.crt'));
    } else {
      die(`image: MION_WEBSITE_CA_CERT='${caSrc}' is neither a file nor a directory`);
    }
    note(`trusting extra CA certs from ${caSrc}`);
  }
  writeFileSync(join(cacertsDir, '.gitkeep'), '');
}

// Stage container/benchmarks/_deps into the website build context as .bench-deps/ so
// the website Containerfile can COPY the benchmark manifests (installed under /bench).
function prepareBenchDeps() {
  if (!existsSync(BENCH_DEPS_SRC)) die(`image: missing ${BENCH_DEPS_SRC} (benchmark deps) - cannot build the website+benchmark image`);
  rmSync(BENCH_DEPS_STAGE, {recursive: true, force: true});
  mkdirSync(BENCH_DEPS_STAGE, {recursive: true});
  // Copy the tree contents (the .../ children), like `cp -R src/. stage/`.
  cpSync(BENCH_DEPS_SRC, BENCH_DEPS_STAGE, {recursive: true});
}

// Stage everything a target's build context needs that doesn't already live in it.
// website bakes the benchmark manifests from a sibling dir, so they're staged in;
// e2e's deps already live in its own build context (nothing to stage).
// Stage container/drizzle-e2e/shared's BAKED parts into one dialect's build
// context as .shared/ so its Containerfile can COPY them. Only the workspace
// policy and the registry assets: everything else in shared/ is bind-mounted at
// run time and must never invalidate the install layer.
function prepareDrizzleShared(cfg) {
  if (!existsSync(DRIZZLE_SHARED_SRC)) die(`image: missing ${DRIZZLE_SHARED_SRC} (drizzle-e2e shared assets)`);
  const stage = join(cfg.dir, '.shared');
  rmSync(stage, {recursive: true, force: true});
  for (const dir of DRIZZLE_BAKED_SHARED) cpSync(join(DRIZZLE_SHARED_SRC, dir), join(stage, dir), {recursive: true});
}

function prepareContext(cfg) {
  prepareCacerts(cfg);
  if (cfg.target === 'website') prepareBenchDeps();
  if (cfg.target.startsWith('drizzle-')) prepareDrizzleShared(cfg);
}

// Optional build-arg overrides: MION_WEBSITE_BASE_IMAGE swaps the Node 26 base;
// MION_WEBSITE_PNPM_VERSION overrides the pinned pnpm. Honored by build + push.
function buildArgFlags(cfg) {
  const flags = ['--build-arg', `DEPS_HASH=${depsHash(cfg)}`];
  if (cfg.baseImage) flags.push('--build-arg', `BASE_IMAGE=${cfg.baseImage}`);
  if (cfg.pnpmVersion) flags.push('--build-arg', `PNPM_VERSION=${cfg.pnpmVersion}`);
  return flags;
}

function buildImage(cfg) {
  requireEngine(cfg.engine);
  prepareContext(cfg);
  const flags = buildArgFlags(cfg);
  note(`building ${cfg.image} (${cfg.target}) from ${cfg.dir}/Containerfile`);
  const net = cfg.buildNetwork ? [`--network=${cfg.buildNetwork}`] : [];
  // Pin the local build to the host arch so it is ALWAYS native, even right after a
  // multi-arch push left a foreign-arch base tag in local storage.
  runOrThrow(cfg.engine, ['build', '--platform', `linux/${hostGoArch()}`, ...net, ...flags, '-t', cfg.image, '-f', 'Containerfile', '.'], {cwd: cfg.dir});
}

// The host-arch image-manifest digest from an OCI index / manifest list (the JSON
// `podman manifest inspect` prints). Empty when the host arch can't be determined
// or is absent from the index. Replaces the shell awk with a JSON.parse.
function hostArchDigestFromIndex(engine, indexJson) {
  const arch = capture(engine, ['info', '--format', '{{.Host.Arch}}']).stdout.trim();
  if (!arch) return '';
  let index;
  try {
    index = JSON.parse(indexJson);
  } catch {
    return '';
  }
  const manifests = Array.isArray(index?.manifests) ? index.manifests : [];
  const match = manifests.find((m) => m?.platform?.architecture === arch);
  return match?.digest ?? '';
}

// Make the working image ready. DEFAULT: use the published GHCR image, but SKIP the
// pull when the local image is ALREADY that image (compare digests, read as a
// manifest/index only — KBs, NO layer download). Pull only when the local image is
// missing or not the published latest; fall back to an existing local image when
// the registry is unreachable, then to a local build. MION_WEBSITE_USE_LOCAL=1 skips
// the registry entirely.
export function ensureImage(opts = {}) {
  const cfg = config(opts.env, opts.target);
  requireEngine(cfg.engine);
  if (cfg.useLocal) return ensureImageLocal(cfg);
  resolvePublishedImage(cfg);
  // Whatever we settled on, refuse to RUN an image whose baked manifests are not
  // the tree's. A `_deps` change does not force a republish, so the published
  // image drifts silently; without this the run just fails somewhere downstream
  // (or worse, passes against the wrong toolchain).
  if (imageExists(cfg.engine, cfg.image) && depsStampState(cfg) === 'drift') buildImage(cfg);
}

function resolvePublishedImage(cfg) {
  if (imageExists(cfg.engine, cfg.image)) {
    const index = capture(cfg.engine, ['manifest', 'inspect', cfg.remoteImage]).stdout.trim();
    if (!index) {
      noteErr(`registry unreachable - using existing local image ${cfg.image} (no pull)`);
      return;
    }
    const localDigest = capture(cfg.engine, ['image', 'inspect', cfg.image, '--format', '{{.Digest}}']).stdout.trim();
    const remoteDigest = hostArchDigestFromIndex(cfg.engine, index);
    if (localDigest && localDigest === remoteDigest) {
      noteErr(`local image ${cfg.image} already matches published ${cfg.remoteImage} (${remoteDigest}) - skipping pull`);
      return;
    }
    noteErr(`local image is not the published latest - pulling ${cfg.remoteImage}`);
  }
  if (ghcrTryPullRetag(cfg.engine, cfg.remoteImage, cfg.image)) return;
  if (imageExists(cfg.engine, cfg.image)) {
    noteErr(`using existing local image ${cfg.image}`);
    return;
  }
  noteErr('no published or local image available - building locally');
  buildImage(cfg);
}

// Every file baked into a target's image: its Containerfile plus the manifests /
// assets it COPYs. Sorted, so the hash below is stable across filesystems. The
// ONE definition of "what makes this image out of date" — both the mtime gate
// and the deps stamp read it, so they can never disagree about the input set.
function targetSrcFiles(cfg) {
  const files = [join(cfg.dir, 'Containerfile')];
  if (cfg.target === 'website') files.push(join(DEPS_DIR, 'package.json'), join(DEPS_DIR, 'pnpm-lock.yaml'), join(DEPS_DIR, 'pnpm-workspace.yaml'), join(DEPS_DIR, '.npmrc'));
  // Directory inputs the image bakes (website: benchmark manifests; e2e: BOTH
  // toolchain manifest roots + the registry assets). A bump to any must rebuild the
  // image.
  const DIRS_BY_TARGET = {
    website: [BENCH_DEPS_SRC],
    e2e: [E2E_DEPS_SRC, E2E_MION_DEPS_SRC, E2E_REGISTRY_SRC],
    'mion-bench': [MION_BENCH_DEPS_SRC],
    ...Object.fromEntries(
      DRIZZLE_DIALECTS.map((dialect) => [
        `drizzle-${dialect}`,
        [join(DRIZZLE_DIR, dialect, '_deps'), ...DRIZZLE_BAKED_SHARED.map((dir) => join(DRIZZLE_SHARED_SRC, dir))],
      ])
    ),
  };
  const dirs = DIRS_BY_TARGET[cfg.target] ?? [];
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    for (const rel of globSync('**/*', {cwd: dir})) files.push(join(dir, rel));
  }
  return files.filter((f) => existsSync(f) && statSync(f).isFile()).sort();
}

// Max mtime (epoch seconds) of those inputs. The LEGACY staleness gate: only
// sound on the local-build path, and only for an image with no deps stamp — a
// fresh clone has arbitrary mtimes, which is why the stamp supersedes it.
function targetSrcEpoch(cfg) {
  let epoch = 0;
  for (const f of targetSrcFiles(cfg)) epoch = Math.max(epoch, Math.floor(statSync(f).mtimeMs / 1000));
  return epoch;
}

// Content hash of the baked inputs, stamped into the image as DEPS_LABEL at build
// time and compared against the tree before any run. Content, never mtime, so it
// survives a clone and means the same thing on every host.
function depsHash(cfg) {
  const digest = createHash('sha256');
  for (const f of targetSrcFiles(cfg)) {
    digest.update(f.slice(cfg.dir.length + 1));
    digest.update('\0');
    digest.update(readFileSync(f));
    digest.update('\0');
  }
  return digest.digest('hex').slice(0, 16);
}

// The label carrying depsHash(). Absent on any image built before stamping — that
// is 'unknown', which must NOT be read as drift: forcing a local build on a
// missing label would make every CI lane rebuild these images from scratch.
const DEPS_LABEL = 'org.mionkit.deps-hash';

function depsStampState(cfg) {
  const want = depsHash(cfg);
  const got = capture(cfg.engine, ['image', 'inspect', cfg.image, '--format', `{{index .Labels "${DEPS_LABEL}"}}`]).stdout.trim();
  if (!got || got === '<no value>') {
    noteErr(`image ${cfg.image} carries no ${DEPS_LABEL} (built before deps stamping) - cannot verify it matches ${cfg.target}'s manifests; push it to stamp one`);
    return 'unknown';
  }
  if (got === want) return 'match';
  noteErr(`image ${cfg.image} was built from DIFFERENT ${cfg.target} manifests (stamped ${got}, tree is ${want}) - building locally instead of running a stale image`);
  return 'drift';
}

// Local-image path: build when missing, and rebuild when any baked manifest (or the
// Containerfile) is newer than the cached image. Bind-mounted source never needs a
// rebuild (mounted live).
function ensureImageLocal(cfg) {
  if (!imageExists(cfg.engine, cfg.image)) return buildImage(cfg);
  const stamp = depsStampState(cfg);
  if (stamp === 'drift') return buildImage(cfg);
  if (stamp === 'match') return; // content-exact: mtimes cannot add anything
  // No stamp to compare (image predates stamping): fall back to the mtime gate.
  const imgEpoch = Number(capture(cfg.engine, ['image', 'inspect', cfg.image, '--format', '{{.Created.Unix}}']).stdout.trim()) || 0;
  if (targetSrcEpoch(cfg) > imgEpoch) {
    note('image is stale (Containerfile or a manifest newer than image) - rebuilding');
    buildImage(cfg);
  }
}

export function cmdLogin(opts = {}) {
  const cfg = config(opts.env, opts.target);
  requireEngine(cfg.engine);
  ghcrLogin(cfg.engine);
}

export function cmdPush(opts = {}) {
  const cfg = config(opts.env, opts.target);
  requireEngine(cfg.engine);
  prepareContext(cfg);
  ghcrPushMultiarch(cfg.engine, cfg.manifest, cfg.dir, cfg.remoteImage, cfg.buildNetwork, buildArgFlags(cfg));
}

export function cmdPull(opts = {}) {
  const cfg = config(opts.env, opts.target);
  requireEngine(cfg.engine);
  ghcrPullRetag(cfg.engine, cfg.remoteImage, cfg.image);
}

// Regenerate _deps/pnpm-lock.yaml inside the container, so the host stays free of
// package-manager files. The supported "bump a website dep" step. Website-only.
export function cmdLock(opts = {}) {
  const cfg = config(opts.env);
  ensureImage(opts);
  note('regenerating _deps/pnpm-lock.yaml inside the container');
  const net = cfg.runNetwork ? [`--network=${cfg.runNetwork}`] : [];
  runOrThrow(cfg.engine, ['run', '--rm', '--init', ...net, '-v', `${DEPS_DIR}:/lock${cfg.mountOpts}`, '-w', '/lock', cfg.image, 'pnpm', 'install', '--lockfile-only', '--no-frozen-lockfile']);
}

export function cmdClean(opts = {}) {
  const cfg = config(opts.env, opts.target);
  requireEngine(cfg.engine);
  note(`removing image ${cfg.image}${cfg.target === 'website' ? ' and named volumes' : ''}`);
  capture(cfg.engine, ['rmi', '-f', cfg.image]); // ignore "no such image"
  // Named volumes only belong to the website run side.
  if (cfg.target === 'website') capture(cfg.engine, ['volume', 'rm', '-f', ...cfg.siteVolumes, cfg.volCache]);
}

// ── pre-publish e2e registry (verdaccio-in-container) ────────────────────────
// Start the e2e image running its baked verdaccio (e2e-serve.sh): the mounted
// tarballs are published to its own :4873, exposed on 127.0.0.1:<port>, and the
// e2e source is mounted read-only at /e2e-src for the in-container matrix run.
// The healthcheck flips to `healthy` only after every tarball is published.
// Returns the coordinates so the caller (scripts/release/e2e.mjs) can wait for
// health, `podman exec` the matrix, drive the host-native smoke, then stopRegistry.
export function startRegistry(opts = {}) {
  const cfg = config(opts.env, 'e2e');
  if (!opts.tarballsDir || !existsSync(opts.tarballsDir)) die(`image: registry: tarballs dir '${opts.tarballsDir ?? ''}' not found (run: rtx release binaries && rtx release pack)`);
  if (!opts.e2eSrcDir || !existsSync(opts.e2eSrcDir)) die(`image: registry: e2e source dir '${opts.e2eSrcDir ?? ''}' not found`);
  ensureImage({env: opts.env, target: 'e2e'});
  const container = `${cfg.containerBase}-e2e-registry`;
  const port = String(opts.port || '4873');
  const net = cfg.runNetwork ? [`--network=${cfg.runNetwork}`] : [];
  capture(cfg.engine, ['rm', '-f', container]); // drop any stale container
  note(`starting containerized verdaccio (${container}) on 127.0.0.1:${port}`);
  runOrThrow(
    cfg.engine,
    [
      'run', '-d', '--init', '--name', container,
      '-v', `${opts.tarballsDir}:/tarballs:ro${cfg.mountOpts}`,
      '-v', `${opts.e2eSrcDir}:/e2e-src:ro${cfg.mountOpts}`,
      // Use the repo's verdaccio config (mounted under /e2e-src) instead of the one
      // BAKED into the pulled image - so the '@mionjs/*' local-only rule applies
      // without republishing the image. e2e-serve.sh honors MION_E2E_VERDACCIO_CONFIG.
      '-e', 'MION_E2E_VERDACCIO_CONFIG=/e2e-src/registry/verdaccio.yaml',
      '-p', `127.0.0.1:${port}:4873`,
      ...net,
      // verdaccio proxies everything that is not @mionjs/* to npmjs, so its
      // uplink needs the host's CA behind a MITM proxy.
      ...caRunArgs(cfg),
      '--health-cmd', 'test -f /tmp/registry-ready',
      '--health-interval', '2s',
      '--health-retries', '90',
      '--health-start-period', '2s',
      cfg.image,
      '/usr/local/bin/e2e-serve.sh',
    ],
    {stdio: ['inherit', 'ignore', 'inherit']}
  );
  return {engine: cfg.engine, container, port, image: cfg.image};
}

// Start the e2e toolchain image as a plain keep-alive container (NO verdaccio, NO
// tarballs) for the POST-publish matrix (scripts/release/e2e.mjs --backend npm):
// the multi-bundler apps install the LIVE @mionjs/* from a real registry
// (registry.npmjs.org) instead of verdaccio, so the container only supplies the
// baked builder toolchains + the bind-mounted source at /e2e-src. Default
// networking gives egress to the public registry (no port publish, no healthcheck).
// Returns the coordinates so the caller can `podman exec` the matrix, then
// stopRegistry() (a plain `rm -f`) tears it down.
export function startToolchainContainer(opts = {}) {
  const cfg = config(opts.env, 'e2e');
  if (!opts.e2eSrcDir || !existsSync(opts.e2eSrcDir)) die(`image: toolchain: e2e source dir '${opts.e2eSrcDir ?? ''}' not found`);
  ensureImage({env: opts.env, target: 'e2e'});
  const container = `${cfg.containerBase}-e2e-matrix`;
  const net = cfg.runNetwork ? [`--network=${cfg.runNetwork}`] : [];
  capture(cfg.engine, ['rm', '-f', container]); // drop any stale container
  note(`starting e2e toolchain container (${container}) for the real-registry matrix`);
  runOrThrow(
    cfg.engine,
    // This one installs from the REAL registry (post-publish matrix), so it needs
    // the host's CA behind a MITM proxy just as much as the verdaccio lane.
    ['run', '-d', '--init', '--name', container, '-v', `${opts.e2eSrcDir}:/e2e-src:ro${cfg.mountOpts}`, ...net, ...caRunArgs(cfg), cfg.image, 'sleep', 'infinity'],
    {stdio: ['inherit', 'ignore', 'inherit']}
  );
  return {engine: cfg.engine, container, image: cfg.image};
}

// Wait until a container's healthcheck passes. Returns false (after dumping the
// container's tail) when it never does, so each caller keeps its own wording.
//
// `.State.Health.Status` only advances when podman's healthcheck TIMER fires,
// and that timer is a transient systemd unit - so wherever systemd is not init
// (GitHub runners, agent/dev containers, some rootless setups) the status sits
// at 'starting' forever while the service is long since ready. Running the SAME
// healthcheck synchronously settles it: exit 0 means the container's own health
// command passed, which is exactly what 'healthy' would have meant.
export async function waitContainerHealthy(engine, container, {timeoutS = 240, logTail = 60} = {}) {
  const deadline = Date.now() + timeoutS * 1000;
  while (Date.now() < deadline) {
    const status = capture(engine, ['inspect', '--format', '{{.State.Health.Status}}', container]).stdout.trim();
    if (status === 'healthy') return true;
    if (status === 'unhealthy') break;
    if (capture(engine, ['healthcheck', 'run', container]).status === 0) return true;
    await sleep(1500);
  }
  noteErr(`${container} did not become healthy - last ${logTail} log lines:`);
  noteErr(capture(engine, ['logs', '--tail', String(logTail), container]).stdout);
  return false;
}

// Remove the registry / toolchain container (best-effort; ignores "no such container").
export function stopRegistry(engine, container) {
  capture(engine, ['rm', '-f', container]);
}

export function buildImageCmd(opts = {}) {
  buildImage(config(opts.env, opts.target));
}

// Commands that operate on an IMAGE accept an optional target (website | e2e |
// mion-bench); with none given, the whole-fleet commands (build-image / push / pull /
// clean) act on EVERY image so a maintainer publishes everything in one shot.
export function main(args) {
  const [cmd, maybeTarget] = args;
  const targets = maybeTarget ? [maybeTarget] : ALL_TARGETS;
  switch (cmd) {
    case 'build-image': return targets.forEach((target) => buildImageCmd({target}));
    case 'ensure': return ensureImage({target: maybeTarget || 'website'});
    case 'login': return cmdLogin();
    case 'push': return targets.forEach((target) => cmdPush({target}));
    case 'pull': return targets.forEach((target) => cmdPull({target}));
    case 'lock': return cmdLock();
    case 'clean': return targets.forEach((target) => cmdClean({target}));
    default: die(`image: unknown command '${cmd ?? ''}'. Try: build-image | ensure | login | push | pull | lock | clean [${ALL_TARGETS.join('|')}]`);
  }
}

if (import.meta.main) {
  loadEnv();
  try {
    main(process.argv.slice(2));
  } catch (err) {
    reportCliError(err);
  }
}
