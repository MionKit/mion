---
type: fix
spec: guidelines
status: ready
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
