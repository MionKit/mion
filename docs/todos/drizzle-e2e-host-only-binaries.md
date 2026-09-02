---
type: chore
spec: guidelines
status: ready
created: 2026-09-02
---

# Build only the host platform binary in the drizzle-e2e workflow

## Intent

The `drizzle · translated suites against real databases` workflow
(`.github/workflows/drizzle-e2e.yml`) has one `build + pack` job whose step
"Cross-compile the platform binary packages" runs `pnpm miondevx release binaries`
(`scripts/release/build-binaries.mjs`). That step cross-compiles the Go resolver for
all seven publish platforms and takes about 18 of the job's 23 minutes.

The five dialect lanes that consume the packed tarballs only ever run on ubuntu
runners inside linux/amd64 containers, so only the `@mionjs/binary-linux-x64` package
is ever installed there. The other six cross-builds are wasted in that workflow.

The release gate (`.github/workflows/release-gate.yml`) and the publish path must KEEP
building all seven: they publish them and exec-test the Linux side-arches under QEMU.
This optimisation is for the drizzle-e2e workflow only.

## Direction

The implementer plans the details. Verified pointers and constraints:

- Give `release binaries` a way to build only the host platform, for example a
  `--host-only` flag on `scripts/release/build-binaries.mjs` (the host is
  `process.platform` + `process.arch`, the same key `getExePath()` in
  `packages/bin/lib/index.js` resolves at runtime). Wire the flag through the
  `binaries` row in `scripts/lib/devx-registry.mjs` so it shows in
  `pnpm miondevx release --help`; the release dispatcher already forwards extra
  arguments to the script.
- `scripts/release/pack.mjs` and the `@mionjs/bin` launcher must still produce a
  consistent tarball set when only one platform package exists: the launcher's
  `optionalDependencies` are filled from the platforms that were actually staged, and
  `dist-binaries/publish-order.json` lists only those, so the packed launcher never
  names a platform package that was not packed.
- `scripts/release/drizzle-e2e.mjs` (`binariesAreStale()` reads
  `dist-binaries/publish-order.json`, `ensureTarballs()` requires a
  `mionjs-binary-*.tgz`) must keep working with the reduced set.
- The publish path must refuse a host-only staging, so a tarball set built with the
  flag can never be published as a release.
- Use the flag in the drizzle-e2e.yml build job, and update the job comment that
  explains the cost.
- Add a contract test under `packages/devtools/test/`, next to the existing
  `*-contracts` tests, that pins the drizzle-e2e.yml build step to the host-only form
  and pins the release-gate workflow to the full seven-platform build.
- Check whether the lanes' in-container `npm install` tolerates a missing optional
  platform package (they are `optionalDependencies`, so a missing one must not fail
  the install). Verify, do not assume.

## Done when

- `pnpm miondevx release binaries --host-only` stages one `@mionjs/binary-<host>`
  package plus the launcher, and `pnpm miondevx release pack` packs a consistent set.
- The drizzle-e2e.yml build job uses the host-only form; release-gate.yml still builds
  all seven, and a contract test pins both.
- The publish path refuses a host-only staging.
- The labelled PR's drizzle-e2e run is green on all five lanes, and the build job is
  materially faster than before (about 23 minutes today).
