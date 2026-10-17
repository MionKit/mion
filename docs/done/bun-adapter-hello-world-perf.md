---
type: fix
spec: guidelines
status: done
created: 2026-10-14
---

# Close the Bun hello-world gap with elysia and hono

## Intent

On the server benchmarks (2026-10-14 full run, Apple M2 Pro), mion on Bun trails the other Bun
frameworks most where mion's own overhead is all that is measured:

| Test | mion.bun | hono.bun | elysia.bun |
| --- | --- | --- | --- |
| hello-world (req/s) | 113,926 | 140,049 | 223,071 |
| light-validation | 84,946 | 83,806 | 101,294 |
| heavy-validation | 55,651 | 46,409 | 59,195 |

The gap shrinks as validation work grows, so the cost is probably per request in the Bun adapter or the
router dispatch, not in validation. Review mion's Bun path against elysia (and hono) and find what
can be made faster without changing mion's behavior.

## Direction

The implementer investigates and plans the details. Starting points:

- mion's Bun adapter: `packages/platform-bun/src/bunHttp.ts` (`bunRequestHandler`): per-request
  `new Headers(getResponseDefaults(...))`, URL slicing, `resolveExecutionChain`, `createContextFromChain`,
  `dispatchWithContext`, the async/await chain, and `reply`.
