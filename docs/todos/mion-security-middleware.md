---
type: feature
spec: full-plan
status: ready
created: 2026-10-31
---

# mionSecurity: CORS and CSRF in one middleware, out of the router and adapters

## Problem

The branch put security checks in the wrong layers:

- The router refuses a method a route does not accept (405) inside `deserializeRequestBody`
  (`packages/rpc-router/src/routes/serializer.routes.ts`), driven by a new per-route `httpMethods` option and
  per-chain `methodBits` (`packages/rpc-router/src/lib/httpMethods.ts`).
- Every platform adapter refuses a form or missing content type (415) through `contentTypeRefusal`
  (`packages/rpc-router/src/lib/bodyReader.ts`), called in node, bun, uws, cloudflare, vercel, aws and gcloud.
- `mionCors` is a separate middleware, and OPTIONS is only safe on a chain holding it.

Security belongs in an opt-in middleware, not in the router or the adapters. The hello-world bench also measured
the adapter check on every request: −6% uws, −3% bun (it reads `content-type` even on a GET).

Both checks protect against CSRF, which exists with or without CORS: a link or image runs a mutation over GET
with `SameSite=Lax` cookies, and a form POST (`text/plain` body shaped as JSON) or an empty no-cors POST runs one
with `SameSite=None` cookies or from a sibling subdomain. CORS only decides who may read an answer.

## Plan

### 1. Take the checks out of the router and adapters (back to pre-branch behaviour)

- Router: delete `src/lib/httpMethods.ts`, the gate in `deserializeRequestBody` (restore its old shape),
  `MethodsExecutionChain.methodBits` (`router.ts` route + not-found chains, `batches.ts`),
  `markAnswersPreflight` / `answersPreflight` (`src/lib/handlers.ts`).
- `httpMethods` removed everywhere, no trace: core `RouteHttpMethod`, `RemoteMethodOpts.httpMethods`,
  `defaultHttpMethods`, `BATCH_HTTP_METHODS` (`packages/core/src/types/method.types.ts`, `routerUtils.ts`);
  router `RouteOptionsBase.httpMethods`, `ResolvedRouteOptions.httpMethods`, `getExecutableFromRoute`;
  `mionRouter.spec.ts` / `fetchMetadata.spec.ts` pins.
- Client (`packages/rpc-client/src/dispatch.ts`): back to the pre-branch GET/POST choice; remove
  `getHttpMethods`, `getRetryMethods`, `DispatchState.httpMethods`, `get-url-too-long`;
  `lib/fetchRemoteMethodsMetadata.ts` back to throwing the platform error first. Remove the GET-only client tests
  and the `getOnlyRequestInfo` test-server route.
- Go: revert the `readOptions` array/tuple arm and its tests (`ts-go-runtypes/internal/compiler/apimeta/`).
- Adapters: remove `contentTypeRefusal` and every call; restore node `dispatchRefusal`, bun
  `readBodyAndDispatch`, aws `createCallContext`, gcloud tests to their pre-branch shape. KEEP: `request.method`
  wiring in all seven, the uws null-prototype method map, Vercel's `OPTIONS` export.
- Adapter tests: keep only the "puts the HTTP method on the request" case per adapter; drop the 405 / 415 /
  QUERY cases and the JSON headers added only for the 415.
- Keep: `request.method`, `endChain` / `endedEarly` / `stopped`, `HeadersSubset` `cors: false`,
  `StatusCodes.METHOD_NOT_ALLOWED` / `UNSUPPORTED_MEDIA_TYPE` (now used by the middleware) plus a new `FORBIDDEN: 403`.

### 2. `mionSecurity` replaces `mionCors`

`packages/rpc-router/src/middlewares/security.ts` (replaces `cors.ts`, which is deleted with `mionCors` and
`MionCorsOptions`); exported from `packages/rpc-router/middlewares.ts`; options type `MionSecurityOptions` in
`src/types/general.ts`. Placed by its own name, first: `mionSecurity: mionSecurity({...})`.

```ts
mionSecurity({
  origins?: string | string[] | RegExp | ((origin: string) => boolean), // trusted to send (CSRF) and, with cors, to read
  cors?: false | {credentials?: boolean; maxAge?: number; allowHeaders?: string[]; exposeHeaders?: string[]}, // default false
  csrf?: false | {crossOrigin?: boolean; methodByIntent?: boolean; formContentTypes?: boolean},           // each default true
});
```

- `alwaysRun` regular middleware built with the internal `middleware()` helper (no params, no return: not public).
- Throws at creation: `origins: '*'` with `cors.credentials`; an `origins` of the wrong kind.
- Per request, in order:
  1. CORS headers (only with `cors`): `Vary: Origin` always; allowed origin echoed, credentials, Expose-Headers
     on a normal request; preflight adds Allow-Methods / Allow-Headers / Max-Age. Lists per chain, cached in a
     `WeakMap` (same derivation and `cors: false` rules as the current `cors.ts`).
  2. Every OPTIONS ends with `endChain(ctx)`, CORS on or off, so a preflight never runs a route.
  3. A chain that already failed (`hasErrors`) is not refused again.
  4. CSRF (skipped with `csrf: false`), each check switchable:
     - `methodByIntent`: route = `chain.methods[chain.routeIndex]`; batch (`ctx.batchId`) and `mutation` /
       `route()` accept POST; `query` (`isMutation === false`) accepts GET, HEAD, POST. Anything else: 405
       `method-not-allowed` with an `Allow` header. Not-found chains (`routeIndex === -1`) are skipped.
     - `crossOrigin` (methods other than GET / HEAD), Go 1.25 `CrossOriginProtection` rules:
       `Sec-Fetch-Site` `same-origin` or `none` passes; `same-site` / `cross-site` passes only for a trusted
       `Origin`; without `Sec-Fetch-Site`, an `Origin` passes when trusted or when its host equals `Host`;
       `Origin: null` is never trusted; no `Origin` and no `Sec-Fetch-Site` passes (non-browser caller).
       Refused: 403 `cross-origin-request-refused`.
     - `formContentTypes` (POST): `text/plain`, `application/x-www-form-urlencoded`, `multipart/form-data`
       (case and parameters ignored) or no content type: 415 `unsupported-media-type`. Header read only on POST.
  - Refusals are thrown `FatalError`s, so they land in `@thrownErrors` under the middleware's id and the CORS
    headers set in step 1 stay on the error answer.

