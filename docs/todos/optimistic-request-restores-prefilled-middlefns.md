---
type: fix
spec: guidelines
status: ready
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

## Done when

- A route's first optimistic call with a prefilled headers middleFn is accepted first time: one
  `fetch`, the Authorization header present, no retry.
- The existing optimistic tests keep passing, and a new one counts the round trips.
