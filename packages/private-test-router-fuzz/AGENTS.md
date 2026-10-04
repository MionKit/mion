# @mionjs/test-router-fuzz guidelines

## Why this package exists

It hosts ONE suite, [test/fuzz/security/](test/fuzz/security/), the `sechttp` lane: hostile HTTP at the mion router, in process and over a real socket through the node adapter, driven against the test-server fixture routes. Run it with `pnpm miondevx core fuzz sechttp --quick`.

It needs `@mionjs/router`, `@mionjs/platform-node` and `@mionjs/test-server` AT ONCE, and no existing package can hold all three. It lived in `packages/rpc-router/test/` once, where the only way to reach them was a project reference from router to test-server. That single edge closed EIGHT cycles in the tsconfig graph, and `tsc --build` refuses the whole graph on a cycle (TS6202), so nothing built. `test-server` cannot hold it either without splitting its tsconfig, and `platform-node` would need a reference to test-server, which recreates the cycle the other way round. A private package that nothing references is the only home with no back-edge.

A sweep in [scripts/ci/check-tree.mjs](../../scripts/ci/check-tree.mjs) fails if any package reference cycle comes back.

## The tsconfig has NO `references`, on purpose

[tsconfig.json](tsconfig.json) is `composite: false`, `noEmit: true`, `rootDir: "../.."`, and it is NOT in the root tsconfig's references. That is what makes the suite's relative import of the run-types fuzz core legal (a composite project with `rootDir: "."` refuses a source file above its root, TS6059), and what makes a cycle impossible: nothing points here and this points nowhere. Same shape as `packages/private-type-budget`.

Never give this package a `references` array, and never make it composite.

## The vitest project needs the plugin

[vitest.config.ts](vitest.config.ts) installs `mionVitePlugin`, unlike the other test-only projects. The suite declares its own fixture routes, and without build-time type information every one fails at run time with `MissingRtFnsError`, not at type-check time.