### 3. Benchmarks

`pnpm miondevx bench servers repeat <lane> hello-world --runs 3` for `mion`, `mion.uws`, `mion.bun`, base vs
branch, ALTERNATING the arms (base, branch, base, branch) with `git restore --source=<sha> --staged --worktree
packages/`. Expect no router overhead. Then the cost of the middleware itself: the bench app with
`mionSecurity()` added (local change, never committed), same lanes. Numbers in the PR.

## Tests

- `packages/rpc-router/test/middlewares/security.spec.ts` (replaces `cors.spec.ts`, keeps its CORS cases):
  method by intent per helper and batch, HEAD on a query, PUT / lowercase → 405 + `Allow`; `Sec-Fetch-Site`
  matrix (same-origin, none, same-site, cross-site, trusted and untrusted Origin); Origin-vs-Host fallback;
  `Origin: null`; no headers passes; form types and missing type → 415, JSON and `text/json` pass; each check
  switched off; `csrf: false`; OPTIONS ended with CORS off; refusals carry CORS headers; a failed chain is not
  refused twice; placement in a group; an API without it gets no checks (the router runs a GET mutation again).
- `packages/rpc-router/test/lib/httpMethods.spec.ts`: keep only the `request.method` cases, moved to
  `test/callContext.spec.ts` (`dispatchRoute` / `createCallContext` default POST, passed method kept).
- `packages/platform-node/test/security.spec.ts`: the five attack requests now go to a server WITH `mionSecurity`
  and are refused, a JSON POST runs; plus a cross-site JSON POST (`Sec-Fetch-Site: cross-site`) refused.
- `packages/platform-node/test/corsBrowser.spec.ts` → real browser: cross-origin read through `mionSecurity`
  with `cors`; a cross-origin `<form method=POST enctype=text/plain>` submit does not run the mutation; an API
  without the middleware is blocked from reading.
- Adapter "puts the HTTP method on the request" cases stay in all seven adapters.
- Remove: GET-only client tests, adapter 405 / 415 / QUERY cases, Go tuple tests.

## Fuzzing

Adapt the existing `SH-GATE` lane (`packages/private-test-router-fuzz/test/fuzz/security/httpFuzzRunner.ts`):
gate routes sit behind `mionSecurity`, the generator adds `Sec-Fetch-Site` and `Origin` values, and the oracle
models method by intent + cross-origin + form types. Keep the forged-observation negative-control test.

## Docs

- `container/website/content/01.rpc/03.middlewares/03.cors.md` → `03.security.md` (`title: security`):
  Adding the Middleware, Options (one table), CORS Headers From Your Types, CSRF Checks (one table: check,
  refuses, status), Answers per Request, What It Protects (CORS is not access control; `cors: false` still sends).
- `02.server/01.routes.md`: remove "Allowed HTTP Methods" and "Request Content Type"; the query/mutation section
  says a mutation is POST only when `mionSecurity` runs, linking the page.
- `02.server/02.middleware.md`: drop the 405 / 415 rows from "Requests That Already Failed"; intro links
  `mionSecurity`.
- `02.server/05.error-handling.md`: drop the 405 / 415 rows (the security page lists its refusals).
- `02.server/03.call-context.md`: revert the "and the route accepts GET" link.
- `02.server/04.headers.md`, `06.platforms/06.vercel.md`: links to the new page; Vercel keeps the OPTIONS note.
- `01.introduction/02.quick-start.md` (+ its example, cookie session): add `mionSecurity` with a one-line why.
- Examples: `packages/private-examples/src/router/cors*.ts` → `security*.ts`; delete `http-methods.routes.ts`.

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example
this change touched, review its report against the code, and commit it as its own commit.

## Out of scope

- A build-time warning when an app has no `mionSecurity` (docs only, decided).
- Token-based CSRF, rate limiting, security response headers (helmet-style).
- Per-route custom method lists and the QUERY method (`httpMethods` removed).
- Changing `mionFetchMetadata`'s early answer.

## Done when

- No method or content-type check is left in the router or any adapter; `httpMethods` leaves no trace.
- `mionSecurity` alone gives CORS (when configured) and CSRF protection; `mionCors` is gone.
- The five attack requests and a cross-site JSON POST are refused behind `mionSecurity`, proven over HTTP and in a
  real browser; a correct mion client call is never refused.
- Hello-world bench: base vs branch shows no router overhead; the middleware's own cost is measured. Both in the PR.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched source file,
  each committed on its own.
