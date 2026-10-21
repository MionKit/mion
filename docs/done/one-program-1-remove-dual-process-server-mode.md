---
type: chore
spec: full-plan
status: done
created: 2026-09-09
---

# One process for client and API: remove the child-process server mode

## Problem

The vite preset could run the mion API two ways. Middleware mode loads the server entry into the
vite process (one program, one resolver, one port). `runMode: 'childProcess'` spawned it beside vite
with vite-node: a second process, a second program and resolver, a port poll, and an env-var
handshake (`MION_TEST_SERVER_AUTO_START`). The child mode survived the AOT sweep for one reason: the
client tests need a real socket, and middleware mode never listens (it mounts on vite's middleware
stack, and vitest opens no port for node tests).

Next was never the reason. `withMion` rejects a `server` block outright ("a Next app is the client");
the docs and quick start described a standalone vite-node API that Next proxies to. Yet everything
needed to host the API inside the Next app already existed: the Turbopack loader rewrites every
`*.ts` in the app, and `createVercelHandler()` returns App Router handlers.

Two processes means two programs. Everything downstream is simpler with one: one resolver, one
generated tree, the batch transport with no pointer, and the client-side route metadata bundling
(its own spec) which needs the routes in the client's program. The production shape mion targets is
a SPA (static files on a CDN) plus a typical API server, and vite 8 can emit both bundles from one
config.

Measured on `packages/client`, whose program already pulls the test server in through the `source`
export condition: 1090 cache modules, every one also in the server's own tree under the same id,
byte-identical except the reflection facade. One program costs nothing extra.

## What shipped

### 1. The vite preset keeps middleware mode only

`packages/devtools/src/vite/mionVitePlugin.ts`:
- `MionServerOptions` lost `runMode`, `viteConfig`, `waitTimeout` and `env`. `startScript`,
  `basePath`, `platform`, `exclude` and `hotReload` stayed; it gained `build` (section 3).
- The `mion-server-orchestrator` plugin, the module-level `serverReady` state, `resolveViteNodeCli`,
  `startManagedServer`, `waitForPort` and the `node:child_process` / `node:fs` / `node:module`
  imports are gone. `createBatchTransportSignals` lost `generated`, whose only reader was the
  orchestrator; the "not on the first echo" rule it also carried is now an explicit flag.
- `assertNoRemovedServerOptions` is the new removed-keys guard on the `server` block, same shape as
  `assertNoRemovedOptions`: any of the four keys, or `buildOnly`, throws naming the replacement.
- `src/vite/index.ts` stopped exporting `serverReady`. `MiddlewareReadySignals` stays internal, and
  `onReady` / `onError` now feed only the 503 path.
- `vite-node` is gone from `packages/devtools/package.json` and the root pin.

### 2. Tests get their port in-process

- `packages/test-server/src/test-server.ts` exports `startTestServer(port?)`, which returns the
  listening node server. The auto-start guard flipped to opt-in
  (`MION_TEST_SERVER_AUTO_START === 'true'`), so importing the module never starts a server.
- `packages/client/globalSetup.ts` starts it and `teardown()` closes it; the port poll and the
  `../test-server/.mion` sweep are gone (the ROOT vitest project sweeps the whole tree).
- `packages/client/vitest.config.ts` lost the `server` block and the env line. The client program is
  now the batch source: the resolver writes `rpc/` under its genDir and appends the import to
  `test-server.ts`. `packages/router/vitest.config.ts` lost the env line too.
- `scripts/lib/env.mjs`: both rows reworded.

**Two things the plan did not anticipate**, both about how vitest loads a globalSetup:

- It runs in vitest's OWN vite environment (`__vitest__`), which inherits the server defaults rather
  than the config's `resolve.conditions` or `ssr.resolve.conditions`. Without
  `environments: {__vitest__: {resolve: {conditions: ['source']}}}` every `@mionjs/*` import in the
  server entry resolves to an unbuilt `.dist` and the run dies before any test.
- For the same reason the globalSetup imports the entry by relative path rather than by package
  name.

### 2b. Every config swept

The removed keys were only carried by three configs, but the lane left stale wiring and stale prose
in a dozen more. All of it went: the e2e consumer's `vite.server.config.ts` (deleted outright, it
existed only as the child's config), the `client` pointer in `packages/test-server/vite.config.ts`
(newly dead, the client program is its own batch source now), the docblocks in
`packages/platform-{node,bun}/src/types.ts`, and the Containerfile / `_deps-mion` comments claiming
vite-node arrives with `@mionjs/devtools`.

A contract in `packages/devtools/test/repo-contracts.test.ts` keeps it that way: no manifest may
declare `vite-node`, and no tracked file may name `runMode:` / `waitTimeout:` / `serverReady`
outside the guard that rejects them.

### 3. One config, two bundles

`server.build?: {outDir?: string}` is opt-in. When set, a `mion-server-bundle` plugin's `config()`
hook declares the server half and `builder: {sharedConfigBuild: true, sharedPlugins: true}`.

**Deviation from the plan, deliberate:** it rides vite's built-in `ssr` environment rather than a
new `server` one. `buildApp()` builds EVERY environment in the config and the defaults already carry
`client` + `ssr`, so a third named environment would emit three bundles. `ssr` is already
`consumer: 'server'`.

**One resolver took more than the plan expected.** `sharedConfigBuild` stops vite re-resolving the
config file per environment (which would call `mionVitePlugin()` again and leak a second resolver
from `configResolved`), but an app build still builds its environments SEQUENTIALLY, so each
`buildEnd` dropped the plugin's refcount to zero and the next `buildStart` respawned. The core
plugin now takes a `buildApp` hook that holds one reference across the whole app build, guarded by
vite's own `isBuilt` check so a host that already built the environments is left alone.

