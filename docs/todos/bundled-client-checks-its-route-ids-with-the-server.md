---
type: feature
spec: guidelines
status: ready
created: 2026-09-20
---

# A bundled client checks its route ids against the server

## Intent

A client built with `bundleApi: 'bundled'` carries compiled validators and serializers keyed by
route ids that fold in the param shape, the return shape and the runtypes version. It never asks the
server anything, so when the server moves on (a route renamed, a param added, a version bump)
nothing notices. The client keeps calling with code compiled against an API that no longer exists.

`mion api-check` already catches this at build time by comparing the two manifests, but only when
both build outputs sit on the same machine. A client deployed against a server that changed
afterwards has no check at all.

## Direction

Mirror what the optimistic metadata request already does, and the implementer plans the details.

- **Piggyback, do not preflight.** `createMetadataSubRequest` already rides the same request body as
  the call it belongs to, and the server answers in the same response. The id check should work the
  same way: send the route's params and return ids with the first request, in that request, so a
  correct client pays one round trip and not two.
- **The server answers in that same response.** On a mismatch it returns the correct metadata
  alongside the result, so the call recovers rather than failing. The server half sits next to
  `mionGetRemoteMethodsDataById` in `packages/router/src/routes/client.routes.ts`, which already
  knows how to serialize a method for a client.
- **Remember the answer** so later calls skip the check.

Three things to settle, called out because each one changes the shape:

1. **Where the checked flag lives.** A bundled client currently ships no storage code at all, which
   was the point of loading the metadata code on demand. `localStorage` is a few lines but puts a
   storage path back into every bundled client; the existing store (`lib/storage.ts`,
   `lib/metadataStore.ts`) reuses a tested abstraction but drags the whole thing in; memory only
   re-checks once per page load and keeps the bundle clean. Weigh the cost of the check against what
   remembering it costs to ship.
2. **What gets checked and when.** Per route on first use, or every bundled route in one go on the
   first request.
3. **What a mismatch means for the app.** Recover silently on the server's metadata, or also report
   it, since a mismatch means the deployed client is stale and someone should know.

## Docs

`container/website/content/01.rpc/03.client/05.bundled-api.md`, a new section next to
*Checking a Release*, which today only covers the build-time `api-check`. The client's metadata
cache page may need a line too if the flag ends up stored.

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page
and example this change touched, review its report against the code, and commit it as its own
commit.

## Done when

- A bundled client calling a server whose route ids no longer match recovers on that same request,
  without a second round trip.
- A client whose ids match pays at most one check, and the cost of remembering that is a deliberate
  choice rather than an accident.
- A bundled client that never meets a mismatch still ships no metadata store.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched
  source file, each committed on its own.
