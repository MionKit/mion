# @mionjs/router guidelines

## `import type` is SAFE in routes and middleFns

RunTypes resolves types at BUILD TIME from the TypeScript program and injects the compiled functions at the `mion.route()` / `mion.middleFn()` call site (the helpers `createMionRouter()` returns; the scanner reads the resolved signature, so a destructured helper is the same), so an erased import changes nothing. Guarded by [src/typeOnlyImports.spec.ts](src/typeOnlyImports.spec.ts).

This was NOT true under deepkit, whose runtime reflection was emitted from the import statement — `import type` stripped the metadata and caused silent failures. That is why the repo guidelines used to carry a "TYPE IMPORTS !!CRITICAL!!" warning and why `@mionjs/no-type-imports` existed; both are gone. Do not reintroduce either.

## Public env knob

`GENERATE_ROUTER_SPEC` is a public runtime knob read by this package. It is deliberately unprefixed (renaming it to `MION_*` would break consumers who already set it) — the one exception to the repo's env-var prefix rule.

## One router factory

`createMionRouter(opts)` ([src/router.ts](src/router.ts), types in [src/types/mionRouter.ts](src/types/mionRouter.ts)) is the ONLY public way to initialize the router and to declare routes / middleFns: the options are written once and ride by type (`O`) into every helper, so `ctx.shared` is typed from `contextDataFactory` and a build-time feature can compute marker slots from `O`. The runtime is still the module singleton: `mion.initRoutes(routes)` runs the private `initRouter` + `registerRoutes` in `src/router.ts`. The helper bodies in [src/lib/handlers.ts](src/lib/handlers.ts) are internal (the internal client / error / serializer routes use them directly) and are NOT exported from `index.ts`. Never re-add bare `route()` exports or a second init entry point.
