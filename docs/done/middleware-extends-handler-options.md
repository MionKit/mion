---
type: feature
spec: guidelines
status: done
created: 2026-10-31
---

# A custom router factory types the router: added option keys and the shared context data

## Intent

A middleware that needs per-handler settings has no typed place for them today. The route and middleware
option types are fixed in the router, so `mionSecurity` can only take global settings. The first user is a
handler-level CORS switch:

```ts
rateLimit: mion.middleware(
  (ctx): HeadersSubset<'x-ratelimit-remaining'> => ...,
  {cors: false} // none of this handler's headers cross origins
),
```

This is clearer than a global name list when a dev wants a whole handler kept off CORS.

The same factory then becomes the ONE place anything that changes the router's default types is declared,
starting with the type of `ctx.shared`, which `createMionRouter` infers from `contextDataFactory` today.

## Settled design

Reached in a design discussion; the implementer plans the details but keeps these decisions.

**`customMionRouter<Types>()`**: a two-step factory. The first call takes types only, no runtime value; it
returns a `createMionRouter`-like function that takes the options literal:

```ts
export const createAppRouter = customMionRouter<{
  shared: {user: string};                // types ctx.shared
  router: {audit?: boolean};             // added router keys
  handler: MionSecurityHandlerOptions;   // keys added to every handler
}>();

const mion = createAppRouter({
  contextDataFactory: () => ({user: ''}), // checked against `shared`, not inferred
  audit: true,
});

mion.route(h, {cors: false}); // typed from `handler`
mion.route(h, {corz: false}); // error
```

Why this shape, and what was rejected:

- **Not `createMionRouter<RouterExt, HandlerExt>(opts)`.** A hand-given type argument turns off inference of the
  options literal, so `O` falls back to its default: `ctx.shared` turns `any` and the build compiles routes for
  the default `parser` while the server runs the one written, a real wire-format mismatch.
- **Not `declare module` augmentation of open interfaces.** Global: a key type-checks on every router of the
  program once the middleware's module loads, and it is messy with types and with the build's reflection.
- **Not a runtime `handlerOptions` callback** (called once per handler at startup, its first parameter typing
  the keys). It did too little to pay for the startup time, and storing its results meant per-handler state.
- **One type argument with named parts** (`shared`, `router`, `handler`), not positional `<A, B, C>`: a dev
  fills only what they need, and a new part later breaks nothing.
- **Types in the generic, runtime values in the options.** `contextDataFactory` runs per request, so only its
  type moves; the function stays in the options. `parser` stays in the options too: the build reads it from
  the literal, so a type copy would only duplicate it.
- **Combining is the dev's job**, as with `contextDataFactory` today: `handler: MionSecurityHandlerOptions & AuditHandlerOptions`.
  Each middleware exports its option type (`MionSecurityHandlerOptions` from `@mionjs/router/middlewares`).
- **One `handler` list for every handler kind**: routes, middlewares, headers middlewares and raw middlewares
  all take the same added keys. Simplest; a key that means nothing on a kind (`cors` on a raw middleware, which
  declares no headers) just does nothing there.
- **Added keys live on the handler's `options` and go to the client by default.** Types are the source the
  client reads from, so the metadata and the client API type carry them like any other option, with the
  literal the dev wrote (`cors: false` included). Ids and hashes built from a method's options take them in too.
- **`ctx.shared` is `never` without a `shared` part.** Fully typed from the first line: a handler on a router
  that declared no shared type cannot read `ctx.shared`.

## Direction

Three parts, in order. The implementer plans the details.

### 1. `customMionRouter` with the `router` and `handler` parts

- **Types.** The helpers already carry the router options type `O` (`RouteHelper<O>` and siblings in
  `packages/rpc-router/src/types/mionRouter.ts`), so the `handler` part resolves once per router: the
  `const RO` constraint becomes the base options plus that part. Route and middleware option types themselves
  (`RouteOptionsBase`, `MiddlewareOptionsBase`, the parser variants in
  `packages/rpc-router/src/types/remoteMethods.ts`) still take NO router type parameter; keep the reasoning in
  the comment there. Router keys check on the options literal of the returned factory (`RouterOptions` in
  `packages/rpc-router/src/types/general.ts`).
- **Unknown keys must fail, and do not today.** Verified: a typo next to a valid key passes on routes,
  middlewares and `createMionRouter`; only a lone unknown key fails (weak-type check). Generic inference does
  no excess-property check against the constraint. Add a strict-key guard on all three, in the
  `ParserLiteralGuard` style (`packages/rpc-router/src/types/parser.ts`), and pin it with type tests:
  ```ts
  mion.route(h, {description: 'd', fooBar: 1}); // passes today, must fail
  ```
- **Type cost.** Measure the constraint change and the guard against the type-instantiation budget; both are
  paid on every route declaration.
