---
type: fix
spec: full-plan
status: done
created: 2026-09-12
---

# A request that already failed runs only the always-run middleFns

## Problem

Two gaps with the same shape.

**A request refused by the platform adapter never reached the router.** `fatalFail()` wrote a bare
response built by `getRouterFatalErrorResponse()`, so no execution chain ran at all: a rate limiter
or an access log registered with `addStartMiddleFns` / `addEndMiddleFns` never saw a 413. It was also
inconsistent with the router's own limit, because `rejectOversizedBody` throws inside
`deserializeRequestBody`, an `alwaysRun` middleFn INSIDE the chain, so a body handed over whole (aws,
gcloud, a direct `dispatchRoute`) already behaved correctly. Only the adapters that refuse early
disagreed.

**An unknown path ran every global start middleFn.** A 404 carried no error until the not-found route
threw halfway down the chain, so a session loader or an authorization step did real work for a
request that was already known to fail.

Both are the same thing: a request can arrive already failed, and then only the middleFns that
declare `alwaysRun` should run.

## What shipped

### Fail first, and the dispatcher's existing rule does the rest

No new state anywhere, and **`runExecutionChain` gained no code at all**: no extra read, no extra
branch, so the happy path pays nothing. The loop already had the rule
(`packages/router/src/dispatch.ts`):

```ts
if (response.hasErrors && !executable.alwaysRun) continue;
```

so the whole job was making the response carry the error BEFORE the first global middleFn instead of
halfway down.

| Source | Key | Error | How it fails first |
| --- | --- | --- | --- |
| unknown path | `mion@notFound` | `route-not-found`, 404 | the first member of its chain throws |
| unknown batch id | `mion@batchNotFound` | `batch-unknown-id`, 404 | the first member of its chain throws |
| adapter refusal after the route resolved | `mion@platformError` | `request-payload-too-large`, 413 | the adapter calls `dispatchPlatformError` |

### The two not-found routes became chain members

`packages/router/src/routes/errors.routes.ts` no longer declares them as routes. They are raw
middleFns (`notFoundMiddleFn`, `batchNotFoundMiddleFn`) that throw the same `FatalError` as before,
and `router.ts` puts each at the head of its own chain, built by `buildNotFoundChains()` at the end
of `registerRoutes` and reachable through `getNotFoundExecutionChain(id)`:

```ts
const methods = [getExecutableFromRawMiddleFn(middleFnDef, [id], 0), ...startMiddleFns, ...endMiddleFns];
notFoundChains.set(id, {routeIndex: -1, methods, serializer: getChainFraming(methods), readsBody: false});
```

Raw middleFns rather than routes: nobody declared the request, so there is no params or return
contract to compile and the two `DEFAULT_WIRE` encoder pins are gone with them. The throw is keyed by
the member's own id, so the wire shape is exactly what it was. Both are exported from
`errors.routes.ts` for `router.ts` alone, so `index.ts` names `mionErrorsRoutes` explicitly rather
than re-exporting the module, and neither thrower joins the published surface.

`callContext.ts`'s `notFoundChain` reads that map instead of looking up a registered route path, so
`/mion@notFound` and `/mion@batchNotFound` stop being reachable paths (they now answer 404 like any
other unknown path).

### The adapter refusal

`recordUndeclaredError(context, key, err)` replaced `onExecutableError` in `lib/dispatchError.ts`:
the same `markFatal`, `markResponseFailed` and `thrownErrors` slot, keyed by a caller-given key
rather than an executable id. The five in-package callers pass `executable.id`, so the old wrapper
was a pure forwarder and went. `dispatch.ts` exports one new function beside the loop, never inside
it:

```ts
export function dispatchPlatformError<Req, Resp>(resolved, platformError, reqHeaders, respHeaders, rawRequest, rawResponse?) {
  const context = createContextFromResolved(resolved, reqHeaders, respHeaders); // no body
  recordUndeclaredError(context, MION_ROUTES.platformError, platformError);
  return dispatchWithContext(context, rawRequest, rawResponse);
}
```

### Everything else

- `deserializeRequestBody` also returns early when `context.response.hasErrors`, so a body a caller
  handed over anyway is never parsed.
- `readsBody` is `true` for every chain built around a real route; only the two not-found chains
  carry `false`.
