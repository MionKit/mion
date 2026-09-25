---
type: chore
spec: guidelines
status: done
created: 2026-09-24
---

# Route Sync as an Isolated Reusable Middleware

## Intent
Route sync becomes an isolated reusable middleware, explicit on both ends, instead of being added by the router and special-cased inside the client request:

```ts
// server
import {mionSyncRoutes} from '@mionjs/router/middlewares';
mion.initRoutes({...mionSyncRoutes, ...routes});
// client
import {useSyncRoutes} from '@mionjs/client/middlewares';
useSyncRoutes(middlewares['mion@syncRoutes']);
```

The sync code stays out of bundles that never use it, and a missing client half is caught by the build like any other middleware.

Needs the isolated reusable middleware shape first: the `@mionjs/client/middlewares` and `@mionjs/router/middlewares` entry points, `ClientMiddleware<typeof handler>`, `ctx.retry()` and the missing-middleware build diagnostics.

## Direction
- Client side today: `packages/rpc-client/src/lib/syncRoutes.ts` (`createSyncSubRequest`, `sendsSyncIds`, `learnSyncRoutes`), wired by hand in `packages/rpc-client/src/dispatch.ts` (`makeCall`, `takeSyncRefusal`, `handleSyncRefusal`) and `packages/rpc-client/src/lib/serializer.ts:43`. All of it moves into `useSyncRoutes`, built on the public hooks: `onRequest` sends the sync ids, `onError` handles the refusal and resends with `ctx.retry()` (a refusal means no route ran, so retry is always allowed).
- Server side: `packages/rpc-router/src/routes/syncRoutes.routes.ts`, added today by `addSyncRoutesMiddleware` in `packages/rpc-router/src/router.ts` when `syncRoutes` or `apiVersionCheck` is on. It becomes an entry the user spreads into the routes, exported from `@mionjs/router/middlewares`. Decide what the `syncRoutes` router option still does once the entry is explicit (and how the `apiVersionCheck` header keeps working), and what the build injects into `initClient` (`InjectRouterOptions`).
- `RouteSyncError` / `RouteSyncErrorData` move to `@mionjs/core` so the client imports nothing from the router.
- Delete the optional-params test fixture pair that stood in for real content (its server half in `packages/private-test-server/src/`, its `notes` route entry and index export, its client half in `packages/rpc-client/test/lib/`), and the test and parity lines that use it. Route sync's own pair is the first real content of both `./middlewares` entries.
- The implementer plans the details.

## Docs
`01.rpc/03.client/06.route-sync.md`: rewrite the setup for the explicit server entry and client installer; update any section whose behaviour changes (for example the first call to a route). Server option docs for `syncRoutes` follow whatever the option becomes.

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example this change touched, review its report against the code, and commit it as its own commit.

## Done when
- Route sync has no special case left in `dispatch.ts` or the router: it is an explicit server entry plus `useSyncRoutes` on the client.
- No trace of that fixture is left anywhere in the repo (a grep finds nothing).
- A client that never talks to a sync server does not load the sync module (a test pins it).
- Existing route sync tests pass unchanged, plus `pnpm test` and `pnpm run lint`.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched source file, each committed on its own.

## Plan (approved 2026-09-25)

### Context
Todo `docs/todos/route-sync-inside-onrequest.md` (type chore, spec guidelines). Today the router adds route sync by itself (`addSyncRoutesMiddleware`, `router.ts:238/270`) and the client hand-wires it in `dispatch.ts` (`makeCall:187`, `takeSyncRefusal`, `handleSyncRefusal`) and `serializer.ts:43,152-164`. Goal: one explicit pair, like any shared middleware:

```ts
import {mionSyncRoutes} from '@mionjs/router/middlewares';
mion.initRoutes({syncRoutes: mionSyncRoutes, ...routes}); // user picks the key, first so it runs first
import {useSyncRoutes} from '@mionjs/client/middlewares';
useSyncRoutes(middlewares.syncRoutes);
```

Decisions taken with the user:
- Remove the `syncRoutes` router option and the whole build-injection chain that only existed for it.
- A middleware the client never sets up is a build ERROR even when its params are optional (MET009 goes from warning to error).

