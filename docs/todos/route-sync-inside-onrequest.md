---
type: chore
spec: guidelines
status: ready
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
- Delete the `echoTag` test fixture that stood in for real content: `packages/private-test-server/src/echoTag.middleware.ts` (and its `notes.echoTag` route entry and index export), `packages/rpc-client/test/lib/echoTag.client.ts`, and the test and parity lines that use it. Route sync's own pair is the first real content of both `./middlewares` entries.
- The implementer plans the details.

## Docs
`01.rpc/03.client/06.route-sync.md`: rewrite the setup for the explicit server entry and client installer; update any section whose behaviour changes (for example the first call to a route). Server option docs for `syncRoutes` follow whatever the option becomes.

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example this change touched, review its report against the code, and commit it as its own commit.

## Done when
- Route sync has no special case left in `dispatch.ts` or the router: it is an explicit server entry plus `useSyncRoutes` on the client.
- No `echoTag` is left anywhere in the repo (a grep finds nothing).
- A client that never talks to a sync server does not load the sync module (a test pins it).
- Existing route sync tests pass unchanged, plus `pnpm test` and `pnpm run lint`.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched source file, each committed on its own.
