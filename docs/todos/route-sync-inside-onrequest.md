---
type: chore
spec: guidelines
status: ready
created: 2026-09-24
---

# Route Sync Runs Through onRequest

## Intent
Once client middleware has `onRequest`, the `mion@syncRoutes` middleware should use it too, instead of being special-cased inside the request. mion registers its own `onRequest` for it and loads the sync code with a dynamic import only when a server uses route sync. One path for every middleware, and the sync code stays out of bundles that never use it.

Needs the client middleware `onRequest` feature (which removes `prefill` and per-call middleware data) to land first.

## Direction
- Client side today: `packages/rpc-client/src/lib/syncRoutes.ts` (`createSyncSubRequest`, `sendsSyncIds`, `learnSyncRoutes`), wired by hand in `packages/rpc-client/src/dispatch.ts` (`makeCall`, `takeSyncRefusal`, `handleSyncRefusal`) and `packages/rpc-client/src/lib/serializer.ts:43`.
- Server side: `packages/rpc-router/src/routes/syncRoutes.routes.ts`, key `MION_ROUTES.syncRoutes` in `packages/core/src/constants.ts`.
- The `onRequest` for sync is registered internally when `setInjectedRouterOptions` sees `syncRoutes: true`, or after a refusal teaches the client (`learnSyncRoutes`).
- Note the existing comment in `syncRoutes.ts` keeps it out of the fetched lane: the dynamic import must keep a bundled client working.
- The implementer plans the details.

## Docs
`01.rpc/03.client/06.route-sync.md`: no user API change expected; update only if behaviour a user sees changes (for example the first call to a route). Otherwise none, because this is internal.

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example this change touched, review its report against the code, and commit it as its own commit.

## Done when
- Route sync has no special case left in `dispatch.ts`; it runs as an internal `onRequest`.
- A client that never talks to a sync server does not load the sync module (a test pins it).
- Existing route sync tests pass unchanged, plus `pnpm test` and `pnpm run lint`.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched source file, each committed on its own.
