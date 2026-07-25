# Pre-publish e2e — step 1: containerized harness

**Status:** todo (design agreed; not started)
**Created:** 2026-07-08
**Scope:** `.github/` (`release-gate.yml` e2e job + `verdaccio-publish` action), `scripts/release/e2e.mjs` (new), `scripts/rt.mjs`, `container/website/Containerfile` + `scripts/container/image.mjs`, `container/pre-publish-e2e/`, `SETUP.md` (dev-loop). No package/runtime code.

> **Pre-publish e2e — 3 units.** **① this: the harness** → ② [feature matrix](./prepublish-e2e-2-feature-matrix.md) (runs *inside* this harness). ③ [staged publish + deploy](./staged-npm-publish-and-deploy.md) is a **separate, independent** track. Do ① then ② sequentially; ③ anytime. **Start here** — this is the foundation ② builds on, it's self-contained (no npmjs.com setup, no publish risk), and it delivers the local pre-publish smoke + the supply-chain fix on its own.

## Context

The pre-publish e2e already exists and already runs on three platforms — it is
NOT missing, it is smeared across CI YAML with two gaps:

1. **No local entry point.** The verdaccio-backed consumer install + suite lives
   only in [`release-gate.yml`](../../.github/workflows/release-gate.yml)'s `e2e`
   job + the [`verdaccio-publish`](../../.github/actions/verdaccio-publish/action.yml)
   composite action. A maintainer cannot smoke a release locally before pushing.
