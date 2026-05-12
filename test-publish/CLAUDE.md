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
- Its `.npmrc` allows `file:` protocol (required to consume local tarballs) but otherwise enforces the same hardening as the root (pinned, ignore-scripts, minimum-release-age).
- `pnpm-lock.yaml` is **committed** as the integrity baseline for all registry deps. The pre-publish scripts run `pnpm install --no-frozen-lockfile` which rewrites only the `@mionjs/*` `file:` entries (expected — tarball content changes when source changes); any registry-dep integrity change in the lockfile diff is a red flag and must be reviewed. Do NOT delete `pnpm-lock.yaml` in the install flow — that erases the supply-chain protection pnpm provides.

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
