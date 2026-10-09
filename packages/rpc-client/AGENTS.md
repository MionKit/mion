# @mionjs/client guidelines

## The call result is `[result, error, response]`, and what goes where is deliberate

- `call()` → `[result, error, response]` (`Result` in [src/types.ts](src/types.ts)).
- `batch()` → one `Result` per route, in order, all sharing one response object (`BatchResult`).
- Split encodes WHO can produce each error: keeps slot 1 a closed, strongly typed union.

Slots:

- 0: the route's value. From the route handler, whenever it ran and succeeded.
- 1: the route's DECLARED errors + `ValidationError`. From the route (or its param validation). CLOSED union.
- 2: decoded response body, ids nested by group (`'a/b'` → `response.a.b`).
  Everything the router answered, typed per middleware (`ClientResponse<RA>`).
- 2, `response['@thrownErrors']`: array of OPEN `RpcError<string>`. Anything not strongly typed:
  server throw, transport (timeout, abort, network), platform, failed hook,
  answer the client could not decode or that failed `validateServerResponses`.

Slot 2 ([src/lib/clientResponse.ts](src/lib/clientResponse.ts)):

- Built once per attempt, as soon as the body arrives. A retry starts a new one.
- Order: decode → nest ids → move each `validation-error` out of the server's `@thrownErrors` record
  to its own path.
  (A validation error is typed: every handler's type includes it.)
- Every answer is read from that object, and the call returns it. Raw body only feeds the retry + check rules.
- Response keys are untrusted: path helpers never walk a `__proto__` segment or into a non-object.
- Strongly typed things sit at their path: body values (route's own entry too), declared errors,
  validation errors from either side, an answer sent as HTTP headers.
- Everything else → pushed to `@thrownErrors`, every one kept, in the order it happened.
- Middleware outcomes: handled by the middleware's own hooks (`middlewares.x.onResponse()` / `.onError()`).
- Hooks never see slot 2: a hook only handles its own middleware.
- Slot 2 type names middlewares only (routes are slot 0).
  Built like `ClientMiddlewares`, once per API, never per route. Keep it that cheap.

Dispatch rules (which error lands where): pinned by [test/errorDispatch.spec.ts](test/errorDispatch.spec.ts),
its header lists them. Two came from real bugs, mind them when touching request handling:

- A middleware failing NEVER masks a route result the server did produce.
  Returned non-fatal middleware error does not abort the chain: slot 0 keeps the value, middleware path holds the error.
- A middleware error NEVER appears in slot 1. Slot 1 = route's declared union only (else its typing lies).

Metadata cache write error:

- Reaches `@thrownErrors` without the router seeing it: browser refused a metadata cache write after eviction ran out.
- Request itself succeeded → never rejects. Added to a later call's `@thrownErrors`, reported once.
- Code: `packages/rpc-client/src/lib/clientMethodsMetadata.ts`, `takeMetadataCacheError`,
  reached only through `useFetchMetadata`'s internal hook.

## Metadata fetching is one installer, never a dispatch special case

- All route-metadata fetching (optimistic first call, browser store, version recovery, one resend)
  lives behind `useFetchMetadata` in [src/middlewares/fetchMetadata.ts](src/middlewares/fetchMetadata.ts).
- `dispatch.ts` only calls the optional internal hook in [src/lib/metadataFetcher.ts](src/lib/metadataFetcher.ts).
  No public type names it.
- Without the installer, `dispatch.ts` only reports `route-metadata-not-found` and a whole-API version mismatch.
- Client never calling the installer ships none of it.
- Never add a metadata branch back into `dispatch.ts` or `serializer.ts`.

## Middleware params come only from onRequest

- `call()` and `batch().call()` take no middleware values.
- Middleware gets params from its `onRequest` hook, run before every request whose chain includes it.
- `middlewares.x` is hooks only. Never add a second way to pass params.
- One exception: `useFetchMetadata`'s internal hook writes the metadata middleware's params itself
  (ids it asks for are only known mid-dispatch).

## Calls never throw

- Every failure comes back inside the result.
- ONE method throws: `typeErrors()`, validates params locally, documented as such.
- Never add a throwing path to `call()` / `batch().call()`.

## Batches need the build plugin

- `batch()` needs the batch id the build transform injects (`InjectBatchId`).
  Why: batches compile into the server at build time.
- Client without the transform → `batch-missing-id` error. By design, not a missing fallback.
