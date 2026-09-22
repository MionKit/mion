# @mionjs/test-server guidelines

## ⚠️ The edge/cloudflare bundles must stay STRICT

The edge and cloudflare test bundles are evaluated as a SCRIPT (EdgeVM / miniflare `initialCode`), where sloppy mode is the default and a failed property assignment silently does nothing instead of throwing — which quietly breaks node-vs-edge error parity in the e2e suites.

Rolldown does not emit the `"use strict"` prologue rollup did, so BOTH vite configs add it via `output.intro`, and [buildTestBundle.ts](buildTestBundle.ts) asserts it on every build. Never remove the intro or the assertion; if a bundler change drops the prologue, fix the config, not the assertion.

## ⚠️ The sechttp fuzz suite lives HERE, not in router

[test/fuzz/security/](test/fuzz/security/) throws hostile HTTP at the mion router, in process and over a real socket through the node adapter, using this package's own fixture routes. It needs `@mionjs/router`, `@mionjs/platform-node` and `compactTestRoutes` at once, and this package already depends on all three.

It used to sit in `packages/router/test/`, where it could only reach them by making router reference `../test-server`. That one edge closed EIGHT cycles in the tsconfig project graph, and `tsc --build` refuses the whole graph on a cycle (TS6202), so no package built. A sweep in [scripts/ci/check-tree.mjs](../../scripts/ci/check-tree.mjs) fails now if any package reference cycle comes back.

So: a package's test tree never imports its downstream consumers. A suite that needs two packages plus a fixture belongs in the package that already depends on all of them.

## ⚠️ TWO tsconfigs, on purpose

[tsconfig.json](tsconfig.json) is typecheck-only (`composite: false`, `noEmit: true`, `rootDir: "../.."`) and INCLUDES `test/`, so eslint's project service, the editor and the vitest plugin all see the fuzz suite. The plugin especially: it only injects build-time type information for call sites its program can see, so a suite outside the program fails at run time with `MissingRtFnsError`, not at type-check time.

[tsconfig.build.json](tsconfig.build.json) is the emitting one: it re-enables `composite`, carries the five project references and EXCLUDES `test/`. The root tsconfig and `packages/client/tsconfig.json` point their references at it. `test/` has to stay out of it because the suite imports the run-types fuzz core by relative path, which a composite project with `rootDir: "."` refuses (TS6059).

Same split as `packages/drizzle-orm-pg-core`, for the same reason.
