---
type: docs
spec: guidelines
status: done
created: 2026-09-30
---

# Middleware Examples That Send No Tokens From JavaScript

## Intent

Most middleware examples show an auth middleware whose client half reads a token in JavaScript and sends it
on every call, in a header or in the body. For example
`packages/private-examples/src/client/client-middleware-hooks.ts`:

```ts
middlewares.auth.onRequest(async (auth) => {
  auth(new HeadersSubset({Authorization: await getToken()}));
});
```

A token that JavaScript can read can be stolen by any script on the page (XSS), so the docs teach a pattern
many teams consider insecure. The examples should show the same mion feature (a middleware that sends and
receives its own data on every request, next to the route) with data that is safe to handle in JavaScript.

## Direction

- Find every example and page that shows this pattern: grep `packages/private-examples/src/` for `token`,
  `Authorization`, `getToken` and `auth` (about 38 files), and the pages that import them under
  `container/website/content/01.rpc/` (middleware, headers, call context, client overview, client error
  handling, batch, cancellation). Also the home page and quick start if they show it.
- Pick one realistic middleware that sends data both ways on every call and holds no secret, and use it
  consistently across the examples. Ideas to weigh: a request trace id (client sends it, server echoes a
  server timing), locale and time zone (server answers with the resolved locale), a client app version
  (server answers with a feature flag set or a "please update" notice), a rate limit (server answers with
  the remaining quota).
- Where an example really is about auth, show auth the safe way: the session lives in an HttpOnly cookie the
  browser sends by itself, and the middleware reads it on the server. JavaScript never sees it. Keep typed
  auth errors (`not-authorized` and the like) since they show error handling well.
- Keep each example short (5 to 15 lines) and keep what each page is teaching (hooks, retries, batch,
  cancellation, headers). Swap the data, not the lesson.
- If a page gives no advice on where auth data should live, add one short tip on the middleware or headers
  page.
- Examples must still compile (`pnpm exec tsc --noEmit -p packages/private-examples/tsconfig.json`), and
  finish with the docs simplification pass.

## Done when

No example or page sends a token read by JavaScript, the middleware examples show one consistent safe
middleware that sends and receives data on every call, and every page still teaches what it taught before.

## Plan (approved 2026-10-01), as shipped

- **Trace id** is the one "client sends, server answers" middleware: the client sends a fresh `X-Trace-Id`
  header from `onRequest`, the server echoes it back (`trace`, a headers function). Used in the hooks,
  headers, batch, cancellation, init and wire-format examples.
- **Auth reads an HttpOnly cookie on the server** (`auth`, a middleware with no params that reads
  `ctx.request.headers.get('cookie')`). The client keeps its typed `onResponse` / `onError` hooks and never
  touches the session. Typed reasons are now `no-session` / `expired-session`. Stand-ins:
  `packages/private-examples/src/client/session.ts` and `router/myAuth.ts` (`getSessionUser`).
- Every example under `packages/private-examples/src/{client,router,introduction}` that sent or read a token
  was switched; `guide/remove-unknown-keys.ts` keeps its `token` key (it is the value being stripped).
  The orphan `client.ts` lost its "per-request data" example, which only made sense with the old token.
- New tip on the middleware page: keep auth tokens out of client JavaScript, use an HttpOnly cookie,
  `credentials: 'include'` for another origin.
- **Added at the user's request**: a pagination example in the middleware page's "Middleware Scope" section
  (`router/pagination.routes.ts` + `client/pagination-client.ts`): the route returns only the items, a
  middleware declared after it in the same group returns the page info it left in the context, and the
  client reads both from one call.
- **Fixed on the way** (the cookie and pagination examples depended on it): the client dropped the answer of
  a middleware with no params unless an `onRequest` hook asked for it, so its result, hooks and declared
  errors never arrived (its declared error even landed in `undeclared`). `rpc-client/src/dispatch.ts` now
  adds such chain middlewares after the answer arrives, and the Go build check no longer reports `MET009`
  for a middleware that takes no params (`apimeta.Method.TakesParams`). Tests:
  `rpc-client/test/paramlessMiddleware.spec.ts` (tuple, hooks, optimistic first call, declared errors,
  request body, batch) and a Go subtest in `apigen_test.go`. The `MET008` / `MET009` fix hints now show the
  trace id instead of a token.
