---
type: feature
spec: guidelines
status: done
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
    await mion.initRoutes(routes);

`initTRPC.context<C>().create({...})` is the precedent: created once per app, config carried in the
type of `t`, procedures still declared at module level from the exported helpers.

**Unblocks:** per-route encoder and decoder strategies, whose router-wide default becomes a field of
this factory's options.

## Direction

- **The runtime stays the module singleton.** The factory is a typed layer over the existing
  implementation: it returns closures over the current helper bodies plus an `initRoutes(routes)` that
  runs today's `initRouter` + `registerRoutes` with the stored options. A true instance router is a
  separate question (see the survey below) and is explicitly NOT part of this todo.
- **One entry point, no aliases.** `createMionRouter` replaces `initMionRouter`, `initRouter` and
  `registerRoutes` on the public surface, and the plain module-level `route` / `query` / `mutation` /
  `middleFn` / `headersFn` / `rawMiddleFn` exports go with them: every route is declared through the
  factory's helpers, so the router options are always in scope. Calling the factory twice, or
  `initRoutes` twice, fails loudly the way `initRouter` does today. `resetRouter` stays for tests.
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

## Plan (approved 2026-09-05)

- **Factory shape.** `createMionRouter<const O extends Partial<RouterOptions>>(opts?: O): MionRouter<O>`
  in `packages/router/src/router.ts`; the types in `packages/router/src/types/mionRouter.ts`.
  `MionRouter<O>` carries `options` (frozen literal), `route` / `query` / `mutation`
  (`RouteHelper<O>`), `middleFn`, `headersFn`, `rawMiddleFn`, and `initRoutes(routes)` (today's
  `initRouter(opts)` + `registerRoutes(routes)`, once). `const O` keeps the option literals.
- **How O is visible in every helper.** The handler's context is `RouterCallContext<O>` =
  `CallContext<ContextDataOf<O>>`, typed from `contextDataFactory`; without one it is
  `CallContext<any>`, so annotated handlers keep compiling. The marker slots stay spelled literally on
  each helper signature (the scanner reads the resolved signature of `mion.route(...)`).
- **Helpers are plain closures** over the bodies in `src/lib/handlers.ts` (internal now), so
  destructuring (`const {route} = createMionRouter({...})`) keeps the types and the injection.
- **Guards.** A second `createMionRouter` throws until `resetRouter()`; a second `initRoutes` throws
  as `initRouter` did. `resetRouter`, `getRouterOptions`, `dispatchRoute`, `setPlatformConfig`,
  `addStartMiddleFns`, `addEndMiddleFns` stay module exports. Registering more routes later is
  replaced by composing one routes object; a separately typed sub api is `PublicApi<typeof sub>`.
- **Scanner.** No Go change: `scan.go` resolves each call's signature. A Go fixture
  (`factory_method_test.go`) pins the factory-method and destructured shapes against both
  `getRunTypeId` forms.
- **Lint.** One syntactic detector (`packages/devtools/src/lint/routerHelperCall.ts`) shared by
  `strong-typed-routes`, `no-unreachable-union-types` and `no-mixed-union-properties`: `X.<helper>`
  with `X` a `createMionRouter` const or a relative import, or a bare helper destructured in-file or
  imported from a relative module; a package-imported bare name never fires. `query` / `mutation`
  are covered too (they were not before).
- **Vite preset.** The batch registry import is injected into the module that calls
  `createMionRouter` (was `initMionRouter`).
- **Migration.** Router specs, the seven platform suites, test-server, type-budget fixtures, fuzz
  runner, the examples, bench apps, pre-publish-e2e, and the website pages that named the old API.
- **Not a fuzz candidate**: an API-shape change with no round-trip or trusted-source oracle.

## What shipped (2026-09-05)

Everything in the plan above, with these decisions taken during the build:

- The init method is named `initRoutes` (not `init`), so the call reads as what it does, and it is
  **synchronous**: the registration path only reads the build-time injected functions off each
  definition, so the `async` it inherited from the old cache-loading design was removed. A routes
  file needs no top-level await.
- **Destructuring is supported and documented**: the helpers never use `this`, so
  `const {route, middleFn} = createMionRouter({...})` keeps the typed context and the injection, and
  the lint detector recognises a destructured or relatively imported bare helper as well as
  `mion.route(...)`.
- **The visible type effect** is the handler context: `RouterCallContext<O>` types `ctx.shared` from
  `contextDataFactory`. One consequence surfaced in the test servers: a shared field that starts as
  `null` needs a return type on the factory, or the field is typed `null`; the website notes it.
- `query` and `mutation` were never covered by the route-aware lint rules; they are now.
- The Vite preset injects the batch registry into the module that calls `createMionRouter`.
- The Go scanner needed no change; a fixture (`factory_method_test.go`) pins the factory-method and
  destructured call shapes.
- The type-budget numbers moved by a few dozen units because the options type now rides through
  every route declaration and `PublicApi` is reached through the factory generic.
- `registering-multiple.routes.ts` became a composition example (one `initRoutes` over a spread of
  two route objects, a sub api typed with `PublicApi<typeof authRoutes>`).
- **Layout rule for every example, bench app and e2e consumer:** `createMionRouter` and
  `mion.initRoutes(routes)` live in the SAME file (the routes file), and the server entry just
  imports that file before it starts the platform. No file creates the router for another file to
  initialize; route-only snippets that never initialize create their own local router.
