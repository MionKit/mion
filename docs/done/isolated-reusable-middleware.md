---
type: feature
spec: full-plan
status: done
created: 2026-09-25
---

# Isolated Reusable Middleware

## Intent
A middleware that needs code on both ends (auth refresh, CSRF, route sync, route metadata) should ship as one isolated, reusable unit: a server handler the user places in the routes object like any middleware, plus a client installer that receives the strongly typed `middlewares.x` and sets its hooks. mion's own route sync and metadata fetch then move onto this same shape, explicit and checked, instead of being added by the router and hand-wired in the client.

First step of the client middleware chain: route sync moves onto this shape next, metadata fetch last.

## Problem
- An isolated reusable middleware (auth refresh, CSRF, route sync, metadata: code on both ends, shipped as one unit) has no shared shape for its client half. mion's own two are special cases: they are added by the router itself and hand-wired in the client (`dispatch.ts` L122-177 before send, L223-248 after, `handleSyncRefusal` L284).
- A client hook cannot resend a call, which route sync needs (refusal → learn → resend), so a built-in cannot be written with the public hooks today.
- Nothing tells the user at build time that a middleware the server needs has no client hook. Required params do fail today, but only at runtime, as a `validation-error` (`packages/rpc-client/src/lib/validation.ts:13-30`).

## Plan

**A. The pattern: a server handler plus a client installer, in separate entry points**
```ts
// server entry: just the handler
export function csrf(ctx: CallContext, token: string): CsrfError | void { ... }

// client entry: gets the typed middleware, sets its hooks. Imports only TYPES from the server side.
export function useCsrf(mw: ClientMiddleware<typeof csrf>) {
  mw.onRequest((call) => call(readCsrfCookie()));
  mw.onError('csrf-expired', async (err, ctx) => { await refreshCsrf(); ctx.retry(); });
}

// app server: placed like any middleware, root or scoped
const api = mion.initRoutes({csrf: mion.middleware(csrf), users: {...}});

// app client: explicit, typed, placement agnostic (works for middlewares.users.csrf too)
useCsrf(middlewares.csrf);
```
- `ClientMiddleware<typeof handler>` accepts the handler function type directly (today it takes a `PublicHandler`, `packages/rpc-client/src/types.ts:231`), so a client entry needs no runtime import of `@mionjs/router`.
- **New hook ability: `ctx.retry()`** in `onResponse` / `onError`: resend the whole call, at most once per middleware per call. It reuses `retryWithProperSerialization` and the once-flags on `DispatchState` (`dispatch.ts:46-63, 308`).
- **Retry is only allowed when resending cannot run a side effect twice.** The client reads the route kind from the route metadata:

  | Route kind | Route did not run (refused before it, for example a middleware `FatalError`) | Route ran (result or declared error in its slot) |
  |---|---|---|
  | `query()` | retry | retry |
  | `mutation()` or plain `route()` | retry | refused |

  A batch retries only if every route in it passes. A refused `retry()` returns `false` and the call resolves with its current result. This extends the rule `makeCall` already follows ("only a FAILED call is repeated", `dispatch.ts:~239`).
- The public hooks are then enough to write route sync (a refusal means no route ran). Metadata may still need internal-only hooks; its own todo decides.

**B. mion's built-ins follow the same pattern (direction for the two follow-up todos)**
```ts
// server
import {mionSyncRoutes} from '@mionjs/router/middlewares';   // an entry, like any middleware
mion.initRoutes({...mionSyncRoutes, ...routes});
// client
import {useSyncRoutes} from '@mionjs/client/middlewares';
useSyncRoutes(middlewares['mion@syncRoutes']);
```
Once they sit in the routes object they show up in the typed `middlewares`, so the checks in C work for them with no special case. This todo only adds the two entry points and proves the pattern with a fixture; moving sync and metadata is the follow-up todos' job.

**C. Missing client half: what fails and where**
| Case | Build (bundled API compile) | Runtime |
|---|---|---|
| Middleware in a called route's chain with a required param, never touched on the client | Error (new code) | `validation-error` before send (unchanged) |
| Same, only optional params | Warning (new code), silenced with `@mion-expect-error` on the `initClient` line | nothing sent |

Build side (Go resolver, `ts-go-runtypes/internal/compiler/apimeta/`):
- Record whether a middleware has a required param, beside `Method.Params` (`tree.go:30`).
- "Touched on the client" means the program reads that middleware off the typed `middlewares` object anywhere (an `onRequest` call, or passing it to an installer like `useCsrf`). The resolver finds these reads by type, like it finds call sites today (`discover.go:26-43`).
- For each middleware in the chain of a route the program calls (`Tree.Select`, `tree.go:283-302`) that is never touched: `MET008` (LevelRuntimeError) when a param is required, `MET009` (LevelWarning) when all are optional. Add them in `internal/diagnostics/codes_apimeta.go` and `messages.go`; devtools already prints them and halts on errors (`packages/devtools/src/core/unplugin.ts:1131`).

**D. Distribution**
- mion ships its own as separate entry points: client halves in `@mionjs/client/middlewares`, server halves in `@mionjs/router/middlewares`. A client app never imports the router, and the main entries stay lean. This todo adds both `exports` entries, their builds, and the typecheck coverage (`pnpm run check:typecheck-coverage`).
- Shared protocol types (for example `RouteSyncError`, today imported from the router in `packages/rpc-client/src/lib/syncRoutes.ts:12`) move to `@mionjs/core`.
- Community middleware: the layout is the author's choice. The docs only advise keeping the client half in its own entry point, so a client importing it does not pull in the router.
- Proof: a CSRF-style fixture pair in the test server (`packages/private-test-server`), client half and server half in separate files, used by the client tests.