- Verified lead: the hello-world test sends `GET /hello` with no body, yet every route chain is built with
  `readsBody: true` (`packages/rpc-router/src/router.ts`, where the route's execution chain is assembled), so
  the adapter still awaits `readRequestBody` per request. A chain whose methods take no params could skip it.
  The `/hello` chain is `mionDeserializeRequest` → `hello` → `mionSerializeResponse`, all sync, no other middleware.
- The benchmark apps: `container/mion-bench/apps/mion/server-bun.ts` + `routes.ts`, against
  `container/mion-bench/apps/elysia/server-bun.mjs` and `container/mion-bench/apps/hono/server-bun.mjs`.
  First check the lanes do the same work (method, route shape, response body and headers), so the gap is
  not a test difference.
- Read how elysia gets its speed (its ahead-of-time compiled handlers, use of `Bun.serve` native routes,
  static responses, sync vs async handlers) and decide which ideas fit mion's design.
- Profile before changing anything (Bun's profiler or `bun --cpu-prof` on the bench app); measure
  with `pnpm miondevx bench servers one mion.bun` and `repeat` to check the run-to-run spread.
- Any router-level win should be checked on the Node and uWebSockets lanes too, and must not
  regress them.
- Every lane must still answer correctly and reject an invalid payload.

## Docs

Server benchmark pages under `container/website/content/03.benchmarks/02.rpc/` only if a stated
explanation of the Bun numbers changes; otherwise none, because only the regenerated data moves.

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example
this change touched, review its report against the code, and commit it as its own commit.

## Done when

- The cause of the gap is found and written up in the PR, with profiles.
- Whatever is fixable is fixed: mion.bun hello-world clearly closer to hono.bun / elysia.bun across
  repeated runs, no regression on the other mion lanes, all mion tests green.
- Server benchmark data regenerated.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched
  source file, each committed on its own.

## Plan: sync dispatch for sync routes (approved 2026-10-15)

- Elysia check (1.4.22 `dist/compose.mjs`): a route with no body and only sync handler + hooks compiles to a
  plain function that hands Bun a `Response` directly (`${maybeAsync ? "async " : ""}function handle(c)`).
  mion does the same, but only where its own rules already allow it.
- The existing `alwaysAwait` option keeps control. The router honours it only with an async handler
  (`alwaysAwait = routerOptions.alwaysAwait && hasAsyncMethods`). When it is in effect, nothing changes.
- Sync path only when `getAlwaysAwait()` is false and no member of the chain is `isAsync`. A member that still
  returns a promise switches to the async loop from that member on (the existing safety net).
- Bun adapter: no `async` wrapper; a request with no body never awaits the body read. With a body: unchanged.
- Not done: `readsBody: false` for no-params routes, or dropping the deserialize step from their chain. Either
  would let a broken JSON body succeed where it errors today.
- Node + uWS adapters adopt the sync dispatch only if it measurably helps without a regression.
- Bun native `routes` only if routing is still a real share of the cost after the above.

## What shipped

Cause: on `GET /hello` the Bun lane spent most of its JS time in promise machinery, not in mion's work. CPU profile
of the bench app (`bun --cpu-prof-md`, before): the async wrappers `bunRequestHandler` ~36%,
`dispatchWithContext` ~21%, `readRequestBody` with no body to read ~5%, `runExecutionChain` ~4%; Bun's native
`Response.json` 17%, `new Headers` 8%; context + route lookup + handler + serialize ~5%. The lanes do the same work
(same method, path, body and header count), so the gap was not a test difference.

- Router: `dispatchMaybeSync` (new export, `packages/rpc-router/src/dispatch.ts`). With `getAlwaysAwait()` true it is
  the old async loop. Otherwise it runs the chain with no await, and at the first step that is `isAsync`, or turns
  out to return a promise (the existing safety net), the rest of the chain goes to the async loop. Both loops share
  the per-step code (`applyResult`, `isUncheckedPromise`); `dispatchWithContext` is unchanged.
- Router (decided with the maintainer after review): `alwaysAwait` is now the option as written. `true` (the
  default) awaits every step on any router, so the event loop keeps turning; the old rule that ignored it for a
  router with no async method is gone, and so is the `hasAsyncMethods` flag behind it. The sync path only runs
  with `alwaysAwait: false`, which the mion bench lanes now set (their handlers are all sync).
- Bun adapter: `bunRequestHandler` is no longer `async` (return type `Response | Promise<Response>`, marked
  breaking). A request with no body skips the body read; both paths then go through `dispatchMaybeSync`, which
  answers with a `Response` when the chain is all sync and with a promise otherwise.
- uWS adapter: an all-sync chain replies inside the uWS callback, no promise.
- Node adapter: tried, no measurable gain at the time (host A/B with the trial build: 37.1k vs 36.5k req/s on
  hello-world). A later change moved it to `dispatchMaybeSync` too; `dispatchWithContext` now goes through it as well.
- Measured and dropped: Bun native `routes` (within noise of the in-JS lookup on a bare Bun server); a plain
  object instead of `Headers` for the reply (within noise, and it would change `Set-Cookie` and bad-value handling).
- Docs: the "Awaiting Every Step" section of the routes page now says when mion awaits and when it answers
  without a promise.

Results on a 4-core cloud box (slower than the M2 Pro in the intent table). Host A/B with wrk on the final code,
old and new bundles alternating, 3 rounds of 8 s each (Bun heavy 9 rounds), average req/s with the round range:

| Lane | hello-world | light-validation | heavy-validation |
| --- | --- | --- | --- |
| mion.bun | 53.0k (49.8-56.3) → 64.9k (60.9-67.4) | 40.2k (39.2-41.8) → 41.3k (39.4-43.6) | 28.7k (25.8-32.3) → 29.0k (27.5-31.0) |
| mion.uws | 62.1k (59.0-65.0) → 68.0k (66.9-69.4) | 44.8k (43.0-48.1) → 47.8k (45.7-49.3) | 26.2k (25.2-27.5) → 26.2k (25.4-26.7) |
| mion (node) | 36.3k (34.4-38.3) → 36.3k (35.2-37.7) | 25.1k (24.5-25.4) → 25.5k (24.3-26.7) | 17.5k (17.0-18.3) → 17.4k (16.5-17.9) |

Container bench before the review fixes (`bench servers suite hello-world`), one run each: mion.bun 47.1k → 55.5k,
hono.bun 56.5k → 56.1k, elysia.bun 85.5k → 88.0k. `repeat mion.bun hello-world`: 46.0k-47.1k → 49.9k-51.8k.
`repeat mion.uws hello-world`: 57.2k-59.2k (old) against 59.9k-64.3k and 65.0k-68.4k (new). mion.bun now matches
hono.bun on hello-world.

What still separates mion.bun from elysia.bun is mion's own per-request work (a context object, the chain, a
`Headers` object, the route-keyed response body) and Bun's reply cost, none of it promise overhead. Shipped in
part: building the reply headers only when needed is left to its own todo. The website's
benchmark data regenerates on deploy; nothing is committed for it.