Examples: `codegen/vite-client.config.ts` is the SPA config, `vite-vitest-global-setup.ts` is the
in-process start, `vite-middleware.config.ts` lost `runMode`, `vite-server.config.ts` is unchanged.

### 4. Next hosts the API in the app

No preset change: `withMion` already forwarded the `client` pointer and still rejects `server`. The
wording that said a Next app can only be the client is gone from `src/next/index.ts` and
`src/options.ts`.

The broker's staleness stamp listed `<genDir>/types` only, so a batch table appearing or vanishing
under `rpc/` never re-ran the route handler's loader in dev. It now folds a recursive `rpc/` listing
into the same digest, pinned by a new case in `test/next-broker.test.ts`.

New example `packages/examples/src/codegen/next-route-handler.ts`.

### 5. e2e: a full Next app with one route

`container/pre-publish-e2e/apps/mion-next/`: `withMion` in `next.config.mjs`, a routes module, and
`app/api/[...mion]/route.ts` through `createVercelHandler()`. The app's own `app/selftest/route.ts`
does the calling, because a `batch()` only gets an id when its call site is in the app's program; it
round-trips JSON (a Date), the compact wire, and one batch.

`build-all.mjs` gained a `buildMionNext` driver: `next build`, then `next start` on a free port,
fetch `/selftest`, assert, kill. `test/build-outputs.test.mjs` asserts the report.

**The non-obvious wiring:** `apps/` runs at `/e2e`, where `next` is baked but the `@mionjs/*`
framework packages are not. `scripts/release/e2e.mjs` now installs the four that app imports, via a
new `MION_E2E_MATRIX_MION_PKGS` variable, and `runContainerMatrix` takes the framework version.

`mion-consumer` moved in-process: the four keys and the env line are gone, `vite.server.config.ts`
is deleted, `globalSetup.ts` starts the server, and `server.ts`'s guard is opt-in.

### 6. Docs

`01.rpc/06.devtools/02.vite.md` (options block, removal note, "One Config, Two Bundles" and "Client
Tests" replacing "Separate server process"), `03.nextjs.md` (new "Hosting the API in Your Next App",
"Sharing Batches" split by where the API lives, Options reworded),
`01.rpc/01.introduction/02.quick-start.md` (the Next starter, plus the deepkit-era `reflection: true`
line in all three starters), `01.rpc/05.platforms/01.node-js.md`, `03.client/03.batch.md` and
`05.platforms/06.vercel.md` (cross-link). `packages/test-server/README.md` and `index.ts` too.

## Fixed along the way

**Two bugs a mion API under `/api` always had.** The client resolves a route's ABSOLUTE path
against its `baseURL`, so `/api` put there is dropped (`new URL('/sayHello', 'http://host/api')` is
`http://host/sayHello`), and the client builds its paths from its OWN `basePath`, so setting it only
on the router leaves the very first call (the route metadata fetch) outside the catch-all handler.
The shipped Vercel example and its docs told readers to put `/api` in the `baseURL`; both ends now
carry `basePath: '/api'` instead. Found by the new e2e lane, which is the first thing in the repo to
call a mion API mounted under a prefix.

**A resolver bug this change is the first to hit.** A router-init module OUTSIDE the session's
working dir is requested as `../pkg/entry.ts`, and `sameTransformPath` matched only by suffix, which
no absolute path can satisfy against a spelling starting with `..`. Every replacement carrying the
program's own absolute file name was silently dropped: the file came back transformed (its type
imports injected) but WITHOUT the batch import, and the server answered every batch with an unknown
id. Fixed by comparing against the requested path resolved to absolute, pinned by
`TestRpc_TransformAppendsImportForFileOutsideCwd`.

## Tests

- devtools: `removedOptions.spec.ts` covers each removed server key and `buildOnly`;
  `middlewareMode.spec.ts` lost the lane block; `batchesModule.spec.ts` lost `runMode` and the
  `generated` promise; new `viteEnvironments.spec.ts` drives a REAL app build through
  `createBuilder(config, null).buildApp()` (the programmatic `build()` always takes vite's legacy
  single-environment path) and asserts both bundles on disk, the server bundle running, the outDir
  knob, the off-by-default posture, and exactly one resolver spawn (counted with a shell shim as the
  binary). `repo-contracts.test.ts` pins the lane's absence; `next-broker.test.ts` pins the `rpc/`
  stamp.
- client: the 14 specs unchanged, plus `oneProgram.spec.ts` (the batch table lands under the
  client's genDir, nothing is written into the API package, and the in-process server answers a
  batch).
- Go: `TestRpc_TransformAppendsImportForFileOutsideCwd`.
- e2e: the `mion-next` lane; `mion-consumer` green in-process.

## Out of scope

- Bundled client route metadata (its own spec).
- Any change to the Next broker or loader beyond the `rpc/` stamp.
- The `@mionjs/starter-nextjs` starter itself (not in this repo); only the docs describing it.
- `mion compile`.
- The `dev-server` export of `@mionjs/platform-vercel`.

## Done when

- [x] `runMode`, `viteConfig`, `waitTimeout`, `env`, `serverReady`, the orchestrator, the vite-node
      spawn and the `vite-node` dependency are gone; a config still carrying any of them fails with
      a hint.
- [x] The client tests and the e2e consumer run their API in-process; nothing polls a port.
- [x] One vite config produces the client static bundle and the server bundle, documented and pinned
      by a test, with one resolver per build.
- [x] A Next app hosting one mion route builds, serves it, and a client with a batch round-trips
      against it in the e2e container.
- [x] Docs and the env registry updated; `pnpm test`, `pnpm run lint` and the e2e lanes green.
