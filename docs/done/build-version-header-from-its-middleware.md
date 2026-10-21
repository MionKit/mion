---
type: fix
spec: guidelines
status: done
created: 2026-10-16
---

# x-build-version Sent by the Middleware That Uses It

## Intent

Before this change the router added `x-build-version` to every response of every app, through the defaults every
adapter merges (`initRouter` in `packages/rpc-router/src/router.ts` put it into `globalResponseHeaders` when
`apiVersionCheck` was on and the build gave a version). No middleware was involved, so an app that never used
version recovery still paid for a default header on every reply, and the Bun adapter could never take its
no-headers path.

The header should come from the middleware whose client half reads it, and only when that middleware runs.

## Direction

The implementer investigates and plans the details.

- Who reads it on the client:
  - `packages/rpc-client/src/middlewares/fetchMetadata.ts`: after a mismatch, each route is re-checked once on
    first use (`hasApiVersionMismatch`).
  - `packages/rpc-client/src/dispatch.ts` (`noteServerApiVersion` + `reportApiVersionMismatch`): the client core
    reads it on EVERY response, even with no middleware, and then reports the whole API as stale. Moving the
    header into a middleware drops this fallback for apps without it: decide what replaces it, or say why
    nothing does.
  - `packages/rpc-client/src/middlewares/syncRoutes.ts` never reads it.
- The finished spec for per-route sync ids describes a `mion@syncRoutes` middleware that SET this header and says
  it left `globalResponseHeaders`. The code before this change did not: `packages/rpc-router/src/middlewares/syncRoutes.ts`
  writes no header and the router still merges it into the defaults. Find out which is intended and which
  middleware owns it (fetch-metadata is the reader today), then make code and docs agree.
- Set rather than returned, so the middleware's answer is never an object-and-error union (the reason that spec
  gave).
- `apiVersionCheck` keeps its meaning: off sends no header.

## Docs

`container/website/content/01.rpc/02.server/04.headers.md`, existing sections "Headers on Every Response" (table
row 4) and "Build Version Header"; `container/website/content/` API Version Check section on the fetch-metadata
middleware page.

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example
this change touched, review its report against the code, and commit it as its own commit.

## Done when

- `x-build-version` is written by its middleware only, and no longer part of the router's default headers.
- Client version recovery still works where the middleware runs, proven by tests; the no-middleware case is
  decided and tested.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched source file,
  each committed on its own.

## Plan: header from mionFetchMetadata (approved 2026-10-16)

### Context
Before, `initRouter` (`packages/rpc-router/src/router.ts:257`) puts `x-build-version` into `globalResponseHeaders`, so
every reply of every app carries it, and Bun can never skip building headers. The header belongs to the
fetch-metadata middleware (its client half does the recovery). User decisions: owner = fetch-metadata; router's own
error chains (not found) get no header; automatic mode.

### Change
- `router.ts`: drop the version header from `globalResponseHeaders`; keep the build version
  (only when `apiVersionCheck` is on) in a module var, read through a new `getBuildVersion()`; reset clears it.
- `lib/handlers.ts`: `markOnDemand(def, onEveryCall?)` keeps an optional hook (WeakMap) that runs on every call,
  even when the request carries no slot for the middleware. `router.ts` `onDemandCaller` calls it first.
- `middlewares/fetchMetadata.ts`: hook = `ctx.response.headers.set(BUILD_VERSION_HEADER, version)` when there is a
  version. Set, never returned, so the answer type stays the same. `alwaysRun` already makes it run on error replies.
- `types/general.ts` `apiVersionCheck` doc: header comes from `mionFetchMetadata`; off = no header.
- Client: no code change. `dispatch.ts` still reports the whole API when the server sends the header and the client
  has no `useFetchMetadata`. With no server middleware, no header, no check (decided + tested).
- `docs/done/check-route-hash-before-running.md`: fix the line saying `mion@syncRoutes` sets the header.

### Tests (Vitest)
- rpc-router `globalHeaders.spec.ts`: defaults no longer hold the header.
- rpc-router `fetchMetadata.spec.ts`: header on a call without the slot, with the slot, on a failing route;
  absent with `apiVersionCheck: false`, without a build version, and on routes outside the middleware.
- Platform `globalHeaders` specs (aws, bun, cloudflare, gcloud, node, uws, vercel): replace the version assertion
  with "no x-build-version without the middleware".
- rpc-client `apiVersion.spec.ts` / helpers: recovery works with the middleware; client without
  `useFetchMetadata` still reports; server without the middleware sends nothing, client reports nothing.
- Update any devtools test that expects the header in defaults.

### Docs
- `container/website/content/01.rpc/02.server/04.headers.md`: row 4 drops `x-build-version`; "Build Version Header"
  says `mionFetchMetadata` sends it.
- `01.rpc/03.middlewares/01.fetch-metadata.md` "API Version Check": the middleware sends it; no middleware = no check.

### Fuzzing
Not a candidate: a fix, no new encode/decode.

### Finish
lint + format + tests, review-pr, docs-simplifier + comments-simplifier (own commits), spec reconciled and
`git mv` to `docs/done/`, PR (links parent session, must merge before `claude/upbeat-edison-crjrpb`), CI green.

### Done when (from spec)
- Header written by its middleware only, not in router defaults.
- Client recovery works where the middleware runs (tested); no-middleware case decided + tested.
- simplify-docs + simplify-comments passes ran, each its own commit.

## What shipped

The plan above, plus these review outcomes:

- A version pinned in `globalResponseHeaders` (any case) wins: the router then keeps no build version, so
  `mionFetchMetadata` adds none and the pinned value rides every response, as before.
- `OnEveryCall` stays private to `lib/handlers.ts`; `onDemandCaller` takes `context: CallContext` directly.
- Extra router tests: no or empty build version, pinned option, bad JSON body, adapter refusal
  (`dispatchPlatformError`), batch call. Extra client test: no `useFetchMetadata` and no header, nothing reported.
- Breaking for apps without `mionFetchMetadata`: their responses (and the router's own not-found answers) no longer
  carry `x-build-version`, so the client's whole-API check is off for them. Marked breaking in the commit.
- Bun note: `mionFetchMetadata` must sit at the root, so every route of an app that uses it still sends the header.
  Only apps without it gain a response with no default header.
