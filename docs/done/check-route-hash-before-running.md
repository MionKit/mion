---
type: feature
spec: guidelines
status: done
created: 2026-09-23
---

# Check each route's types before the call runs (`syncRoutes`)

## The problem

A client encodes a call with a route's metadata row (bundled at build time, fetched, or restored from the metadata
store). When the server behind the same address changed (a redeploy, a rollback, another server on the same port),
nothing stopped the handler: a params change still ran when the old value fitted the new type, and a return type
change was never caught (the client read the wrong shape silently). The API id check (`x-build-version`) only
reacted after a response, and only for the whole API.

## What shipped

A server option, `syncRoutes` (default off). With it on, every call carries one short id per route; the server
compares them before anything runs.

- **The route sync id** (`routeSyncId`, `packages/core/src/routeSync.ts`): FNV-1a over
  `id:paramsJitHash:returnJitHash:headersParam.jitHash` of the route and of every public middleware in its chain,
  in chain order, as 6 base64url chars. Both ends read those fields off `getReflectionFromMarkers` over the same
  build-injected ids. The type ids fold in the mion version, so a different mion version blocks too, on purpose
  (different compiled functions).
- **One middleware does it all**: `mion@syncRoutes` (`packages/router/src/routes/syncRoutes.routes.ts`), a typed
  start middleware right after `mionDeserializeRequest`, `alwaysRun`, pinned `clone` parser. It returns
  `x-build-version` as a typed `HeadersSubset` when `apiVersionCheck` is on (the header left
  `globalResponseHeaders`, so the adapters no longer carry it), and under `syncRoutes`:
  - missing ids: `FatalError 'route-sync-required'` carrying the rows of the call's routes and chains;
  - a different id: `FatalError 'route-types-mismatch'` naming the routes.
  One error type for both (`RouteSyncError`): the encoder cannot tell two `FatalError`s apart in one union.
- **The client** (`packages/client/src/lib/syncRoutes.ts`, `request.ts`): sends the ids in the body slot (no request
  header, so no CORS preflight, and it rides GET `?data=`) when the build injected `syncRoutes` at `initClient`, or
  once a refusal taught it for that baseURL. `route-sync-required` installs the rows and resends once;
  `route-types-mismatch` goes to slot 2 with no resend (the app should reload or ship a new build). The version
  recovery keeps a row whose types changed, so replacing it cannot hide a mismatch.
- **The flag reaches the client through the API type**: `initRoutes` returns `ApiWithOptions<R, O>`, the public API
  plus the router options exactly as passed to `createMionRouter`, under the `ROUTER_OPTIONS` unique symbol
  (`@mionjs/core`). The Go API walk skips that key (the build version is unchanged) and a new marker,
  `InjectRouterOptions`, fills `initClient`'s third slot with the options a client acts on (today `syncRoutes`),
  under the same trust rule as the build version. A non-literal `syncRoutes` injects nothing; the first refusal
  teaches the client instead (no warning code was added for it).
- No startup check for a missing build version: the ids come from the route markers, which the router already
  requires, not from the version.
- **One list of the row fields a client acts on**: `clientRowView` (`packages/core/src/clientRowView.ts`), used by
  the version recovery and the parity tests. `isAsync` is out of it (the dispatcher flips it at runtime).

## Related fixes that shipped with it

- A route's `middlewareIds` lists route-level middlewares only: a global start/end middleware is not in the API
  type, so a bundled client's rows never matched.
- The fetched shelf could never replace a stale row after a version mismatch.
- The version mismatch state was process-wide instead of per server.
- The mismatch resend had no bound: a call a changed server kept refusing was resent forever.
- MET007 compared clients and servers as the walk went, so a later matching client hid an earlier one and the
  message often named the same version twice.

## Tests

- core: `routeSyncId` golden values and which fields move it; `clientRowView` normalising.
- router: `syncRoutes.spec.ts` (header on route and not-found chains, refusals run no handler, batches, mion routes
  never checked); route-level `middlewareIds`.
- Go: `InjectRouterOptions` injection and walk skip; every client checked against its server.
- client: the per-server state, the row replacement, the bounded resend, the options key kept out of the route
  types, the sync helpers.
- Parity in the bundled and mixed lanes (`test/lib/parity.ts`): one dispatch point naming every test-server method
  id; rows alike through `clientRowView`, route sync ids alike, every compiled function a row reaches alike as a
  syntax tree.
- `client-drift` lane: a mixed client built against server A; servers A, B, C, A on one port with the stored
  metadata kept across reloads. Unchanged routes and options-only changes run; a changed params type, a changed
  return type and a changed middleware in a route's chain are refused with no handler run; a fetched route's first
  call is refused once and resent.

## Docs

`container/website/content/01.rpc/03.client/06.route-sync.md` (new page), a tip in `05.bundled-api.md`, a row in the
client overview's features table.

## Plan — syncRoutes (approved 2026-09-24)

The approved design, from an investigation of four options (client sends ids every call; client sends a token and
ids once per server version; server hands over its ids on a token miss; server sends ids after running): after
review the user chose ids on every call under a server flag, as short as possible, with a mismatch a hard stop and
no retry, the flag carried once on the API type, the id covering the route and its middlewares, one middleware
doing the header and the check from standard mion pieces, and tests proving both builds mint the same ids.
