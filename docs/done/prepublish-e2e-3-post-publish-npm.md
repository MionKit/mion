# Pre-publish e2e — step 3: post-publish smoke against real npm

**Status:** done (shipped)
**Created:** 2026-07-10
**Scope:** `scripts/release/e2e.mjs` (new `npm` backend), `scripts/container/image.mjs` (`startToolchainContainer`), `scripts/lib/env.mjs` (`RT_E2E_REGISTRY`), `scripts/rt.mjs` (help), `.github/workflows/post-publish.yml` (new), `.github/workflows/publish.yml` (pointer), `SETUP.md`. No package/runtime code.

> **Pre-publish e2e — the series.** ① [harness](./prepublish-e2e-1-harness.md) → ② [feature matrix](./prepublish-e2e-2-feature-matrix.md) (runs inside the harness) → ③ **this: the same suite, run once more AFTER publish against the real registry.** Independent of ③'s sibling, [staged publish + deploy](./staged-npm-publish-and-deploy.md).

## Context

The pre-publish e2e (① + ②) installs the **packed** `@ts-runtypes/*` tarballs from a throwaway verdaccio and runs the consumer suite. That proves the bytes we're about to publish are good — but it can't prove the bytes that actually **land on npm** resolve and run, because:

- `pnpm publish` rewrites `workspace:*` → concrete versions and npm applies its own manifest handling; the published tarball is assembled by the registry, not byte-identical to what we packed.
- The value that most often breaks at publish time is the **per-OS platform-binary optional-dep chain** — `@ts-runtypes/bin` → `@ts-runtypes/binary-<os>-<arch>` (os/cpu-gated optional deps). A missing or mis-gated platform package only surfaces when a real consumer installs from the real registry on that OS/arch.

So we want the identical suite run a second time, post-publish, against `registry.npmjs.org`.

## What shipped

**`e2e.mjs` grew a third backend, `npm`** (alongside `container` + `host-npx`). It skips the build/pack/publish + verdaccio entirely and installs the already-live packages from the real registry:

```bash
pnpm rtx release e2e --backend npm                 # matrix + host smoke (matrix needs podman)
pnpm rtx release e2e --backend npm --no-matrix     # host smoke only (no container)
pnpm rtx release e2e --backend npm --version 0.9.0 --registry https://registry.npmjs.org
```

- The registry the matrix installs from is now threaded through `RT_E2E_REGISTRY` (in-container verdaccio for the pre-publish backends, `registry.npmjs.org` for `npm`), instead of being hardcoded to `http://127.0.0.1:4873` in the matrix script. `runHostSmoke` likewise takes a full registry URL.
- `waitForNpmVersion` polls `npm view` until the version is resolvable, so a run triggered promptly after publish waits out CDN propagation rather than 404-ing.
- The matrix reuses the same `tsrt-e2e` toolchain image, started as a plain keep-alive container (`startToolchainContainer` — no verdaccio, no tarballs, default networking for registry egress) instead of the verdaccio-serving `startRegistry`.
- Because the two modes share `runContainerMatrix` / `runHostSmoke` / the fixtures, the post-publish suite **cannot drift** from the pre-publish one — same code, different registry.

**`post-publish.yml`** drives it in CI as a **manual `workflow_dispatch`** (optional `version` / `registry` inputs, else `version.json`):

- `resolve` job pins the version + registry once so every lane verifies the same coordinates.
- `e2e` matrix — ubuntu (matrix + host smoke), macOS + Windows (host smoke only), each `--backend npm`. Mirrors the release gate's e2e lane split.
- `exec-smoke` matrix — `linux-arm64` + `linux-arm` binaries `npm pack`ed from npm and exec'd under QEMU (`--version`), the post-publish analog of the release gate's tarball exec-smoke.

**Why manual:** the release path stage-publishes to npm (`publish.yml`) and a maintainer promotes each package to live with a 2FA challenge (`pnpm rtx release stage-approve`). There is no CI signal for "stage approved → live", so this can't hang off `publish.yml` — the maintainer dispatches it after approval. The version wait makes an early dispatch harmless.

## Verification

Host smoke run locally against the live `0.9.0` packages (`pnpm rtx release e2e --backend npm --no-matrix`): installs `@ts-runtypes/core` + `devtools` from npm, npm auto-resolves the `@ts-runtypes/bin` peer + the `binary-linux-x64` optional dep, and vitest transforms the fixture through the plugin → spawns the published host binary → rewrites both `getRunTypeId` shapes. Passed. The published `binary-linux-arm64` tarball was confirmed to `npm pack` + extract to a valid aarch64 static ELF for the QEMU lane.
