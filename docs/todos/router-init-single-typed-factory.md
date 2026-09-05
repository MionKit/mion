---
type: feature
spec: guidelines
status: ready
created: 2026-09-05
---

# One way to initialize the router: the typed factory `createMionRouter`

## Intent

Today a mion app is wired in two steps that never meet at the type level: routes are declared with
module-level helpers (`route()`, `query()`, `mutation()`, `middleFn()`, `headersFn()` from
`packages/router/src/lib/handlers.ts`) and the router is initialized later with a runtime options
bag (`initMionRouter(routes, opts)` at `packages/router/src/router.ts:136`, or `initRouter(opts)` +
`registerRoutes(routes)` at `:149` / `:162`). Because the options arrive after the routes exist, a
router-wide setting can never influence what the build compiles for a route: TypeScript only flows
types forward, and the Go scanner reads each `route(...)` call on its own. Any future router-wide
compile-time default (a per-route encoder or decoder strategy is the first one wanted) is blocked by
this shape.

Wanted: a single, tRPC-style typed factory that is the ONLY way to initialize the router. The
options literal is written once, in one call, and rides by type into every helper the call returns:

    // mion.ts
    export const mion = createMionRouter({basePath: 'api', contextDataFactory: getSharedData});
    // routes.ts
    export const routes = {hello: mion.route((ctx, name: string) => `hi ${name}`)};
    // server.ts
    await mion.init(routes);

`initTRPC.context<C>().create({...})` is the precedent: created once per app, config carried in the
type of `t`, procedures still declared at module level from the exported helpers.

**Unblocks:** `docs/todos/per-route-encoder-strategies.md`, whose router-wide default is a field of
this factory's options.

## Direction

- **The runtime stays the module singleton.** The factory is a typed layer over the existing
  implementation: it returns closures over the current helper bodies plus an `init(routes)` that runs
  today's `initRouter` + `registerRoutes` with the stored options. A true instance router is a
  separate question (see the survey below) and is explicitly NOT part of this todo.
- **One entry point, no aliases.** `createMionRouter` replaces `initMionRouter`, `initRouter` and
  `registerRoutes` on the public surface, and the plain module-level `route` / `query` / `mutation` /
  `middleFn` / `headersFn` / `rawMiddleFn` exports go with them: every route is declared through the
  factory's helpers, so the router options are always in scope. Calling the factory twice, or
  `init` twice, fails loudly the way `initRouter` does today. `resetRouter` stays for tests.
- **Options carried by type.** `createMionRouter<O extends RouterOptions>(opts: O)` returns
  `MionRouter<O>`; the helper signatures keep the `InjectTypeFnArgs` / `InjectRunTypeId` markers
  spelled out literally (the scanner matches the alias, and reads the resolved type arguments), so
  a later feature can compute marker slots from `O`. Only the field a future feature reads has to be
  a literal; the bag itself is not `CompTimeArgs` (it carries `contextDataFactory` and env-driven
  values, and the literal checker rejects named function references and property access).
- **Everything moves.** The footprint measured before filing: 99 TypeScript files under
  `packages/` reference `initMionRouter` / `initRouter`, 86 `resetRouter()` calls, the seven
  `platform-*` adapters and their specs bind through `initRouter` / `registerRoutes` (62 uses),
  `dispatchRoute` (15) and `setPlatformConfig` (19); `packages/examples/src` has 92 references; the
  three `container/mion-bench/apps/mion/server-*.ts` apps and the `packages/test-server` fixtures
  boot through `initMionRouter`; six website pages under `container/website/content/01.rpc` name
  `initMionRouter`. The lint rule `strong-typed-routes` (`packages/devtools/src/lint/rules/`) and
  the devtools `mion` presets must keep recognising route declarations made through the factory's
  helpers (a property access on a const, not a bare import).
- **Survey behind the decision (singleton vs instance).** Runtime frameworks are instance-based and
  accumulate config and types on the instance (Express, Koa, hapi, Fastify with one encapsulation
  context per plugin, Hono and Elysia with method chaining feeding `hc<typeof app>` / Eden
  `treaty<typeof app>`, NestJS via dependency injection). Frameworks with a compile step declare at
  module level (Encore.ts `api()`, Nitro handlers), because the compiler does the wiring. tRPC and
  oRPC sit in between with a typed builder (`initTRPC.create()`, `os`). mion has a compile step, so
  the typed factory over a singleton is the coherent next step; a real instance router would also
  need per-instance caches in `@mionjs/core` (the method, jit and buffer caches live on `globalThis`
  through `getOrCreateGlobal` in `packages/core/src/utils.ts:11`, keyed by method id) and a new
  adapter contract, which is why it stays out of scope here.

The implementer plans the details: the exact `MionRouter<O>` shape, how `rawMiddleFn` and the
internal client / error routes are declared, the migration order across packages, and the docs
rewrite.

## Done when

- `createMionRouter(opts)` is the only exported way to initialize the router and to declare routes,
  middleFns and headers functions; `initMionRouter`, `initRouter`, `registerRoutes` and the plain
  helper exports are gone from the public surface.
- The options given to the factory are visible in the type of every helper it returns.
- Every example, doc page, test-server fixture, platform spec, router spec and bench app uses the
  factory; `pnpm test`, `pnpm run lint` and the examples typecheck stay green.
- The website documents the single initialization form and no page still shows the old one.
