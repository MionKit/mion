---
type: fix
spec: guidelines
status: done
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

## Plan: per-copy state, a reload per host (approved 2026-11-02, Next part revised 2026-11-03)

Core and router keep their state per module copy. Vite reloads a fresh copy of the whole API; Next keeps the router
loaded, so the Next preset resets it.

- `@mionjs/core` and `@mionjs/router` keep no state on `globalThis`: `getOrCreateGlobal`, the core load counter,
  its dual-load warning and `MION_SUPPRESS_DUAL_LOAD_WARN` go. Each module copy owns its tables, flags and caches.
  The `createMionRouter` guard stays as it is.
- Next: the first CI run of the `next dev` lane showed Turbopack re-runs only the edited module and its importers,
  keeping `@mionjs/router` loaded, so the re-run `createMionRouter` hit the guard. Next-only fix, keeping core and
  Vite clean: in `next dev`, `withMion` opens the router-init module (the resolver's `routerInitFiles`) with a
  one-line reset that keeps the batch table (`src/next/devRouterReset.ts`), through a `rewriteOutput` pass on the
  broker and the webpack lane. Production gets no reset, so the guard holds. Pinned by the `next dev` edit lane in
  the pre-publish e2e `mion-next` app, the broker and reset specs, and a router spec of the reset's steps.
- Vite (`middlewareMode.ts`): the reload invalidates the entry's whole SSR module tree (inlined `@mionjs/*`
  included) instead of "own files" by Vite root, and never calls `resetRouter()`. Every request awaits one shared
  reload, and an edit made during a reload starts another. A change marks the API stale when the file is in the tree
  the last load collected; after a failed load, or before the first load collected its tree, any source edit outside
  `node_modules` does. The batch table appearing or vanishing marks it stale from the plugin directly (the `add`
  listener goes). A type edit needs nothing of its own: it rewrites the generated module the API imports, an
  ordinary change in the tree. A failed load with no basePath known lets page navigations through instead of
  answering 503 for the whole site.
- Docs: Next "Editing Types While the Dev Server Runs" (route, type and batch edits reload the API), Vite "Fullstack Apps" (reload, entry outside the root, one genDir per process).
- Tests: `rpc-router/test/moduleCopies.spec.ts` (a fresh copy needs no reset, the guard holds inside one copy),
  plus a fresh batch table and a fresh `@mionjs/core` cache; `devtools/test/vite/middlewareMode.spec.ts` (fresh-copy
  reload, 20 concurrent requests during a reload, edits during the first load and during a reload, entry outside
  the root, failed reload then recovery, retry after a failed load, page navigation on a failed first load, stale
  mark); `sfcTransform.spec.ts` through the real resolver and a genDir outside the vite root (a batch only in a
  `.vue` file reaches the running API; an `import type`-only type edit reloads it).
  The `next dev` lane runs in the `pre-publish-e2e` CI label only: its image is private.
- Out of scope: ESM-only packages and the dev 503 body's ANSI codes, filed as their own todo.