## Tests
- Client (`packages/rpc-client/test/`): an installer's hooks run like app hooks; `ctx.retry()` resends once, never twice; one test per cell of the retry table (query ran, mutation ran = refused, plain route ran = refused, route refused before running), plus a batch mixing a query and a mutation; a scoped placement (`middlewares.users.csrf`) works with the same installer; `ClientMiddleware<typeof handler>` type checks params (`types.spec.ts`, `@ts-expect-error` on wrong params).
- Fixture client entry imports nothing from `@mionjs/router` at runtime (read the built entry graph, like `test/bundleSplit.spec.ts`).
- Go (`apimeta` tests): MET008 for a required untouched middleware, MET009 for an optional one, none when touched by `onRequest` or by passing it to an installer; `@mion-expect-error` silences MET009.
- Devtools: a bundled-API build fails on MET008 (`packages/devtools/test/vite/bundledApiBuild.spec.ts`).

## Docs
- `01.rpc/03.client/00.client-overview.md`: section "Sending Middleware Data" gains `ctx.retry()`; new section "Isolated Reusable Middleware" (installer pattern).
- `01.rpc/02.server/02.middleware.md`: new section "Sharing a Middleware" (handler plus client installer, and a tip to keep the client half in its own entry point).
- Examples in `packages/private-examples/src/` for both.

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example this change touched, review its report against the code, and commit it as its own commit.

## Fuzzing
Not a candidate: wiring, no oracle.

## Out of scope
Moving route sync and metadata to this pattern (their own todos). CORS middleware (own todo).

## Done when
- `ctx.retry()`, `ClientMiddleware<typeof handler>`, and the `@mionjs/client/middlewares` + `@mionjs/router/middlewares` entry points shipped and tested.
- MET008 / MET009 reported by the bundled API build.
- Fixture middleware pair works end to end, no client→router runtime import.
- `pnpm test`, `go -C ts-go-runtypes test ./internal/... ./cmd/...` and `pnpm run lint` pass.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched source file, each committed on its own.

## What shipped (2026-09-25)

Where the build diverged from the plan above, this section is the record.

- **Installer type:** `ClientMiddlewareOf<typeof handler>`, not `ClientMiddleware<typeof handler>`. `ClientMiddleware<PH>` already takes the client side handler shape, so a second name converts the server handler (drops `ctx`). `rawMiddleware` has no client side and is skipped everywhere.
- **`ClientMiddleware` gained a type-only `Id` argument** (`ClientMiddleware<PH, Id>`), filled by `ClientMiddlewares` with the key path, the same way `ClientRoutes` carries a route id. No runtime change; the build reads it.
- **Retry rule, as built (`packages/rpc-client/src/dispatch.ts`, `isRetrySafe` / `routeSucceeded`):** a `query()` always retries. A `mutation()` or plain `route()` retries only when it did not succeed: the route answered an error, or it answered nothing in a response carrying any error. Nothing sent yet also allows it. A batch needs every route to pass. `retry()` returns `false` when refused. The route's position in its chain was considered (a new metadata field) and dropped: the rule above needs no metadata change. Known and pinned: a void mutation that ran, followed by an error from a later middleware, counts as failed and is resent.
- **Response handlers:** `onResponse` / `onError` get `(value, context: MiddlewareContext)`; their return type is `unknown` so existing arrow hooks that return a value keep compiling. A promise is awaited. A hook that throws or rejects lands in `undeclared` as `middleware-on-response-failed` or `middleware-on-error-failed` and cancels any retry. New names say middleware, never hook: hook is kept for real lifecycle hooks later. A retry resets the call and runs every `onRequest` again (a refreshed token is sent), and hooks fire once per attempt.
- **Build checks:** `MET008` (`LevelRuntimeError`) and `MET009` (`LevelWarning`) are anchored at the FIRST call to a route whose chain runs the middleware, not at `initClient`; `@mion-expect-error` on that line silences them. A middleware counts as set up when any file of the client program reads it off `middlewares` (dot, bracket, nested or destructured name); files that never spell `middlewares` are skipped. `Method.NeedsParams` in the Go tree marks a required param or a required header.
- **Entry points:** `@mionjs/router/middlewares` and `@mionjs/client/middlewares` ship empty (`export {}`) until route sync fills them, pinned by `repo-contracts.test.ts` (declared, off the main barrels, client installers import the router for types only) and by a chunk test in `packages/rpc-client/test/bundleSplit.spec.ts`. A placeholder pair was first shipped in them and moved to test code in review: nothing published carries a dummy. An optional-params test fixture pair stood in until route sync became the first real content of both entries.
- **`RouteSyncError` / `RouteSyncErrorData`** live in `@mionjs/core`; `@mionjs/router` still re-exports them.
- **Fixture:** the server half is `packages/private-test-server/src/csrf.middleware.ts`, placed in a `notes` group (and once more in `notes.admin`), not at the root, where its required token would break every other route's tests. The client half is `packages/rpc-client/test/lib/csrf.client.ts`, because the test server does not depend on the client. Tests: `packages/rpc-client/test/isolatedMiddleware.spec.ts`, `types.spec.ts`, Go `TestApiGen_ReportsMiddlewaresTheClientNeverSetsUp`, devtools `bundledApiBuild.spec.ts`.
- **Docs:** existing pages only (per-middleware pages come later): the retry rule, a Reusable Middleware subsection and `MiddlewareContext` in `01.rpc/03.client/00.client-overview.md`, one paragraph in `01.rpc/02.server/02.middleware.md`, the example `packages/private-examples/src/client/client-middleware-installer.ts`. MET008 / MET009 reach the diagnostics catalog page through the generated catalog.

