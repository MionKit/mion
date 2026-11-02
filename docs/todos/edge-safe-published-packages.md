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

## Plan: ship live functions (approved 2026-11-02)

### Changes
1. `packages/core/vite.config.ts`, `packages/rpc-router/vite.config.ts`: `mionVitePlugin({..., runTypes: {emitMode: 'both'}})`
   (other published packages do not run the plugin). Measure router/core dist size before/after for the PR.
2. `constants.ts:15`: `getPublicRoutesData: false` default (router.ts:334 already ORs `getENV('GENERATE_ROUTER_SPEC')`);
   sweep other module-load `process` reads in published `src/` (only devtools, which is node-only).
3. Generic hardening in `packages/run-types/src/runtypes/entryTuple.ts`: registration is first-wins by hash, so a
   code-only entry from any dependency can shadow the app's live factory for the same hash. When an existing entry has
   no `createRTFn`/`createPureFn` and the new tuple carries one, fill it in.
4. Better error: in `rtUtils.ts` `materializeRTFn` / `initPureFunction`, when `new Function` is blocked, rethrow naming
   the entry (`.mion/types/<id>.js`, type name) so the user can see it came from a dependency. Update
   `RuntimeCodeGenBlockedError` text in `rpc-router/src/lib/reflection.ts` to say a dependency built in `'code'` mode
   also causes it.
5. `packages/platform-cloudflare/test/cloudflareHandler.workers.spec.ts:41-42`: drop the `process` polyfill.

### Tests
- Release gate (pre-publish e2e, `container/pre-publish-e2e/mion-consumer`): new edge lane. Worker built with the
  documented config (`private-examples/src/cloudflare/cloudflare.vite.config.ts` shape: `emitMode: 'both'`, one
  bundle, `@mionjs/*` bundled from the installed packed tarballs, no `source` condition), booted in miniflare
  (workerd) with no `nodejs_compat` and no polyfill; asserts a route, a batch call and a validation error.
  Add `miniflare` (same pin as root) to `_deps-mion/package.json`; wire the lane in `scripts/release/e2e.mjs`.
- Every PR: platform-cloudflare workers spec without the polyfill (covers bug 2).
- Vitest in run-types: upgrade-on-register (code-only entry then live entry → live factory used, no `new Function`),
  and the blocked-codegen error names the entry (simulate by stubbing).
- Verify locally: pack, install into a scratch dir, run the lane on the host (container image may not be pullable
  here; say so if the in-container run cannot happen).

### Docs
- `01.rpc/06.platforms/05.cloudflare.md` "Vite Configuration" caution: mion's own packages ship live functions;
  a dependency built in `'code'` mode fails the same way and the error names its module. "Cloudflare Configuration":
  no `nodejs_compat` needed.
- `06.vercel.md`: same one-line note if it fits. `07.devtools/02.vite.md` `emitMode` comment stays accurate, adjust wording only if needed.
- No fuzzing: fix, not a feature.

### Finish
Gate (lint, format, tests), spec reconciled + `git mv` to `docs/done/`, review-pr, docs-simplifier +
comments-simplifier passes (own commits), PR linking parent session, drive CI green, rebase on `origin/main`.

### Done when (from spec)
- Worker from packed packages + documented config answers routes, a batch and a validation error on workerd, no
  `nodejs_compat`, no `process` polyfill, under the release gate.
- Both simplify passes ran and are committed separately.
