// engine.mjs — podman/container helpers shared by container/image.mjs,
// website/site.mjs and website/bench-data/bench.mjs. Folds the old
// scripts/container/lib.sh (engine readiness, macOS podman-machine autostart) and
// scripts/container/ghcr.sh (GHCR login / push / pull) into one module.
//
// The engine name is passed in by each caller (image.mjs reads RT_WEBSITE_ENGINE,
// bench.mjs reads RT_BENCH_ENGINE), so this module is engine-agnostic and holds no
// mutable state. GHCR coordinates come from the environment with the same defaults
// the shell used (ghcr.io / mionkit / M-jerez).

import {platform} from 'node:os';
import {capture, die, note, noteErr, run, runOrThrow, which} from './proc.mjs';

// Make sure the container engine is installed AND reachable (not just on PATH).
export function requireEngine(engine) {
  if (!which(engine)) die(`container engine '${engine}' not found. Install podman (https://podman.io).`);
  ensureEngineRunning(engine);
}

// On macOS, podman runs inside a Linux VM ("podman machine") that does NOT
// auto-start at login: a stopped machine is still the "default" connection but its
// socket is dead, and every command fails with "connection refused". When that
// happens, init a machine if none exists and start it. Linux podman runs natively
// (no machine layer), and non-podman engines (e.g. docker) are left alone.
export function ensureEngineRunning(engine) {
  if (engine !== 'podman') return;
  if (platform() !== 'darwin') return;
  if (capture(engine, ['info']).status === 0) return;
  const names = capture(engine, ['machine', 'list', '--format', '{{.Name}}']).stdout.trim();
  if (!names) {
    note('no podman machine found — initializing (one-time, ~1 min)');
    if (run(engine, ['machine', 'init']) !== 0) die('podman machine init failed');
  }
  const running = capture(engine, ['machine', 'list', '--format', '{{.Running}}']).stdout;
  if (!/true/i.test(running)) {
    note('starting podman machine');
    if (run(engine, ['machine', 'start']) !== 0) die('podman machine start failed');
  }
  if (capture(engine, ['info']).status !== 0) {
    die(`podman is installed but the engine isn't reachable (try: ${engine} machine start)`);
  }
}

// True if a local image with this tag exists (`podman image exists`).
export function imageExists(engine, image) {
  return capture(engine, ['image', 'exists', image]).status === 0;
}

// ── GHCR (GitHub Container Registry) ─────────────────────────────────────────
// Coordinates with the same defaults ghcr.sh used; overridable from the environment.
export function ghcrConfig() {
  return {
    registry: process.env.GHCR_REGISTRY || 'ghcr.io',
    owner: process.env.GHCR_OWNER || 'mionkit',
    user: process.env.GHCR_USER || 'M-jerez',
  };
}

// Log in to the registry using GHCR_PAT via --password-stdin (never echoed, never
// written into a layer / the build context / git).
export function ghcrLogin(engine) {
  const pat = process.env.GHCR_PAT;
  if (!pat) die('ghcr: no PAT found. Set GHCR_PAT=<token> in .env');
  const {registry, user} = ghcrConfig();
  note(`logging in to ${registry} as ${user}`);
  runOrThrow(engine, ['login', registry, '-u', user, '--password-stdin'], {input: pat, stdio: ['pipe', 'inherit', 'inherit']});
}

// Build a linux/amd64 + linux/arm64 manifest list and push it to <ref>. On an
// arm64 host the amd64 arm builds under QEMU emulation (slower). buildArgFlags
// (e.g. ['--build-arg', 'BASE_IMAGE=…']) mirror a local build's base/pnpm overrides.
export function ghcrPushMultiarch(engine, manifest, ctx, ref, net, buildArgFlags = []) {
  const netArg = net ? [`--network=${net}`] : [];
  note(`building multi-arch (linux/amd64,linux/arm64) manifest: ${manifest}`);
  capture(engine, ['manifest', 'rm', manifest]); // ignore "no such manifest"
  runOrThrow(engine, ['manifest', 'create', manifest]);
  runOrThrow(engine, ['build', ...netArg, ...buildArgFlags, '--platform', 'linux/amd64,linux/arm64', '--manifest', manifest, '-f', 'Containerfile', '.'], {cwd: ctx});
  note(`pushing manifest -> docker://${ref}`);
  runOrThrow(engine, ['manifest', 'push', '--all', manifest, `docker://${ref}`]);
  note(`pushed ${ref}`);
}

// Pull the published image and tag it as the local working image.
export function ghcrPullRetag(engine, ref, localImg) {
  note(`pulling ${ref}`);
  runOrThrow(engine, ['pull', ref]);
  runOrThrow(engine, ['tag', ref, localImg]);
  note(`tagged ${ref} as ${localImg}`);
}

// Refresh the local working image from the published one before a run. Returns
// false (without throwing) when the registry is unreachable / the image isn't
// published / the caller isn't logged in, so callers can fall back to a local
// image or build.
export function ghcrTryPullRetag(engine, ref, localImg) {
  note(`ensuring latest published image is pulled: ${ref}`);
  if (run(engine, ['pull', ref]) === 0) {
    runOrThrow(engine, ['tag', ref, localImg]);
    return true;
  }
  noteErr(`could not pull ${ref} (offline / not published / not logged in)`);
  return false;
}
