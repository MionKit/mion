---
type: chore
spec: full-plan
status: ready
created: 2026-09-09
---

# One process for client and API: remove the child-process server mode

## Problem

The vite preset can run the mion API two ways. Middleware mode loads the server entry into the vite
process (one program, one resolver, one port). `runMode: 'childProcess'` spawns it beside vite with
vite-node: a second process, a second program and resolver, a port poll, and an env-var handshake
(`MION_TEST_SERVER_AUTO_START`). The child mode survived the AOT sweep for one reason: the client
tests need a real socket, and middleware mode never listens (it mounts on vite's middleware stack,
and vitest opens no port for node tests).

Next was never the reason. `withMion` rejects a `server` block outright ("a Next app is the client");
the docs and quick start describe a standalone vite-node API that Next proxies to. Yet everything
needed to host the API inside the Next app already exists: the Turbopack loader rewrites every
`*.ts` in the app, and `createVercelHandler()` returns App Router handlers.

Two processes means two programs. Everything downstream is simpler with one: one resolver, one
generated tree, the batch transport with no pointer, and the client-side route metadata bundling
(its own spec) which needs the routes in the client's program. The production shape mion targets is
a SPA (static files on a CDN) plus a typical API server, and vite 8 can emit both bundles from one
config.

Measured on `packages/client`, whose program already pulls the test server in through the `source`
export condition: 1090 cache modules, every one also in the server's own tree under the same id,
byte-identical except the reflection facade. One program costs nothing extra.

## Plan

### 1. The vite preset keeps middleware mode only

`packages/devtools/src/vite/mionVitePlugin.ts`:
- `MionServerOptions` (:39-76) loses `runMode`, `viteConfig`, `waitTimeout`, `env`. `startScript`,
  `basePath`, `platform`, `exclude`, `hotReload` stay.
- Delete the `mion-server-orchestrator` plugin (:229-244), the module state and `serverReady`
  (:262-281), `resolveViteNodeCli` (:283-298), `startManagedServer` (:300-337), `waitForPort`
  (:339-351), the `node:child_process` / `node:fs` / `node:module` imports (:9-11), and
  `transport.generated` in `createBatchTransportSignals` (:121-140), whose only reader was the
  orchestrator.
- The `runMode` check (:212-218) becomes a removed-keys guard on the `server` block, same style as
  `assertNoRemovedOptions` in `src/options.ts:128`: any of the four keys, or `buildOnly`, throws
  naming the replacement (start the API in-process; tests start it themselves).
- `src/vite/index.ts:9` stops exporting `serverReady`. `MiddlewareReadySignals`
  (`middlewareMode.ts:50-57`) stays internal; `onReady` / `onError` keep feeding the 503 path.
- `packages/devtools/package.json:116` drops `vite-node`; the root `package.json:105` pin goes with
  it (no other user in the repo).

### 2. Tests get their port in-process

Not a plugin option: `vite dev` already listens, only vitest has no port. Test projects start the API
themselves, the pattern every other project already uses (`packages/platform-node/src/mionHttp.spec.ts:65-71`).

- `packages/test-server/src/test-server.ts`: export `startTestServer(port)` (today `startServer`
  at :572-590 is private and returns nothing to close). Flip the guard at :600 to opt-in: start on
  import only when `MION_TEST_SERVER_AUTO_START === 'true'`, so importers stop setting `'false'`.
- `packages/client/globalSetup.ts`: `setup()` awaits `startTestServer(TEST_SERVER_PORT)` and
  `teardown()` closes it; the port poll (:24-35) goes. Vitest imports globalSetup through the
  project's own vite module runner (`ServerModuleRunner` in vitest 4.1.8), so the mion transform
  applies to the server module it imports. Fallback if a runner quirk bites: the pattern in
  `packages/client/src/middlewareMode.e2e.spec.ts:36-55` (a vite server in middleware mode plus
  `http.createServer(vite.middlewares).listen`).
- `packages/client/vitest.config.ts`: delete the `server` block (:16-24) and the
  `MION_TEST_SERVER_AUTO_START: 'false'` env (:36-38). The client program is now the batch source
  too: the resolver writes `rpc/` under the client's genDir and appends the import to
  `test-server.ts`, the router-init module, so the in-process server registers the batches. The
  `teardown()` sweep of `../test-server/.mion` (:41-46) goes, nothing writes there anymore.
- `packages/router/vitest.config.ts:27-30` drops the env line.
- `scripts/lib/env.mjs:213-214`: reword `MION_TEST_PORT` (no spawn); `MION_TEST_SERVER_AUTO_START`
  becomes "set to 'true' to start on import, used by the compiled-server e2e lane".

### 3. One config, two bundles

Vite 8's environment API builds several environments from one config: `environments.client` (the
static files) and a `server` environment (`consumer: 'server'`, input = the API entry), with
`builder` set so `vite build` emits both (`node_modules/vite/dist/node/index.d.ts:2281` `buildApp`,
`:3498` `environments`).

- The preset gains `server.build?: {outDir?: string}`, opt-in. When set, the plugin's `config()`
  hook declares the `server` environment with `rollupOptions.input = server.startScript`, server
  resolve conditions, `ssr.noExternal` for `@mionjs/*` as middleware mode already sets
  (`middlewareMode.ts:119-124`), and `builder: {}`. Off by default so `build.lib` projects
  (`packages/test-server/vite.config.ts:21-26`) are untouched.
- With `builder.sharedPlugins` false vite instantiates plugins per environment, so `buildStart`
  runs twice. The resolver must start once per config: memoize by resolved root, or gate on
  `this.environment`. Pinned by the build test below.
