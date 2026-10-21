---
type: feature
spec: guidelines
status: done
created: 2026-09-24
---

# Client Middleware onCall Replaces prefill

## Intent
`middleware(params).prefill()` is the wrong abstraction: it sends the middleware once and restores cached params. A middleware runs on EVERY request on the server, so the client should declare a callback that also runs on every request:

    middlewares.auth.onCall((call) => call({headers: {Authorization: token}}));

The callback runs before each request that includes that middleware and returns its params. It sits beside the existing persistent `onError` / `onSuccess` handlers. `prefill()` is removed, not deprecated.

This is step 1 of 3 of the client middleware chain: the route sync and metadata todos build on `onCall`.

## Direction
- `prefill()` lives in `packages/client/src/subRequest.ts:50` and `packages/client/src/client.ts:298`; the prefill cache (`prefilledMiddlewaresCache`) and restore logic in `packages/client/src/request.ts` (restore ~line 432, `routes-cant-be-prefilled` error ~line 494) all go.
- `onCall` registers on the same persistent registry `onError` / `onSuccess` use (`handlersRegistry`), keyed by middleware id.
- A per-call `middleware(params)` passed to `.call()` should still win over the `onCall` value for that one request (implementer confirms).
- `call` is the same strongly typed middleware function the client already exposes (`middlewares.auth(params)`), so params are type checked. Or it could be the sub request itself; implementer decides. Either way the user decides per request whether to call it: not calling means the middleware sends no params on that request.
- The callback probably also receives the root request, with all its sub requests, so it can read the whole call context (which route, which other middleware):

      middlewares.auth.onCall((call, request) => call(tokenFor(request)));

- Analyse whether the client's request object (`MionClientRequest`) should be renamed to something like `CallContext` now that user code sees it.
- Support both sync and async callbacks from the start (a token refresh needs async). First check for big downsides, for example an extra await on every request even when all callbacks are sync; if one is found, raise it with the user before building.
- Decide what happens when the callback throws or its promise rejects.
- The implementer plans the details.

## Docs
- `01.rpc/03.client/00.client-overview.md`: rewrite existing section "Prefilling Middleware Data" as an onCall section.
- `01.rpc/03.client/01.error-handling.md`: rewrite existing section "Prefill vs Call with Middleware".
- `01.rpc/03.client/05.bundled-api.md`: drop prefill mentions.
- Examples: `packages/examples/src/client/client-prefill-middlewares.ts` (rename), `client.ts`, `client-usage.ts`, `client-full-example.ts`, `introduction/client.ts` (home page).

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example this change touched, review its report against the code, and commit it as its own commit.

## Done when
- `prefill` is gone from the client source, types, tests, examples and docs (a grep finds nothing).
- `onCall` runs on every request that includes the middleware and gets the root request, with tests for that, for type-checked params, for a callback that chooses not to call, for a per-call override, for sync and async callbacks, and for a throwing or rejecting callback.
- The request vs call-context naming was analysed and the decision recorded in the moved spec.
- `pnpm test` and `pnpm run lint` pass.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched source file, each committed on its own.

## Plan — onRequest / onResponse / onError (approved 2026-09-25)

### Context
`middlewares.auth(params).prefill()` stores params once and replays them. A middleware runs on every request on the server, so the client should ask for its params on every request instead:

```ts
middlewares.auth
  .onRequest((auth, context) => auth({headers: {Authorization: getToken()}}))
  .onResponse((session) => ...)
  .onError('not-authorized', () => logout());
```

**Naming (chosen by the user):** `onRequest` / `onResponse` / `onError`, the ofetch / openapi-fetch style. `onSuccess` / `offSuccess` are renamed to `onResponse` / `offResponse` everywhere (breaking, no alias). Removal: `offRequest`, `offResponse`, `offError`. `onResponse` still fires only for a successful middleware result; declared errors go to `onError` (docs say so).

`prefill()` / `removePrefill()` are removed (not deprecated). This is step 1 of 3; the route-sync todo builds on it.

### Where the hooks live (option B, chosen)

Hooks live only on the middleware function. The sub request is just params. Inside `onRequest`, the first argument is a plain function that returns `void`: calling it records this request's params, not calling it sends nothing.

```ts
middlewares.session
  .onRequest((session, context) => session(currentToken()))  // session: (token: string) => void
  .onResponse((info) => ...)                                  // after each success
  .onError('session-expired', (e) => ...);                    // after each declared error

// async works the same way
middlewares.auth.onRequest(async (auth) => auth({headers: {Authorization: await refreshToken()}}));

// inline, per call: params only, no hooks on this object; it wins over onRequest for this call
await routes.getUser(1).call({middlewares: {session: middlewares.session('abc')}});

middlewares.session('abc').onError   // ✗ removed (type error)
```

