---
type: feature
spec: guidelines
status: ready
created: 2026-10-31
---

# Middleware adds its own options to routes and the router

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

## Direction

The implementer plans the details. Two parts, in order:

1. **Let a middleware extend option types.** Design how a middleware such as `mionSecurity` declares extra
   option keys, typed, on:
   - route and middleware options (`RouteOptionsBase`, `MiddlewareOptionsBase`, the parser variants in
     `packages/rpc-router/src/types/remoteMethods.ts`);
   - the router's global options (`RouterOptions` in `packages/rpc-router/src/types/general.ts`).

   The keys must type-check where the handler is defined, and the middleware must read them at runtime from the
   chain members' `options` (as `mionSecurity` reads `isMutation` today). An unknown key still fails.
   Decide whether these keys reach the client metadata. A server-only key like `cors` should not.
2. **`cors: false` as a handler option, through that mechanism.** A route or middleware with `{cors: false}`
   keeps all its declared headers off `mionSecurity`'s CORS allow and expose lists, the same as listing them in
   `cors.excludeHeaders`, and winning over `allowHeaders` and `exposeHeaders`. The headers are still sent.
   The lists are built per chain in `describeChain` (`packages/rpc-router/src/middlewares/security.ts`).

## Docs

- `container/website/content/01.rpc/02.server/02.middleware.md`: new section on options a middleware adds.
- `container/website/content/01.rpc/03.middlewares/03.security.md`: existing section "CORS Headers From Your
  Types", the `cors: false` handler option next to `excludeHeaders`.

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example
this change touched, review its report against the code, and commit it as its own commit.

## Done when

- A middleware can add typed option keys to routes, middleware and the router; an unknown key still fails.
- `{cors: false}` on a route or middleware keeps all its headers off the CORS lists, tested next to
  `excludeHeaders`.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched source file,
  each committed on its own.
