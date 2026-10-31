---
type: feature
spec: guidelines
status: ready
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
  handler: MionSecurityHandlerOptions;   // added route + middleware keys
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
  `getExecutableFromMiddleware` in `packages/rpc-router/src/router.ts`), so an added key is silently dropped at
  registration today. Carry the added keys through so the middleware reads them off the chain members, as
  `mionSecurity` reads `isMutation`. Router keys already survive (`initRouter` spreads every key) and are read
  with `getRouterOptions()`.
- **Client metadata.** `getSerializableMethod` (`packages/rpc-router/src/lib/remoteMethods.ts`) sends a
  handler's `options` object as is. Added keys reaching it would go to the client. Client API types are safe
  already: `ResolvedRouteOptions` / `ResolvedMiddlewareOptions` (`packages/rpc-router/src/types/resolvedOptions.ts`)
  list fixed keys, and the build reads options off those types.

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
- Why: an explicit type is cheaper to check than one inferred from the factory's body, a known cost when that
  body builds an inferred Drizzle database. With the type required by design, no lint rule forcing an explicit
  return type on `contextDataFactory` is needed.
- Wide change: `contextDataFactory` appears about 138 times in 46 files (tests, `packages/private-examples`,
  website pages). All move to `customMionRouter`.

## Open questions

The implementer resolves these with the user while planning; the recommendation is the default.

1. **Added keys and the client.** Keep types as the source the client reads from: send none for now (`cors` is
   server-only), or let a middleware mark keys that ride the metadata and the client API type? Recommended:
   none in this change; strip added keys from `getSerializableMethod` or keep them off `options`, see 2.
2. **Where the added keys live at runtime.** On the handler's `options` (what the middleware reads, but then
   `getSerializableMethod` must pick only the known keys), or in a separate server-only field on the method
   (never serialized, since the metadata is built from named fields)?
3. **Security's per-chain cache.** `mionSecurity` keeps a module-level `WeakMap` from chain to its built CORS
   strings (`chainRules` in `security.ts`): middleware state beside the router's own data. Should the router give
   a middleware a place on the chain, or a startup step, so it keeps no map of its own? Related, since
   `describeChain` is what `cors: false` changes: fix it in this change.
4. **Raw middlewares.** Do they get the `handler` keys? They declare no headers, so `cors` means nothing there.
   Recommended: no.
5. **One `handler` part or one per kind** (`route`, `middleware`)? Recommended: one, `cors: false` needs both.
6. **`ctx.shared` without a `shared` part.** Stays `any` as today, or becomes an empty type now that plain
   `createMionRouter` can no longer set it?

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

- `customMionRouter<{shared, router, handler}>()` types `ctx.shared`, router keys and route + middleware keys;
  an unknown key fails on routes, middlewares and the router, even next to a valid one.
- The build finds a router created through `customMionRouter`, Go-tested.
- `{cors: false}` on a route or middleware keeps all its headers off the CORS lists, tested next to
  `excludeHeaders`.
- Plain `createMionRouter` rejects `contextDataFactory` at the type level; every use moved to `customMionRouter`.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched source file,
  each committed on its own.