### Design decisions
- **Where it lives:** on the middleware function itself (`middlewares.auth.onRequest`). The `MethodProxy.get` trap answers `onRequest` / `offRequest` / `onResponse` / `offResponse` / `onError` / `offError` on the middlewares proxy only (it becomes its own root proxy, `routes.*` untouched). Types: each middleware leaf in `ClientMiddlewares` becomes `((...params) => MiddlewareSubRequest) & MiddlewareHooks`. Option B removes `events()` / `onError` / `offError` / `onSuccess` / `offSuccess` from `MiddlewareSubRequest` and `MionSubRequest`.
- **`call` argument:** typed `(...params: Parameters<H>) => void`, so params are type checked. The callback's own type is `(call, context: CallContext) => void | Promise<void>`. At runtime `call` builds the sub request and keeps it for this request; called twice, the last call wins; a call after the callback's promise settled is ignored. Not calling it sends nothing.
- **Returns `TypedEvent`**, so `.onError()` / `.onResponse()` chain exactly like `prefill()` did.
- **Second argument `context`:** the root request typed as a new public read-only interface `CallContext` (`route`, `batchSubRequests`, `subRequestList`, `signal`, `options`). `MionClientRequest` implements it; the class keeps its name because it is internal and carries retry state users must not touch. Decision recorded in the moved spec.
- **When it runs:** once per `.call()` / batch call, for every middleware in the route chain (cached metadata `middlewareIds`), or by group scope on the first optimistic call (same rule prefill used, `isMiddlewareInScope`). A retry does not re-ask (a per-request `Set` of asked ids).
- **Per-call override:** a middleware passed in `call({middlewares})` wins; its `onRequest` is not run.
- **Sync + async:** callbacks run in chain order; only when one returns a promise does the request `await Promise.all`. No extra wait when all are sync, and `makeCall` already awaits elsewhere, so no real downside. Abort is re-checked after the await.
- **Throw / reject:** the request is not sent. The error goes to the `undeclared` slot: an `RpcError` thrown by the callback passes through as-is; anything else becomes `RpcError{type: 'middleware-on-request-failed'}` with the original error attached. `onError` listeners do not fire (it is not a declared error).
- **Registry:** `HandlersRegistry` gains `registerRequest` / `unregisterRequest` / `getRequestHandler` (and `registerSuccess` etc. renamed to `registerResponse`); `clearHandlers` and `clearAll` (`client.destroy()`) clear it too.
- **Bundled builds:** no metadata slot needed on `onRequest`; a route's build-injected site already bundles its whole middleware chain. `prefill` is dropped from the Go dispatch-point list.

### Changes
- `packages/client/src/client.ts`: drop `prefilledMiddlewaresCache`, `pendingPrefills`, `prefill`, `removePrefill`; pass the registry to `MionClientRequest`; separate middlewares root proxy with `onRequest`/`offRequest`.
- `packages/client/src/request.ts`: replace store/restore/scoped-restore prefill code with `runOnRequestHandlers(ids)` (chain) and a scoped variant (optimistic); remove `prefill`, `removePrefill`, `routes-cant-be-prefilled`.
- `packages/client/src/subRequest.ts`: drop `prefill`, `removePrefill`, `events`, `onError`/`offError`/`onSuccess`/`offSuccess` (option B).
- `packages/client/src/types.ts`: drop `prefill`, `removePrefill`, `PrefilledMiddlewaresCache`; add `CallContext`, `OnRequestHandler`, `ClientMiddleware` leaf type; export from index.
- `packages/client/src/lib/handlersRegistry.ts`, `constants.ts` (`DEFAULT_PREFILL_OPTIONS` → `DEFAULT_CLIENT_OPTIONS`), `lib/sanitize.ts` comment.
- Go: `ts-go-runtypes/internal/compiler/apimeta/discover.go` drops `"prefill"`; fixtures in `apimeta_test.go`, `resolver/apigen_test.go`, comment in `marker/marker.go`, `apimeta.go`; `packages/run-types/src/markers.ts` comment; `packages/devtools/test/vite/bundledApiBuild.spec.ts`. Rebuild `mion-bin/mion`.
- `packages/client/src/lib/typedEvent.ts`: `onSuccess`/`offSuccess`/`hasSuccessHandler` → `onResponse`/`offResponse`/`hasResponseHandler`; `SuccessHandler` type → `ResponseHandler`.
- `packages/client/README.md`, `packages/client/CLAUDE.md`, example route comments that say `onSuccess`.
- Sibling todos: `onCall` → `onRequest` in `route-sync-inside-oncall.md` (renamed `route-sync-inside-onrequest.md`) and `metadata-fetch-as-one-middleware.md`; prefill/onSuccess wording in `match-2-client-call-outcome-and-match.md`.
- `container/pre-publish-e2e/mion-consumer` tests + `client-app/src/batchFlow.ts` move to `onRequest`.

