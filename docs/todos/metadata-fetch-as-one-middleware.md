---
type: chore
spec: guidelines
status: ready
created: 2026-09-24
---

# Metadata Fetch as an Isolated Reusable Middleware

## Intent
Fetching route metadata is a middleware on the server (`mion@methodsMetadata`), but the router adds it by itself and the client handles it in several files. It should become an isolated reusable middleware, explicit on both ends: a server entry from `@mionjs/router/middlewares` the user spreads into the routes, and a client installer from `@mionjs/client/middlewares` that receives the typed middleware.

Last step of the client middleware chain: needs the isolated reusable middleware shape and route sync on it first.

## Direction
- Scattered today: `packages/rpc-client/src/dispatch.ts` (`makeCall`'s optimistic and version-check branches, `retryWithProperSerialization`, `handleSyncRefusal`), `lib/serializer.ts` (~43, 142), `lib/clientMethodsMetadata.ts` (~451), `lib/apiVersionRecovery.ts` (~41), `lib/fetchRemoteMethodsMetadata.ts` (`mion@methodsMetadataById`).
- Keep the on-demand load of the fetched metadata code (dynamic import) working, and the bundled-API mode that needs no fetch.
- A client with no metadata installer and a route that is not bundled must fail clearly: a build error, and a clear error on the first call at runtime.
- The public hooks may not be enough (optimistic first call, serializer choice): decide which internal-only hooks the installer needs, and keep them out of the public type.
- Decide whether the separate `methodsMetadataById` fetch folds into the same middleware.
- The implementer plans the details.

## Docs
`01.rpc/03.client/02.metadata-cache.md`: add the explicit setup (server entry + client installer); update any section whose described behaviour changes. `05.bundled-api.md`: say a fully bundled client needs no metadata installer.

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example this change touched, review its report against the code, and commit it as its own commit.

## Done when
- Metadata handling lives in one client installer module, with no special cases left in `dispatch.ts` / `serializer.ts`, and the server half is an explicit entry, no longer added by the router.
- Metadata cache, optimistic request, version recovery and bundled-API tests all pass, plus `pnpm test` and `pnpm run lint`.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched source file, each committed on its own.