### Server (`packages/rpc-router`, `packages/core`)
1. `packages/rpc-router/middlewares.ts` exports `mionSyncRoutes = middleware(syncRoutes, {maxBodySize: 1024})`, a plain middleware the user places under any key (root or group), like `csrf`. Handler body moves from `src/routes/syncRoutes.routes.ts` (file becomes the middleware source under `src/middlewares/syncRoutes.ts`), always checks (no option). Param stays optional so a curl caller still gets `route-sync-required` with rows.
2. It becomes a normal middleware with no fixed id: drop `syncRoutes` from `MION_ROUTES` (and so from `mionInternalRouteIds`). Core gets a `SyncRoutesHandler` type next to `RouteSyncError` (the client has no router dependency, so the installer types from core). Effects: server `middlewareIds` and metadata rows now include it, matching the Go bundled rows; the client decodes its answer generically, so the pinned `clone` parser and `bodyLimit.ts:35` special case go.
3. Delete `addSyncRoutesMiddleware`, `setServerBuildVersion`, the `syncRoutes` option (`types/general.ts:74`, `constants.ts:29`), `ApiWithOptions` / `ROUTER_OPTIONS` (initRoutes returns `PublicApi<R>` again).
4. Version header: `initRouter` merges `{[BUILD_VERSION_HEADER]: buildVersion}` into `globalResponseHeaders` when `apiVersionCheck && buildVersion` (user headers win). Keeps it on every answer incl. 404s and mion's own routes.
5. Guard: a routes key equal to one of mion's own ids (`MION_ROUTES` values) throws at `initRoutes` (today it silently reuses the internal executable, `router.ts:506`).

### Client (`packages/rpc-client`)
1. New `src/middlewares/syncRoutes.ts`, exported from `middlewares.ts`: `useSyncRoutes(mw: ClientMiddlewareOf<SyncRoutesHandler>)`.
   - `onRequest`: `call(routeSyncIds(routeIds))`, route ids from `ctx.route` / `ctx.batchSubRequests` in batch order; `''` for a route with no row.
   - `onError('route-sync-required')`: install `errorData.metadata` rows (lazy lane, `installMethodRows`), `ctx.retry()`.
   - `onError('route-types-mismatch')`: every refused route fetched (not bundled) → `forgetFetchedMetadata` + `fetchRemoteMethodsMetadata` for them, then `ctx.retry()` (one retry per call is enough, fetch counts unchanged). Otherwise, or when retry is refused, rethrow so it stays in the undeclared slot as today.
   - Lane functions only through `await loadMetadataFromServer()`, never a static import (keeps `bundleSplit` green).
2. Delete from `dispatch.ts`: sync imports, `resentWithSyncIds`, line 187, `takeSyncRefusal`, `handleSyncRefusal`, sync deletes in `retryWithProperSerialization`. Delete sync branches in `serializer.ts`. Delete `lib/syncRoutes.ts`, `setInjectedRouterOptions` and `initClient`'s `routerOptions` argument (`client.ts:39,42`).

### Build (Go + run-types)
- Remove the `InjectRouterOptions` marker: `run-types/src/markers.ts:273` + index export, Go `marker.go` (`KindInjectRouterOptions`), `resolver/apiversion.go` splice, `apimeta/tree.go` `ReadRouterOptions` / `clientRouterOptions`, their tests.
- MET009 → `LevelRuntimeError` (silenceable with `@mion-expect-error`), message says the build stops; regenerate the diagnostics catalog. Fix any test/example client that now trips it (touch the middleware or add the directive).

### Fixture cleanup
Delete the optional-params fixture: its server file, its `notes` entry, index export, its client half, its block in `isolatedMiddleware.spec.ts`, `parity.ts:105`. Reword the `docs/done/isolated-reusable-middleware.md` mention so a grep finds nothing.

### Tests
- Router `syncRoutes.routes.spec.ts`: same assertions, setup places the entry under a user key; "option off ignores ids" becomes "no entry, no check"; header tests move to `globalHeaders.spec.ts` (flip its "not global" assertion). `router.spec.ts:94-112` default chain loses `mion@syncRoutes`. New: reserved key throws.
- Client `mixed/routeDrift.spec.ts`: same assertions (slots, fetch counts), setup places the entry + calls `useSyncRoutes`. `lib/syncRoutes.spec.ts` rewritten for the installer (ids, batch order, '' for missing rows). `types.spec.ts:84-92` updated for the removed slot/key.
- `bundleSplit.spec.ts`: plain app build (each mode) has no sync code; an app calling `useSyncRoutes` has it. Pins "a client that never talks to a sync server does not load the sync module".
- Go: `TestApiGen_ReportsMiddlewaresTheClientNeverSetsUp` expects MET009 as an error; devtools `bundledApiBuild.spec.ts` fails on it.
- Gate: `pnpm test`, `go -C ts-go-runtypes test ./internal/... ./cmd/...`, `pnpm run lint`, `pnpm run format`.

