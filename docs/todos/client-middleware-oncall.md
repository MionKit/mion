---
type: feature
spec: guidelines
status: ready
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
