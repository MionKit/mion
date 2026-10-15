---
type: fix
spec: guidelines
status: ready
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
