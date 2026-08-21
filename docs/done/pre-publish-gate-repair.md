# Repair the pre-publish release gate (the whole consumer harness was pre-migration)

**Status:** done — shipped in `8415194`. Found while acting on
[plugin-legacy-option-sunset.md](plugin-legacy-option-sunset.md), whose deprecation window was gated on
"the first release published after `bb9f36f`" — a release that could not be cut.
**Created:** 2026-08-21

## Problem

`scripts/pre-publish-test.sh` is mandatory before any publish (CLAUDE.md) and runs under
`set -euo pipefail`. Every stage of its consumer-simulation harness (`test-publish/`, a project that
installs the packed tarballs like a real user) was still written against the deleted deepkit/AOT
engine, so the script could not reach the end. This is the most likely reason nothing has been
published since 2026-05-06 even though the migration landed in July.

Four independent breakages, in firing order:

1. **Install (step 5b).** `test-publish/package.json` depended on `@mionjs/run-types` and
   `@mionjs/type-formats` via `file:./tarballs/*.tgz`. Both packages were deleted and
   `scripts/pack-packages.sh` no longer produces those tarballs. Removing them also dropped the entire
   deepkit tree still pinned in the consumer lockfile.
2. **Transform.** `src/server/server.ts` imported `@mionjs/core/aot-caches` and `serverPureFnsCache`
   from `@mionjs/core/server-pure-fns` (both deleted subpaths); `src/client/pureFns.ts` used the
   deleted `pureServerFn` API.
3. **Spawn — a product bug, not a fixture bug.** `mionVitePlugin` spawned the managed server with
   `pnpm exec vite-node`. `vite-node` is a dependency of `@mionjs/devtools`, not of the consumer, so
   under a strict (non-hoisting) install it never reaches the consumer's `node_modules/.bin`:
   `Command "vite-node" not found`, exit 254. It also assumed every consumer runs pnpm.
   **`server.runMode` was broken for every published consumer.** Now resolved from devtools' own
   dependency tree — via vite-node's `package.json` `bin`, because its exports map does not expose the
   CLI file — and spawned with `process.execPath`.
4. **Verify (step 5g).** `src/tests/aot-build.spec.ts` asserted the bundle contained `addAOTCaches`,
   `addRoutesToCache`, `pureFnsCache`, `jitFnsCache`, `routerCache` and `serverPureFnsCache`. All but
   `addRoutesToCache` were deleted in the migration, so the assertions could never pass.

## What shipped

- `aot-build.spec.ts` → `build-output.spec.ts` (`test:aot` → `test:build-output`), guarding the same
  intent against the current engine: `dist/server.js` must carry inlined compiled fn bodies
  (`getPureFn('rt::…')` plus their dependency-key arrays) for the fixture's own routes, stay free of
  `node:fs` so the artifact stays edge/lambda deployable, and contain no residue of the deleted engine.
  Assertions were derived by reading a real build, not guessed.
- The `pureServerFn` fixture is replaced by the live routesFlow `serverMapFrom` lane
  (`getCustomerById` → `getPreferencesById`), wired the way `packages/client` and
  `packages/test-server` wire the harvest/consume transport.
- `test-publish/tsconfig.json` lost its deepkit-era `"reflection": true` and gained the
  `@mionjs/devtools/virtual-modules` types entry.

## Verified

The gate was run for real, not reasoned about: pack all 11 tarballs → clean install → `pnpm run test`
(60 passed, 1 skipped) → `pnpm run build` → `pnpm run test:build-output` (5 passed).

## The two defects this gate surfaced — both since fixed

- [devtools-cjs-vite-plugin-unusable.md](devtools-cjs-vite-plugin-unusable.md) — the last remaining
  gate failure: `@mionjs/platform-bun` shipped no declarations because its own build could not run.
- [virtual-module-retired-and-dual-core-load.md](virtual-module-retired-and-dual-core-load.md) — why
  the `serverMapFrom` flow test was skipped. The virtual module turned out to be the cause of both
  the lost transport and the duplicated `@mionjs/core`; the test now passes.
