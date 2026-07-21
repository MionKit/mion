# Vite plugin: restore `middleware` (in-process) server mode + SSR support

**Status:** todo — **CONFIRMED wanted by maintainer 2026-07-21.** Restore the in-process `middleware`
mode as the idiomatic Vite/Nuxt fullstack default, **without** the old AOT/compile step (build-time
injection replaces it). Own PR — NOT the docs PR #125. Sibling of R28 in
[migration-review-findings.md](../done/migration-review-findings.md) (SSR `noExternal` + Vue SFC
transform dropped, "re-add decision left to the docs wave").
**Created:** 2026-07-21

## Problem

The pre-migration `mionVitePlugin` supported three `server.runMode` values
(`73d318d^:packages/devtools/src/vite-plugin/types.ts:78-83`):

- `buildOnly` — spawn child, harvest **AOT caches**, kill it. Genuinely obsolete (AOT is gone).
- `childProcess` — spawn child, keep it running for a live API. **Survives** (now readiness is TCP
  port-polling → `serverReady`, not the old AOT-over-IPC handshake).
- `middleware` — **load the mion backend in the SAME Vite process as dev-server middleware, for
  Nuxt-like/SSR frameworks.** This is the idiomatic "backend of a frontend in Vite" pattern.

The migration **dropped `middleware`**. It remains in the `runMode` union type but is ignored: the
wrapper warns and falls back to `childProcess` (`mionVitePlugin.ts:153-156`), and there is no
`configureServer` hook anymore. So a fullstack/Nuxt user can no longer run the API in-process — they
must spawn a separate child server on another port (`childProcess`), which is not the same thing
(separate process, separate port, no shared Vite module graph / SSR pipeline).

This is a real capability regression, not an AOT casualty. (My first pass mis-described `middleware`
as an AOT metadata path — it was not; only `buildOnly` was.)

## Evidence — what `middleware` mode did (pre-migration, `73d318d^`)

`packages/devtools/src/vite-plugin/mionVitePlugin.ts:235-296` (`configureServer`):
- `ssrLoadModule = (url) => server.ssrLoadModule(url)` — load the server entry through Vite's
  internal SSR transform pipeline (so its typed mion code got transformed by the same plugin).
- resolved the router options + `@mionjs/platform-node`'s `httpRequestHandler` in-process.
- `server.middlewares.use((req,res,next) => …)` — proxy requests under `basePath` to the mion
  `httpRequestHandler`, `next()` for everything else.

The old implementation was tangled with AOT-cache generation
(`loadSSRRouterAndGenerateAOTCaches`, virtual-module invalidation) — but the CORE mechanism
(`configureServer` + `ssrLoadModule` + `middlewares.use` → `httpRequestHandler`) is independent of
AOT and would be **simpler** now: types are injected at build time, so no cache-generation step.

Related dropped SSR pieces (R28, same wave): the plugin no longer auto-adds
`ssr.noExternal: [/@mionjs\//]` (SSR users get duplicated `@mionjs/core` instances → split
registries) and no longer transforms `.vue?vue&type=script` blocks (typed mion code in `.vue` SFCs
silently untransformed). A restored SSR/middleware story should re-add these together.

## Fix plan (decision made — implement)

1. **`runMode` becomes `'middleware' | 'childProcess'`, `middleware` the default.** Drop `buildOnly`
   entirely (it was the AOT/compile mode — gone). No `MION_COMPILE`/AOT anything comes back; the
   restore is purely the in-process dev-server mechanism.
2. Re-add a `configureServer(server)` hook gated on `runMode === 'middleware'` that
   `ssrLoadModule`s the `startScript`, grabs `httpRequestHandler` from the platform adapter, and
   proxies `basePath` requests — **minus all AOT machinery** (build-time injection replaces the old
   `loadSSRRouterAndGenerateAOTCaches` + virtual-module-invalidation dance, so this is much smaller
   than the pre-migration version).
3. Re-add `config()` returning `ssr: {noExternal: [/@mionjs\//]}` (R28) so SSR/vite-node users don't
   dedupe-fail, and the `.vue?vue&type=script` SFC transform (R28) so Nuxt/Vue typed code compiles.
4. Cross-check the platform adapters: `httpRequestHandler` must open no port / need no compile env
   in middleware mode (the old `isMionCompileMode()` `listen()` skips are being removed in the
   leftover sweep — see [../partially/old-engine-leftover-sweep.md](../partially/old-engine-leftover-sweep.md)).
5. Docs: the website `5.devtools/3.vite-config.md` "Client + Server" section currently presents
   `childProcess` as the fullstack answer; once `middleware` lands, document **in-process middleware
   as the primary Nuxt/SSR/fullstack path** and `childProcess` as the separate-process/e2e alternative.

## Interim (shipped)

Docs describe only the current reality (`childProcess` only). The `vite-client.config.ts` example
+ vite-config page frame the managed `server` block as the optional e2e/dev convenience it now is.
