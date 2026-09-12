---
type: fix
spec: full-plan
status: ready
created: 2026-09-12
---

# A request that already failed runs only the always-run middleFns

## Problem

Two gaps with the same shape.

**A request refused by the platform adapter never reaches the router.** `fatalFail()` writes a bare
response built by `getRouterFatalErrorResponse()`, so no execution chain runs at all: a rate limiter
or an access log registered with `addStartMiddleFns` / `addEndMiddleFns` never sees a 413. It is also
inconsistent with the router's own limit, because `rejectOversizedBody` throws inside
`deserializeRequestBody`, an `alwaysRun` middleFn INSIDE the chain, so a body handed over whole (aws,
gcloud, a direct `dispatchRoute`) already behaves correctly. Only the adapters that refuse early
disagree.

**An unknown path runs every global start middleFn.** A 404 carries no error until the not-found
route throws halfway down the chain, so a session loader or an authorization step does real work for
a request that is already known to fail.

Both are the same thing: a request can arrive already failed, and then only the middleFns that
declare `alwaysRun` should run.

## Plan

### One mechanism, three sources

A failed-on-arrival request carries its error and the key it is reported under:

| Source | Key | Error | Carried on |
| --- | --- | --- | --- |
| unknown path | `mion@notFound` | `route-not-found`, 404 | the chain, settled at registration |
| unknown batch id | `mion@batchNotFound` | `batch-unknown-id`, 404 | the chain |
| adapter refusal after the route resolved | `mion@platformError` | `request-payload-too-large`, 413 | the context |

- `MethodsExecutionChain` gains `chainError?: {key: string; error: RpcError<string>}`, set when the
  router builds its two not-found chains.
- `CallContext` gains `platformError?: RpcError<string>`, set by the adapter.
- `runExecutionChain` reads whichever is present once before the loop, records it exactly as a thrown
  error does, then runs the chain unchanged:

```ts
// packages/router/src/dispatch.ts, before the loop
const failed = context.platformError ?? context.executionChain.chainError;
if (failed) recordArrivalError(context, failed); // thrownErrors[key] + markResponseFailed
// the loop's existing rule then does the rest, untouched:
if (response.hasErrors && !executable.alwaysRun) continue; // dispatch.ts:84
```

`recordArrivalError` mirrors `onExecutableError` (`packages/router/src/lib/dispatchError.ts:66`) but
keys by the given key rather than an executable id, and keeps the error's own `statusCode`.

### The not-found routes are deleted

`MION_ROUTES.notFound` and `MION_ROUTES.batchNotFound` stop being routes. Both entries go from
`packages/router/src/routes/errors.routes.ts:36` and `:53`; the constants stay, because they are the
wire keys. Their chains become start and end middleFns only, with no route at all, which is the
structural change to watch:

- `MethodsExecutionChain.routeIndex` needs a route-less value (-1) and every reader must handle it, in
  particular `applyMaxBodySizeCap` (`packages/router/src/router.ts:711`, which reads
  `chain.methods[chain.routeIndex]`), the chain framing helper and the public-metadata builder. This
  is the main implementation risk.
- `readsBody` (`packages/router/src/router.ts:438`) stops being a list of two route ids and becomes
  "this chain has no `chainError`": the same answer for a better reason.
- `deserializeRequestBody` (`packages/router/src/routes/serializer.routes.ts:30`) returns early for an
  arrival error too, so a body handed over anyway is never parsed.

### What runs

Only `alwaysRun` methods, for all three sources. `mionDeserializeRequest` and `mionSerializeResponse`
are already `alwaysRun` (`packages/router/src/routes/serializer.routes.ts:233`), so the answer still
serializes normally.

This CHANGES the 404 behaviour: a global start middleFn without `alwaysRun` used to run on an unknown
path and now does not. That is the point (no sessions, no authorization for a doomed request). It is
unreleased, so no consumer depends on it, and the example and docs move with it.

The wire shape does not change for any of the three: same `@thrownErrors` key, same status, same
`x-rpc-error` header. `mion@platformError` is already the key `getRouterFatalErrorResponse` writes.

### The adapter rule

One new router export keeps the five adapters identical:

```ts
dispatchPlatformError(resolved, platformError, reqHeaders, respHeaders, rawRequest, rawResponse);
```

It builds the context from the already-resolved request with an empty body, attaches the error and
runs the chain. Which call sites switch is decided by one question, was the route already resolved?

- Resolved, so the chain exists, take the new path: node `mionHttp.ts:146` (declared `content-length`
  over the limit) and `:197` (the running size passes it); uws `uwsHttp.ts:219` (`collectBody` answers
  null); the `readRequestBody` throw inside the try in bun `bunHttp.ts:94`, cloudflare
  `cloudflareHandler.ts:95` and vercel `vercelHandler.ts:87`, whose catches cover both the resolve and
  the read today and so need splitting.
- Not resolved, or the response already left, keep `fatalFail`: a throwing `pathTransform` (node
  `:132`, uws `:169`), a connection or request error (node `:180`, `:212`), a failure while replying
  (node `:267`, uws `:247`), and the post-dispatch catch-all (node `:168`, uws `:199`).

## Tests

- Router: for each of the three sources, a global `alwaysRun` start and end middleFn runs, a global
  middleFn WITHOUT `alwaysRun` does not, the route and ordinary middleFns do not, `'{not json'` is
  never parsed, and the answer carries the right key, status and header.
- One test pinning all three responses byte-identical to today's wire shape.
- Per adapter (node, uws, bun, cloudflare, vercel): a body over the route's limit runs an `alwaysRun`
  end middleFn, answers 413, and the connection stays usable for the next request. Node covers both
  the declared `content-length` and the mid-read case.
- aws and gcloud: pin that they already run the chain, so this does not regress them.
- Existing specs to update: `packages/router/src/notFound.spec.ts`, `batches.spec.ts`,
  `security.spec.ts`, the client's unknown-batch-id test, and the adapter security specs.

## Docs

- The security page: what runs when a request is refused, and that the adapter and the router enforce
  the limit the same way.
- The middleFns page: rename the unknown-paths section to cover every failed-on-arrival request, and
  say plainly that only `alwaysRun` middleFns run.
- `packages/examples/src/router/middleFns-unknown-paths.ts`: its rate limiter must now declare
  `alwaysRun` to keep seeing 404s.

## Out of scope

Errors raised before a route is resolved or after the response has been written: no chain exists, so
they keep the current bare fatal response. Also out of scope: changing the error keys, the status
codes, or `getRouterFatalErrorResponse` itself.

## Done when

All three failed-on-arrival sources run exactly the `alwaysRun` middleFns and nothing else, no body is
ever parsed for them, the not-found routes are gone and their chains carry no route, the wire shape is
unchanged for all three, and the tests and docs above are in place.
