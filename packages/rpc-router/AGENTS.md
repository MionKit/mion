# @mionjs/router guidelines

## `import type` is SAFE in routes and middleware

- RunTypes resolves types at BUILD TIME from the TS program.
- Injects compiled functions at the `mion.route()` / `mion.middleware()` call site → erased import changes nothing.
- Those helpers come from `createMionRouter()`.
- Scanner reads the resolved signature: a destructured helper works the same.
- Guarded by [test/typeOnlyImports.spec.ts](test/typeOnlyImports.spec.ts).
- Never add a rule or warning against `import type` here.

## Public env knob

- `GENERATE_ROUTER_SPEC`: public runtime knob read by this package.
- Unprefixed on purpose (rename to `MION_*` breaks consumers who set it). Only exception to the env-var prefix rule.

## One router factory

- `createMionRouter(opts)` ([src/router.ts](src/router.ts), types [src/types/mionRouter.ts](src/types/mionRouter.ts)):
  ONLY public way to init the router and declare routes / middleware.
- Options written once, ride by type (`O`) into every helper.
- `ctx.shared` is typed from `contextDataFactory`.
- Router-wide `parser` reaches what the build compiles for a route naming none.
- Runtime still the module singleton.
  `mion.initRoutes(routes)` runs private `initRouter` + `registerRoutes` in `src/router.ts`.
- Helper bodies in [src/lib/handlers.ts](src/lib/handlers.ts) are internal, NOT exported from `index.ts`.
  (mion's own middlewares and its error / serializer routes use them directly.)
- Never re-add bare `route()` exports or a second init entry point.
- Second `createMionRouter()` throws until `resetRouter()` clears it: catches a second app built on top of the first.
- Tests: call it in `beforeEach` / `beforeAll` next to the reset, never where the file is evaluated.
- ⚠️ bun runs a package's test files in ONE process.
  Router built in a describe body throws on a flag a sibling file set.
  That whole file is skipped, run still reports `0 fail`.
- `O` reaches a declaration only through a method of the returned object.
  TS has no partial type application: a plain exported function cannot capture it.
- Defaulted type parameter does NOT work: call site never infers it, so it silently takes its default.
  Every route then loses the router-wide parser.

## This package's test tree never imports a downstream consumer

- No `@mionjs/test-server`, no `@mionjs/platform-*`, no relative path into another package's `src/`.
- Why: needs a tsconfig project reference back to a package that already references router.
  Graph goes circular, `tsc --build` builds NOTHING (TS6202).
- `sechttp` HTTP fuzz suite lives in `packages/private-test-router-fuzz` for this reason.
- Sweep in [scripts/ci/check-tree.mjs](../../scripts/ci/check-tree.mjs) fails if the cycle comes back.
- Suite needing router + adapter + fixture routes → its own private package, which nothing references.
