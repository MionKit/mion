---
type: docs
spec: guidelines
status: ready
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