- **Build detection.** The build finds the module that creates the router by the callee name
  `createMionRouter` (`ts-go-runtypes/internal/compiler/routerinit/routerinit.go`, `FactoryName`), to append
  the batch table import there. `createAppRouter(...)` hides that call (`rpc-batch-router-init-hidden`). Make
  the detection also accept `customMionRouter`, declared by the router package, with Go tests; the batch import
  then lands in the module calling `customMionRouter`, which loads before any route runs. Check the diagnostic
  prose naming the factory (`ts-go-runtypes/internal/diagnostics/`) still reads true.
- **Runtime.** The router rebuilds each handler's `options` from a fixed key list (`getExecutableFromRoute`,
  `getExecutableFromMiddleware`, `getExecutableFromRawMiddleware` in `packages/rpc-router/src/router.ts`), so
  an added key is silently dropped at registration today. Carry the added keys onto `options` so the middleware
  reads them off the chain members, as `mionSecurity` reads `isMutation`. Router keys already survive
  (`initRouter` spreads every key) and are read with `getRouterOptions()`.
- **Client metadata.** `getSerializableMethod` (`packages/rpc-router/src/lib/remoteMethods.ts`) sends a
  handler's `options` object as is, so carried keys reach the client with no extra step. The client API types
  need the change: `ResolvedRouteOptions` / `ResolvedMiddlewareOptions`
  (`packages/rpc-router/src/types/resolvedOptions.ts`) list fixed keys today; add the `handler` keys with the
  literal each route wrote. The build reads options off those types (`readOptions` in
  `ts-go-runtypes/internal/compiler/apimeta/tree.go`), so a build-compiled client gets them too; Go-test it.
  This resolved type is paid per route: include it in the type-cost measure.
- **Raw middlewares.** `RawMiddlewareOptions` (a `Pick` in `remoteMethods.ts`) takes the `handler` keys as well.
  Raw middlewares never reach the client, so only the server reads them.

### 2. `cors: false` as a handler option

A route or middleware with `{cors: false}` keeps all its declared headers off `mionSecurity`'s CORS allow and
expose lists, the same as listing them in `cors.excludeHeaders`, and winning over `allowHeaders` and
`exposeHeaders`. The headers are still sent. The lists are built per chain in `describeChain`
(`packages/rpc-router/src/middlewares/security.ts`). `MionSecurityHandlerOptions` is exported beside
`mionSecurity`.

### 3. Move the `ctx.shared` type into the `shared` part

- `customMionRouter<{shared: S}>()` types `ctx.shared` in every helper, and `contextDataFactory` in the
  returned factory's options is checked against `() => S`, never inferred.
- **Plain `createMionRouter` stops accepting `contextDataFactory`: the key is typed `never` there**, so passing
  it without `customMionRouter` is a type error. `ContextDataOf<O>` inference
  (`packages/rpc-router/src/types/mionRouter.ts`) goes away, with no fallback or hint (root AGENTS.md: a removed
  thing leaves no trace).
- Without a `shared` part, `ctx.shared` is `never` (today `any`), on `createMionRouter` and on a
  `customMionRouter` that names none.
- Why: an explicit type is cheaper to check than one inferred from the factory's body, a known cost when that
  body builds an inferred Drizzle database. With the type required by design, no lint rule forcing an explicit
  return type on `contextDataFactory` is needed.
- Wide change: `contextDataFactory` appears about 138 times in 46 files (tests, `packages/private-examples`,
  website pages). All move to `customMionRouter`.

## Open questions

1. **Security's per-chain cache.** Settled with the user: kept, keyed by the chain object (`WeakMap`). Not-found and
   merged batch chains carry no route id, an identity lookup builds no key per request, and an entry dies with its
   chain instead of outliving `resetRouter`.

## Docs

- `container/website/content/01.rpc/02.server/02.middleware.md`: new section on options a middleware adds,
  through `customMionRouter`.
- `container/website/content/01.rpc/03.middlewares/03.security.md`: existing section "CORS Headers From Your
  Types", the `cors: false` handler option next to `excludeHeaders`.
- `container/website/content/01.rpc/02.server/03.call-context.md`: existing section "Sharing Data Between
  Handlers", the `shared` part of `customMionRouter`.
- `container/website/content/01.rpc/07.devtools/01.linter.md`: the note on an inferred Drizzle database in
  `contextDataFactory` now reads against an explicit `shared` type.
- Every other page or example using `contextDataFactory` moves to `customMionRouter`.

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example
this change touched, review its report against the code, and commit it as its own commit.

## Done when

- `customMionRouter<{shared, router, handler}>()` types `ctx.shared`, router keys and the keys of every handler
  kind; an unknown key fails on handlers and the router, even next to a valid one.
- Added keys reach the client in the metadata and in the client API type, build-compiled clients included.
- `ctx.shared` is `never` without a `shared` part.
- The build finds a router created through `customMionRouter`, Go-tested.
- `{cors: false}` on a route or middleware keeps all its headers off the CORS lists, tested next to
  `excludeHeaders`.
- Plain `createMionRouter` rejects `contextDataFactory` at the type level; every use moved to `customMionRouter`.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched source file,
  each committed on its own.

