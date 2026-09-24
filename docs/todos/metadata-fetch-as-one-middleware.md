---
type: chore
spec: guidelines
status: ready
created: 2026-09-24
---

# Metadata Fetch as One Client Middleware

## Intent
Fetching route metadata is a middleware on the server (`mion@methodsMetadata`), so the client should treat it as ONE middleware with an internal `onCall`, the same way route sync does. Today its handling is spread across several client files.

Last step of the client middleware chain: needs `onCall` and route sync on `onCall` first.

## Direction
- Scattered today: `packages/client/src/request.ts` (~lines 151, 188, 210, 266), `lib/serializer.ts` (~43, 142), `lib/clientMethodsMetadata.ts` (~451), `lib/apiVersionRecovery.ts` (~41), `lib/fetchRemoteMethodsMetadata.ts` (`mion@methodsMetadataById`).
- Keep the on-demand load of the fetched metadata code (dynamic import) working, and the bundled-API mode that needs no fetch.
- Decide whether the separate `methodsMetadataById` fetch folds into the same middleware.
- The implementer plans the details.

## Docs
`01.rpc/03.client/02.metadata-cache.md`: none expected, because the change is internal; update any section whose described behaviour changes.

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example this change touched, review its report against the code, and commit it as its own commit.

## Done when
- Metadata handling lives in one client middleware module, with no special cases left in `request.ts` / `serializer.ts`.
- Metadata cache, optimistic request, version recovery and bundled-API tests all pass, plus `pnpm test` and `pnpm run lint`.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched source file, each committed on its own.
