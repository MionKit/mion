---
type: feature
spec: guidelines
status: done
created: 2026-10-01
---

# Client call() returns [result, error, response]

## Intent

`call()` returns a 5-tuple today: `[result, error, undeclared, middlewareResults, middlewareErrors]`.
The last three are hard to use. Middleware answers are keyed by full route ids and typed as
`Record<string, unknown>`, so reading one needs a string key and a cast:

```ts
const pagination = middlewareResults?.['products/pagination'] as Pagination | undefined;
```

The new result has three slots:

```ts
const [products, error, response] = await routes.products.list(2).call();

response.products?.pagination;   // Pagination | RpcError<'page-out-of-range'> | undefined
response.auth;                   // SessionInfo | RpcError<'not-authorized'> | undefined
response['@thrownErrors'];       // RpcError<string>[] | undefined, client-made ones included
```

A route reads its own answer and its own declared errors from slots 0 and 1, as today. Slot 2 gives
access to everything else in the response, with almost no processing.

## Direction

Decided with the user. The implementer plans the details.

- **Slots 0 and 1 do not change**: the route's own answer, and the route's own declared errors plus
  validation errors (closed union).
- **Slot 2 is the decoded response body**, processed only to turn route ids into nested objects
  (`'products/pagination'` becomes `response.products.pagination`). That happens as soon as the
  response is created or received, and that nested object is the one shared through the whole
  response life cycle (hooks, retries, the returned result). No other processing.
- **The route's own entry stays in slot 2** (`response.products.list` repeats slot 0). Less
  processing, and slot 2 stays faithful to the body.
- **`response['@thrownErrors']` is an array of `RpcError<string>`** (open, untyped errors), holding
  every undeclared error, including ones the client makes itself: timeout, abort, network failure,
  a failed `onRequest`, a request that never reaches the server. The client builds the response
  object and adds them there. Today it does not: client-made errors go into a separate `errors` map
  in `packages/rpc-client/src/dispatch.ts` (`onError`, `setUndeclaredError`, keyed by
  `CLIENT_REQUEST_ERROR_ID`), and the server's `@thrownErrors` (`MION_ROUTES.thrownErrors` in
  `packages/core/src/constants.ts`) arrives as a record keyed by method id, so it is flattened into
  the array.
- **Slot 2's type is one map of every middleware in the API**, all optional, nested by group,
  plus `@thrownErrors`. Each value is the middleware's whole return type, answer and declared errors
  together, never split into success / error pairs (`HandlerResponse<PH>` in
  `packages/rpc-client/src/types.ts`). It is derived from the middleware tree `initClient` already
  types (`ClientMiddlewares<RA>` in the same file), not per route, so it is computed once per API.
  The route's own entry stays in the response at runtime; whether the type names it is the
  implementer's call, within the cost rule below.
- **Mind the type cost.** The map is built like `ClientRoutes` / `ClientMiddlewares`: one mapped
  type over the API that tells routes, middlewares and groups apart by the `type` discriminant,
  never structurally (the comment above `RouteLeaf` in `types.ts` explains why). No per-route chain
  computation, no deep conditional types. Measure it with the client's type-cost budget before and
  after.
- **Batch**: slots 0 and 1 stay arrays, one entry per route; slot 2 is one nested object for the
  whole batch (`BatchResult` in the same file).
- **The 5-tuple goes away completely**: no `undeclared`, `middlewareResults` or `middlewareErrors`
  slot, alias or shim (the "removed thing leaves no trace" rule in the root CLAUDE.md).
- The slot rules in `packages/rpc-client/CLAUDE.md` and the contract suite
  `packages/rpc-client/test/errorDispatch.spec.ts` (its R1 to R7 header) are rewritten for the new
  slots.
- Every example under `packages/private-examples/src/` that reads slots 2 to 4 moves to slot 2
  (`grep -rn "middlewareResults\|middlewareErrors\|undeclared" packages/private-examples/src`),
  the pagination example included.

## Docs

