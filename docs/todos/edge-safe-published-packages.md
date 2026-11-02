---
type: fix
spec: guidelines
status: ready
created: 2026-11-02
---

# Published packages cannot run on Cloudflare Workers or Vercel Edge

## Intent

No npm user can deploy a mion API to an edge runtime with 0.13.2, whatever they configure. Found while porting the
mion-starters (Vue and Nuxt) to 0.13.2; investigation and repros in the mion-starters repo,
`docs/investigations/mion-0.13-migration/` (README table rows 1 and 2, `vue.md` issues 1-2, `nuxt.md` issues 4-5,
`repros/edge-codegen`, `repros/nuxt-edge`).

Two separate bugs, both hit on real workerd (`wrangler dev`):

1. **Code-string-only compiled functions inside the packages.** `@mionjs/router` (and `@mionjs/core`) ship their
   own precompiled type modules (`.dist/esm/.mion/types/*.js`, the built-in routes `@thrownErrors`,
   `platformError`, the error serializers) in the default `emitMode: 'code'`. The app's
   `runTypes: {emitMode: 'both'}` only reaches the app's own `.mion`, so `initRoutes` dies with
   `RuntimeCodeGenBlockedError: Route/middleware "@thrownErrors" … Build with mionVitePlugin({runTypes: {emitMode: 'both'}})`,
   advice the user has already followed. Same failure under `node --disallow-code-generation-from-strings`.
2. **Unguarded `process.env`** at module load: `getPublicRoutesData: process.env.GENERATE_ROUTER_SPEC === 'true'`
   gives `ReferenceError: process is not defined` without `nodejs_compat`.

## Direction

The implementer plans the fix. Verified pointers:

- `packages/rpc-router/vite.config.ts:16-18` calls `mionVitePlugin` without `emitMode`; check core and client the
  same way. Options: publish the packages' generated entries with live factories (`'both'`), or let the app build
  re-emit package entries in the app's mode. Weigh bundle size for non-edge users.
- mion's own edge tests never see published output: `packages/private-test-server/vite.cloudflare.config.ts:29-36`
  and `buildTestBundle.ts:62-80` bundle `@mionjs/*` from the `source` condition, which npm consumers do not have.
  The regression test must run the built (packed) packages on an edge runtime; the pre-publish e2e is the natural
  place.
- `packages/rpc-router/src/constants.ts:15`: the package already has a guarded `getENV()` (used at
  `router.ts:320`). `packages/platform-cloudflare/test/cloudflareHandler.workers.spec.ts:41-42` polyfills
  `globalThis.process`, which hides the bug; drop the polyfill once fixed.
- Make the `RuntimeCodeGenBlockedError` message name the module the code-only entry came from.

## Docs

`container/website/content/01.rpc/06.platforms/05.cloudflare.md`, existing sections "Cloudflare Configuration" and
"Vite Configuration" (today's example config fails with `process is not defined`); `06.vercel.md` if Edge needs a
note. `01.rpc/07.devtools/02.vite.md` "All Plugin Options" describes `emitMode: 'both'` as sufficient.

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example
this change touched, review its report against the code, and commit it as its own commit.

## Done when

- A worker built from the packed packages with the documented config boots and answers routes, a batch and a
  validation error on workerd, with no `nodejs_compat` and no `process` polyfill, under a test that runs on every PR
  or at least in the release gate.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched source file,
  each committed on its own.
