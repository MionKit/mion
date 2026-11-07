---
type: feature
spec: guidelines
status: done
created: 2026-10-31
---

# `createMionRouter.withTypes` types a router's added option keys, `sharedDataFactory` types `ctx.shared`

## Intent

A middleware that needs per-handler settings had no typed place for them: the route and middleware option types
are fixed in the router, so `mionSecurity` could only take global settings. The first user is a handler-level
CORS switch:

```ts
rateLimit: mion.middleware(
  (ctx): HeadersSubset<'x-ratelimit-remaining'> => ...,
  {cors: false} // none of this handler's headers cross origins
),
```

This is clearer than a global name list when a dev wants a whole handler kept off CORS. The same change gives
`ctx.shared` a type the client does not pay for.

## Settled design

Reached with the user; the first design (a separate `customMionRouter` factory with a `shared` type part) was
dropped during review for the one below.

```ts
export const createAppRouter = createMionRouter.withTypes<{
  router: {audit?: boolean}; // keys added to the router options
  handler: MionSecurityHandlerOptions; // keys added to every handler kind
}>();

const mion = createAppRouter({sharedDataFactory: (): {user: string} => ({user: ''}), audit: true});
mion.route(h, {cors: false}); // typed from `handler`
mion.route(h, {description: 'd', corz: false}); // error, even next to a valid key
```

- **`createMionRouter.withTypes<T>()` returns `createMionRouter` typed by `T`.** One init name, one runtime path,
  one once-guard, and a shape agents know (Redux Toolkit `.withTypes`, zustand `create<T>()(...)`).
- **Not `createMionRouter<T>(opts)`.** A hand-given type argument turns off inference of the options literal, so
  the build compiles routes for the default `parser` while the server runs the one written.
- **Not a spread type carrier** (`...extendRouter<T>()` in the options): it works, but no library uses it, so
  agents would not write it from memory.
- **Not `declare module` augmentation**: global, so a key type-checks on every router once a module loads.
- **One type argument with named parts** (`router`, `handler`): a dev fills only what they need, and a new part
  later breaks nothing. Combining middlewares' keys is the dev's job: `handler: MionSecurityHandlerOptions & AuditOptions`.
- **One `handler` list for every handler kind**, raw middlewares included. A key that means nothing on a kind does
  nothing there.
- **Added keys live on the handler's `options` and go to the client**, with the literal the dev wrote, in the
  metadata, the client API type and the API build version. Only JSON values: `withTypes` refuses a function,
  RegExp, bigint, symbol, Date, Map or Set.
- **`contextDataFactory` is renamed `sharedDataFactory`** (it builds `ctx.shared`). `ctx.shared` is its return
  type, `never` without a factory.
- **A declared `shared` type would not stop the client cost**: a client types the router by inferring the whole
  options literal, so the factory's return is computed from its body before any declared type is compared. Only a
  written return type can keep a heavy type opaque (`{db: unknown}`, cast on the server). Drizzle, PostgreSQL client
  instantiations (`packages/private-drizzle-example-app/reports/context-type-cost.md`): inferred `() => ({db})`
  14,456, written `{db: typeof db}` 14,456, written `{db: unknown}` 2,118, no factory 2,031. So the
  `rpc-handler-shared-factory-untyped` warning asks for a written return.

## What shipped

- **Types** (`packages/rpc-router/src/types/mionRouter.ts`): the router types `T` ride next to `O` on `MionRouter`
  and every helper. Handler option types resolve once per router (`RouteOptionsOf<T>` and siblings).
  `WithShared<O, T>` joins `ctx.shared` into `T` once per router. Option types in `remoteMethods.ts` still take no
  router type parameter.
- **Unknown keys fail, even next to a valid one**: `KnownKeysOf<O, T>` in the factory's constraint, and a guard
  inside `NoInfer<...>` on every helper's options, both kept out of inference (the type budget). The error names
  the key: `UnknownOptionKey<"corz">`.
- **Runtime** (`packages/rpc-router/src/router.ts`): registration copies the options literal onto each method's
  `options`, mion's own keys written after, so they always win. Router keys reach `getRouterOptions()`.
- **Client**: `ResolvedRouteOptions` / `ResolvedMiddlewareOptions` add the keys each method wrote. Core's
  `MethodWithOptions` rows take `MethodOptionsMetadata` (an index signature), so the `clone` codec of
  `mionFetchMetadata` keeps added keys both ways. The build reads them off the API type (`readOptions`).
- **`cors: false`**: `describeChain` (`packages/rpc-router/src/middlewares/security.ts`) puts a member's headers in
  the excluded set, beside `excludeHeaders`, winning over `allowHeaders` / `exposeHeaders`. The headers are still
  sent. `MionSecurityHandlerOptions` is exported from `@mionjs/router`, beside `MionSecurityOptions`.
- **`PublicHandler`** matches `(ctx: any, ...)`: a handler whose `ctx.shared` is `never` kept no client type.
- **Build**: router-init detection (`ts-go-runtypes/internal/compiler/routerinit`) accepts
  `createMionRouter.withTypes(...)`. The lint check (`routerrules/sharedfactory.go`) reads `sharedDataFactory` off
  the options' type, so spreads, variables, quoted keys and factories built by a call are all checked.

## Open questions

1. **Security's per-chain cache.** Settled with the user: kept, keyed by the chain object (`WeakMap`). Not-found and
   merged batch chains carry no route id, an identity lookup builds no key per request, and an entry dies with its
   chain instead of outliving `resetRouter`.

## Docs

- `container/website/content/01.rpc/02.server/02.middleware.md`: "Custom Router Types".
- `container/website/content/01.rpc/03.middlewares/03.security.md`: `cors: false` next to `excludeHeaders`.
- `container/website/content/01.rpc/02.server/03.call-context.md`: `sharedDataFactory` and its written return.
- `container/website/content/01.rpc/07.devtools/01.linter.md`: "Typed Shared Data".

## Done when

- `createMionRouter.withTypes<{router, handler}>()` types the router keys and the keys of every handler kind; an
  unknown key fails on handlers and the router, even next to a valid one.
- Added keys reach the client in the metadata and the client API type, build-compiled clients included.
- `ctx.shared` is the written return type of `sharedDataFactory`, `never` without one; every use is renamed.
- `rpc-handler-shared-factory-untyped` reports a factory with no written return type, Go-tested per shape.
- The build finds a router created through `withTypes`, Go-tested.
- `{cors: false}` keeps a handler's headers off the CORS lists, tested next to `excludeHeaders`.
- The simplify-docs and simplify-comments passes ran, each committed on its own.