- `container/website/content/01.rpc/04.client/01.error-handling.md`: existing sections "The Result
  Pattern" and "Middleware Errors" are rewritten for the 3 slots.
- `container/website/content/01.rpc/04.client/00.client-overview.md`, `03.batch.md`,
  `04.cancellation-timeouts.md`: existing sections whose examples read the old slots.
- `container/website/content/01.rpc/02.server/02.middleware.md`: existing section "Returning Data
  Beside a Route" (the pagination example and its tip).

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example this change touched, review its report against the code, and commit it as its own commit.

## Done when

- `call()` and `batch().call()` return the 3-slot result; slot 2 is nested and typed from the API's
  middleware map, with no rise in the client's type-budget numbers beyond what the map itself costs.
- Client-made errors appear in the `response['@thrownErrors']` array.
- The contract suite, the client CLAUDE.md slot rules, every example and the client pages use the
  new slots; nothing names the old slots.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched
  source file, each committed on its own.

## Plan (approved 2026-10-01)

Decisions taken with the user while planning:

- Slot 2 is always defined. Per attempt, as soon as the body arrives: decode it, turn ids into nested
  objects, then move each `validation-error` from the server's `@thrownErrors` record to its own path.
  That one object is shared by the rest of the dispatch and returned; a retry starts a new one.
- Strongly typed goes to its path: every body value (the route's own entry too), declared errors,
  validation errors from the server or the client, and a middleware answer sent as HTTP headers.
- Everything else goes to the `@thrownErrors` array, every one kept, in the order it happened: the
  server's other thrown errors (ids dropped), platform error, timeout, abort, network failure, a failed
  `onRequest` / `onResponse` / `onError` hook, `route-metadata-not-found`, a `validateServerResponses`
  failure (its wrong answer is removed from its path), a decode failure (`deserialization-error`, which
  used to land in the typed slot), and the bundled API, API version and metadata cache errors.
- Hooks do not see slot 2: a hook only handles its own middleware.
- Each middleware's type is its whole return or a `ValidationError`. The type names middlewares only;
  routes are slot 0.

Build: `types.ts` (3-slot `Result` / `BatchResult`, `ClientResponse<RA>` built like `ClientMiddlewares`),
a new `lib/clientResponse.ts` (nesting and path helpers), `dispatch.ts`, `batch.ts`, `serializer.ts`,
the client CLAUDE.md slot rules, the contract suite and every test, example and page that read the old
slots. Type cost measured with the type-budget package before and after.

## What shipped

- As planned. Details the plan did not name:
  - `RouteSubRequest`'s API parameter now defaults to `any`, so a route typed by a real API still fits a
    `RouteSubRequest<any>` once its result names that API's response type.
  - Every failing `onResponse` / `onError` hook is reported in `@thrownErrors`, not only the first one.
  - `ClientCallContext.response` is now slot 2; the HTTP `Response` moved to `httpResponse`.
  - Response keys are untrusted: a `__proto__` segment, a top-level `@thrownErrors` key or a walk into a
    non-object never becomes a path, and such an error goes to `@thrownErrors` instead.
  - A middleware answer sent only as HTTP headers is checked by `validateServerResponses` even after another
    error, since the headers prove it ran.
  - The bundled API, API version and metadata cache errors are added to `@thrownErrors` last, not when they
    happen (decided not to matter: they rarely meet another untyped error).
- Found and fixed on the way: on the fetched lane a headers answer was checked with functions the server never
  sends, so any route answering in headers crashed the whole response under `validateServerResponses`
  (`@mionjs/core` `routesCache.getMethodJitFns`, now the return's own functions, as the server does).
- A missing auth header (the server's headers validation) is the auth middleware's validation error, so it
  sits at `response.auth`, never in `@thrownErrors`.
- Type cost (type-budget package, `5 + initClient` step): 3065 before, 3080 after. The map itself costs about
  30; the shorter result saves 15. The next step (`6 + db query`) moved by 4 in every dialect without touching
  the query, and its budget records that as a reviewed exception.
- The repo contract that kept the old slot from being called "fatal" was removed with the slot.
