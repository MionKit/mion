---
type: chore
spec: guidelines
status: done
created: 2026-09-25
---

# Split the Client Request Into a Call Context and a Dispatcher

## Intent
`MionClientRequest` (`packages/client/src/request.ts`, ~630 lines) mixes three things: the request data, the retry state of one call, and all the dispatch logic. Split it the way the router already does (`packages/router/src/callContext.ts` builds plain data, `packages/router/src/dispatch.ts` runs it):

- **Call context**: plain data, and the exact object `onRequest` hooks receive as `CallContext`. Today they get the class instance typed as `CallContext`, so a cast reaches `addSubRequest()` and the retry flags.
- **Dispatcher**: preparing, running `onRequest` hooks, sending, retries, sync refusals, resolving results, building the result tuple.

No behaviour change. It also gives the upcoming work that moves route sync and the metadata fetch into `onRequest` hooks a clean dispatcher to change, so do this first.

## Direction
- Data today on the class: `path`, `requestId`, `route`, `batchSubRequests`, `subRequestList`, `options`, `signal`, `response`, `thrownErrorIds`.
- Retry state for one call today on the class: `purgedStaleMetadata`, `retriedAfterMismatch`, `verifying`, `resentWithSyncIds`, `askedRequestHandlers`. It belongs to the dispatch, never to the context users see.
- `buildResult` and the middleware response handling live in `MionClient` (`packages/client/src/client.ts`); they move to the dispatch side, leaving `MionClient` with the proxies, signal composition and the handlers registry.
- The `lib/` helpers (`serializer.ts`, `validation.ts`, `sanitize.ts`) read only `options` and `subRequestList`, so they take the call context instead of the class.
- Keep the `// type-call-context-start/end` region in `packages/client/src/types.ts`: the error-handling page imports it.
- Mirror the router's file names and function shape where it fits; the implementer plans the details.

## Docs
None, because nothing a user sees changes. If the public `CallContext` fields change, update its type reference on `01.rpc/03.client/01.error-handling.md` (existing section "Type Reference").

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example this change touched, review its report against the code, and commit it as its own commit.

## Done when
- The context `onRequest` receives is plain data with no methods and no retry state.
- The dispatch logic and `buildResult` live in their own module; `MionClient` no longer builds results.
- `lib/` helpers take the call context.
- All client tests pass unchanged (client, bundled and mixed projects), plus `pnpm test` and `pnpm run lint`.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched source file, each committed on its own.

## Plan (approved 2026-09-25), as shipped
- `packages/client/src/callContext.ts`: `ClientCallContext` (declared in `types.ts`, extends the public `CallContext` with `path`, `requestId`, a mutable `subRequestList`, `thrownErrorIds`, `response`), built as a plain object by `createCallContext`. Helpers are plain functions: `addSubRequest`, `getRouteIds`, `getRoutePointers`. `batchId` only feeds the batch `path`.
- `packages/client/src/dispatch.ts`: `dispatchCall(context, handlersRegistry)` runs the call, the middleware `onResponse` / `onError` hooks and `buildResult`; `dispatchTypeErrors(options, subRequests)` replaces `validateParams`. The retry flags live in a per-call `DispatchState`, never on the context. `isMiddlewareInScope` moved here.
- Header wire helpers (`extractRequestHeaders`, `reconstructHeadersSubsetFromResponse`) moved to `lib/headers.ts`.
- `MionClient` keeps its name (it is the client instance; the proxy is `MethodProxy`). `execute` composes the signal, creates the context and calls `dispatchCall`; it no longer builds results.
- `lib/serializer.ts`, `lib/validation.ts`, `lib/sanitize.ts` take the public `CallContext`.
- `request.ts` is gone; `index.ts` exports the two new modules instead, so `MionClientRequest` left the public exports.
- Tests: existing client tests unchanged except the `isMiddlewareInScope` import path. New test in `test/onRequest.spec.ts` pins the hook context as a plain object with no methods and no retry keys.
- Public `CallContext` fields did not change, so no docs change.