- Examples: `packages/examples/src/codegen/vite-client.config.ts` becomes the SPA config (client
  plus server environment); `vite-vitest-global-setup.ts` becomes the in-process start;
  `vite-middleware.config.ts` drops `runMode`; `vite-server.config.ts` stays, a standalone API
  project is still its own program.

### 4. Next hosts the API in the app

No preset change: `withMion` already takes the `client` pointer, and `server` stays rejected (Next
runs its own server). What goes is the wording: `src/next/index.ts:26-38, 52-54, 79-84` and
`src/options.ts:183-185` say "a Next app is the client, never the API".

- The route handler `app/api/[...mion]/route.ts` imports the routes module (which calls
  `createMionRouter` and `initRoutes`) and re-exports `createVercelHandler()`, the shape
  `packages/examples/src/vercel/vercel-handler.ts:1-4` already shows. The loader rewrites it
  (`RULE_GLOBS`, `runtypes/next/index.ts:30`), the router-init module joins `SiteFiles`
  (`dispatch.go:1016-1036`), and the batch import lands as a relative file path because the Next
  lane is always `transformRelative` (`core/unplugin.ts:487-495`).
- One gap: the broker's staleness stamp watches `types/` only (`runtypes/next/broker.ts:221-250`),
  so a batch table appearing or vanishing under `rpc/` never re-runs the route handler's loader in
  dev. Extend the stamp to `rpc/`; the vite preset's twin is the `presenceChanged` invalidate at
  `mionVitePlugin.ts:132-136`.
- New example `packages/examples/src/codegen/next-route-handler.ts`; `next-config.ts` unchanged.

### 5. e2e: a full Next app with one route

`container/pre-publish-e2e/apps/mion-next/` (new, beside `smoke-next`): `withMion` in
`next.config`, a routes module with one `mion.route`, `app/api/[...mion]/route.ts` through
`createVercelHandler()`, and a page that calls the route with `initClient<Api>` and sends one
`batch()`, so the transport is proven in-app.

- `build-all.mjs`: a `buildMionNext` driver next to `buildNext` (:221-262): `next build`, then
  `next start` on a free port, a client round trip through `@mionjs/client` (JSON and binary) and
  the batch, assert, kill. Out of process, like every Next step here.
- `test/build-outputs.test.mjs`: the new lane's assertions.
- Container-only on purpose: Next is not a workspace dependency (`runtypes/next/CLAUDE.md`).
- `mion-consumer` moves in-process: drop the four keys (`vitest.config.ts:19-26`), delete
  `vite.server.config.ts`, `globalSetup.ts` starts the server instead of awaiting `serverReady`,
  `server.ts:123` guard flipped to opt-in (`compile-output.spec.ts:130` already passes `'true'`),
  `package.json:5` description.

### 6. Docs

- `01.rpc/06.devtools/02.vite.md`: the options block (:39-56) and note (:62); "Separate server
  process" (:100-107) replaced by "One Config, Two Bundles" and "Client Tests" (in-process start);
  "Fullstack" (:88-98) reworded.
- `01.rpc/06.devtools/03.nextjs.md`: new "Hosting the API in Your Next App" (route handler, client
  `baseURL`), Options (:50-58) reworded, "Sharing Batches" gains the in-app case.
- `01.rpc/01.introduction/02.quick-start.md:111-155`: the starter description moves from a
  vite-node dev server plus proxy to the in-app route handler; the deepkit-era `reflection: true`
  line (:125) goes.
- `01.rpc/03.client/03.batch.md:114-115, 137`; `01.rpc/05.platforms/06.vercel.md` cross-link.
- `packages/test-server/README.md:89`, `packages/test-server/index.ts:16-24`;
  `packages/platform-node/src/types.ts:35` and `packages/platform-bun/src/types.ts:38` docblocks.

## Tests

- devtools: `src/vite/removedOptions.spec.ts:57-68`: each removed key throws with its hint,
  `buildOnly` still throws. `src/vite/middlewareMode.spec.ts:376-393`: the lane block goes; the
  shared-signal cases (:204-217, :333-363) move onto `mionMiddlewarePlugin`'s own signals.
  `src/vite/batchesModule.spec.ts:80-88` drops `runMode`. New `src/vite/viteEnvironments.spec.ts`,
  the shape of `batchesBuild.spec.ts`: a real `vite build` over a temp fixture with `server.build`
  set asserts both bundles on disk, the server bundle runs, exactly one resolver spawn.
  `test/repo-contracts.test.ts`: `vite-node` absent. `test/next-broker.test.ts`: the stamp covers
  `rpc/`.
- client: the 14 specs unchanged; globalSetup in-process; `middlewareMode.e2e.spec.ts` unchanged;
  one new assertion that the client's own genDir holds `rpc/` and the in-process server answers a
  batch.
- e2e: the Next lane above; `mion-consumer` green in-process.
- `pnpm run check:env` and `check:test-batches` still pass.

## Out of scope

- Bundled client route metadata (its own spec).
- Any change to the Next broker or loader beyond the `rpc/` stamp.
- The `@mionjs/starter-nextjs` starter itself (not in this repo); only the docs describing it.
- `mion compile`.
- The `dev-server` export of `@mionjs/platform-vercel`.

## Done when

- `runMode`, `viteConfig`, `waitTimeout`, `env`, `serverReady`, the orchestrator, the vite-node
  spawn and the `vite-node` dependency are gone; a config still carrying any of them fails with a
  hint.
- The client tests and the e2e consumer run their API in-process; nothing polls a port.
- One vite config produces the client static bundle and the server bundle, documented and pinned
  by a test, with one resolver per build.
- A Next app hosting one mion route builds, serves it, and a client with a batch round-trips
  against it in the e2e container.
- Docs and the env registry updated; `pnpm test`, `pnpm run lint` and the e2e lanes green.
