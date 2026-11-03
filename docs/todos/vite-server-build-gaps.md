---
type: fix
spec: guidelines
status: ready
created: 2026-11-02
---

# `server.build` and preview gaps in the Vite preset

## Intent

The two-bundle Vite build is the cleanest 0.13 story for a fullstack app. Porting the mion-starters showed where it
fails silently or leaks. Investigation in the mion-starters repo, `docs/investigations/mion-0.13-migration/`
(README rows 16-17, `vue.md` issues 6-9, `nuxt.md` issues 6, 22).

1. **Silent input overwrite.** `server.build` sets the server bundle's input to `server.entry` and overwrites a user
   `environments.ssr.build.rollupOptions.input` without a word.
2. **`public/` copied into the API bundle**: `dist-server/` gets favicons and robots.txt.
3. **Hosts that own the server build.** In Nuxt, `server.build` replaces Nuxt's own SSR bundle. `nuxt build` exits 0,
   then every page answers 500 (`Cannot find module .nuxt/dist/server/server.mjs`). The docs list Nuxt under
   "Fullstack Apps".
4. **`mion-pure-fns/` in the public `outDir`.** Every build writes `<outDir>/mion-pure-fns/index.json`, with source
   file paths and mapper ids, so a static CDN deploy publishes them.
5. **`vite preview` does not serve the API** (there is no `configurePreviewServer`).

Rechecked on 2026-11-03 against `main` (`85f3488af`): every item is still open.

Out of scope: building several API entries from one config. A real app deploys to one target, so this is not a
generic need.

## Direction

The implementer plans the fixes. Verified pointers:

- `packages/devtools/src/vite/mionVitePlugin.ts`, `serverBundlePlugin` (its `config` hook, `order: 'post'`):
  - warn or fail when an existing input would be replaced;
  - set `copyPublicDir: false` on the server environment;
  - detect a host that already owns `ssr` and fail with a clear message.
- `packages/devtools/src/core/unplugin.ts`, the `mion-pure-fns/` writer (the pure-fn artifact): decide whether an app build should emit it
  at all. It must never land in a client `outDir`.
- Preview: document how to preview the API (run the built server, proxy from `vite preview`), or mount it in
  `configurePreviewServer` if that is cheap.

## Docs

`container/website/content/01.rpc/07.devtools/02.vite.md`: "One Config, Two Bundles", "Fullstack Apps" (which hosts
`server.build` fits) and "All Plugin Options".

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example
this change touched, review its report against the code, and commit it as its own commit.

## Done when

- A replaced input is reported, the API bundle holds no `public/` files, a host that owns `ssr` gets a clear error
  instead of a broken build, and no pure-fn artifact lands in the client output. Each is pinned by a test.
- Previewing the API is documented or works.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched source file,
  each committed on its own.
