---
type: chore
spec: guidelines
status: done
created: 2026-09-24
---

# Metadata Fetch as an Isolated Reusable Middleware

## Intent
Fetching route metadata is a middleware on the server (`mion@methodsMetadata`), but the router adds it by itself and the client handles it in several files. It should become an isolated reusable middleware, explicit on both ends: a server middleware from `@mionjs/router/middlewares` the user places first in the routes under its own name, and a client installer from `@mionjs/client/middlewares` that receives it, the same shape route sync ships with:

```ts
mion.initRoutes({mionSyncRoutes, ...routes});
useSyncRoutes(middlewares.mionSyncRoutes);
```

Last step of the client middleware chain: the isolated reusable middleware shape and route sync are both on it now.

## Direction
- Scattered today: `packages/rpc-client/src/dispatch.ts` (`makeCall`'s optimistic and version-check branches, `retryWithProperSerialization`), `lib/serializer.ts` (~43, 142), `lib/clientMethodsMetadata.ts` (~451), `lib/apiVersionRecovery.ts` (~41), `lib/fetchRemoteMethodsMetadata.ts` (`mion@methodsMetadataById`).
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

## Plan (approved 2026-09-26)

### Context
Todo `docs/todos/metadata-fetch-as-one-middleware.md` (chore, guidelines). Today the router adds the metadata
middleware to every chain and the by-id route by itself, and the client handles fetching in `dispatch.ts`,
`serializer.ts`, `clientMethodsMetadata.ts`, `apiVersionRecovery.ts`. Goal: same shape as route sync, plus the
default flips to compiling metadata into the client.

```ts
// server: one export, spread, adds the middleware AND the by-id route
import {mionMethodsMetadata} from '@mionjs/router/middlewares';
mion.initRoutes({...mionMethodsMetadata, mionSyncRoutes, ...routes});
// client: only needed when bundleApi is false or 'mixed'
import {useMethodsMetadata} from '@mionjs/client/middlewares';
useMethodsMetadata(middlewares.mionMethodsMetadata);
```

Decisions taken with the user:
- `bundleApi` stays; default becomes `'bundled'`; `'mixed'` stays; `bundleApi: false` turns bundling off.
- Installer set up by hand on both ends.
- One server export carrying both the middleware and the by-id route.
- Resend rule: one resend per call, only when safe (table below).

### Why the by-id route is still needed
A middleware only runs inside a route's chain, so it can only bring rows along with a real call. Three cases
need rows WITHOUT running the route:
- `typeErrors()` validates params locally and sends nothing. For a route with no rows yet, it POSTs
  `{"<id>ById": [["users/get"]]}` to the by-id route, builds the validator from the rows, then validates.
- The optimistic body cannot be written (JSON.stringify throws): rows are fetched first, then the call goes out
  once with the real encoders.
- Route sync's `route-types-mismatch`: the fetched rows are refetched before the one resend.

### Server (`packages/rpc-router`, `packages/core`)
1. New `src/middlewares/methodsMetadata.ts`: `mionMethodsMetadata = {mionMethodsMetadata: middleware(...), mionMethodsMetadataById: route(...)}`, exported from `middlewares.ts`. Same options as today (clone parser, `alwaysRun`, `maxBodySize: 4096`). Handlers move out of `routes/client.routes.ts`.
2. On-demand caller (skip the params pipeline when the body has no slot) is kept, marked on the def (internal WeakSet), not found by a fixed id.
3. Remove: `mionClientMiddlewares` from `defaultEndMiddlewares`, `mionClientRoutes`, `MION_ROUTES.methodsMetadata` / `methodsMetadataById`, the `skipClientRoutes` option (passing it throws with a message naming the new export, like the removed `syncRoutes`).
4. `MethodsMetadataHandler` / `MethodsMetadataByIdHandler` types on `@mionjs/core/middlewares`, with a router type test against the real handlers (same drift guard as sync).

### Client (`packages/rpc-client`)
1. New `src/middlewares/methodsMetadata.ts`: `useMethodsMetadata(mw)`. Registers an internal `MetadataFetcher` on the client's registry through a symbol accessor, never on the public type. The by-id route id is the middleware's sibling (`<key>ById`). Heavy code stays behind `loadMetadataFromServer()` (the lazy chunk).
2. `MetadataFetcher` (internal, `src/lib/metadataFetcher.ts`, not exported from the index):
   - `beforeCall`: hydrate the browser store, decide optimistic, add the version-verify subrequest.
   - `fetchRows(ids)`: the by-id request (typeErrors, stringify fallback, sync refetch).
   - `readRows(parsedBody)`: installs rows before decoding.
   - `afterCall`: the resend decision, through the same per-middleware retry budget and `isRetrySafe` as `ctx.retry()`.
   - `takeError`: the stored-cache write error for the undeclared slot.
3. `dispatch.ts`: `makeCall` keeps one generic path calling the optional fetcher; `retryWithProperSerialization`, `purgedStaleMetadata`, `retriedAfterMismatch`, `verifying`, `metadataRowsOf` go. `serializer.ts`: the `MION_ROUTES.methodsMetadata` special case and the cache hooks go (the plain wire-form writer stays, it is generic).
4. No fetcher and a route with no rows: clear `route-metadata-not-found` in the undeclared slot, message names both fixes (bundle the route, or set up `useMethodsMetadata`). Same for `typeErrors()` (rejects, as it does today on failures).
5. Version check: the header stays read by dispatch. With the installer, each route is checked and fetched rows refreshed (as today). Without it, a mismatch is reported once for the whole API, since the client cannot check routes one by one.
6. `useSyncRoutes`: its refetch goes through the fetcher when one is set up.

### Resend rules (one resend per call)
| Answer | Resend? |
| --- | --- |
| Route succeeded | Never. Rows it brought are saved |
| Optimistic call failed with a wire error (validation, serialization, request JSON) | Once, with the real encoders |
| Rows came from the browser store, call failed with a wire error | Forget them, resend once (fresh rows ride along) |
| Server version differs, call failed with a wire error | Verify rows, resend once |
| A mutation in the call succeeded (batch) | Never. Today it resends and runs it twice |
| Route returned its own declared error | Never |
| Optimistic body cannot be written | Fetch rows first, then send once (nothing was sent) |
| Server refuses the rows (`rpc-metadata-not-found`), network error, abort | Never |

### Build (devtools + Go)
- Default flip: `bundleApi` unset means `'bundled'`; `false` (TS) / `off` (Go const, CLI `--bundle-api off`, tsconfig `false`) is the fetched lane. Touch `devtools/src/options.ts`, `core/unplugin.ts` (stub only when off), `resolver-client.ts`, Go `constants.go`, `cmd/mion/main.go`, `config.go`, `resolver.go`, `apigen.go`.
- Go recognises the metadata middleware by its handler's declaration (`mionMethodsMetadata` in `@mionjs/router`), then:
  - `bundled`: exempt from MET008/MET009 (a fully bundled client never needs it).
  - `mixed`: a route the build could not bundle (MET004 site) with no `useMethodsMetadata` set up is a new build ERROR (MET010), naming the fix.
  - off: no API analysis runs, so it is the runtime error above.
- Regenerate the diagnostics catalog.

### Tests
- Router: `test/middlewares/methodsMetadata.spec.ts` (moved from `client.routes.spec.ts`), `router.spec.ts` default chain without metadata, removed option throws, `maxBodySize.spec.ts`, `parser.spec.ts`, `batches.spec.ts`, type drift test.
- Client: `test/middlewares/methodsMetadata.spec.ts`, one test per resend-table row, plus no-installer errors (call and `typeErrors()`). Existing optimistic, cache, cold-load, version and route-drift specs set up the installer, same assertions. `bundleSplit.spec.ts`: a client without the installer ships no fetched-lane code. Default `client` vitest project gets `bundleApi: false`.
- Go: default mode, MET009 exemption under bundled, MET010 under mixed. Devtools: default bundled, `false` stubs.
- Test server, pre-publish-e2e servers and clients, mion-next, mion-bench: place the export / install the client half.
- Fuzzing: not a candidate (wiring, no cheap oracle).
- Gate: `pnpm test`, `go -C ts-go-runtypes test ./internal/... ./cmd/...`, `pnpm run lint`, `pnpm run format`. PR labels: `pre-publish-e2e`, `website`.

### Docs
- `01.rpc/03.client/02.metadata-cache.md`: new "Setting Up Metadata Fetching" section (server + client, only for `bundleApi: false` or `'mixed'`), plus "When a Call Is Sent Again" with the resend table; intro updated.
- `05.bundled-api.md`: bundled is the default, `false` fetches; a fully bundled client needs no installer; version check with and without it.
- Default mentions in `00.client-overview.md`, `06.devtools/02.vite.md`, `03.nextjs.md`, `04.cli.md`, `02.server/09.security.md`, `06.route-sync.md` (order next to sync).
- Examples under `packages/private-examples/src/client/` for the pair.
- `packages/rpc-client/CLAUDE.md` line about `takeMetadataCacheError` updated.

### Finish
Append this plan to the todo, reconcile with what shipped, `git mv` to `docs/done/`. Then the docs-simplifier and
comments-simplifier subagents in parallel, each committed alone. Push to `claude/compassionate-darwin-g4gwzd`.

### Done when (from the todo)
- Metadata handling lives in one client installer module; no special cases left in `dispatch.ts` / `serializer.ts`; the server half is an explicit entry.
- Metadata cache, optimistic request, version recovery and bundled-API tests pass, plus `pnpm test` and `pnpm run lint`.
- Both simplification passes committed on their own.

## What shipped (2026-09-26)

Where the build diverged from the plan above, this section is the record.

- **Server pair:** `mionMethodsMetadata` on `@mionjs/router/middlewares` is an object spread into the routes, `{...mionMethodsMetadata, ...routes}`: the `mionMethodsMetadata` middleware (on demand, `alwaysRun`, clone parser, `maxBodySize: 4096`) and the `mionMethodsMetadataById` route. The router no longer adds either; `MION_ROUTES.methodsMetadata` / `methodsMetadataById`, `mionClientMiddlewares`, `mionClientRoutes` and `routes/client.routes.ts` are gone, and passing the removed `skipClientRoutes` option throws, naming the export.
- **The by-id route runs alone.** Placed among the user's routes it would inherit their root middlewares (an `auth` headers middleware refused it in the test server), while the client calls it before it knows what they need. It is marked standalone (`markStandalone`, internal) so its chain holds only mion's start and end middlewares, as when the router registered it itself. The Go API walk mirrors that: its `MiddlewareIds` are empty.
- **On demand without a fixed id:** the middleware def is marked (`markOnDemand`, internal WeakSet) and `getExecutableFromMiddleware` wraps its caller, so it skips its params pipeline when the body has no slot, whatever key holds it.
- **Client installer:** `useMethodsMetadata(middlewares.mionMethodsMetadata)` on `@mionjs/client/middlewares`. It reads the middleware's client and id through an internal symbol on `middlewares.<name>` (`MIDDLEWARE_TARGET`) and registers an internal `MetadataFetcher` per client (`src/lib/metadataFetcher.ts`, not exported). The by-id route is found as the sibling `<id>ById`. Heavy code stays behind the lazy `#metadata-from-server` chunk.
- **Dispatch:** `makeCall` has one path that calls the optional per-call hook (`prepare`, `askRows`, `readRows`, `shouldResend`). `retryWithProperSerialization`, `purgedStaleMetadata`, `retriedAfterMismatch`, `verifying`, `metadataRowsOf`, `metadataCacheHooks` and the serializer's metadata special case are gone. `deserializeResponseBody` takes a generic raw-body hook. `typeErrors()` goes through the same `loadMethodsMetadata`.
- **No installer:** a route with no rows fails with `route-metadata-not-found` in the undeclared slot, naming both fixes, and sends nothing; `typeErrors()` rejects. A build version mismatch is reported once per server for the whole API (`reportApiVersionMismatch`), since no route can be checked alone.
- **Resend rules:** one metadata resend per call, through the same budget and `isRetrySafe` rule as `ctx.retry()`, decided before any public hook sees the failed attempt. A resend keeps what onRequest hooks sent. It needs an attempt that reached the server and failed on the wire (`validation-error`, `serialization-error`, `parsing-json-request-error`), plus one of: the attempt was optimistic, its rows came from the browser store (purged first), or the server's build differs. A batch whose mutation succeeded is no longer resent.
- **Build default:** `bundleApi` unset now means `'bundled'` in the CLI, the tsconfig key and both presets; `false` (TS, tsconfig) or `off` (CLI) turns it off. The `#bundled-api` stub applies only to `false`. Go: `BundleApiUnset` / `BundleApiOff = "off"`, `resolveBundleApi`, and a tsconfig key that accepts `false`.
- **Diagnostics:** the Go walk recognises the metadata pair by its `@mionjs/router` declaration (`routerDeclares`; a computed key is skipped, it crashed the resolver on first try). Under `bundled` the middleware is exempt from MET008/MET009; under `mixed` it is required like any other, and a called API with no pair is the new `MET010` (runtime-error level). MET003/MET004 texts now say a fetch needs `useMethodsMetadata`.
- **Lint lane** passes `bundleApi: 'off'`: it reads no per-project config, so the bundled-API checks stay with the build, as before the default flipped.
- **Tests:** router `test/middlewares/methodsMetadata.spec.ts` (moved, plus the standalone chain and the type drift guard), `maxBodySize`, `parser`, `router`, `batches` specs; client `test/middlewares/methodsMetadata.spec.ts` (one test per resend rule, the no-installer errors, `readRows`), `bundleSplit.spec.ts` (no installer ships no fetch code in any mode; with it the lane is lazy and the recovery rides its chunk), bundled and mixed lane specs set the installer up, a bundled mismatch without it is reported once; the fetched specs use `test/lib/fetchingClient.ts`; devtools `bundledApiBuild.spec.ts` (bundles with no option, `false` writes nothing); Go `TestApiGen_MetadataMiddleware`, `TestResolveBundleApi`.
- **Fixtures:** test server, pre-publish e2e consumer, bun and Next apps place the pair; the Next app's first build is the fetched lane (`bundleApi: false`) and its client sets up the installer; examples `packages/private-examples/src/client/metadata-fetch*.ts`, `src/codegen/vite-fetched-client.config.ts`.
- **Docs:** `02.metadata-cache.md` (setup, first call, resend table), `05.bundled-api.md` (bundled default, modes table, no installer needed), `00.client-overview.md`, `03.batch.md`, `02.server/09.security.md`, `06.devtools/02.vite.md`, `04.cli.md`.