2. **Verdaccio runs on the host.** `verdaccio-publish` does `npx --yes verdaccio@6`
   **on the runner** (and would, if lifted verbatim into a local script, run on a
   dev's own machine). That executes verdaccio's entire transitive tree — and any
   malicious postinstall in it — as the invoking user, with access to `~/.npmrc`
   (the npm token), SSH keys, env. That is the supply-chain exposure we want gone.

Two goals, agreed with the maintainer:

- **G1 — a local way to run the full pre-publish e2e** (build → registry →
  install published packages → run the consumer suite).
- **G2 — keep multi-platform coverage** (the real per-OS binary spawn + launcher
  plumbing), which is the whole reason the e2e exists.

Plus one hard constraint the maintainer added:

- **G3 — verdaccio + its dependency tree must run *inside the container*, never
  installed into a dev's host environment.** "Run anything that is not core
  functionality inside the container" — supply-chain blast-radius reduction.
  Baking it into the **existing shared image** is explicitly fine (saves a
  reinstall per run).

## The two immovable constraints that shape everything

Both are "laws of physics" — the design routes around them rather than fighting
them.

**L1 — the host-platform binary can only be exercised by an `npm install` on
that host.** `@ts-runtypes/bin`'s `getExePath()` resolves
`@ts-runtypes/binary-<os>-<arch>` via optional-dependency `os`/`cpu` gating:
installing on darwin picks the darwin binary and skips the others. Even if you
force a foreign binary into `node_modules` (`--os`/`--cpu`), a Mach-O binary
cannot *execute* on Linux — and the e2e's point is spawn + rewrite, not just
resolution (see [`container/pre-publish-e2e/src/main.ts`](../../container/pre-publish-e2e/src/main.ts)).
⇒ **exercising the darwin binary ⟺ install + suite run on darwin.** No container
substitutes for this.

**L2 — GitHub's macOS/Windows runners cannot run a Linux podman container.**
So the containerized-verdaccio model is the **local + Linux** story; the
darwin/windows **CI** lanes cannot use it and fall back to on-runner verdaccio
(acceptable: CI runners are ephemeral, disposable VMs — not a dev's machine,
which is the actual threat surface in G3).

The seam these two carve is exactly the right one: **verdaccio (the untrusted
registry server) → container; the consumer install + suite (your own vite/vitest
harness + the packages under test) → host-native.** Verdaccio is what we isolate;
the consumer side is your existing trusted dev harness plus the SUT.

## Architecture — containerized registry + host-native consumer

```
        ┌──────────── podman (Linux, from the shared GHCR image) ────────────┐
        │  verdaccio  (baked into the image, started by entrypoint)           │
        │  tarballs/ mounted READ-ONLY ──► published to its own :4873         │
        │  healthcheck: ready only after every tarball is published           │
        └───────────────────────────────┬────────────────────────────────────┘
                                         │  -p 127.0.0.1:4873:4873
                                         ▼
        HOST (dev's Mac, or a per-OS CI runner — REAL os/arch)
        node · vite · vitest · container/pre-publish-e2e consumer suite
        npm install @ts-runtypes/*  --registry http://127.0.0.1:4873
        npm test   → resolves + SPAWNS the host-platform binary
```

Everything registry-related (verdaccio **and** the publish of the tarballs into
it) happens inside the container. The host only ever runs `npm install`/`npm test`
of the fixture — its deps are the vite/vitest harness you already run daily and
the freshly built `@ts-runtypes/*` packages under test. **Verdaccio's tree never
lands in the host's node/npm environment.**

### The single front door: `pnpm rtx release e2e`

One script owns the flow; local and every CI lane call the *same* script, so
they cannot drift. New `scripts/release/e2e.mjs`, wired into `scripts/rt.mjs`'s
`release` dispatch next to `pack`/`tarballs`.

Flow (`pnpm rtx release e2e`):

1. Ensure `tarballs/` exists (else instruct: `rtx release binaries && rtx release pack`,
   or run them itself — mirror what the gate's `build` job does).
2. **Pick a registry backend:**
   - **container** (default; required locally): pull the shared image
     (`pull-shared-image` / `image.mjs cmdPull`), `podman run` it with
     `-v tarballs:/tarballs:ro,-p 127.0.0.1:4873:4873`, entrypoint starts
     verdaccio + publishes the mounted tarballs to its own `:4873`, marks
     healthy. Host waits for healthy.
   - **host-npx** (fallback; CI macOS/Windows only): the current
     `npx verdaccio` path. **Guarded** — see the guard below.
3. Consumer suite (detailed in
   [`prepublish-e2e-2-feature-matrix.md`](./prepublish-e2e-2-feature-matrix.md)) —
   two axes: the **full multi-bundler feature matrix** builds + tests **inside the
   container** (Linux binary; installs the fresh `@ts-runtypes/*` from the
   in-container verdaccio), and a **lean host-native smoke** installs from the
   port-published `:4873` and builds one app natively to exercise the **host
   platform's** binary (L1). Locally you get both; per-OS CI runs the lean smoke.
4. Teardown the container / kill verdaccio.

**The local-safety guard (encodes G3):** `e2e.mjs` refuses the `host-npx` backend
unless `process.env.CI` is set. So on a dev machine it is **container-or-error** —
if podman isn't up, it fails with "start podman (see the ts-runtypes-setup
skill)" and *never* npx-installs verdaccio locally. The npx fallback exists
*only* for the ephemeral GH macOS/Windows runners (L2), and logs loudly that it
is doing so (never silent).

## Required CI + tooling changes (file by file)

| File | Change |
|------|--------|
| [`container/website/Containerfile`](../../container/website/Containerfile) | Bake verdaccio in: `RUN npm i -g verdaccio@<pin>` (deps-only image; verdaccio is a node app, fits the Node 26 base). Pin the version. Add an entrypoint/helper script that starts verdaccio with a config + publishes `/tarballs/*.tgz` to `127.0.0.1:4873` + exposes a healthcheck. Move `.github/verdaccio.yaml` into the image (or mount it). |
| [`scripts/container/image.mjs`](../../scripts/container/image.mjs) | Add a `verdaccio`/`registry` run command (start the container with the tarballs mount + port publish + `--health-*`), reusing `cfg.engine`/`ensureImage`. The image now carries a verdaccio layer ⇒ **republish to GHCR** (`rtx container push`) so CI's `pull-shared-image` gets it (per the "republish when image inputs change" rule). |
| **NEW** `scripts/release/e2e.mjs` | The orchestrator above (container-default, host-npx-fallback-guarded-by-CI, host consumer install+test). |
| [`scripts/rt.mjs`](../../scripts/rt.mjs) | Add `e2e: ['node', ['scripts/release/e2e.mjs']]` to the `release` area + `--help` line. |
| [`.github/actions/verdaccio-publish/action.yml`](../../.github/actions/verdaccio-publish/action.yml) | Retire or repurpose. The e2e job calls `pnpm rtx release e2e` instead of this action's inline npx. Keep an `host-npx` code path (now inside `e2e.mjs`) for the macOS/Windows lanes. |
| [`.github/workflows/release-gate.yml`](../../.github/workflows/release-gate.yml) `e2e` job | Replace the inline `verdaccio-publish` + `npm install`/`npm test` steps with: download tarballs → `pnpm rtx release e2e`. On `ubuntu-latest` it uses the container; on `macos-14`/`windows-latest` it uses the guarded host-npx fallback (podman-for-linux-containers unavailable — L2). Matrix, QEMU `smoke` job, benchmarks, website-build: unchanged. |
| [`SETUP.md`](../../SETUP.md) | Document `pnpm rtx release e2e` in the dev-loop section. (The staged-publish **approval** runbook is unit ③'s SETUP.md change, not this one.) |

Keep the OS matrix (`linux-x64`, `darwin-arm64`, `win32-x64`) and the QEMU
`smoke` job (`linux-arm64`, `linux-arm`) exactly as-is — that IS G2, and L1/L2
mean it cannot collapse into the container.

## Supply-chain rationale (why this satisfies G3)

- **Blast radius, before:** `npx verdaccio` on host → a compromised dep runs as
  you, reads `~/.npmrc`/keys/env.
- **Blast radius, after (local + Linux CI):** verdaccio is installed *once* in
  the image build (CI, or `podman build`'s ephemeral sandbox — never the host's
  fs/npm cache), distributed as immutable GHCR layers you *pull*. At run time it
  executes in a **rootless** container that sees **only** the read-only
  `tarballs/` mount and a loopback port — not your home dir. **Mounts are the
  only leak path**, so the run command mounts tarballs read-only and nothing else
  (no repo mount, no home mount).

## Implementation notes

No open design decisions — these are build-time checks/tasks:

- **Verify the L2 assumption when wiring the CI lanes:** confirm the GH
  macOS/Windows runner images lack a usable Linux-container engine. Robust either
  way — the `host-npx` guard is CI-only, so a future runner that ships one simply
  stops taking the fallback.
- **Fixture marker coverage:** the current fixture has only the static
  `getRunTypeId<User>()`; add the value-first `getRunTypeId(value)` form per the
  marker rule (folded into unit ②'s fixture rebuild).

## Acceptance criteria

- [x] `pnpm rtx release e2e` runs the flow locally on macOS against a
      **containerized** verdaccio and exercises the real darwin-arm64 binary;
      fails cleanly (no host verdaccio install) if podman is down. **Verified
      green end-to-end on macOS/arm64** (containerized verdaccio → in-container
      matrix on the published linux-x64 binary → host-native darwin smoke).
- [x] The same command drives the `ubuntu-latest` e2e lane (container); the
      macOS/Windows lanes pass via the CI-guarded host-npx fallback. (`release-gate.yml`
      rewired; ubuntu=container, mac/win=host-npx.)
- [~] The shared GHCR image carries the verdaccio + e2e-toolchain layers.
      **Local image built + verified; the GHCR republish (`pnpm rtx container push`)
      is the one remaining maintainer step so CI `pull-shared-image` gets it.**
- [x] `SETUP.md` documents `pnpm rtx release e2e` under Publishing.
- [x] On completion, `git mv` this spec to `docs/done/`.

## Implementation outcome (shipped 2026-07-08)

Shipped as designed. New `scripts/release/e2e.mjs` (container-default /
host-npx-fallback-guarded-by-CI), `startRegistry`/`stopRegistry` +
`prepareE2eDeps` in `image.mjs`, verdaccio + the e2e toolchains baked into
`container/website/Containerfile` (config + `e2e-serve.sh` under
`container/pre-publish-e2e/registry/`), `rtx release e2e` wired, `release-gate.yml`
e2e job rewired, `verdaccio-publish` action retired (its logic moved into
`e2e.mjs`; `.github/verdaccio.yaml` kept for the host-npx path), `RT_E2E_*` in the
env registry + `.env.sample`.

Deviations found + fixed while wiring the container run: verdaccio `max_body_size`
(the ~8 MB binary tarballs 413'd), the runtime install uses **npm**
(`--legacy-peer-deps` + an explicit `@ts-runtypes/bin`) rather than `pnpm add` (the
build-time pnpm store lives in a cache mount absent from the image, so `pnpm add`
would re-resolve + prune the baked toolchains), and the age gate is bypassed only
for the packages-under-test install.

**Remaining maintainer step:** `pnpm rtx container push` to republish the shared
GHCR image with the new layers (needs `GHCR_PAT`), so CI's `pull-shared-image`
serves it. Until then the prod release-gate e2e (ubuntu container backend) pulls
an image without the e2e layers.
</content>