## Plan: customMionRouter build (approved 2026-10-31)

- **Types** (`packages/rpc-router/src/types/`): `CustomRouterTypes` (`shared`, `router`, `handler`) rides as `T`
  next to `O` on `MionRouter` and every helper. `ctx` is `CallContext<SharedOf<T>>`, `never` without `shared`.
  Handler option constraints resolve once per router; a strict-key guard (`ParserLiteralGuard` style) inside
  `CompTimeArgs<...>` rejects an unknown key on every helper and on the factory options. Plain
  `createMionRouter` types `contextDataFactory` as `never`; the custom factory requires `() => S` when `shared`
  is declared. `ContextDataOf` removed. `PublicHandler` matches `(ctx: any, ...)` so a `never`-shared handler
  keeps its client type. `ResolvedRouteOptions` / `ResolvedMiddlewareOptions` carry the extra keys of `RO`.
- **Runtime**: `customMionRouter<T>()` returns `createMionRouter`. Registration copies extra keys onto
  `options`, fixed keys after. Core `RemoteMethodOpts` gains an index signature so the `clone` metadata
  route keeps extra keys both ways.
- **Security**: `MionSecurityHandlerOptions = {cors?: false}`; `describeChain` excludes a `cors: false`
  member's headers last, beside `excludeHeaders`. Per-chain cache kept, keyed by the chain object (WeakMap):
  not-found and batch chains have no id, identity lookup needs no key building, and entries die with their
  chain instead of outliving `resetRouter`.
- **Build**: `routerinit` accepts `customMionRouter`; diagnostic prose names both factories; catalog regenerated.
- **Migration**: every `contextDataFactory` use moves to `customMionRouter`.
- **Tests**: type tests for shared / factory / router keys / handler keys / unknown keys / client API type;
  runtime key copy; metadata serialization (server, clone round trip, fetched + bundled client lanes, drift);
  security `cors: false`; Go router init, apimeta, apigen, api version; devtools batch build; type budget.
- **Docs**: middleware, security, call-context, linter pages; examples move to `customMionRouter`.
- **Fuzzing**: none, no input space with a cheap oracle.

## Shipped (reconciled 2026-11-01)

The settled design changed during review with the user. What shipped:

- **`createMionRouter.withTypes<{router, handler}>()`**, not `customMionRouter`. It returns `createMionRouter` typed by
  the declared keys, a pattern agents know (Redux Toolkit `.withTypes`, zustand `create<T>()(...)`), and keeps one
  init name. `createMionRouter<Types>(opts)` stays impossible: an explicit type argument stops the options literal
  from being inferred, so the router-wide `parser` is lost. A spread form (`...extendRouter<T>()` into the options)
  was prototyped and works, but no library uses it, so agents would not write it from memory.
- **No `shared` part. `contextDataFactory` is renamed `sharedDataFactory`** (it builds `ctx.shared`), and plain
  `createMionRouter` accepts it again. `ctx.shared` is its return type, `never` without a factory.
- **The premise of part 3 was half wrong.** A declared `shared` type does not stop the cost: a client types the router
  by inferring the whole options literal, so a factory with no written return type is computed from its body before
  any declared type is compared. Only a written return type avoids it (measured: 14,737 vs 2,437 client
  instantiations, `packages/private-drizzle-example-app/reports/context-type-cost.md`). So the lint rule the spec
  discarded ships: `rpc-handler-shared-factory-untyped` (warning) reports a `sharedDataFactory` with no written return.
- **Unknown keys.** Router options: `KnownKeysOf<O, T>` in the factory's constraint. Handler options: a guard inside
  `NoInfer<...>` on the parameter. Both stay out of inference (the type budget). The error names the key:
  `UnknownOptionKey<"corz">`. Raw middlewares take the same guard.
- **`ctx.shared` joins the router types once per router** (`WithShared<O, T>`): reading it off `O` in every helper made
  the factory's unknown-key constraint cost about 20 more instantiations per router.
- **Definitions take `RO extends object`**, and the router tree holds `RouteDef<any, object>` and siblings: a literal of
  only added keys (`{cors: false}`) shares no key with mion's own options.
- **Client metadata.** Core's `MethodWithOptions` rows take `MethodOptionsMetadata` (`RemoteMethodOpts` plus an index
  signature): the `clone` codec of `mionFetchMetadata` dropped undeclared keys both ways. Server-side option types
  stay closed, so a middleware reads its key with a cast, as `mionSecurity` does.
- **JSON values only.** `withTypes`' constraint (`JsonHandlerKeys`) refuses an added key typed as a function, RegExp,
  bigint, symbol, Date, Map or Set.
- **`PublicHandler`** matches `(ctx: any, ...)`: a handler whose `ctx.shared` is `never` lost its client type.
- **Build.** Router-init detection accepts `createMionRouter.withTypes(...)`, alias and namespace forms included.
- **Error text test** lives in `packages/private-type-budget/test/routerOptionKeys.test.ts`, which compiles snippets.
