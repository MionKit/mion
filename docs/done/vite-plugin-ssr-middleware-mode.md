# Vite plugin: `middleware` (in-process) server mode + SSR support

**Status:** done — shipped on `claude/vite-plugin-ssr-middleware-35q9jm`
(`feat(platform-node,platform-bun)!: asMiddleware` + `feat(devtools)!: restore runMode 'middleware'`).
`middleware` is now the DEFAULT run mode; `buildOnly` stays gone. Sibling of R28 in
[migration-review-findings.md](migration-review-findings.md) — its SSR half shipped here, its Vue-SFC
half is split out to [../todos/vue-sfc-runtypes-transform.md](../todos/vue-sfc-runtypes-transform.md).
**Created:** 2026-07-21

## Problem (as filed)

The pre-migration `mionVitePlugin` supported three `server.runMode` values
(`73d318d^:packages/devtools/src/vite-plugin/types.ts:78-83`):

- `buildOnly` — spawn child, harvest **AOT caches**, kill it. Genuinely obsolete (AOT is gone).
- `childProcess` — spawn child, keep it running for a live API. **Survives** (readiness is TCP
  port-polling → `serverReady`, not the old AOT-over-IPC handshake).
- `middleware` — **load the mion backend in the SAME Vite process as dev-server middleware, for
  Nuxt-like/SSR frameworks.** This is the idiomatic "backend of a frontend in Vite" pattern.

The migration **dropped `middleware`**: it stayed in the `runMode` union but the wrapper warned and
fell back to `childProcess`, and there was no `configureServer` hook. A fullstack/Nuxt user could
only run the API as a separate process on another port — separate process, separate port, no shared
Vite module graph / SSR pipeline. A real capability regression, not an AOT casualty.

## Why it could not simply be switched back on

The old mode had TWO halves, and only one survived the AOT sweep:

1. **Plugin half** (`73d318d^:mionVitePlugin.ts:235-296`): `configureServer` →
   `ssrLoadModule(startScript)` → `getRouterOptions()` for the basePath →
   `@mionjs/platform-node`'s `httpRequestHandler` → `server.middlewares.use(...)`.
2. **Adapter half** (deleted): the plugin set `process.env.MION_COMPILE = 'middleware'`
   (`73d318d^:aotCacheGenerator.ts:219-241`) and `startNodeServer()` checked `isMionCompileMode()`
   (`73d318d^:core/src/utils.ts:56-59`) to build the http server but **skip `.listen()`**
   (`73d318d^:platform-node/src/mionHttp.ts:43,60-63`; same in `bunHttp.ts:46-56`). That is what let
   an ordinary entry — `initMionRouter(); startNodeServer();` — be loaded in-process without opening
   a port. [old-engine-leftover-sweep.md](old-engine-leftover-sweep.md) removed that whole contract,
   correctly: it was named after a compile step it had nothing to do with.

## What shipped

**1. `asMiddleware`, an ordinary platform option** (`NodeHttpOptions`, `BunHttpOptions`) replaces the
env gate. `startNodeServer()` then builds its handler, applies the binary options and publishes the
platform config, but never `listen()`s — and installs no `SIGINT`/`SIGTERM` handlers, since those
call `process.exit(0)` and the process is now the host's. It is reachable by hand
(`startNodeServer({asMiddleware: true})` + mount `httpRequestHandler` in your own express/connect
app), and the plugin sets it through `setNodeHttpOpts` before loading the entry — so **an unchanged
entry works in both run modes**, which is the property the old flag provided.

Related: `platform-bun` had no mountable handler at all (the `fetch` body was inlined into
`Bun.serve`); it is now exported as `bunRequestHandler(req: Request)`, and `startBunServer` honours
`asMiddleware` too (returning `undefined` — there is no server to hand back — with overloads keeping
the ordinary call typed as a `Server`).

**2. `runMode: 'middleware'` restored and made the default**
(`packages/devtools/src/vite-plugin/middlewareMode.ts`), minus every piece of AOT machinery: no cache
generation, no virtual-module invalidation. Beyond the straight restore:

