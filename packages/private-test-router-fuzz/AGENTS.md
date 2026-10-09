# @mionjs/test-router-fuzz guidelines

## Why this package exists

- Hosts ONE suite, [test/fuzz/security/](test/fuzz/security/), the `sechttp` lane.
- Hostile HTTP at the mion router, in process and over a real socket via the node adapter.
- Driven against the test-server fixture routes.
- Run: `pnpm miondevx core fuzz sechttp --quick`.
- Needs `@mionjs/router`, `@mionjs/platform-node` and `@mionjs/test-server` AT ONCE.
- No existing package can hold all three:
  - `packages/rpc-router/test/`: needs a router → test-server project reference.
    That one edge closed EIGHT tsconfig graph cycles; `tsc --build` refuses the whole graph on a cycle (TS6202).
  - `test-server`: only by splitting its tsconfig.
  - `platform-node`: needs a reference to test-server, same cycle the other way round.
- Private package nothing references = only home with no back-edge.
- Sweep in [scripts/ci/check-tree.mjs](../../scripts/ci/check-tree.mjs) fails if any package reference cycle comes back.

## The tsconfig has NO `references`, on purpose

- [tsconfig.json](tsconfig.json): `composite: false`, `noEmit: true`, `rootDir: "../.."`.
- NOT in the root tsconfig's references.
- Makes the suite's relative import of the run-types fuzz core legal.
  (Composite project with `rootDir: "."` refuses a source file above its root, TS6059.)
- Makes a cycle impossible: nothing points here, this points nowhere. Same shape as `packages/private-type-budget`.
- Never give this package a `references` array. Never make it composite.

## The vitest project needs the plugin

- [vitest.config.ts](vitest.config.ts) installs `mionVitePlugin`, unlike the other test-only projects.
- Suite declares its own fixture routes.
- No build-time type info → every one fails at run time with `MissingRtFnsError`, not at type-check time.
