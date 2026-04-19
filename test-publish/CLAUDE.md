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

## Running Tests & Build

- `npm run test`: runs JSON and binary serialization E2E tests (uses mionVitePlugin + IPC server)
- `npm run build`: builds with AOT caches via `vite.build.config.ts`
- `npm run test:aot`: verifies AOT caches are inlined in build output
- `npm run verify`: runs test + build + test:aot in sequence
- `npm run clean`: removes dist and node_modules

## Project Structure

- `src/server/server.ts`: mion server used by tests
- `src/client/pureFns.ts`: client pure functions for AOT verification
- `src/tests/json.spec.ts`, `binary.spec.ts`: E2E serialization tests
- `src/tests/aot-build.spec.ts`: verifies AOT output after build

## Dependencies

- All `@mionjs/*` dependencies come from local tarballs (`file:./tarballs/*.tgz`), not npm
- Uses `@mionjs/devtools/vite-plugin` (mionVitePlugin) for type reflection, AOT caches, and pure function injection
- Must re-run `../scripts/pack-and-install.sh` after any mion package changes to pick up updates