- **Boundary-aware mounting.** The old code computed `'/' + (basePath || '')`, so the default empty
  basePath produced `'/'` and matched **every** dev-server request (frontend included), and `/api`
  swallowed `/apidocs`. Now: exact/`/`/`?` boundary matching, and with no basePath mion serves the
  root while an overridable `server.exclude` list keeps vite's own URLs — the same shape
  `@hono/vite-dev-server` uses.
- **Fetch-style adapters are supported, not only node-style.** Vite's dev middleware layer is connect
  (node `req`/`res`) in every runtime — running vite under bun works through bun's `node:http`, while
  mounting vite's middlewares inside `Bun.serve` is the direction that does not work
  ([oven-sh/bun#12212](https://github.com/oven-sh/bun/issues/12212)). So a fetch-style handler is
  bridged from node req/res (`nodeWebBridge.ts`), exactly how the ecosystem serves fetch-native
  servers in dev. `server.platform` picks the adapter; `@mionjs/platform-node` stays the default
  because it needs no `Request` materialization.
- **Lazy init.** The API loads on the first request that reaches the mount, with an eager warm-up
  unless `VITEST` is set — vitest's own vite server also fires `configureServer`, and booting the API
  into the test process is not wanted.
- **Hot reload** (`server.hotReload`, default on): a change under the vite root re-loads the entry on
  the next API request, after `resetRouter()` — `initMionRouter` throws "Router has already been
  initialized" otherwise. Dependencies keep their module instances, so caches stay warm.
- **Loud failures.** A failed load answers `503` with the real cause (and reports it through
  `serverReady`); an entry that opened its own port anyway fails naming the actual cause — two copies
  of the adapter module, i.e. an `ssr.noExternal` that dropped `@mionjs/*`. An unknown `runMode` now
  throws instead of silently taking the childProcess lane, which is what a stale `buildOnly` config
  would have done.

**3. `ssr.noExternal: [/@mionjs\//]` is added in middleware mode only.** The unconditional version
(R28) was motivated by a duplication that turned out to have a different cause
([virtual-module-retired-and-dual-core-load.md](virtual-module-retired-and-dual-core-load.md)), so it
is not restored globally. In middleware mode single-instance state is load-bearing — the API shares
one SSR module graph with the app, and a second `@mionjs/core` means split registries — and it is
also what makes the `asMiddleware` handoff between plugin and entry reliable.

## Verified

- `packages/devtools/src/vite-plugin/middlewareMode.spec.ts` — 17 cases against a **real** vite dev
  server over temp fixtures (router/adapter stubbed via `resolve.alias`): basePath forwarding and its
  boundary, the no-basePath + exclude lane, the node↔web bridge in both directions, lazy loading,
  503-with-cause, the duplicate-adapter guard, hot reload through `resetRouter`, and the
  runMode→lane selection. The boundary case was mutation-checked: reverting the match to a plain
  `startsWith` fails it, i.e. it really pins the old bug.
- `packages/client/src/middlewareMode.e2e.spec.ts` — the REAL `test-server` entry, transformed by the
  REAL ts-runtypes pipeline, loaded in-process and answering `sayHello` over HTTP with the tagged
  union wire shape, plus a validation rejection carrying the compiled validator's `typeErrors`.
- `packages/platform-node/src/mionHttpMiddleware.spec.ts` and
  `packages/platform-bun/src/bunHttpMiddleware.test.ts` — not listening, platform config still
  published, no exit handlers, the flag surviving a later `start…({port})`, and the handler still
  serving mounted on a host.

## Not shipped here

The Vue-SFC transform half of R28 — typed mion code inside `.vue` `<script>` blocks is still silently
untransformed. It cannot be fixed from mion: `@ts-runtypes/devtools` rejects non-TS ids in its
transform hook and exposes no filter option, and its resolver is private to that plugin. Probing the
resolver directly showed the ENGINE can already transform a virtual, not-in-program path, so this is
a plugin-surface gap rather than an architectural limit — split out with the measurements into
[../todos/vue-sfc-runtypes-transform.md](../todos/vue-sfc-runtypes-transform.md).
