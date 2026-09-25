# @mionjs/router guidelines

## `import type` is SAFE in routes and middleware

RunTypes resolves types at BUILD TIME from the TypeScript program and injects the compiled functions at the `mion.route()` / `mion.middleware()` call site (the helpers `createMionRouter()` returns; the scanner reads the resolved signature, so a destructured helper is the same), so an erased import changes nothing. Guarded by [test/typeOnlyImports.spec.ts](test/typeOnlyImports.spec.ts).

This was NOT true under deepkit, whose runtime reflection was emitted from the import statement — `import type` stripped the metadata and caused silent failures. That is why the repo guidelines used to carry a "TYPE IMPORTS !!CRITICAL!!" warning and why `@mionjs/no-type-imports` existed; both are gone. Do not reintroduce either.

## Public env knob

`GENERATE_ROUTER_SPEC` is a public runtime knob read by this package. It is deliberately unprefixed (renaming it to `MION_*` would break consumers who already set it) — the one exception to the repo's env-var prefix rule.

## One router factory

`createMionRouter(opts)` ([src/router.ts](src/router.ts), types in [src/types/mionRouter.ts](src/types/mionRouter.ts)) is the ONLY public way to initialize the router and to declare routes / middleware: the options are written once and ride by type (`O`) into every helper, so `ctx.shared` is typed from `contextDataFactory` and the router-wide `parser` reaches what the build compiles for a route naming none. The runtime is still the module singleton: `mion.initRoutes(routes)` runs the private `initRouter` + `registerRoutes` in `src/router.ts`. The helper bodies in [src/lib/handlers.ts](src/lib/handlers.ts) are internal (the internal client / error / serializer routes use them directly) and are NOT exported from `index.ts`. Never re-add bare `route()` exports or a second init entry point.

A second `createMionRouter()` throws until `resetRouter()` clears it, which is the point: it catches a second app built on top of the first. In tests that means the call belongs in a `beforeEach` / `beforeAll` next to the reset, never where the file is evaluated. It matters most under bun, which runs a package's test files in ONE process: a router built in a describe body throws on a flag a sibling file already set, and that whole file is skipped with the run still reporting `0 fail`.

`O` can only reach a declaration through a method of the object the factory returns: TypeScript has no partial type application, so a plain exported function cannot capture it. A defaulted type parameter does NOT work either, nothing at the call site infers it, so it silently takes its default and every route loses the router-wide parser.

## This package's test tree never imports a downstream consumer

No `@mionjs/test-server`, no `@mionjs/platform-*`, and no relative path into another package's `src/`. Adding one means adding a tsconfig project reference back to a package that already references router, which makes the graph circular and stops `tsc --build` from building ANYTHING (TS6202). The `sechttp` HTTP fuzz suite lived here once and moved to `packages/private-test-router-fuzz` for exactly that reason; a sweep in [scripts/ci/check-tree.mjs](../../scripts/ci/check-tree.mjs) fails if the cycle comes back.

A suite that needs the router plus an adapter plus fixture routes belongs in a private package of its own, which nothing references.
