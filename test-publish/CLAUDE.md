# test-publish - E2E Consumer Verification

## Purpose

- Simulates a real project consuming mion packages from npm tarballs
- Validates that published packages install, test, and bundle correctly
- Excluded from the monorepo workspace (runs independently)

## Pre-Publish (Full Verification)

- Run `bash scripts/pre-publish-test.sh` from the **monorepo root** before any publish
- That script handles the entire flow: build, pack, install tarballs here, test, build, and verify AOT

## Local Development Scripts

- `bash ../scripts/pack-and-install.sh`: builds all mion packages, packs tarballs, and installs them here (run from this directory or root)

## Package Manager: pnpm

- This package uses its own `pnpm-lock.yaml`, isolated from the monorepo workspace.
- Its `pnpm-workspace.yaml` allows `file:` protocol (required to consume local tarballs) and enforces the same 30-day `minimumReleaseAge`, ignore-scripts, and exact-pinning policies as the rest of the monorepo. The `.npmrc` only carries auth/registry settings (pnpm 11 ignores pnpm-specific keys in `.npmrc` — they must live in `pnpm-workspace.yaml`).
- **`minimumReleaseAge` is overridden to 0 only at install time** by `scripts/pack-and-install.sh` and `scripts/pre-publish-test.sh` via the `--config.minimum-release-age=0` CLI flag. Reason: every pack changes tarball hashes, triggering fresh resolution that would otherwise fail on whatever transitive happens to be young that day. The threat model still doesn't apply: this package is private (never published), runs only locally/CI, and the `@mionjs/*` tarballs it consumes are built from this monorepo. The resting `pnpm-workspace.yaml` declares the strict policy so manual `pnpm install` here behaves identically to root/website; only the scripted install path bypasses it.
- **`@mionjs/*` overrides** are declared in `pnpm-workspace.yaml` under `overrides:`. Without them, the platform tarballs (which declare e.g. `@mionjs/router: ^X.Y.Z` as their dep) cause pnpm to also pull the npm-registry copy of `@mionjs/*` alongside the local tarball — yielding two parallel copies of `@mionjs/core`, `@mionjs/router`, etc. The registry copy is the last published version, which may be stale (e.g. missing exports added after the version was published without a bump) and breaks vite-node's module resolution at runtime.

### Lockfile is committed and restored after every script run
- `pnpm-lock.yaml` is **committed** as the integrity baseline for all registry deps.
- The pre-publish scripts (`scripts/pack-and-install.sh`, `scripts/pre-publish-test.sh`) back `pnpm-lock.yaml` up before the install and **restore it from backup at script exit** (via a bash `trap EXIT`). So each run leaves the working tree clean even though `pnpm install --no-frozen-lockfile` would normally rewrite the `@mionjs/*` `file:` integrity hashes (those hashes change on every pack — pure noise that'd never stop diffing).
- Any *registry-dep* integrity change you do see in the lockfile diff after a manual install is a red flag and must be reviewed.
- Do NOT delete `pnpm-lock.yaml` — that erases the integrity hashes pnpm uses to verify every registry dep.

## Running Tests & Build

- `pnpm run test`: runs JSON and binary serialization E2E tests (uses mionVitePlugin + IPC server)
- `pnpm run build`: builds with AOT caches via `vite.build.config.ts`
- `pnpm run test:aot`: verifies AOT caches are inlined in build output
- `pnpm run verify`: runs test + build + test:aot in sequence
- `pnpm run clean`: removes dist and node_modules

## Project Structure

- `src/server/server.ts`: mion server used by tests
- `src/client/pureFns.ts`: client pure functions for AOT verification
- `src/tests/json.spec.ts`, `binary.spec.ts`: E2E serialization tests
- `src/tests/aot-build.spec.ts`: verifies AOT output after build

## Dependencies

- All `@mionjs/*` dependencies come from local tarballs (`file:./tarballs/*.tgz`), not npm
- Uses `@mionjs/devtools/vite-plugin` (mionVitePlugin) for type reflection, AOT caches, and pure function injection
- Must re-run `../scripts/pack-and-install.sh` after any mion package changes to pick up updates
