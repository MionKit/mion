---
type: fix
spec: guidelines
status: done
created: 2026-10-15
---

# `test:bun` runs against missing or stale framework dists

## Intent

`pnpm run test:bun` runs platform-bun's bun:test suites, which import `@mionjs/router` and `@mionjs/core`
through their `default` export, the built `.dist`. Its pre-step (`pretest:bun` = `check:builds`) only
rebuilds the resolver, `run-types/dist`, `devtools/dist` and the uWS binary, never the framework packages.

Found while measuring the Bun adapter (2026-10-15), on a host bootstrapped by the setup script:

- No `.dist` (fresh host): every bun test file dies at import with
  `error: Cannot find module '@mionjs/router' from '.../platform-bun/test/bunHttp.test.ts'`.
- Stale `.dist` (left by `pnpm miondevx bench servers …`, which builds every `@mionjs/*` dist):
  the suite silently tests the OLD router. A new router export showed up as
  `SyntaxError: Export named 'dispatchMaybeSync' not found in module '.../rpc-router/.dist/esm/index.js'`;
  a behavior change with no new export would pass green against old code.

CI's `platform-bun suite (bun:test)` step is green, so something there provides the dists. How is not
obvious from `ci.yml`: find it first, it decides the fix.

## Direction

The implementer investigates and plans the details. Options to weigh:

- Let bun resolve the workspace packages from source (the `source` export condition, as vitest and the
  tsconfigs already do), so no dist is involved. The bun runtypes loader must still inject types into those
  sources: check `packages/platform-bun/bun-preload.ts` and its tsconfig.
- Or make `pretest:bun` build or freshness-check the framework dists `platform-bun` imports, the way
  `scripts/core/build.mjs` (`checkPkgDist`) does for `run-types` and `devtools`.
- Whatever CI does today must keep working.

## Docs

None, because only the dev test command changes. If `SETUP.md` or `.agents/docs/testing.md` say how
`test:bun` works, update that line.

## Done when

- `pnpm run test:bun` passes on a host with no framework `.dist`, and fails or rebuilds (never passes
  silently) with a stale one.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched source
  file, each committed on its own.

## Plan: run bun on framework source (approved 2026-10-15, automatic mode)

- How CI passed: CI pins bun 1.3.11, which mapped `@mionjs/*` to source through the root tsconfig `paths`
  (`"@mionjs/*": ["./packages/*"]`), ignoring platform-bun's `"paths": {}`. bun 1.4 honors the empty `paths`,
  so it falls back to the `default` export, the `.dist`. Same tree, green on CI, red on a newer host bun.
- Fix: run bun with `--conditions=source` in `scripts/core/test-bun.mjs` and platform-bun's `test` / `dev:test`
  scripts. bunfig.toml has no key for it (tried: ignored). Framework imports then load source on every bun
  version, so no dist can be missing or stale. The loader still reads `@mionjs/devtools/runtypes/bun` from
  devtools' dist (that export has no `source` entry), which `check:builds` keeps fresh.
- Test: `packages/platform-bun/test/sourceResolution.test.ts` asserts `@mionjs/router` and `@mionjs/core`
  resolve to source, not a `.dist`, so a run without the flag fails instead of passing on old code.
  It only fails on bun 1.4+: CI's pinned 1.3.11 reaches source through `paths` anyway. So a contract test in
  `packages/devtools/test/repo-contracts.test.ts` pins the flag on `test-bun.mjs` (`bunTestArgs`) and both
  package scripts, on any bun.
- CI stays on bun 1.3.11: the bench, website and pre-publish-e2e images pin it in lockstep so published
  benchmark numbers never move with no code change. Bumping it is a separate call.
- Docs: the `test:bun` line in `.agents/docs/testing.md`.