### Docs
- `01.rpc/03.client/06.route-sync.md`: rewrite "Turning On Route Sync" (server entry + client installer, spread first), "Handling a Stopped Call" and the tip wording (no option); "The First Call" stays true.
- `05.bundled-api.md:100`: drop "With `syncRoutes` on".
- `00.client-overview.md` / `02.server/02.middleware.md`: MET009 is now an error wherever mentioned.
- Examples `private-examples/src/client/sync-routes.routes.ts` + `sync-routes-client.ts` updated.
- Fuzzing: not a candidate (wiring, no oracle).

### Finish
Append this plan to the todo, reconcile it with what shipped, `git mv` to `docs/done/`. Then docs-simplifier and comments-simplifier subagents in parallel, each committed alone. Push to `claude/clever-bardeen-sjv075`.

### Done when (from the todo)
- No route sync special case in `dispatch.ts` or the router.
- No trace of the optional-params fixture anywhere.
- A client never talking to a sync server does not load the sync module (test).
- Existing route sync test assertions pass; `pnpm test` and `pnpm run lint` green.
- Both simplification passes committed on their own.

## What shipped (2026-09-25)

Where the build diverged from the plan above, this section is the record.

- **Placed by its own name.** `mionSyncRoutes` is a plain middleware, not a keyed entry to spread, placed with the shorthand key so every app spells it the same: `{mionSyncRoutes, ...routes}` and `useSyncRoutes(middlewares.mionSyncRoutes)`. Any other key works too. Nothing keys on a fixed id any more; `MION_ROUTES.syncRoutes` is gone. Placed first, it runs before every other middleware and route of the chain.
- **Server:** `packages/rpc-router/src/middlewares/syncRoutes.ts`, exported from `@mionjs/router/middlewares`. It always checks; no `alwaysRun`, since a failed chain skips it anyway. Parser stays pinned to `clone` (the router-wide parser never reaches this helper at build time), body share stays `1024`. Being a normal middleware, it is listed in each route's `middlewareIds` and its row is served, matching the Go bundled rows.
- **Version header** moved into `globalResponseHeaders` at `initRouter` (the option's own entry wins), so it is on every answer, 404s and mion's own routes included, with no chain member.
- **Shared types:** `RouteSyncError`, `RouteSyncErrorData` and `SyncRoutesHandler` live on a types-only `@mionjs/core/middlewares` entry, off core's main barrel, and the router no longer re-exports them. A separate middlewares package was weighed and left for later: route sync needs router and client internals that are not public API yet.
- **Removed:** the `syncRoutes` router option, `addSyncRoutesMiddleware`, the `bodyLimit.ts` special case, `ApiWithOptions` / `ROUTER_OPTIONS`, the `InjectRouterOptions` marker (run-types, Go `marker.go`, `apiversion.go`, `apimeta/tree.go`) and `initClient`'s third argument. The type budget dropped (step 4: 547 to 523, step 5: 3076 to 3052, total 13614 to 13566).
- **Client:** `packages/rpc-client/src/middlewares/syncRoutes.ts`. `onRequest` sends one id per route (batch order). `onError('route-sync-required')` installs the rows it carries and retries. `onError('route-types-mismatch')` forgets and refetches the fetched rows, then retries; a bundled route, or a refused retry, rethrows so the refusal stays in the undeclared slot. Refetching inside the hook keeps one resend per call and the same fetch counts. `dispatch.ts` and `serializer.ts` hold no sync code.
- **`onError` typing:** an error declared with several types (`RouteSyncError`) typed as `never` in a hook. `ErrorOfType<E, T>` in `packages/rpc-client/src/types.ts` fixes it for every middleware.
- **MET009 is now an error** (`LevelRuntimeError`, still silenced by `@mion-expect-error`): a middleware the client never sets up stops a `bundleApi` build even when its params are optional. `packages/rpc-client/test/lib/parity.ts` now reads every optional-param middleware of the test server.
- **Reserved names:** a root routes key naming one of mion's own start or end middlewares throws at `initRoutes` instead of silently reusing it.
- **Fixture:** the optional-params stand-in middleware and its client half are deleted, along with every use.
- **Tests:** router `test/middlewares/syncRoutes.spec.ts` (same checks; refusal rows now include the sync middleware's own row), `test/globalHeaders.spec.ts` (header), client `test/middlewares/syncRoutes.spec.ts`, `test/mixed/routeDrift.spec.ts` (same assertions), `test/bundleSplit.spec.ts` (a client that never installs it ships none of it, in every mode), `test/types.spec.ts`, Go `TestApiGen_ReportsMiddlewaresTheClientNeverSetsUp`.
- **Docs:** `01.rpc/03.client/06.route-sync.md` setup and tips, one line in `05.bundled-api.md` and `00.client-overview.md`; examples `packages/private-examples/src/client/sync-routes*.ts`.
