---
type: fix
spec: guidelines
status: done
created: 2026-09-06
---

# The optimistic first request does not restore prefilled middleFns, so it always retries

## Intent

The client's `serializer: 'optimistic'` mode promises one round trip on a route's first call: plain
JSON goes out with the metadata ask piggybacked, and the compiled functions arrive with the answer.
That promise breaks as soon as a middleFn was prefilled: the optimistic request leaves every
prefilled middleFn out, so on a server with a global headers middleFn (the test server's `auth`, any
app with an auth check) the first request is rejected with the middleFn's validation error and the
client silently retries with the metadata. Every "optimistic" first call with a prefill is therefore
two round trips, and the user cannot tell.

Found while pinning the optimistic gate in `packages/client/src/client.spec.ts` (the plain-JSON
gate tests pass the auth middleFn explicitly to the call for that reason). It predates the encoder
work: the retry path is what made the existing optimistic tests pass.

Passing the auth middleFn explicitly only looked like a fix: with a cold metadata cache the explicit
one retried too, because the optimistic body carried the HeadersSubset as a param and no
Authorization header went out (`extractRequestHeaders` needs the middleFn's metadata, which the
first call does not have). The existing tests never saw that: the metadata cache is process-wide, so
by the time the optimistic tests ran, earlier tests had already cached `auth`.

## Direction

- `packages/client/src/request.ts`, `makeCall`: the optimistic branch calls
  `restorePrefilledMiddleFns()`, but that restore only adds the prefilled middleFns that the route's
  metadata lists (`middleFnIds`), which is exactly what the optimistic request does not have yet. So
  nothing is restored, the body carries no middleFn params and the request goes out without the
  prefilled headers.
- The optimistic request should carry every prefilled middleFn of the client instead (the user
  prefilled them for a reason), with a headers middleFn's `HeadersSubset` sent as HTTP headers and
  kept out of the body, the way an explicitly passed one already is (`serializeJSonBodyOptimistic`,
  `extractRequestHeaders`). Check what the server does with a prefilled middleFn that is not in the
  route's chain (an unknown body key) before deciding whether to send all of them or to filter once
  the metadata arrives.
- A test in `client.spec.ts` should pin the one-round-trip property with a PREFILLED auth middleFn,
  spying on `fetch` the way the plain-JSON gate tests do.

The implementer plans the details.

## Plan (approved 2026-09-06, delegated session)

Shipped as planned, on the same code path for the prefilled and the explicit case:

- `packages/client/src/request.ts`: the optimistic branch of `makeCall` now calls
  `restoreScopedPrefilledMiddleFns()`. The chain is not cached yet, but a middleFn's SCOPE is part of
  its pointer: it runs for the routes of its own group and of the groups nested in it (that is how the
  router builds a chain), so `isMiddleFnInScope(middleFnPointer, routePointer)` decides from the route
  pointer alone. Every top-level prefill plus the prefills scoped to the route's group ride along
  (single route and batch alike, skipping the route ids and ids the call already carries); a prefill
  scoped to another group is never sent, so an app with many scoped prefills pays nothing for them.
  Sending ALL prefills was considered and rejected for that reason. The restored ids are remembered in
  `optimisticPrefillIds`; once the answer has cached the metadata, `pruneOptimisticPrefills()` drops any
  of them the chain did not list (a safety net: the server ignores body keys outside the chain), so the
  resolved middleFns match what a call with cached metadata restores. The standard-flow restore kept
  its chain-driven behaviour (`restorePrefilledMiddleFns`, single route and batch merged into one loop
  over `getRouteIds()`), with `errors` now required since only that flow calls it.
- `packages/client/src/lib/headers.ts`: new `hasHeadersSubsetParam(id, params)`, the one rule for
  "this subrequest's first param is a headers middleFn's HeadersSubset": the cached metadata decides
  when there is any, else (a route's first optimistic call with an explicit headersFn) the value itself
  (`instanceof HeadersSubset`).
- `packages/client/src/lib/serializer.ts`: `serializeJSonBodyOptimistic` strips that HeadersSubset
  from the body (and, like the compiled JSON path, omits a subrequest with no params left), and
  `extractRequestHeaders` in `request.ts` uses the same rule to send it as HTTP headers, metadata or not.
- Tests (`client.spec.ts`, `batch.spec.ts`), all spying on `fetch` and forgetting the route's cached
  metadata first so the call is a real first call whatever ran before: one fetch with the Authorization
  header and no `auth` body key for a PREFILLED auth, for an EXPLICIT auth, and for a batch; every
  top-level prefill rides along and the in-chain ones resolve (`session`); a SCOPED prefill (the new
  `utils/scopeTag` middleFn of the test server, inside the `utils` group) is left off a top-level route's
  first call and rides along on a `utils/*` route's; the scope rule itself is pinned as a table; a
  prefill the chain does not list (the answer's metadata rewritten) is dropped from the results. The query-route GET test now primes the metadata first: a route's first
  call is optimistic and always a POST, and it only ever passed on the retry's GET.
- Docs: one sentence in the client overview's prefill section (the very first call is one round trip).
- Not a fuzz candidate: a single wire-shape property, pinned by the round-trip counters.

## Done when

- A route's first optimistic call with a prefilled headers middleFn is accepted first time: one
  `fetch`, the Authorization header present, no retry. SHIPPED, the same for an explicit headers
  middleFn on a cold cache and for a batch.
- The existing optimistic tests keep passing, and a new one counts the round trips. SHIPPED.
