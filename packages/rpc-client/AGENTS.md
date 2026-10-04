# @mionjs/client guidelines

## The call result is `[result, error, response]`, and what goes where is deliberate

`call()` resolves to `[result, error, response]` ([src/types.ts](src/types.ts), `Result`; `batch()` returns one
`Result` per route, in order, every entry sharing the same response object, `BatchResult`). The split encodes WHO can produce each error, and
that is what keeps slot 1 a closed, strongly typed union.

| slot | holds                                                                           | who produced it                                                                                                                                                                           |
| ---- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0    | the route's value                                                               | the route handler, whenever it ran and succeeded                                                                                                                                          |
| 1    | the route's DECLARED errors + `ValidationError`                                 | the route (or its param validation), a CLOSED union                                                                                                                                       |
| 2    | the decoded response body, ids nested by group (`'a/b'` becomes `response.a.b`) | everything the router answered, typed per middleware (`ClientResponse<RA>`)                                                                                                               |
| 2    | `response['@thrownErrors']`, an array of OPEN `RpcError<string>`                | anything not strongly typed: a server throw, transport (timeout, abort, network), platform, a failed hook, an answer the client could not decode or that failed `validateServerResponses` |

Slot 2 is built once per attempt ([src/lib/clientResponse.ts](src/lib/clientResponse.ts)), in this order, as soon as
the body arrives: decode it, nest the ids, then move each `validation-error` out of the server's `@thrownErrors`
record to its own path (a validation error is typed, every handler's type includes it). Every answer is read from
that object and it is what the call returns; the raw body only feeds the retry and check rules. A retry starts a new
one. Response keys are untrusted: the path helpers never walk a `__proto__` segment or into a non-object. Strongly typed things sit at their
path: body values (the route's own entry too), declared errors, validation errors from either side, an answer sent
as HTTP headers. Everything else is pushed to `@thrownErrors`, every one kept, in the order it happened.

- Middleware outcomes are meant to be handled by the middleware's own hooks
  (`middlewares.x.onResponse()` / `.onError()`). Hooks never see slot 2: a hook only handles its own middleware.
- The type of slot 2 names middlewares only (routes are slot 0) and is built like `ClientMiddlewares`, once per
  API, never per route. Keep it that cheap.

The dispatch rules (which error lands where) are pinned by
[test/errorDispatch.spec.ts](test/errorDispatch.spec.ts); the header of that file lists them.
Two of them exist because of real bugs, keep them in mind when touching request handling:

- A middleware failing NEVER masks a route result that the server did produce (a returned,
  non-fatal middleware error does not abort the chain), so slot 0 keeps the value while the middleware's path
  holds its error.
- A middleware error NEVER appears in slot 1. Slot 1 is the route's declared union and nothing
  else, otherwise the typing of that slot would be a lie.

One thing reaches `@thrownErrors` that the router never saw: a metadata cache write the browser refused, after
eviction ran out of things to give up. The request itself succeeded, so it never rejects; it is added to a later
call's `@thrownErrors` and reported once (`packages/rpc-client/src/lib/clientMethodsMetadata.ts`,
`takeMetadataCacheError`, reached only through `useFetchMetadata`'s internal hook).

## Metadata fetching is one installer, never a dispatch special case

Everything about fetching route metadata (the optimistic first call, the browser store, the version
recovery, the one resend) lives behind `useFetchMetadata` in
[src/middlewares/fetchMetadata.ts](src/middlewares/fetchMetadata.ts). `dispatch.ts` only calls the
optional internal hook in [src/lib/metadataFetcher.ts](src/lib/metadataFetcher.ts), which no public type
names. Without the installer, `dispatch.ts` only reports `route-metadata-not-found` and a whole-API version
mismatch. A client that never calls the installer ships none of it. Do not add a metadata branch back into
`dispatch.ts` or `serializer.ts`.

## Middleware params come only from onRequest

`call()` and `batch().call()` take no middleware values. A middleware gets its params from its
`onRequest` hook, which runs before every request whose chain includes it, and `middlewares.x`
is hooks only. Do not add a second way to pass them. The one exception is `useFetchMetadata`'s internal
hook, which writes the metadata middleware's params itself: the ids it asks for are only known mid-dispatch.

## Calls never throw

Every failure comes back inside the result. The ONE method that throws is `typeErrors()`,
which validates params locally and is documented as such. Never add a throwing path to
`call()` / `batch().call()`.

## Batches need the build plugin

`batch()` requires the batch id the build transform injects (`InjectBatchId`), because
batches are compiled into the server at build time. A client without the transform gets a
`batch-missing-id` error; that is by design, not a missing fallback.