- Which adapter call sites switched, decided by one question, had the route already resolved?
  - Switched: node's declared `content-length` and mid-read checks, uws' `collectBody` null answer,
    and the `readRequestBody` throw in bun, cloudflare and vercel (each of which had ONE try/catch
    covering both the resolve and the read, now split so only the read reaches the chain).
  - Kept `fatalFail`: a throwing `pathTransform`, a connection or request error, a failure while
    replying, and the post-dispatch catch-all. No chain exists for any of them.
  - aws hands the body over whole, so its 413 is raised from inside the chain and it was untouched.
  - gcloud measures the body itself (it arrives parsed, so the router cannot), and that check threw
    past the chain into a bare answer. It now calls `dispatchPlatformError` like the other five.
- node now destroys the request stream after the reply rather than before it; bun still sets
  `connection: close` on the 413.
- `toRpcError` moved to `lib/dispatchError.ts`, the module whose own header says it is for any
  adapter layer. node and uws each carried a private copy and bun, cloudflare and vercel needed one,
  so five identical copies became one export.
- `notFoundChains` goes through `getOrCreateGlobal` like every other router map, so a dual module
  load cannot leave one half with routes and no not-found chain.

### The wire shape did not change

The 413 envelope is byte-identical: the exact-wire pins in `mionHttp.spec.ts` and `uwsHttp.spec.ts`,
including their literal `content-length: '152'`, pass untouched. The 404s are unchanged too.

## Deviations from the original plan

The plan put the error on the execution chain (`chainError`), then on the `CallContext`
(`arrivalError`). Both were dropped: the chain is static data shared by every request and has no
business carrying a request error, and a context field would have cost the happy path a read per
request. Throwing from the head of the chain needs neither.

## Tests

- `packages/router/src/notFound.spec.ts`, rewritten: for each of the three sources, a global
  `alwaysRun` start AND end middleFn runs, a global middleFn WITHOUT `alwaysRun` does not, the route
  and route-level middleFns do not, `'{not json'` is never parsed, and the answer carries the right
  key, status and `x-rpc-error`. Plus the chain shape: `routeIndex` is -1, the first member is the
  thrower, and neither id is reachable as a path.
- Per adapter (node, uws, bun, cloudflare, vercel): a body over the route's limit answers 413,
  an `alwaysRun` end middleFn sees it, a plain global does not, and the server still serves the next
  request. Node covers both the declared `content-length` and the mid-read case. Bun's suite declares
  a second route with a large `maxBodySize`, which lifts `Bun.serve`'s own ceiling clear of the test
  body: without it Bun refuses natively, mion is never called, and the assertions pin nothing.
- aws pins that it already ran the chain, and its 413 is raised from INSIDE the chain
  (`mionDeserializeRequest`), so the plain global runs first: the tests record that as the real
  difference between an adapter refusal and a router one. gcloud, which had no 404 coverage at all,
  pins the adapter-refusal side of the same rule.
- `maxBodySize.spec.ts` pins the invariant behind all of it: the router measures a STRING body, so a
  body its host already parsed carries no wire size and is not refused. That is deliberate, and it
  is why an adapter handed a parsed body owns the check.
- `notFound.spec.ts` also pins the guard inside `deserializeRequestBody`: that member declares
  `alwaysRun`, so the dispatcher never skips it and a global middleFn that threw would otherwise
  still have its body parsed.
- Updated: the five adapter `security.spec.ts` files, `maxBodySize.spec.ts`, `resolveRequest.spec.ts`
  and `router.spec.ts` (the flat router holds 2 fewer routes).

## Docs

- `01.rpc/02.server/02.middle-fns.md`: "Unknown Paths" became "Requests That Already Failed", with a
  table of the three and the plain statement that only `alwaysRun` middleFns run.
- `01.rpc/02.server/09.security.md`: the tip that said global middleFns still run, and the body-size
  section, both rewritten. Its link to the renamed heading moved with it.
- `01.rpc/03.client/03.batch.md`: a third sentence stating the old rule, not named in the original
  plan.
- `packages/examples/src/router/middleFns-failed-requests.ts` (renamed, it covers three cases
  now): its rate limiter declares `alwaysRun`,
  and it now also shows a global WITHOUT it being skipped.

## Out of scope

Errors raised before a route is resolved or after the response has been written: no chain exists, so
they keep the bare fatal response. The error keys, the status codes and `getRouterFatalErrorResponse`
are unchanged.
