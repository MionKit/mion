---
type: fix
spec: guidelines
status: ready
created: 2026-11-02
---

# The in-process API breaks or goes stale on reload in dev hosts (Next, Vite, Nuxt)

## Intent

0.13's promise is "the API runs inside your dev server". Porting the mion-starters showed four ways that breaks on
reload, all needing a dev-server restart or a starter-side workaround. Investigation in the mion-starters repo,
`docs/investigations/mion-0.13-migration/` (README rows 4-7 and 24; `nextjs.md` issues 5-6, `nuxt.md` issues 1, 2,
17, 20, `vue.md` issue 3; repros `repros/router-dual-instance.mjs`, `repros/nuxt-hotreload/`).

1. **Router re-init (Next).** Route tables live on `globalThis`, the created/initialized flags are module-scoped.
   After any edit Next re-evaluates the route handler with fresh flags over old tables:
   `Invalid route: @thrownErrors. Naming collision, duplicated route` until restart (with `@mionjs/*` external:
   `createMionRouter has already been called`). Same root cause in production: two server bundles in one process
   (a Server Component importing the route handler) cannot both init. The spike works around it with a dev-only
   `resetRouter()` imported before the routes.
2. **Reload race (Vite).** `reload()` resets the router, then loads; only the first request after a change awaits it,
   so concurrent requests get 422 "Not-found chain is not registered. This should never happen." (116 of 200 in
   Nuxt).
3. **Ownership by Vite root (Vite, always in Nuxt).** Files outside `config.root` are ignored, and Nuxt's root is
   `app/`, so API edits never reload; when a batch appears, the router is reset but the cached entry never re-runs
   `initRoutes`, and every call answers that 422 forever.
4. **SFC batch registration.** A batch first seen through the SFC transform writes `batches.generated.js`, but the
   running API is never marked stale (the watcher `add` fires before `onGenerate` updates the module path), so every
   fresh `vite dev` answers `404 batch-unknown-id` until an API file is touched.

## Direction

The implementer plans the fix. Verified pointers:

- `packages/rpc-router/src/router.ts:87-103` (globals vs flags), `:221` and `:258` (the two throws), `:161` (Vite
  host calls `resetRouter()` before reloading). Decide what a re-init in one process means (replace, or refuse
  with a clear error in production) and keep flags and tables in one place.
- `packages/devtools/src/vite/middlewareMode.ts:108-118, 153-157` (reset-then-load, no shared reload promise; a
  shared promise or build-then-swap), `:176-185, 280-303` (`isOwnFile` by root; decide ownership by program or
  workspace, always invalidate the entry), `:151` (a failed entry load answers 503 for every URL, blanking a Nuxt
  site).
- `packages/devtools/src/vite/mionVitePlugin.ts:141-156` (`onGenerate` invalidates router-init modules but does not
  mark the middleware stale).
- Optional: the dev host and a separate API build share one genDir, so a batch-less build deletes `.mion/rpc`
  under the running dev API; consider separate genDirs or document one genDir per process.
- Next has no reload hook: the fix for (1) has to work from the router side or from what `withMion` /
  `@mionjs/platform-vercel` can inject.

## Docs

`container/website/content/01.rpc/07.devtools/03.nextjs.md` "Editing Types While the Dev Server Runs" (promises
no restart) and `02.vite.md` "Fullstack Apps" (reload behaviour, roots, the 503). Only if behaviour visible to
users changes.

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example
this change touched, review its report against the code, and commit it as its own commit.

## Done when

- Editing a handler, a type or a client file during `next dev` and during `vite dev` keeps the API answering, with no
  request failing during the reload, including an entry outside the Vite root and a batch first seen in a `.vue`
  file; each case pinned by a test.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched source file,
  each committed on its own.