### Tests (Vitest, `packages/client/test/`)
- Existing prefill tests (client, batch, errorDispatch, bundled, oneProgram, sanitize, serializer.compact) move to `onRequest` / `offRequest`.
- `onSuccess` tests renamed to `onResponse` and moved onto the middleware function; one test that `middlewares.auth.onError(...)` fires for an inline middleware passed in `call({middlewares})`.
- New `onRequest` block pinning: runs on EVERY request with the middleware (counted over 3 calls, and a batch) and gets the context (route id, batch routes); a group-scoped middleware is not asked for a route outside its group; callback that never calls `call` sends nothing (server rejects); calling twice keeps the last params; per-call `middlewares` override wins and the callback is not run; sync and async callbacks; throw and reject land in `undeclared` with no fetch; `offRequest` and `destroy` stop it; first optimistic call stays one round trip.
- `types.spec.ts`: `call` params type checked (`@ts-expect-error` on wrong params), `call` returns `void`, `context` is `CallContext`, the sub request has no `prefill` / `onError` / `onResponse`.
- Go: `go -C ts-go-runtypes test ./internal/... ./cmd/...` with fixtures using a middleware `.typeErrors()` site instead of `.prefill()`.

### Docs
- `01.rpc/03.client/00.client-overview.md`: rewrite "Prefilling Middleware Data" as "Sending Middleware Data on Every Call" (onRequest); fix the features table row and the event handlers table.
- `01.rpc/03.client/01.error-handling.md`: rewrite "Prefill vs Call with Middleware" as "onRequest vs Call with Middleware", fix links.
- `01.rpc/03.client/05.bundled-api.md`: drop the prefill mention.
- Examples: `git mv` `client-prefill-middlewares.ts` → `client-middleware-hooks.ts` and `prefill.routes.ts` → `middleware-hooks.routes.ts`; update `client.ts`, `client-usage.ts`, `client-full-example.ts`, `introduction/client.ts`.

### Fuzzing
Not a candidate: this is request wiring, there is no round-trip or reference oracle.

### Finish
- `pnpm test`, Go tests, `pnpm run lint`, `pnpm run format`, `pnpm exec vitest run website-links`.
- Append the approved plan to the spec, record the naming and `CallContext` decisions, `git mv` it to `docs/done/client-middleware-onrequest.md`.
- `docs-simplifier` and `comments-simplifier` subagents in parallel, each committed on its own (`docs(simplify):`, `chore(comments):`).
- Push to `claude/youthful-carson-hvilyd`. PR (only if asked) labelled `website` + `pre-publish-e2e`.

### Done when (from the spec)
- `grep -ri prefill` finds nothing in client source, types, tests, examples and docs.
- `onRequest` tests: every request, root request, typed params, not calling, per-call override, sync + async, throw + reject.
- Naming analysed and recorded.
- `pnpm test` and `pnpm run lint` pass; both simplify passes committed on their own.

## Plan amendment — onRequest is the only way to send middleware data (approved 2026-09-25)

- `call({middlewares})` on a route and on a batch is removed. `CallSetup` keeps only `signal` and `timeout`.
- The result stays a 5-tuple. Slots 3 and 4 (`middlewareResults`, `middlewareErrors`) are keyed by middleware id and loosely typed (`Record<string, unknown>` / `Record<string, RpcError<string>>`), so a route caller can still inspect any middleware outcome.
- `middlewares.auth` is hooks only (`onRequest` / `offRequest` / `onResponse` / `offResponse` / `onError` / `offError`). Calling it directly is a type error; the typed `call` inside `onRequest` is the only way to pass params. Middleware `typeErrors()` goes with it.
- Replaces the earlier "per-call override" decision: there is no per-call middleware value any more. Per-call data comes from the `context` argument of `onRequest`.
- Extra docs: the "Passing Data to Middleware" section of `00.client-overview.md`, and the examples `client-using-middlewares.ts`, `batch-with-middlewares.ts`, `cancellation-with-middlewares.ts`.

## What shipped (2026-09-25)

- `prefill()`, `removePrefill()` and `call({middlewares})` (route and batch) are gone. A middleware gets its params only from `middlewares.x.onRequest((call, context) => ...)`, sync or async. `middlewares.x` is hooks only: `onRequest` / `offRequest` / `onResponse` / `offResponse` / `onError` / `offError`. `onSuccess` became `onResponse`.
- `call` is typed `(...params) => void`. Not calling it sends nothing; the last call wins; a call after the hook finished is ignored. Each hook runs once per request (a retry never asks again), for the middlewares in the route chain, or by group scope on a first optimistic call.
- A hook that throws or rejects stops the request before any fetch. A thrown `RpcError` lands in `undeclared` as is; anything else becomes `middleware-on-request-failed`. `onError` listeners never see it.
- The result keeps 5 slots. Slots 3 and 4 are keyed by middleware id and loosely typed.
- **Naming decision:** `MionClientRequest` keeps its name; it is internal and carries retry state. User code sees it only as the new public read-only `CallContext` interface (`route`, `batchSubRequests`, `subRequestList`, `options`, `signal`), which the class implements.
- **Found during the work and fixed here:** after a build-version mismatch, the verify subrequest was loaded and validated as a method once hooks had added middlewares. Only the call's own ids plus the hook-added ids are loaded and validated now.
- The build no longer treats `.prefill()` as a dispatch point (`ts-go-runtypes/internal/compiler/apimeta/discover.go`); a route site already bundles its middleware chain.
